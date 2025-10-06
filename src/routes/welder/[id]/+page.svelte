<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { db, type Welder, type Plan, type Record } from '$lib/db';
        import { base } from '$app/paths';

    // --- Импортируем наши новые компоненты ---
    import RecordForm from '$lib/components/RecordForm.svelte';
    import RecordList from '$lib/components/RecordList.svelte';
    import RecordModal from '$lib/components/RecordModal.svelte';
    // --- Конец импорта ---

    // --- Глобальное состояние страницы ---
    let welderId: number;
    let welder: Welder | undefined;
    let allPlans: Plan[] = [];
    let records: Record[] = [];

    // Состояние для формы добавления
    let newArticle = '';
    let newQuantity = '';

    // Состояние для модального окна
    let selectedRecord: Record | null = null;
    let selectedPlan: Plan | null = null;
    let showModal = false;
    // --- Конец состояния ---

    // --- Вычисляемые значения (reactive statements) ---
       $: activePlans = allPlans.filter(p => p.isUnlimited || (p.quantity > 0 && p.completed < p.quantity));
    // --- Конец вычисляемых значений ---

    // --- Основные функции работы с данными ---
    async function loadData() {
        welder = await db.welders.get(parseInt($page.params.id!, 10));
        if (!welder) {
            console.error('Сварщик не найден!');
            return;
        }
        welderId = welder.id!;
        allPlans = await db.plans.toArray();
        records = await db.records.where('welderId').equals(welderId).reverse().sortBy('date');
    }

    // --- Обработчики событий от дочерних компонентов ---

            // 1. Из RecordForm: пользователь хочет добавить запись
    async function handleAdd(event: CustomEvent<{ article: string; quantity: string | number }>) { // Указал, что quantity может быть строкой или числом
        try {
            const { article, quantity } = event.detail;
            // ИЗМЕНЕНИЕ: Преобразуем quantity в строку перед replace
            const qty = parseFloat(String(quantity).replace(',', '.'));
            
            if (article.trim() === '' || isNaN(qty) || qty <= 0) {
                alert('Введите артикул и корректное количество!');
                return;
            }
            
            const activePlan = activePlans.find(p => p.article.toLowerCase() === article.trim().toLowerCase());
            if (!activePlan) {
                alert('Такого артикула нет в активном плане или он уже выполнен!');
                return;
            }

                        // --- НОВОЕ: Проверка на превышение плана (только для лимитированных планов) ---
            if (!activePlan.isUnlimited && activePlan.completed + qty > activePlan.quantity) {
                alert(`Нельзя добавить! Превышен план по артикулу "${activePlan.article}". Осталось ${(activePlan.quantity - activePlan.completed).toFixed(2).replace(/\.?0+$/, '')}шт.`);
                return;
            }
            // --- КОНЕЦ НОВОГО ---

            const art = article.trim().toUpperCase();
            const now = new Date();

            const existingRecord = await db.records
                .where('welderId').equals(welderId)
                .and(record => {
                    const recordDate = new Date(record.date);
                    const recordMonth = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
                    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    return record.article === art && recordMonth === currentMonth;
                })
                .first();

            await db.transaction('rw', db.records, db.plans, async () => {
                if (existingRecord) {
                    const newTotalQuantity = existingRecord.quantity + qty;
                    const historyEntry = { date: now.toISOString(), quantity: qty, note: `Добавлено ${qty.toFixed(2).replace(/\.?0+$/, '')}` };
                    const newHistory = [...JSON.parse(existingRecord.history || '[]'), historyEntry];
                    await db.records.update(existingRecord.id!, { quantity: newTotalQuantity, date: now, history: JSON.stringify(newHistory) });
                } else {
                    await db.records.add({
                        welderId: welderId,
                        article: art,
                        quantity: qty,
                        date: now,
                        history: JSON.stringify([{ date: now.toISOString(), quantity: qty, note: 'Создано' }])
                    });
                }
                activePlan.completed += qty;
                await db.plans.update(activePlan.id!, { completed: activePlan.completed });
            });

            newArticle = '';
            newQuantity = '';
            await loadData();

        } catch (error) {
            console.error("Ошибка при добавлении записи:", error);
            let errorMessage = 'Произошла неизвестная ошибка.';
            if (error instanceof Error) {
                errorMessage = error.message;
            }
            alert(`Произошла ошибка! Подробности в консоли (F12). Ошибка: ${errorMessage}`);
        }
    }

    // 2. Из RecordList: пользователь кликнул на артикул
    function handleSelectArticle(event: CustomEvent<{ article: string }>) {
        newArticle = event.detail.article;
        document.getElementById('quantity-input')?.focus();
    }

    // 3. Из RecordList: пользователь долго нажал на запись
    function handleOpenModal(event: CustomEvent<{ record: Record }>) {
        selectedRecord = event.detail.record;
        selectedPlan = allPlans.find(p => p.article === selectedRecord!.article) || null;
        showModal = true;
    }

        async function handleSave(event: CustomEvent<{ newQuantity: number; quantityDifference: number }>) {
        if (!selectedRecord || !selectedPlan) return;
        const { newQuantity, quantityDifference } = event.detail;

        try {
            await db.transaction('rw', db.records, db.plans, async () => {
                const historyEntry = { date: new Date().toISOString(), quantity: quantityDifference, note: `Изменено с ${selectedRecord!.quantity.toFixed(2).replace(/\.?0+$/, '')} на ${newQuantity.toFixed(2).replace(/\.?0+$/, '')}` };
                const newHistory = [...JSON.parse(selectedRecord!.history || '[]'), historyEntry];
                
                await db.records.update(selectedRecord!.id!, {
                    quantity: newQuantity,
                    date: new Date(),
                    history: JSON.stringify(newHistory)
                });
                // ИЗМЕНЕНИЕ: Добавили '!' к selectedPlan
                selectedPlan!.completed += quantityDifference;
                await db.plans.update(selectedPlan!.id!, { completed: selectedPlan!.completed });
            });
            closeModal();
            await loadData();
        } catch (error) {
            console.error("Ошибка при сохранении:", error);
            alert(`Произошла ошибка! Подробности в консоли (F12).`);
        }
    }

        async function handleDelete() {
        if (!selectedRecord || !selectedPlan) return;
        
        try {
            await db.transaction('rw', db.records, db.plans, async () => {
                await db.records.delete(selectedRecord!.id!);
                // ИЗМЕНЕНИЕ: Добавили '!' к selectedPlan
                selectedPlan!.completed -= selectedRecord!.quantity;
                if (selectedPlan!.completed < 0) selectedPlan!.completed = 0;
                await db.plans.update(selectedPlan!.id!, { completed: selectedPlan!.completed });
            });
            closeModal();
            await loadData();
        } catch (error) {
            console.error("Ошибка при удалении:", error);
            alert(`Произошла ошибка! Подробности в консоли (F12).`);
        }
    }

    // 6. Из RecordModal: пользователь закрыл окно
    function closeModal() {
        showModal = false;
        selectedRecord = null;
        selectedPlan = null;
    }
    // --- Конец обработчиков ---

    onMount(() => {
        loadData();
    });
</script>

<main>
    {#if welder}
        <h1>Карточка сварщика: {welder.name}</h1>
    {:else}
        <h1>Сварщик не найден</h1>
    {/if}

    <!-- Используем компонент формы -->
    <RecordForm
        {activePlans}
        bind:newArticle
        bind:newQuantity
        on:add={handleAdd}
    />

    <!-- Используем компонент списка -->
        <!-- Используем компонент списка -->
    <RecordList
        {records}
        {allPlans}
        on:selectArticle={handleSelectArticle}
        on:openModal={handleOpenModal}
    />

    <!-- Используем компонент модального окна -->
    <RecordModal
        bind:show={showModal}
        selectedRecord={selectedRecord}
        plan={selectedPlan}
        on:save={handleSave}
        on:delete={handleDelete}
        on:close={closeModal}
    />

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
        padding-bottom: 80px;
    }

    h1 {
        color: #444;
        border-bottom: 2px solid #eee;
        padding-bottom: 10px;
        margin-bottom: 20px;
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