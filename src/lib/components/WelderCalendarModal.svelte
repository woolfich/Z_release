<script lang="ts">
import { onMount, createEventDispatcher } from 'svelte';
import { activatedDays as rawActivatedDays } from '$lib/stores';
import { db, type DailyAllocation } from '$lib/db';
import type { Writable } from 'svelte/store';

// --- НОВОЕ: Явно указываем тип для хранилища ---
let activatedDays: Writable<string[]> = rawActivatedDays;
// --- КОНЕЦ НОВОГО ---
// --- Props ---
export let welder: any | null = null;
export let show: boolean = false;
// --- Конец Props ---

const dispatch = createEventDispatcher();

// --- Внутреннее состояние компонента ---
let calendarData: Map<string, CalendarDay[]> = new Map(); // 'YYYY-MM' -> CalendarDay[]
let currentMonthKey: string = '';
// --- Конец состояния ---

// --- Структура для данных одного дня в календаре ---
interface CalendarDay {
date: Date;
hours: number;
}
// --- Конец структуры ---

// --- Реактивная загрузка данных, когда компонент показывается или меняется сварщик ---
$: if (show && welder) {
loadDataAndBuildCalendar();
}
// --- Конец реактивной логики ---

async function loadDataAndBuildCalendar() {
if (!welder) return;

const dailies: DailyAllocation[] = await db.dailies.where('welderId').equals(welder.id!).toArray();

buildCalendarFromDailies(dailies);

// 3. Устанавливаем текущий месяц на самый последний, где есть работа
const months = Array.from(calendarData.keys()).sort();
if (months.length > 0) {
currentMonthKey = months[months.length - 1];
} else {
currentMonthKey = ''; // Нет данных
}
}

function buildCalendarFromDailies(dailies: DailyAllocation[]) {
const tempCalendarData = new Map<string, CalendarDay[]>();
const monthGroups = new Map<string, Map<string, number>>();

for (const daily of dailies) {
const date = new Date(daily.dateStr);
const monthKey = getMonthKey(date);
if (!monthGroups.has(monthKey)) {
monthGroups.set(monthKey, new Map());
}
const m = monthGroups.get(monthKey)!;
const dateStr = daily.dateStr;
m.set(dateStr, (m.get(dateStr) || 0) + daily.hours);
}

for (const [monthKey, dayMap] of monthGroups.entries()) {
const days: CalendarDay[] = Array.from(dayMap.entries()).map(([dateStr, hours]) => ({
date: new Date(dateStr),
hours
}));
days.sort((a, b) => a.date.getTime() - b.date.getTime());
tempCalendarData.set(monthKey, days);
}

calendarData = tempCalendarData;
}

// --- Вспомогательные функции ---
function getMonthKey(date: Date): string {
return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// НОВАЯ функция для красивого отображения часов
function formatHours(num: number): string {
// toFixed(1) округляет число до одной цифры после запятой и возвращает строку
return num.toFixed(2);
}

function getDaysInMonth(year: number, month: number): number {
return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
return new Date(year, month, 1).getDay();
}
// --- Конец вспомогательных функций ---

// --- Функции для общения с родителем ---
function handleClose() {
dispatch('close');
}
// --- НОВОЕ: Логика активации ячеек ---
function toggleDayActivation(dateString: string) {
activatedDays.update(days => {
const index = days.indexOf(dateString);
if (index > -1) {
// День уже активен, деактивируем его
return days.filter(d => d !== dateString);
} else {
// День не активен, активируем его
return [...days, dateString];
}
});
}

// --- НОВОЕ: Реализация долгого тапа для ячейки календаря ---
const LONG_PRESS_DAY_MS = 400; // Чуть быстрее, чем для списка
let dayPressTimer: number;

function handleDayPress(e: PointerEvent, date: Date) {
if (e.button !== 0) return;

const dateString = getDateString(date);
dayPressTimer = window.setTimeout(() => {
toggleDayActivation(dateString);
}, LONG_PRESS_DAY_MS);

const clearPress = () => clearTimeout(dayPressTimer);
// НОВОЕ: Добавляем проверку, что e.target существует
if (e.target) {
e.target.addEventListener('pointerup', clearPress, { once: true });
e.target.addEventListener('pointercancel', clearPress, { once: true });
}
}

// Вспомогательная функция для форматирования даты в 'YYYY-MM-DD'
function getDateString(date: Date): string {
const year = date.getFullYear();
const month = String(date.getMonth() + 1).padStart(2, '0');
const day = String(date.getDate()).padStart(2, '0');
return `${year}-${month}-${day}`;
}
// --- КОНЕЦ НОВОГО ---

// НОВАЯ функция для клика по оверлею
function handleOverlayClick(event: MouseEvent) {
if (event.target === event.currentTarget) {
handleClose();
}
}
// --- Конец функций общения ---

// --- Логика для отображения календаря ---
$: currentMonthData = calendarData.get(currentMonthKey) || [];
$: [currentYear, currentMonth] = currentMonthKey.split('-').map(Number);
$: daysInCurrentMonth = currentYear ? getDaysInMonth(currentYear, currentMonth - 1) : 0;
$: firstDayOffset = currentYear ? getFirstDayOfMonth(currentYear, currentMonth - 1) : 0;
// --- Конец логики отображения ---
</script>

{#if show && welder}
<!-- ИСПРАВЛЕНО: Правильная вложенность div'ов -->
<div
class="modal-overlay"
role="button"
tabindex="0"
aria-label="Закрыть окно"
on:click={handleOverlayClick} 
on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClose()}
>
<div
class="modal-content"
role="dialog"
aria-labelledby="modal-title"
tabindex="-1" 
on:keydown={(e) => e.key === 'Escape' && handleClose()}
>
<h3 id="modal-title">Календарь для: {welder.name}</h3>

{#if calendarData.size > 0}
<div class="calendar-nav">
<button on:click={() => {
const keys = Array.from(calendarData.keys()).sort();
const currentIndex = keys.indexOf(currentMonthKey);
if (currentIndex > 0) currentMonthKey = keys[currentIndex - 1];
}} disabled={currentMonthKey === Array.from(calendarData.keys()).sort()[0]}>
← Пред.
</button>
<span class="current-month-title">
{currentMonth ? new Date(currentYear, currentMonth - 1).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' }) : ''}
</span>
<button on:click={() => {
const keys = Array.from(calendarData.keys()).sort();
const currentIndex = keys.indexOf(currentMonthKey);
if (currentIndex < keys.length - 1) currentMonthKey = keys[currentIndex + 1];
}} disabled={currentMonthKey === Array.from(calendarData.keys()).sort()[Array.from(calendarData.keys()).length - 1]}>
След. →
</button>
</div>

<div class="calendar-grid">
<!-- Пустые ячейки для выравнивания по дням недели -->
{#each Array(firstDayOffset) as _}
<div class="calendar-day empty"></div>
{/each}
<!-- Ячейки дней месяца -->
{#each Array(daysInCurrentMonth) as _, i (i)}
{@const dayDate = new Date(currentYear, currentMonth - 1, i + 1)}
{@const dayOfWeek = dayDate.getDay()} <!-- получаем день недели -->
{@const dayData = currentMonthData.find(d => d.date.getFullYear() === dayDate.getFullYear() && d.date.getMonth() === dayDate.getMonth() && d.date.getDate() === dayDate.getDate())}
<div
class="calendar-day"
class:has-work={dayData}
class:weekend={dayOfWeek === 0 || dayOfWeek === 6}
class:activated={$activatedDays.includes(getDateString(dayDate))} 
role="button"
tabindex="0"
on:pointerdown={(e) => handleDayPress(e, dayDate)}
on:keydown={(e) => e.key === 'Enter' && toggleDayActivation(getDateString(dayDate))}
>
<span class="day-number">{i + 1}</span>
{#if dayData}
<span class="hours">{formatHours(dayData.hours)}ч</span>
{/if}
</div>
{/each}
</div>
{:else}
<p style="text-align: center; color: #888;">За этот период нет выполненных работ.</p>
{/if}

<div class="modal-actions">
<button class="cancel-button" on:click={handleClose}>Закрыть</button>
</div>
</div>
</div>
<!-- КОНЕЦ ИСПРАВЛЕННОГО БЛОКА -->
{/if}

<style>
.modal-overlay {
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background-color: rgba(0, 0, 0, 0.5);
display: flex;
justify-content: center;
align-items: center;
z-index: 1000;
padding: 20px;
box-sizing: border-box;
}

.modal-content {
background: white;
padding: 20px;
border-radius: 8px;
box-shadow: 0 4px 12px rgba(0,0,0,0.2);
max-width: 95%;
width: 500px;
max-height: 90vh;
overflow-y: auto;
text-align: left;
}

.modal-content h3 {
margin-top: 0;
text-align: center;
color: #333;
}

.calendar-nav {
display: flex;
justify-content: space-between;
align-items: center;
margin: 20px 0;
font-weight: bold;
}

.current-month-title {
color: #444;
}

.calendar-grid {
display: grid;
grid-template-columns: repeat(7, 1fr);
gap: 5px;
text-align: center;
}

.calendar-day {
aspect-ratio: 1 / 1;
display: flex;
flex-direction: column;
justify-content: center;
align-items: center;
border: 1px solid #eee;
border-radius: 4px;
font-size: 0.8em;
background-color: #fafafa;
}

.calendar-day.empty {
visibility: hidden;
}

/* --- НОВЫЕ СТИЛИ ДЛЯ ВЫХОДНЫХ --- */
.calendar-day.weekend {
background-color: #fce4ec; /* Нежно-розовый */
color: #616161; /* Чуть темнее текст для читаемости */
} 

.calendar-day.has-work {
background-color: #e8f5e9;
border-color: #c8e6c9;
font-weight: bold;
}

.day-number {
color: #555;
}

.hours {
color: #2e7d32;
font-size: 0.9em;
}

.modal-actions {
margin-top: 20px;
}

.cancel-button {
width: 100%;
background-color: #777;
color: white;
padding: 10px;
border: none;
border-radius: 4px;
cursor: pointer;
font-weight: bold;
}

.cancel-button:hover {
background-color: #555;
}

/* --- НОВЫЙ СТИЛЬ ДЛЯ АКТИВИРОВАННОЙ ЯЧЕЙКИ --- */
.calendar-day.activated {
border: 2px solid #2196f3; /* Синяя рамка */
box-shadow: 0 0 5px rgba(33, 150, 243, 0.5);
}
/* --- КОНЕЦ НОВОГО СТИЛЯ --- */

</style>