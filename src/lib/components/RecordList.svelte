<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { Record, Plan } from '$lib/db';

    // --- Props ---
    export let records: Record[] = [];
    export let allPlans: Plan[] = [];
    // --- Конец Props ---

    const dispatch = createEventDispatcher();

    // --- Внутренние функции-помощники ---
    function formatQuantity(num: number): string {
        return num.toFixed(2).replace(/\.?0+$/, '');
    }

    // --- ИЗМЕНЁННАЯ ФУНКЦИЯ ГРУППИРОВКИ ---
    function groupRecordsByMonth(records: Record[] | undefined) {
        if (!records || records.length === 0) {
            return new Map();
        }
        // 1. Сортируем *все* записи по lastUpdated (новые сверху), если они еще не отсортированы
        // (предполагается, что родитель уже отсортировал, но на всякий случай)
        const sortedRecords = [...records].sort((a, b) => {
            // Убедись, что lastUpdated определено, иначе используй date как fallback
            const timeA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : new Date(a.date).getTime();
            const timeB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : new Date(b.date).getTime();
            return timeB - timeA; // Сортировка по убыванию (новые первыми)
        });

        const grouped = new Map<string, Record[]>();
        for (const record of sortedRecords) {
            const date = new Date(record.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!grouped.has(monthKey)) {
                grouped.set(monthKey, []);
            }
            // 2. Так как records уже отсортированы по lastUpdated, просто добавляем их в массив месяца
            // в порядке следования - порядок сохранится.
            grouped.get(monthKey)!.push(record);
        }
        return grouped;
    }
    // --- КОНЕЦ ИЗМЕНЁННОЙ ФУНКЦИИ ---


    $: groupedRecords = groupRecordsByMonth(records);

    function getUnitForRecord(record: Record): string {
        const plan = allPlans.find(p => p.article === record.article);
        return (plan && plan.isUnlimited) ? 'ч' : 'шт';
    }

    // --- НОВАЯ ЛОГИКА ОБРАБОТКИ КЛИКОВ И ДОЛГОГО НАЖАТИЯ ---
    let pressTimer: number;

    function handlePointerDown(event: PointerEvent, record: Record) {
        // Начинаем отсчет долгого нажатия
        pressTimer = window.setTimeout(() => {
            // Если за 500мс не было отпускания, считаем это долгим нажатием
            handleLongPress(record);
        }, 500);
    }

    function handlePointerUp(event: PointerEvent, record: Record) {
        // Отпустили палец/мышь
        clearTimeout(pressTimer); // Отменяем таймер долгого нажатия

        // Проверяем, что это было короткое нажатие (не было долгого)
        // и что событие было левой кнопкой мыши или касанием пальца
        if (event.button === 0 || event.pointerType === 'touch') {
            // Проверяем, не был ли клик по кнопке-артикулу
            const target = event.target as HTMLElement;
            if (target.closest('.article-button')) {
                handleArticleClick(record.article);
            }
        }
    }

    function handlePointerCancel() {
        // Если жест прервался (например, пользователь начал скроллить)
        clearTimeout(pressTimer);
    }
    // --- КОНЕЦ НОВОЙ ЛОГИКИ ---


    // --- Функции для общения с родителем ---
    function handleArticleClick(article: string) {
        dispatch('selectArticle', { article });
    }

    function handleLongPress(record: Record) {
        dispatch('openModal', { record });
    }
    // --- Конец функций общения ---
</script>

<div class="record-list">
    <h2>Выполненные работы</h2>
    {#each Array.from(groupedRecords.entries()) as [monthKey, monthRecords] (monthKey)}
        <div class="month-block">
            <h3 class="month-header">{new Date(monthKey + '-01').toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' })}</h3>
            {#each monthRecords as record (record.id)}
                <div
                    class="record-item"
                    role="button"
                    tabindex="0"
                    on:pointerdown={(e) => handlePointerDown(e, record)}
                    on:pointerup={(e) => handlePointerUp(e, record)}
                    on:pointercancel={handlePointerCancel}
                    on:keydown={(e) => e.key === 'Enter' && handleLongPress(record)}
                >
                    <button class="article-button">{record.article}</button>
                    <span class="quantity">{formatQuantity(record.quantity)}{getUnitForRecord(record)}</span>
                    <div class="date-info">
                        <span class="date">{new Date(record.date).toLocaleDateString('ru-RU')}</span>
                        <!-- Отображаем lastUpdated, если оно отличается от date -->
                        {#if record.lastUpdated && new Date(record.lastUpdated).getTime() !== new Date(record.date).getTime()}
                            <span class="updated-date">изм: {new Date(record.lastUpdated).toLocaleDateString('ru-RU')}</span>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/each}
</div>

<style>
    .record-list h2 {
        text-align: left;
        border-bottom: 1px solid #ddd;
        padding-bottom: 5px;
    }

    .month-block {
        margin-top: 1.5em;
    }

    .month-header {
        text-align: left;
        font-size: 1.1em;
        color: #555;
        border-bottom: 2px solid #eee;
        padding-bottom: 5px;
        margin-bottom: 10px;
    }

    .record-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        border-bottom: 1px solid #eee;
        /* --- НОВЫЕ СТИЛИ ДЛЯ МОБИЛЬНЫХ УСТРОЙСТВ --- */
        user-select: none; /* Запрещаем выделение текста */
        -webkit-tap-highlight-color: transparent; /* Убираем стандартную подсветку при тапе */
        outline: none;
        touch-action: manipulation; /* Отключаем задержку на двойной тап */
        /* --- КОНЕЦ НОВЫХ СТИЛЕЙ --- */
    }

    .record-item:hover, .record-item:focus {
        background-color: #f9f9f9;
    }

    .article-button {
        font-weight: bold;
        flex-grow: 1;
        text-align: left;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        transition: background-color 0.2s;
        color: #333;
    }

    .article-button:hover {
        background-color: #e0e0e0;
    }

    .quantity {
        color: #555;
        margin-right: 15px;
    }

    .date-info {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px; /* Небольшой отступ между датами */
    }

    .date {
        color: #999;
        font-size: 0.9em;
    }

    .updated-date {
        color: #ff6b6b; /* Красный цвет для даты изменения */
        font-size: 0.8em;
        font-weight: 500;
    }
</style>
