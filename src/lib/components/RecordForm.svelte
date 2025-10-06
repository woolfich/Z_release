<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { Plan } from '$lib/db';

    // --- Props (свойства), которые передаст родительский компонент ---
    export let activePlans: Plan[] = [];
    export let newArticle: string;
    export let newQuantity: string;
    // --- Конец Props ---

    const dispatch = createEventDispatcher();

    // --- Логика для подсказок (внутренняя для компонента) ---
    let showSuggestions = false;
    let suggestions: Plan[] = [];

    $: if (newArticle.trim() !== '') {
        suggestions = activePlans.filter(plan =>
            plan.article.toLowerCase().includes(newArticle.toLowerCase())
        );
        showSuggestions = suggestions.length > 0;
    } else {
        suggestions = [];
        showSuggestions = false;
    }

    function selectSuggestion(article: string) {
        newArticle = article;
        showSuggestions = false;
        // Фокус на следующее поле для удобства
        document.getElementById('quantity-input')?.focus();
    }

    // Функция, которая сообщит родителю о попытке добавления
    function handleAdd() {
        dispatch('add', {
            article: newArticle,
            quantity: newQuantity
        });
    }
</script>

<div class="add-record">
    <div class="input-with-suggestions">
        <input
            type="text"
            placeholder="Артикул"
            bind:value={newArticle}
            on:focus={() => showSuggestions = newArticle.trim() !== ''}
        />
        {#if showSuggestions}
            <div class="suggestions-list">
                {#each suggestions as suggestion (suggestion.id)}
                    <button class="suggestion-item" on:click={() => selectSuggestion(suggestion.article)}>
                        <span class="suggestion-article">{suggestion.article}</span>
                        <span class="suggestion-info">{suggestion.completed}/{suggestion.quantity}шт</span>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <input
        id="quantity-input"
        type="number"
        step="0.01"
        placeholder="Кол-во"
        bind:value={newQuantity}
        on:keydown={(e) => e.key === 'Enter' && handleAdd()}
    />
    <button on:click={handleAdd}>Добавить запись</button>
</div>

<style>
    .add-record {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-bottom: 2em;
        flex-wrap: wrap;
    }

    .input-with-suggestions {
        position: relative;
    }

    input {
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        max-width: 150px;
    }

    .suggestions-list {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background-color: white;
        border: 1px solid #ccc;
        border-top: none;
        border-radius: 0 0 4px 4px;
        max-height: 150px;
        overflow-y: auto;
        z-index: 10;
    }

    .suggestion-item {
        display: flex;
        justify-content: space-between;
        padding: 8px;
        cursor: pointer;
        width: 100%;
        background: none;
        border: none;
        text-align: left;
    }

    .suggestion-item:hover {
        background-color: #f0f0f0;
    }

    .suggestion-article {
        font-weight: bold;
        color: #333;
    }

    .suggestion-info {
        color: #888;
        font-size: 0.9em;
    }

    button {
        padding: 8px 12px;
        border: none;
        background-color: #555;
        color: white;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    button:hover {
        background-color: #777;
    }
</style>