<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { Record, Plan } from '$lib/db';

       // --- Props ---
    export let records: Record[] = [];
    export let allPlans: Plan[] = []; // <-- НОВЫЙ PROP
    // --- Конец Props ---

    const dispatch = createEventDispatcher();

    // --- НОВОЕ: Умная функция для определения единицы измерения ---
    function getUnitForRecord(record: Record): string {
        const plan = allPlans.find(p => p.article === record.article);
        // Если план найден и он безлимитный, возвращаем "ч", иначе "шт"
        return (plan && plan.isUnlimited) ? 'ч' : 'шт';
    }
    // --- КОНЕЦ НОВОГО ---

    // --- Внутренние функции-помощники ---
    function formatQuantity(num: number): string {
        return num.toFixed(2).replace(/\.?0+$/, '');
    }

    function groupRecordsByMonth(records: Record[] | undefined) {
        if (!records || records.length === 0) {
            return new Map();
        }
        const grouped = new Map<string, Record[]>();
        for (const record of records) {
            const date = new Date(record.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!grouped.has(monthKey)) {
                grouped.set(monthKey, []);
            }
            grouped.get(monthKey)!.push(record);
        }
        return grouped;
    }

    // Реактивно группируем записи при их изменении
    $: groupedRecords = groupRecordsByMonth(records);

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
                    on:contextmenu|preventDefault={() => handleLongPress(record)}
                    on:keydown={(e) => e.key === 'Enter' && handleLongPress(record)}
                    on:touchstart|preventDefault
                    on:touchend|preventDefault
                >
                    <button class="article-button" on:click={() => handleArticleClick(record.article)}>
                        {record.article}
                    </button>
                                        <span class="quantity">{formatQuantity(record.quantity)}{getUnitForRecord(record)}</span>
                    <span class="date">{new Date(record.date).toLocaleDateString('ru-RU')}</span>
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
        user-select: none;
        outline: none;
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

    .date {
        color: #999;
        font-size: 0.9em;
    }
</style>