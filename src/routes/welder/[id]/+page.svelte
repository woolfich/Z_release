<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com  ">
	<link rel="preconnect" href="https://fonts.gstatic.com  " crossorigin="anonymous">
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<script lang="ts">
import { onMount } from 'svelte';
import { page } from '$app/stores';
import { db, type Welder, type Plan, type Record as DbRecord, type Norm, type DailyAllocation } from '$lib/db';
import { activatedDays as rawActivatedDays } from '$lib/stores';
import type { Writable } from 'svelte/store';
import { base } from '$app/paths';

// --- Импортируем наши компоненты ---
import RecordForm from '$lib/components/RecordForm.svelte';
import RecordList from '$lib/components/RecordList.svelte'; // Убедись, что RecordList может отображать lastUpdated
import RecordModal from '$lib/components/RecordModal.svelte';
// --- Конец импорта ---

// --- Явно указываем тип для хранилища ---
let activatedDays: Writable<string[]> = rawActivatedDays;
// --- КОНЕЦ ---

// --- Глобальное состояние страницы ---
let welderId: number;
let welder: Welder | undefined;
let allPlans: Plan[] = [];
let records: DbRecord[] = []; // Теперь DbRecord должен включать lastUpdated

// Состояние для формы добавления
let newArticle = '';
let newQuantity = '';

// Состояние для модального окна
let selectedRecord: DbRecord | null = null;
let selectedPlan: Plan | null = null;
let showModal = false;
// --- Конец состояния ---

// --- Вычисляемые значения (reactive statements) ---
$: activePlans = allPlans.filter(p => p.isUnlimited || (p.quantity > 0 && p.completed < p.quantity));
// --- Конец вычисляемых значений ---

// --- Simple per-welder mutex (to avoid race conditions when writing dailies) ---
const welderLocks = new Map<number, Promise<void>>();

function acquireWelderLock(id: number): Promise<() => void> {
	// Create a new "slot" that will be resolved when this task is done
	let release!: () => void;
	const p = new Promise<void>((res) => (release = res));

	const prev = welderLocks.get(id) || Promise.resolve();
	// Chain the new slot after previous
	welderLocks.set(id, prev.then(() => p));

	// Return a function that resolves the current slot
	return Promise.resolve(() => {
		release();
		// If current slot is last, clean up map entry (best-effort)
		const cur = welderLocks.get(id);
		// Note: can't easily compare Promises here for identity in all engines; leave map cleanup optional
	});
}
// --- end mutex ---

// --- Основные функции работы с данными ---
async function loadData() {
	welder = await db.welders.get(parseInt($page.params.id!, 10));
	if (!welder) {
		console.error('Сварщик не найден!');
		return;
	}
	welderId = welder.id!;
	allPlans = await db.plans.toArray();
	// ЗАМЕНИ ЭТУ СТРОКУ:
	// records = await db.records.where('welderId').equals(welderId).reverse().sortBy('date');
	// НА ЭТУ:
	records = await db.records.where('welderId').equals(welderId).reverse().sortBy('lastUpdated'); // Сортировка по lastUpdated (новые сверху)
}

// --- Вспомогательные функции ---
function getDateString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function getMonthKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function nextWorkingDate(date: Date): Date {
	let next = new Date(date);
	next.setDate(next.getDate() + 1);
	while (next.getDay() === 0 || next.getDay() === 6) {
		next.setDate(next.getDate() + 1);
	}
	return next;
}

// !!! FIX: считаем ВСЕ часы сварщика на дату (независимо от артикула),
// чтобы соблюдался лимит 8 часов на ячейку.
async function getOccupiedHours(_article: string, dateStr: string): Promise<number> {
	// используем where по индексируемым полям — быстрее и корректнее
	const dailies: DailyAllocation[] = await db.dailies
		.where({ welderId, dateStr })
		.toArray();
	return dailies.reduce((acc: number, d: DailyAllocation) => acc + d.hours, 0);
}

// Получить map dateStr -> hours для dailies, которые принадлежали записи (используется при редактировании)
async function getRecordDailiesMap(record: DbRecord): Promise<Record<string, number>> {
	const map: Record<string, number> = {};
	const recordDate = new Date(record.date);
	const recordMonthKey = getMonthKey(recordDate);

	const dailies: DailyAllocation[] = await db.dailies
		.where('welderId')
		.equals(welderId)
		.filter((d: DailyAllocation) => {
			const dMonthKey = getMonthKey(new Date(d.dateStr));
			return d.article === record.article && dMonthKey === recordMonthKey;
		})
		.toArray();

	for (const d of dailies) {
		map[d.dateStr] = (map[d.dateStr] || 0) + d.hours;
	}
	return map;
}

// --- РАСПРЕДЕЛЕНИЕ ЧАСОВ ---
// excludeMap: optional map dateStr -> hours (часы, которые нужно вычесть из занятости БД, например старые dailies этой же записи)
async function distributeHours(article: string, totalHours: number, excludeMap: Record<string, number> = {}): Promise<{ dateStr: string; hours: number }[]> {
	let hoursLeft = totalHours;
	const dailyDistribution: { dateStr: string; hours: number }[] = [];

	const priorityDates = [...$activatedDays].sort((a, b) => a.localeCompare(b));
	const priorityDatesSet = new Set(priorityDates);

	// локальная карта уже выделённых в этом вызове часов (чтобы не переписать одну дату несколько раз)
	const allocatedSoFar: Record<string, number> = {};

	// вспомог: получить текущую занятость с учётом excludeMap и allocatedSoFar
	async function getEffectiveOccupied(articleLocal: string, dateStr: string): Promise<number> {
		const dbOccupied = await getOccupiedHours(articleLocal, dateStr);
		const excluded = excludeMap[dateStr] || 0;
		const alreadyAllocated = allocatedSoFar[dateStr] || 0;
		// effective = (в базе - то, что мы исключаем) + то, что мы уже запланировали в этой сессии
		let effective = dbOccupied - excluded + alreadyAllocated;
		if (effective < 0) effective = 0;
		return effective;
	}

	// ШАГ 1: Приоритетное распределение по активированным ячейкам
	for (const dateStr of priorityDates) {
		if (hoursLeft <= 0.01) break;
		const occupied = await getEffectiveOccupied(article, dateStr);
		const free = Math.max(0, 8 - occupied);
		if (free > 0) {
			const toAdd = Math.min(hoursLeft, free);
			dailyDistribution.push({ dateStr, hours: toAdd });
			allocatedSoFar[dateStr] = (allocatedSoFar[dateStr] || 0) + toAdd;
			hoursLeft -= toAdd;
		}
	}

	// ШАГ 2: Стандартное распределение остатка с сегодняшего дня
	let currentDate = new Date();
	while (hoursLeft > 0.01) {
		const dayString = getDateString(currentDate);
		if (priorityDatesSet.has(dayString)) {
			currentDate = nextWorkingDate(currentDate);
			continue;
		}
		const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
		if (isWeekend) {
			currentDate = nextWorkingDate(currentDate);
			continue;
		}
		const occupied = await getEffectiveOccupied(article, dayString);
		const free = Math.max(0, 8 - occupied);
		if (free > 0) {
			const toAdd = Math.min(hoursLeft, free);
			dailyDistribution.push({ dateStr: dayString, hours: toAdd });
			allocatedSoFar[dayString] = (allocatedSoFar[dayString] || 0) + toAdd;
			hoursLeft -= toAdd;
		}
		currentDate = nextWorkingDate(currentDate);
	}

	return dailyDistribution;
}

// --- Удаление dailies для записи ---
async function deleteDailiesForRecord(record: DbRecord) {
	const art = record.article;
	const recordDate = new Date(record.date);
	const recordMonthKey = getMonthKey(recordDate);

	await db.dailies
		.where('welderId')
		.equals(welderId)
		.filter((d: DailyAllocation) => {
			const dMonthKey = getMonthKey(new Date(d.dateStr));
			return d.article === art && dMonthKey === recordMonthKey;
		})
		.delete();
}

// Тумблирование активированных дней (toggle) — вызывай из календаря по долгому тапу
function toggleActivatedDay(dateStr: string) {
	activatedDays.update(arr => {
		const idx = arr.indexOf(dateStr);
		if (idx === -1) {
			return [...arr, dateStr].sort((a, b) => a.localeCompare(b));
		} else {
			const next = arr.slice();
			next.splice(idx, 1);
			return next;
		}
	});
}

// 1. Из RecordForm: пользователь хочет добавить запись
async function handleAdd(event: CustomEvent<{ article: string; quantity: string | number }>) {
	try {
		const { article, quantity } = event.detail;
		const qty = parseFloat(String(quantity).replace(',', '.'));
		if (article.trim() === '' || isNaN(qty) || qty <= 0) {
			alert('Введите артикул и корректное количество!');
			return;
		}
		const activePlan = activePlans.find(p => p.article.toLowerCase() === article.trim().toLowerCase());
		if (!activePlan) {
			alert('Такого артикула нет в активном плане или он уже выполнен!');
			return;
		}

		if (!activePlan.isUnlimited && activePlan.completed + qty > activePlan.quantity) {
			alert(`Нельзя добавить! Превышен план по артикулу "${activePlan.article}". Осталось ${(activePlan.quantity - activePlan.completed).toFixed(2).replace(/\.?0+$/, '')}шт.`);
			return;
		}

		const art = article.trim().toUpperCase();
		const norm = await db.norms.where('article').equals(art).first();
		if (!norm) {
			alert(`Не найдена норма времени для артикула "${art}"!`);
			return;
		}

		const totalHours = qty * norm.time;

		// Acquire per-welder lock to avoid concurrent writes that can break the 8h limit
		const release = await acquireWelderLock(welderId);
		try {
			// При создании новой записи excludeMap не нужен
			const dailyDistribution = await distributeHours(art, totalHours);

			// Агрегация по месяцам
			const aggregatedQuantities = new Map<string, number>();
			for (const entry of dailyDistribution) {
				const date = new Date(entry.dateStr);
				const monthKey = getMonthKey(date);
				const quantityForDay = entry.hours / norm.time;
				aggregatedQuantities.set(monthKey, (aggregatedQuantities.get(monthKey) || 0) + quantityForDay);
			}

			await db.transaction('rw', [db.records, db.plans, db.dailies], async () => {
				for (const entry of dailyDistribution) {
					await db.dailies.add({
						welderId: welderId,
						article: art,
						dateStr: entry.dateStr,
						hours: entry.hours
					});
				}

				// ИСПРАВЛЕНО: Создаём/обновляем записи с lastUpdated
				for (const [monthKey, quantity] of aggregatedQuantities.entries()) {
					const [year, month] = monthKey.split('-').map(Number);
					const recordDate = new Date(year, month - 1, 1);

					const existingRecord = await db.records
						.where({ welderId, article: art })
						.and(r => {
							const rDate = new Date(r.date);
							return rDate.getFullYear() === year && rDate.getMonth() === month - 1;
						})
						.first();

					const historyEntry = { date: new Date().toISOString(), quantity: quantity, note: `Добавлено ${quantity.toFixed(2)} шт` };
					const now = new Date(); // <-- Время изменения
					if (existingRecord) {
						const newTotalQuantity = existingRecord.quantity + quantity;
						const newHistory = [...JSON.parse(existingRecord.history || '[]'), historyEntry];
						// Обновляем запись с lastUpdated
						await db.records.update(existingRecord.id!, { quantity: newTotalQuantity, history: JSON.stringify(newHistory), lastUpdated: now });
					} else {
						// Создаём новую запись с lastUpdated
						await db.records.add({
							welderId: welderId,
							article: art,
							quantity: quantity,
							date: recordDate,
							history: JSON.stringify([historyEntry]),
							lastUpdated: now // <-- Добавляем lastUpdated при создании
						});
					}
				}

				activePlan.completed += qty;
				await db.plans.update(activePlan.id!, { completed: activePlan.completed });
			});
		} finally {
			// release lock
			release();
		}

		// НЕ очищаем activatedDays — чтобы выбор ячеек сохранялся между вводами
		newArticle = '';
		newQuantity = '';
		await loadData(); // Перезагружаем данные с новой сортировкой

	} catch (error) {
		console.error("Ошибка при добавлении записи:", error);
		alert(`Произошла ошибка! Подробности в консоли (F12).`);
	}
}

// 2. Из RecordList: пользователь кликнул на артикул
function handleSelectArticle(event: CustomEvent<{ article: string }>) {
	newArticle = event.detail.article;
	document.getElementById('quantity-input')?.focus();
}

// 3. Из RecordList: пользователь долго нажал на запись
function handleOpenModal(event: CustomEvent<{ record: DbRecord }>) {
	selectedRecord = event.detail.record;
	selectedPlan = allPlans.find(p => p.article === selectedRecord!.article) || null;
	showModal = true;
}

// 4. Сохранение изменённой записи
async function handleSave(event: CustomEvent<{ newQuantity: number; quantityDifference: number }>) {
	if (!selectedRecord || !selectedPlan) return;

	const record = selectedRecord;
	const plan = selectedPlan;
	const { newQuantity, quantityDifference } = event.detail;

	try {
		const art = record.article;
		const norm = await db.norms.where('article').equals(art).first();
		if (!norm) {
			alert(`Не найдена норма времени для артикула "${art}"!`);
			return;
		}

		const oldQuantity = record.quantity;
		const totalHours = newQuantity * norm.time;

		// --- НОВОЕ: сначала считываем, какие dailies принадлежали этой записи (map date->hours)
		const recordOwnMap = await getRecordDailiesMap(record);

		// Удаляем старые dailies (как раньше)
		await deleteDailiesForRecord(record);

		// Acquire per-welder lock to avoid race conditions while redistributing and writing
		const release = await acquireWelderLock(welderId);
		try {
			// Распределяем новые часы, передавая excludeMap = recordOwnMap,
			// чтобы distributeHours "знал", какие часы были нашими и не учитывал их дважды.
			const dailyDistribution = await distributeHours(art, totalHours, recordOwnMap);

			await db.transaction('rw', [db.records, db.plans, db.dailies], async () => {
				// Добавляем новые dailies
				for (const entry of dailyDistribution) {
					await db.dailies.add({
						welderId: welderId,
						article: art,
						dateStr: entry.dateStr,
						hours: entry.hours
					});
				}

				// Обновляем запись
				const historyEntry = {
					date: new Date().toISOString(),
					quantity: quantityDifference,
					note: `Изменено с ${oldQuantity.toFixed(2).replace(/\.?0+$/, '')} на ${newQuantity.toFixed(2).replace(/\.?0+$/, '')}`
				};
				const newHistory = [...JSON.parse(record.history || '[]'), historyEntry];
				const now = new Date(); // <-- Время изменения
				// Обновляем запись с lastUpdated
				await db.records.update(record.id!, {
					quantity: newQuantity,
					date: record.date,
					history: JSON.stringify(newHistory),
					lastUpdated: now // <-- Устанавливаем lastUpdated при редактировании
				});

				// Обновляем план
				plan.completed += quantityDifference;
				await db.plans.update(plan.id!, { completed: plan.completed });
			});
		} finally {
			release();
		}

		// НЕ очищаем activatedDays — чтобы выбор ячеек сохранялся между правками
		closeModal();
		await loadData(); // Перезагружаем данные с новой сортировкой

	} catch (error) {
		console.error("Ошибка при сохранении:", error);
		alert(`Произошла ошибка! Подробности в консоли (F12).`);
	}
}

// 5. Удаление записи
async function handleDelete() {
	if (!selectedRecord || !selectedPlan) return;

	const record = selectedRecord;
	const plan = selectedPlan;

	try {
		// Удаляем связанные dailies
		await deleteDailiesForRecord(record);

		await db.transaction('rw', db.records, db.plans, async () => {
			// Удаляем запись
			await db.records.delete(record.id!);
			plan.completed -= record.quantity;
			if (plan.completed < 0) plan.completed = 0;
			await db.plans.update(plan.id!, { completed: plan.completed });
		});

		closeModal();
		await loadData(); // Перезагружаем данные с новой сортировкой
	} catch (error) {
		console.error("Ошибка при удалении:", error);
		alert(`Произошла ошибка! Подробности в консоли (F12).`);
	}
}

// 6. Из RecordModal: пользователь закрыл окно
function closeModal() {
	showModal = false;
	selectedRecord = null;
	selectedPlan = null;
}
// --- Конец обработчиков ---

onMount(() => {
	loadData();
});
</script>


<main>
{#if welder}
<h1>Карточка сварщика: {welder.name}</h1>
{:else}
<h1>Сварщик не найден</h1>
{/if}


<RecordForm
  {activePlans}
  bind:newArticle
  bind:newQuantity
  on:add={handleAdd}
/>


<RecordList
  {records} <!-- Передаём отсортированные записи -->
  {allPlans}
  on:selectArticle={handleSelectArticle}
  on:openModal={handleOpenModal}
/>


<RecordModal
  bind:show={showModal}
  selectedRecord={selectedRecord}
  plan={selectedPlan}
  on:save={handleSave}
  on:delete={handleDelete}
  on:close={closeModal}
/>


<div class="bottom-nav">
<a href="{base}/">домой ∆</a>
</div>
</main>

<style>
@import url('https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,700;1,400&display=swap');

main {
	font-family: 'Roboto', sans-serif;
	text-align: center;
	padding: 2em 1em;
	max-width: 800px;
	margin: 0 auto;
	color: #2c3e50;
	background-color: #f9fafb;
	border-radius: 12px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
	padding-bottom: 100px; /* Increased for better spacing with fixed nav */
}

h1 {
	color: #34495e;
	font-weight: 700;
	font-size: 1.8em;
	border-bottom: 2px solid #ecf0f1;
	padding-bottom: 15px;
	margin-bottom: 30px;
	letter-spacing: 0.5px;
}

.bottom-nav {
	position: fixed;
	bottom: 0;
	left: 0;
	width: 100%;
	background-color: #3498db;
	padding: 1.2em;
	text-align: center;
	box-sizing: border-box;
	box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
	z-index: 1000;
}

.bottom-nav a {
	color: #ffffff;
	text-decoration: none;
	font-weight: 500;
	font-size: 1.1em;
	padding: 12px 28px;
	border-radius: 8px;
	background-color: #2980b9;
	transition: background-color 0.3s ease, transform 0.2s ease;
}

.bottom-nav a:hover {
	background-color: #2574a9;
	transform: translateY(-2px);
}

/* Additional styles for readability and modern feel */
:global(body) {
	background-color: #ecf0f1;
	font-family: 'Roboto', sans-serif;
}

:global(input, button, select) {
	font-family: 'Roboto', sans-serif;
	border-radius: 6px;
	border: 1px solid #bdc3c7;
	padding: 10px;
	font-size: 1em;
	transition: border-color 0.2s;
}

:global(input:focus, button:focus, select:focus) {
	border-color: #3498db;
	outline: none;
}

:global(button) {
	background-color: #3498db;
	color: white;
	border: none;
	cursor: pointer;
	transition: background-color 0.3s;
}

:global(button:hover) {
	background-color: #2980b9;
}

/* Assuming RecordList has class .record-entry for entries */
:global(.record-entry) {
	font-family: 'Roboto', sans-serif;
	font-size: 1.1em;
	font-style: italic; /* For a 'beautiful' touch, or remove if not desired */
	color: #34495e;
	padding: 12px;
	background-color: #ffffff;
	border-radius: 8px;
	margin-bottom: 12px;
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
	transition: box-shadow 0.2s;
}

:global(.record-entry:hover) {
	box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}
</style>
