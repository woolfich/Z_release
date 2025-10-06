<script lang="ts">
    import ImportExport from '$lib/components/ImportExport.svelte';
    import { onMount } from 'svelte';
    import { db, type Welder } from '$lib/db';
    import { base } from '$app/paths';

    // Переменная для хранения нового имени из инпута
    let newWelderName = '';

    // Реактивный массив, который будет хранить список сварщиков из БД
    let welders: Welder[] = [];

    // Функция для загрузки сварщиков из базы данных
    async function loadWelders() {
        // Сортируем по имени для удобства
        welders = await db.welders.orderBy('name').toArray();
    }

    // Функция для добавления нового сварщика
    async function addWelder() {
        // Не добавляем пустые строки
        if (newWelderName.trim() === '') {
            alert('Введите фамилию!');
            return;
        }

        // Добавляем запись в таблицу 'welders' в нашей БД
        await db.welders.add({
            name: newWelderName.trim()
        });

        // Очищаем инпут
        newWelderName = '';

        // Перезагружаем список, чтобы увидеть изменения
        await loadWelders();
    }

    // onMount - это хук Svelte, который выполняется один раз при загрузке компонента
    // Идеальное место, чтобы загрузить данные из БД
    onMount(() => {
        loadWelders();
    });
</script>

<main>
    <h1>Учёт сварщиков</h1>

    <!-- Блок с добавлением и импортом/экспортом -->
    <div class="controls">
        <div class="add-welder">
            <input
                type="text"
                placeholder="Фамилия сварщика"
                bind:value={newWelderName}
                on:keydown={(e) => {
                    if (e.key === 'Enter') addWelder();
                }}
            />
            <button on:click={addWelder}>Добавить</button>
        </div>
        <!-- Кнопки Импорт/Экспорт пока просто заглушки -->
                <!-- Используем наш новый компонент -->
        <ImportExport />
    </div>

    <!-- Список сварщиков -->
    <div class="welder-list">
             {#each welders as welder (welder.id)}
                <a href="{base}/welder/{welder.id}" class="welder-item">{welder.name}</a>
            {/each}
    </div>

    <!-- Фиксированная кнопка "План" -->
    <div class="bottom-nav">
            <a href="{base}/plan">План</a>
    </div>
</main>

<style>
    main {
        font-family: sans-serif;
        text-align: center;
        padding: 1em;
        max-width: 600px;
        margin: 0 auto;
        color: #333; /* Серо-стальной базовый цвет */
    }

    .controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1em;
        flex-wrap: wrap;
        gap: 10px;
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

    button:disabled {
        background-color: #ccc;
        cursor: not-allowed;
    }

    .welder-list {
        margin-top: 2em;
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

    .bottom-nav {
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        background-color: #444;
        padding: 1em;
        text-align: center;
        box-sizing: border-box; /* Чтобы padding не влиял на ширину */
    }

    .bottom-nav a {
        color: white;
        text-decoration: none;
        font-weight: bold;
        padding: 10px 20px;
        border-radius: 5px;
        background-color: #555;
        transition: background-color 0.2s;
    }

    .bottom-nav a:hover {
        background-color: #666;
    }
</style>