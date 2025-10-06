<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import type { Record, Plan } from '$lib/db';

    // --- Props ---
    export let selectedRecord: Record | null = null;
    export let plan: Plan | null = null;
    export let show: boolean = false;
    // --- Конец Props ---

    const dispatch = createEventDispatcher();
    let editQuantity = '';

    // Реактивно обновляем поле ввода, когда выбрана новая запись
    $: if (selectedRecord) {
        editQuantity = selectedRecord.quantity.toString();
    }

    // --- НОВОЕ: Логика для красивой истории "было -> стало" ---
    $: historyChanges = calculateHistory(selectedRecord);

    function calculateHistory(record: Record | null) {
        if (!record || !record.history) return [];

        const history = JSON.parse(record.history);
        const changes = [];
        let currentQuantity = 0;

        for (const entry of history) {
            const was = currentQuantity;
            const became = currentQuantity + entry.quantity;
            changes.push({
                date: new Date(entry.date),
                was: was,
                became: became,
                note: entry.note || ''
            });
            currentQuantity = became;
        }
        return changes.reverse(); // Новые изменения сверху
    }
    // --- КОНЕЦ ЛОГИКИ ---

    function formatQuantity(num: number): string {
        return num.toFixed(2).replace(/\.?0+$/, '');
    }

    // --- Функции для общения с родителем ---
    function handleSave() {
        if (!selectedRecord || !plan) return;

                const newQuantity = parseFloat(String(editQuantity).replace(',', '.'));
        if (isNaN(newQuantity) || newQuantity < 0) {
            alert('Введите корректное количество!');
            return;
        }

        const quantityDifference = newQuantity - selectedRecord.quantity;
        const newTotalForArticle = plan.completed + quantityDifference;

        // Проверка на превышение плана
        if (newTotalForArticle > plan.quantity) {
            alert(`Нельзя изменить! Итоговое количество (${formatQuantity(newTotalForArticle)}шт) превысит план (${formatQuantity(plan.quantity)}шт).`);
            return;
        }

        dispatch('save', { newQuantity, quantityDifference });
    }

    function handleDelete() {
        if (!selectedRecord) return;
        if (confirm(`Удалить запись "${selectedRecord.article}"?`)) {
            dispatch('delete');
        }
    }

    function handleClose() {
        dispatch('close');
    }
    // --- Конец функций общения ---
</script>

{#if show && selectedRecord && plan}
    <div class="modal-overlay" role="button" tabindex="0" on:click={handleClose} on:keydown={(e) => e.key === 'Enter' && handleClose()}>
        <div class="modal-content" role="dialog" aria-labelledby="modal-title" tabindex="-1" on:click|stopPropagation on:keydown={(e) => e.key === 'Escape' && handleClose()}>
            <h3 id="modal-title">Запись: {selectedRecord.article}</h3>

            <!-- Блок для редактирования количества -->
            <div class="edit-section">
                <label for="edit-quantity-input">Изменить количество:</label>
                <input id="edit-quantity-input" type="number" step="0.01" bind:value={editQuantity} />
            </div>

            <!-- Блок с историей -->
            <div class="history-section">
                <h4>История изменений:</h4>
                <div class="history-list">
                    {#each historyChanges as change (change.date.toISOString())}
                        <div class="history-item">
                            <span class="history-date">{change.date.toLocaleDateString('ru-RU')}</span>
                            <span class="history-change">
                                {formatQuantity(change.was)}шт --► {formatQuantity(change.became)}шт
                                {#if change.note}
                                    <span class="history-note">({change.note})</span>
                                {/if}
                            </span>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Кнопки действий -->
            <div class="modal-actions">
                <button class="save-button" on:click={handleSave}>Сохранить</button>
                <button class="delete-button" on:click={handleDelete}>🗑️ Удалить</button>
                <button class="cancel-button" on:click={handleClose}>Отмена</button>
            </div>
        </div>
    </div>
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
        outline: none;
    }

    .modal-content {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        max-width: 450px;
        width: 90%;
        text-align: left;
    }

    .modal-content h3 {
        margin-top: 0;
        text-align: center;
        color: #333;
    }

    .edit-section {
        margin: 20px 0;
        padding: 15px;
        background-color: #f9f9f9;
        border-radius: 5px;
        border: 1px solid #eee;
    }

    .edit-section label {
        display: block;
        font-weight: bold;
        margin-bottom: 8px;
    }

    .edit-section input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
    }

    .history-section {
        margin-top: 20px;
    }

    .history-section h4 {
        margin-bottom: 10px;
        border-bottom: 1px solid #ddd;
        padding-bottom: 5px;
    }

    .history-list {
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #eee;
        padding: 10px;
        background-color: #fafafa;
    }

    .history-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid #f0f0f0;
        font-size: 0.9em;
    }

    .history-item:last-child {
        border-bottom: none;
    }

    .history-date {
        font-weight: bold;
        color: #555;
        flex-shrink: 0;
        margin-right: 10px;
    }

    .history-change {
        color: #333;
    }

    .history-note {
        color: #888;
        font-style: italic;
    }

    .modal-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 20px;
    }

    .save-button {
        background-color: #5cb85c;
    }

    .save-button:hover {
        background-color: #4cae4c;
    }

    .delete-button {
        background-color: #d9534f;
    }

    .delete-button:hover {
        background-color: #c9302c;
    }

    .cancel-button {
        background-color: #777;
    }

    .cancel-button:hover {
        background-color: #555;
    }

    button {
        padding: 10px 12px;
        border: none;
        color: white;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
        font-weight: bold;
    }
</style>