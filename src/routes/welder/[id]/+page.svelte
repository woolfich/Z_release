<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
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
import RecordList from '$lib/components/RecordList.svelte';
import RecordModal from '$lib/components/RecordModal.svelte';
// --- Конец импорта ---

// --- Явно указываем тип для хранилища ---
let activatedDays: Writable<string[]> = rawActivatedDays;
// --- КОНЕЦ ---

// --- Глобальное состояние страницы ---
let welderId: number;
let welder: Welder | undefined;
let allPlans: Plan[] = [];
let records: DbRecord[] = [];

// Состояние для формы добавления
let newArticle = '';
let newQuantity = '';

// Состояние для модального окна
let selectedRecord: DbRecord | null = null;
let selectedPlan: Plan | null = null;
let showModal = false;
// --- Конец состояния ---

// --- Вычисляемые значения ---
$: activePlans = allPlans.filter(p => p.isUnlimited || (p.quantity > 0 && p.completed < p.quantity));
// --- Конец вычисляемых значений ---

// --- Simple per-welder mutex ---
const welderLocks = new Map<number, Promise<void>>();

function acquireWelderLock(id: number): Promise<() => void> {
	let release!: () => void;
	const p = new Promise<void>((res) => (release = res));

	const prev = welderLocks.get(id) || Promise.resolve();
	welderLocks.set(id, prev.then(() => p));

	return Promise.resolve(() => {
		release();
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
	records = await db.records.where('welderId').equals(welderId).reverse().sortBy('date');
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

async function getOccupiedHours(_article: string, dateStr: string): Promise<number> {
	const dailies: DailyAllocation[] = await db.dailies
		.where({ welderId, dateStr })
		.toArray();
	return dailies.reduce((acc: number, d: DailyAllocation) => acc + d.hours, 0);
}

// --- РАСПРЕДЕЛЕНИЕ ЧАСОВ ---
async function distributeHours(article: string, totalHours: number, excludeMap: Record<string, number> = {}): Promise<{ dateStr: string; hours: number }[]> {
	let hoursLeft = totalHours;
	const dailyDistribution: { dateStr: string; hours: number }[] = [];

	const priorityDates = [...$activatedDays].sort((a, b) => a.localeCompare(b));
	const priorityDatesSet = new Set(priorityDates);
	const allocatedSoFar: Record<string, number> = {};

	async function getEffectiveOccupied(articleLocal: string, dateStr: string): Promise<number> {
		const dbOccupied = await getOccupiedHours(articleLocal, dateStr);
		const excluded = excludeMap[dateStr] || 0;
		const alreadyAllocated = allocatedSoFar[dateStr] || 0;
		let effective = dbOccupied - excluded + alreadyAllocated;
		if (effective < 0) effective = 0;
		return effective;
	}

	// ШАГ 1: Приоритетное распределение
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

	// ШАГ 2: Стандартное распределение
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

// Тумблирование активированных дней
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

// 1. Добавление записи
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

		const release = await acquireWelderLock(welderId);
		try {
			const dailyDistribution = await distributeHours(art, totalHours);

			await db.transaction('rw', [db.records, db.plans, db.dailies], async () => {
				// Сохраняем dailies
				for (const entry of dailyDistribution) {
					await db.dailies.add({
						welderId: welderId,
						article: art,
						dateStr: entry.dateStr,
						hours: entry.hours
					});
				}

				// ОДНА запись на операцию
				const now = new Date();
				const operationDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
				const historyEntry = { 
					date: new Date().toISOString(), 
					quantity: qty, 
					note: `Добавлено ${qty.toFixed(2)} шт` 
				};

				await db.records.add({
					welderId: welderId,
					article: art,
					quantity: qty,
					totalHours: totalHours, // ← "ярлык"
					date: operationDate,
					history: JSON.stringify([historyEntry])
				});

				activePlan.completed += qty;
				await db.plans.update(activePlan.id!, { completed: activePlan.completed });
			});
		} finally {
			release();
		}

		newArticle = '';
		newQuantity = '';
		await loadData();

	} catch (error) {
		console.error("Ошибка при добавлении записи:", error);
		alert(`Произошла ошибка! Подробности в консоли (F12).`);
	}
}

// 2. Выбор артикула из списка
function handleSelectArticle(event: CustomEvent<{ article: string }>) {
	newArticle = event.detail.article;
	document.getElementById('quantity-input')?.focus();
}

// 3. Открытие модального окна
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

		const newTotalHours = newQuantity * norm.time;

		await deleteDailiesForRecord(record);

		const release = await acquireWelderLock(welderId);
		try {
			const dailyDistribution = await distributeHours(art, newTotalHours);

			await db.transaction('rw', [db.records, db.plans, db.dailies], async () => {
				for (const entry of dailyDistribution) {
					await db.dailies.add({
						welderId: welderId,
						article: art,
						dateStr: entry.dateStr,
						hours: entry.hours
					});
				}

				const now = new Date();
				const updatedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
				const historyEntry = {
					date: new Date().toISOString(),
					quantity: quantityDifference,
					note: `Изменено с ${record.quantity.toFixed(2)} на ${newQuantity.toFixed(2)}`
				};
				const newHistory = [...JSON.parse(record.history || '[]'), historyEntry];

				await db.records.update(record.id!, {
					quantity: newQuantity,
					totalHours: newTotalHours, // ← обновляем "ярлык"
					date: updatedDate,
					history: JSON.stringify(newHistory)
				});

				plan.completed += quantityDifference;
				await db.plans.update(plan.id!, { completed: plan.completed });
			});
		} finally {
			release();
		}

		closeModal();
		await loadData();

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
		await deleteDailiesForRecord(record);

		await db.transaction('rw', db.records, db.plans, async () => {
			await db.records.delete(record.id!);
			plan.completed -= record.quantity;
			if (plan.completed < 0) plan.completed = 0;
			await db.plans.update(plan.id!, { completed: plan.completed });
		});

		closeModal();
		await loadData();
	} catch (error) {
		console.error("Ошибка при удалении:", error);
		alert(`Произошла ошибка! Подробности в консоли (F12).`);
	}
}

// 6. Закрытие модального окна
function closeModal() {
	showModal = false;
	selectedRecord = null;
	selectedPlan = null;
}

onMount(() => {
	loadData();
});
</script>

<main>
	<div class="header">
		{#if welder}
			<h1>Карточка сварщика</h1>
			<p class="welder-name">{welder.name}</p>
		{:else}
			<h1>Сварщик не найден</h1>
		{/if}
	</div>

	<div class="card">
		<RecordForm
			{activePlans}
			bind:newArticle
			bind:newQuantity
			on:add={handleAdd}
		/>
	</div>

	<div class="card">
		<RecordList
			{records}
			{allPlans}
			on:selectArticle={handleSelectArticle}
			on:openModal={handleOpenModal}
		/>
	</div>

	<RecordModal
		bind:show={showModal}
		selectedRecord={selectedRecord}
		plan={selectedPlan}
		on:save={handleSave}
		on:delete={handleDelete}
		on:close={closeModal}
	/>

	<div class="bottom-nav">
		<a href="{base}/" class="home-button">
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
			<span>Домой</span>
		</a>
	</div>
</main>

<style>
	:root {
		--font-family-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
		--background-color: #f8f9fa;
		--card-background: #ffffff;
		--text-color: #212529;
		--text-muted: #6c757d;
		--primary-color: #007bff;
		--primary-hover: #0056b3;
		--border-color: #dee2e6;
		--shadow: 0 4px 6px rgba(0, 0, 0, 0.05 );
		--border-radius: 8px;
	}

	:global(body) {
		margin: 0;
		font-family: var(--font-family-sans);
		background-color: var(--background-color);
		color: var(--text-color);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	main {
		padding: 1.5rem 1rem;
		max-width: 700px;
		margin: 0 auto;
		padding-bottom: 100px;
	}

	.header {
		text-align: center;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-muted);
		margin: 0;
	}

	.welder-name {
		font-size: 2rem;
		font-weight: 700;
		color: var(--text-color);
		margin: 0.25rem 0 0 0;
	}

	.card {
		background-color: var(--card-background);
		border-radius: var(--border-radius);
		box-shadow: var(--shadow);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		border: 1px solid var(--border-color);
	}

	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background-color: rgba(255, 255, 255, 0.8);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border-top: 1px solid var(--border-color);
		padding: 1rem;
		display: flex;
		justify-content: center;
		align-items: center;
		box-shadow: 0 -2px 10px rgba(0,0,0,0.07);
	}

	.home-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background-color: var(--primary-color);
		color: white;
		text-decoration: none;
		font-weight: 600;
		font-size: 1rem;
		padding: 0.75rem 1.5rem;
		border-radius: 50px;
		transition: background-color 0.2s ease, transform 0.2s ease;
		box-shadow: 0 2px 4px rgba(0, 123, 255, 0.3);
	}

	.home-button:hover {
		background-color: var(--primary-hover);
		transform: translateY(-2px);
	}

	.home-button:active {
		transform: translateY(0);
	}

	.home-button svg {
		transition: transform 0.2s ease;
	}

	.home-button:hover svg {
		transform: scale(1.1);
	}
</style>
