<script lang="ts">
    import ImportExport from '$lib/components/ImportExport.svelte';
    import { onMount } from 'svelte';
    import { db, type Welder } from '$lib/db';
    import { base } from '$app/paths';

    let newWelderName = '';
    let welders: Welder[] = [];

    async function loadWelders() {
        welders = await db.welders.orderBy('name').toArray();
    }

    async function addWelder() {
        if (newWelderName.trim() === '') {
            alert('Введите фамилию!');
            return;
        }
        await db.welders.add({ name: newWelderName.trim() });
        newWelderName = '';
        await loadWelders();
    }

    onMount(() => {
        loadWelders();
    });
</script>

<!-- Весь экран теперь flex-контейнер -->
<div class="app-container">
    <!-- Фиксированный верхний блок -->
    <header class="main-header">
        <h1>Учёт сварщиков</h1>
        <div class="controls">
            <div class="add-welder">
                <input
                    type="text"
                    placeholder="Фамилия сварщика"
                    bind:value={newWelderName}
                    on:keydown={(e) => e.key === 'Enter' && addWelder()}
                />
                <button on:click={addWelder}>Добавить</button>
            </div>
            <ImportExport />
        </div>
    </header>

    <!-- Основной контент, который занимает всё оставшееся пространство -->
    <main class="main-content">
        <div class="welder-list">
            {#each welders as welder (welder.id)}
                <a href="{base}/welder/{welder.id}" class="welder-item">{welder.name}</a>
            {/each}
        </div>
    </main>

    <!-- Фиксированный нижний блок -->
    <footer class="main-footer">
        <a href="{base}/plan">План</a>
    </footer>
</div>

<style>
    .app-container {
        display: flex;
        flex-direction: column;
        height: 100vh; /* Занимаем всю высоту экрана */
        max-width: 600px;
        margin: 0 auto;
        font-family: sans-serif;
        color: #333;
    }

    .main-header {
        flex-shrink: 0; /* Не сжимается */
        padding: 1em;
        border-bottom: 1px solid #eee;
        background-color: #fafafa;
    }

    .main-header h1 {
        margin: 0 0 0.5em 0;
        color: #444;
    }

    .controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .add-welder {
        display: flex;
        gap: 8px;
    }

    input {
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
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

    button:hover:not(:disabled) {
        background-color: #777;
    }

    /* --- Стили для основного контента --- */
    .main-content {
        flex-grow: 1; /* Занимает всё доступное пространство */
        overflow-y: auto; /* Включаем скролл только для этого блока */
        padding: 1em;
    }

    .welder-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .welder-item {
        display: block;
        padding: 15px;
        background-color: #f4f4f4;
        border: 1px solid #ddd;
        border-radius: 5px;
        text-decoration: none;
        color: #333;
        transition: background-color 0.2s, transform 0.1s;
    }

    .welder-item:hover {
        background-color: #e8e8e8;
        transform: translateY(-2px);
    }

    /* --- Стили для нижнего блока --- */
    .main-footer {
        flex-shrink: 0; /* Не сжимается */
        background-color: #444;
        padding: 1em;
        text-align: center;
        box-sizing: border-box;
    }

    .main-footer a {
        color: white;
        text-decoration: none;
        font-weight: bold;
        padding: 10px 20px;
        border-radius: 5px;
        background-color: #555;
        transition: background-color 0.2s;
        display: inline-block;
    }

    .main-footer a:hover {
        background-color: #666;
    }
</style>