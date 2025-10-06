<script lang="ts">
    import { onMount } from 'svelte';
    import { db, type Plan } from '$lib/db';
        import { base } from '$app/paths';

    // Переменные для полей ввода
    let newArticle = '';
    let newQuantity = '';

    // Реактивный массив для хранения списка планов
    let plans: Plan[] = [];

    // Функция для загрузки планов из БД
    async function loadPlans() {
        // Загружаем планы, сортируя по ID, чтобы новые были сверху
        plans = await db.plans.orderBy('id').reverse().toArray();
    }

        // Функция для добавления нового плана
    async function addPlan() {
        const quantity = parseInt(newQuantity, 10);

        // Проверки на корректность ввода
        if (newArticle.trim() === '' || isNaN(quantity) || quantity < 0) { // Изменил проверку на >= 0
            alert('Введите артикул и корректное количество (0 для безлимита)!');
            return;
        }

        // --- НОВОЕ: Определяем, безлимитный ли это план ---
        const isUnlimited = quantity === 0;
        // --- КОНЕЦ НОВОГО ---

        // Добавляем запись в таблицу 'plans'
        await db.plans.add({
            article: newArticle.trim().toUpperCase(),
            quantity: quantity,
            completed: 0,
            isUnlimited: isUnlimited // <-- ДОБАВИЛИ НОВОЕ СВОЙСТВО
        });

        // Очищаем поля ввода
        newArticle = '';
        newQuantity = '';

        // Перезагружаем список
        await loadPlans();
    }

    // Загружаем данные при монтировании компонента
    onMount(() => {
        loadPlans();
    });
</script>

<main>
    <h1>План работ</h1>

    <!-- Блок для добавления нового плана -->
    <div class="add-plan">
        <input
            type="text"
            placeholder="Артикул (например, хт637)"
            bind:value={newArticle}
            on:keydown={(e) => {
                if (e.key === 'Enter') {
                    // Переводим фокус на поле количества
                    document.getElementById('quantity-input')?.focus();
                }
            }}
        />
        <input
            id="quantity-input"
            type="number"
            placeholder="Кол-во"
            bind:value={newQuantity}
            on:keydown={(e) => {
                if (e.key === 'Enter') addPlan();
            }}
        />
        <button on:click={addPlan}>Добавить</button>
    </div>

    <!-- Список планов -->
    <div class="plan-list">
        {#each plans as plan (plan.id)}
            <div class="plan-item" class:completed={plan.quantity > 0 && plan.completed >= plan.quantity}>
                <span class="article">{plan.article}</span>
                <span class="quantity">{plan.quantity}шт</span>
                <span class="progress">... {plan.completed}шт</span>
            </div>
        {/each}
    </div>

    <!-- Фиксированная кнопка "домой ∆" -->
    <div class="bottom-nav">
            <a href="{base}">домой ∆</a>

    </div>
</main>

<style>
    main {
        font-family: sans-serif;
        text-align: center;
        padding: 1em;
        max-width: 600px;
        margin: 0 auto;
        color: #333;
        padding-bottom: 80px; /* Место под фиксированную кнопку */
    }

    .add-plan {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-bottom: 2em;
        flex-wrap: wrap;
    }

    input {
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        max-width: 150px;
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

    .plan-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .plan-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        background-color: #f4f4f4;
        border: 1px solid #ddd;
        border-radius: 5px;
        transition: border-color 0.3s, background-color 0.3s;
    }

    /* Класс для выполненного плана */
    .plan-item.completed {
        border-color: #4caf50; /* Зеленый контур */
        background-color: #e8f5e9; /* Светло-зеленый фон */
    }

    .article {
        font-weight: bold;
    }

    .quantity {
        color: #555;
    }

    .progress {
        color: #777;
        font-style: italic;
    }

    .bottom-nav {
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        background-color: #444;
        padding: 1em;
        text-align: center;
        box-sizing: border-box;
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