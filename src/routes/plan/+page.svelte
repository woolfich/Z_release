<script lang="ts">
    import { onMount } from 'svelte';
    import { base } from '$app/paths'; // ← ЭТА СТРОКА ДОБАВЛЕНА
    import { db, type Plan } from '$lib/db';


    // --- Состояние страницы ---
    let plans: Plan[] = [];
    let newArticle = '';
    let newQuantity = '';

    // --- НОВОЕ: Состояние для модального окна ---
    let showPlanModal = false;
    let selectedPlan: Plan | null = null;
    let editArticle = '';
    let editQuantity = '';
    // --- КОНЕЦ НОВОГО ---

    // --- Функции для работы с планами ---
    async function loadPlans() {
        plans = await db.plans.orderBy('id').reverse().toArray();
    }

    async function addPlan() {
        const quantity = parseInt(newQuantity, 10);
        if (newArticle.trim() === '' || isNaN(quantity) || quantity < 0) {
            alert('Введите артикул и корректное количество!');
            return;
        }

        const isUnlimited = quantity === 0;

        await db.plans.add({
            article: newArticle.trim().toUpperCase(),
            quantity: quantity,
            completed: 0,
            isUnlimited: isUnlimited
        });

        newArticle = '';
        newQuantity = '';
        await loadPlans();
    }

    // --- НОВОЕ: Логика для модального окна ---

    // Функция для обработки долгого нажатия
    function handlePlanLongPress(plan: Plan) {
        selectedPlan = plan;
        showPlanModal = true;
    }

    // Функции для действий в модальном окне
    function openEditPlan() {
        if (selectedPlan) {
            editArticle = selectedPlan.article;
            editQuantity = selectedPlan.quantity.toString();
        }
    }

    function openCompletePlan() {
        if (selectedPlan && !selectedPlan.isUnlimited) {
            if (confirm(`Отметить план "${selectedPlan.article}" как выполненный?`)) {
                savePlanChanges({ completed: selectedPlan.quantity });
            }
        } else {
            alert("Безлимитный план нельзя отметить как выполненный.");
        }
    }

    async function deletePlan() {
        if (!selectedPlan) return;
        if (selectedPlan.completed > 0) {
            alert("Нельзя удалить план, по которому уже есть выполненные работы!");
            return;
        }
        if (confirm(`Удалить план "${selectedPlan.article}"?`)) {
            await db.plans.delete(selectedPlan.id!);
            closePlanModal();
            await loadPlans();
        }
    }

    async function savePlanChanges(changes: Partial<Plan>) {
        if (!selectedPlan) return;
        try {
            await db.plans.update(selectedPlan.id!, changes);
            closePlanModal();
            await loadPlans();
        } catch (error) {
            console.error("Ошибка при сохранении плана:", error);
            alert("Не удалось сохранить изменения.");
        }
    }

    function closePlanModal() {
        showPlanModal = false;
        selectedPlan = null;
        editArticle = '';
        editQuantity = '';
    }
    // --- КОНЕЦ ЛОГИКИ ---

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
            placeholder="Артикул"
            bind:value={newArticle}
            on:keydown={(e) => {
                if (e.key === 'Enter') {
                    document.getElementById('quantity-input')?.focus();
                }
            }}
        />
        <input
            id="quantity-input"
            type="number"
            placeholder="Кол-во"
            bind:value={newQuantity}
            on:keydown={(e) => e.key === 'Enter' && addPlan()}
        />
        <button on:click={addPlan}>Добавить</button>
    </div>

    <!-- Список планов -->
    <div class="plan-list">
        {#each plans as plan (plan.id)}
            <div
                class="plan-item"
                class:completed={plan.quantity > 0 && plan.completed >= plan.quantity}
                role="button"
                tabindex="0"
                on:pointerdown={(e) => handlePlanLongPress(plan)}
                on:pointerup={(e) => {
                    // Отменяем стандартное действие, чтобы не было клика
                    e.preventDefault();
                }}
                on:pointercancel={() => {}}
                on:keydown={(e) => e.key === 'Enter' && handlePlanLongPress(plan)}
            >
                <span class="article">{plan.article}</span>
                <span class="quantity">{plan.quantity}шт</span>
                <span class="progress">... {plan.completed}шт</span>
            </div>
        {/each}
    </div>

    <!-- НОВОЕ: Модальное окно для действий с планом -->
    {#if showPlanModal && selectedPlan}
        <div class="modal-overlay" on:click={closePlanModal}>
            <div class="modal-content" on:click|stopPropagation>
                <h3>Действия с планом: {selectedPlan.article}</h3>

                <!-- Блок для редактирования -->
                <div class="edit-section">
                    <h4>Редактировать:</h4>
                    <input type="text" placeholder="Артикул" bind:value={editArticle} />
                    <input type="number" placeholder="Количество" bind:value={editQuantity} />
                    <button class="save-button" on:click={() => savePlanChanges({ article: editArticle.trim().toUpperCase(), quantity: parseInt(editQuantity, 10) })}>
                        Сохранить изменения
                    </button>
                </div>

                <!-- Кнопки быстрых действий -->
                <div class="modal-actions">
                    <button class="complete-button" on:click={openCompletePlan} disabled={selectedPlan.isUnlimited}>
                        ✅ Отметить выполненным
                    </button>
                    <button class="delete-button" on:click={deletePlan}>
                        🗑️ Удалить
                    </button>
                    <button class="cancel-button" on:click={closePlanModal}>Отмена</button>
                </div>
            </div>
        </div>
    {/if}


    <!-- Фиксированная кнопка "домой ∆" -->
<div class="bottom-nav">
    <a href="{base}/">домой ∆</a>
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
        padding-bottom: 80px;
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

    button:hover:not(:disabled) {
        background-color: #777;
    }

    button:disabled {
        background-color: #ccc;
        cursor: not-allowed;
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
        /* --- НОВЫЕ СТИЛИ ДЛЯ МОБИЛЬНЫХ УСТРОЙСТВ --- */
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        outline: none;
        touch-action: manipulation;
        /* --- КОНЕЦ НОВЫХ СТИЛЕЙ --- */
    }

    .plan-item:hover, .plan-item:focus {
        background-color: #e8e8e8;
    }

    .plan-item.completed {
        border-color: #4caf50;
        background-color: #e8f5e9;
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

    /* --- НОВЫЕ СТИЛИ ДЛЯ МОДАЛЬНОГО ОКНА --- */
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
    }

    .modal-content {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        max-width: 400px;
        width: 90%;
        text-align: left;
    }

    .modal-content h3 {
        margin-top: 0;
        text-align: center;
    }

    .edit-section {
        margin: 20px 0;
        padding: 15px;
        background-color: #f9f9f9;
        border-radius: 5px;
        border: 1px solid #eee;
    }

    .edit-section h4 {
        margin-top: 0;
        margin-bottom: 10px;
    }

    .edit-section input {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 10px;
    }

    .modal-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 20px;
    }

    .complete-button {
        background-color: #5cb85c;
    }

    .complete-button:hover:not(:disabled) {
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

    .save-button {
        background-color: #337ab7;
        width: 100%;
        margin-top: 10px;
    }

    .save-button:hover {
        background-color: #286090;
    }
</style>