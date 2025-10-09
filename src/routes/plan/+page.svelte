<script lang="ts">
    import { onMount } from 'svelte';
    import { base } from '$app/paths';
    import { db, type Plan, type Norm } from '$lib/db'; // <-- ДОБАВИЛИ type Norm

    // --- НОВОЕ: Логика для подсказок ---
    let allNorms: Norm[] = [];
    let showSuggestions = false;
    let suggestions: Norm[] = [];
    // --- КОНЕЦ НОВОГО ---

    function formatQuantity(num: number): string {
        return num.toFixed(2).replace(/\.?0+$/, '');
    }

    let plans: Plan[] = [];
    let newArticle = '';
    let newQuantity = '';

    let showPlanModal = false;
    let selectedPlan: Plan | null = null;
    let editArticle = '';
    let editQuantity = '';

    async function loadPlans() {
        plans = await db.plans.orderBy('id').reverse().toArray();
    }

    // --- НОВОЕ: Функция загрузки норм ---
    async function loadNorms() {
        allNorms = await db.norms.orderBy('article').toArray();
    }
    // --- КОНЕЦ НОВОЕ ---

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

    // --- LONG PRESS IMPLEMENTATION (без изменений) ---
    const LONG_PRESS_MS = 2000;
    const MOVE_CANCEL_PX = 10;
    type PressState = { timeoutId: number | null; startX: number; startY: number; triggered: boolean; };
    const pressStates = new Map<number, PressState>();

    function startPress(e: PointerEvent, plan: Plan) {
        if ((e instanceof PointerEvent) && e.button && e.button !== 0) return;
        const id = e.pointerId;
        const startX = (e as PointerEvent).clientX ?? 0;
        const startY = (e as PointerEvent).clientY ?? 0;
        if (pressStates.has(id)) { clearPressState(id); }
        const timeoutId = window.setTimeout(() => {
            const st = pressStates.get(id); if (st) { st.triggered = true; } handlePlanLongPress(plan);
        }, LONG_PRESS_MS);
        pressStates.set(id, { timeoutId, startX, startY, triggered: false });
        const target = e.target as Element | null;
        try { target?.setPointerCapture?.(id); } catch (err) { /* ignore */ }
    }

    function movePress(e: PointerEvent) {
        const id = e.pointerId; const st = pressStates.get(id);
        if (!st) return;
        const dx = Math.abs((e.clientX ?? 0) - st.startX);
        const dy = Math.abs((e.clientY ?? 0) - st.startY);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) { clearPressState(id); }
    }

    function endPress(e: PointerEvent) {
        const id = e.pointerId; const st = pressStates.get(id);
        if (!st) return;
        const hadTriggered = st.triggered;
        clearPressState(id);
        const target = e.target as Element | null;
        try { target?.releasePointerCapture?.(id); } catch (err) { /* ignore */ }
        if (hadTriggered) {
            (e.target as HTMLElement | null)?.addEventListener('click', stopImmediateOnce, { capture: true, once: true });
        }
    }

    function cancelPress(e: PointerEvent) { clearPressState(e.pointerId); }
    function clearPressState(pointerId: number) {
        const st = pressStates.get(pointerId);
        if (!st) return;
        if (st.timeoutId != null) { clearTimeout(st.timeoutId); }
        pressStates.delete(pointerId);
    }
    function stopImmediateOnce(ev: Event) { ev.stopImmediatePropagation(); ev.preventDefault(); }
    // --- END LONG PRESS ---

    // Модалка и действия
    function handlePlanLongPress(plan: Plan) {
        selectedPlan = plan;
        showPlanModal = true;
    }

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
            alert("Безлимитный план нельзя отметить как выполненным.");
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

    // --- НОВОЕ: Реактивная логика для подсказок ---
    $: if (newArticle.trim() !== '') {
        suggestions = allNorms.filter(norm =>
            norm.article.toLowerCase().includes(newArticle.toLowerCase())
        );
        showSuggestions = suggestions.length > 0;
    } else {
        suggestions = [];
        showSuggestions = false;
    }

    function selectSuggestion(article: string) {
        newArticle = article;
        showSuggestions = false;
        document.getElementById('quantity-input')?.focus();
    }
    // --- КОНЕЦ НОВОГО ---

    onMount(() => {
        loadPlans();
        loadNorms(); // <-- НОВОЕ: Загружаем нормы при монтировании
    });
</script>

<main>
    <h1>План работ</h1>

    <div class="add-plan">
        <!-- НОВОЕ: Оборачиваем инпут в контейнер для подсказок -->
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
                           <span class="suggestion-info">{suggestion.time}ч</span>
                      </button>
                    {/each}
                </div>
            {/if}
        </div>
        <!-- КОНЕЦ НОВОГО -->

        <input
            id="quantity-input"
            type="number"
            placeholder="Кол-во"
            bind:value={newQuantity}
            on:keydown={(e) => e.key === 'Enter' && addPlan()}
        />
        <button on:click={addPlan}>Добавить</button>
    </div>

    <div class="plan-list">
        {#each plans as plan (plan.id)}
            <div
                class="plan-item"
                class:completed={plan.quantity > 0 && plan.completed >= plan.quantity}
                role="button"
                tabindex="0"
                on:pointerdown={(e) => startPress(e as PointerEvent, plan)}
                on:pointermove={(e) => movePress(e as PointerEvent)}
                on:pointerup={(e) => endPress(e as PointerEvent)}
                on:pointercancel={(e) => cancelPress(e as PointerEvent)}
                on:keydown={(e) => e.key === 'Enter' && handlePlanLongPress(plan)}
            >
                <span class="article">{plan.article}</span>
                <span class="quantity">{formatQuantity(plan.quantity)}шт</span>
                <span class="progress">... {formatQuantity(plan.completed)}шт</span>
            </div>
        {/each}
    </div>

    {#if showPlanModal && selectedPlan}
        <div class="modal-overlay" on:click={closePlanModal}>
            <div class="modal-content" on:click|stopPropagation>
                <h3>Действия с планом: {selectedPlan.article}</h3>

                <div class="edit-section">
                    <h4>Редактировать:</h4>
                    <input type="text" placeholder="Артикул" bind:value={editArticle} />
                    <input type="number" placeholder="Количество" bind:value={editQuantity} />
                    <button class="save-button" on:click={() => savePlanChanges({ article: editArticle.trim().toUpperCase(), quantity: parseInt(editQuantity, 10) })}>
                        Сохранить изменения
                    </button>
                </div>

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
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        outline: none;
        touch-action: manipulation;
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

    /* --- НОВЫЕ СТИЛИ ДЛЯ ПОДСКАЗОК --- */
    .input-with-suggestions {
        position: relative;
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
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
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
    /* --- КОНЕЦ НОВЫХ СТИЛЕЙ --- */

    /* --- Стили для модального окна (без изменений) --- */
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