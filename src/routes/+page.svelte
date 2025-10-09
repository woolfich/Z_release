<script lang="ts">
    import ImportExport from '$lib/components/ImportExport.svelte';
    import WelderCalendarModal from '$lib/components/WelderCalendarModal.svelte'; // <-- 1. Импортируем наш компонент
    import { onMount } from 'svelte';
    import { db, type Welder } from '$lib/db';
    import { base } from '$app/paths';

    let newWelderName = '';
    let welders: Welder[] = [];

    // --- 2. НОВОЕ: Состояние для модального окна ---
    let showWelderModal = false;
    let selectedWelder: Welder | null = null;
    // --- КОНЕЦ НОВОГО ---

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

    // --- 3. НОВОЕ: Реализация долгого нажатия ---
    const LONG_PRESS_MS = 500; // 0.5 секунды
    const MOVE_CANCEL_PX = 10;

    type PressState = {
        timeoutId: number | null;
        startX: number;
        startY: number;
        triggered: boolean;
    };
    const pressStates = new Map<number, PressState>();

    function startPress(e: PointerEvent, welder: Welder) {
        if ((e instanceof PointerEvent) && e.button && e.button !== 0) return;
        const id = e.pointerId;
        const startX = (e as PointerEvent).clientX ?? 0;
        const startY = (e as PointerEvent).clientY ?? 0;
        if (pressStates.has(id)) clearPressState(id);
        const timeoutId = window.setTimeout(() => {
            const st = pressStates.get(id);
            if (st) st.triggered = true;
            handleWelderLongPress(welder);
        }, LONG_PRESS_MS);
        pressStates.set(id, { timeoutId, startX, startY, triggered: false });
        const target = e.target as Element | null;
        try { target?.setPointerCapture?.(id); } catch (err) { /* ignore */ }
    }

    function movePress(e: PointerEvent) {
        const id = e.pointerId;
        const st = pressStates.get(id);
        if (!st) return;
        const dx = Math.abs((e.clientX ?? 0) - st.startX);
        const dy = Math.abs((e.clientY ?? 0) - st.startY);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
            clearPressState(id);
        }
    }

    function endPress(e: PointerEvent) {
        const id = e.pointerId;
        const st = pressStates.get(id);
        if (!st) return;
        const hadTriggered = st.triggered;
        clearPressState(id);
        const target = e.target as Element | null;
        try { target?.releasePointerCapture?.(id); } catch (err) { /* ignore */ }
        if (hadTriggered) {
            (e.target as HTMLElement | null)?.addEventListener('click', stopImmediateOnce, { capture: true, once: true });
        }
    }

    function cancelPress(e: PointerEvent) {
        clearPressState(e.pointerId);
    }

    function clearPressState(pointerId: number) {
        const st = pressStates.get(pointerId);
        if (!st) return;
        if (st.timeoutId != null) clearTimeout(st.timeoutId);
        pressStates.delete(pointerId);
    }

    function stopImmediateOnce(ev: Event) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
    }
    // --- КОНЕЦ НОВОГО ---

    // --- 4. НОВОЕ: Функции для управления модальным окном ---
    function handleWelderLongPress(welder: Welder) {
        selectedWelder = welder;
        showWelderModal = true;
    }

    function closeWelderModal() {
        showWelderModal = false;
        selectedWelder = null;
    }
    // --- КОНЕЦ НОВОГО ---

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
                <!-- 5. НОВОЕ: Добавляем обработчики долгого нажатия на каждый элемент списка -->
                <a
                    href="{base}/welder/{welder.id}"
                    class="welder-item"
                    role="button"
                    tabindex="0"
                    on:pointerdown={(e) => startPress(e as PointerEvent, welder)}
                    on:pointermove={(e) => movePress(e as PointerEvent)}
                    on:pointerup={(e) => endPress(e as PointerEvent)}
                    on:pointercancel={(e) => cancelPress(e as PointerEvent)}
                    on:keydown={(e) => e.key === 'Enter' && handleWelderLongPress(welder)}
                >
                    {welder.name}
                </a>
            {/each}
        </div>
    </main>

    <!-- Фиксированный нижний блок -->
    <footer class="main-footer">
        <div class="nav-links">
            <a href="{base}/plan">План</a>
            <a href="{base}/norms">Нормы</a>
        </div>
    </footer>
</div>

<!-- 6. НОВОЕ: Добавляем сам компонент модального окна -->
<WelderCalendarModal bind:show={showWelderModal} welder={selectedWelder} on:close={closeWelderModal} />

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
        border-bottom: 1px solid #ccc; /* Сделали границу чуть мягче */
        background-color: #f0f4f8; /* Светлый сине-серый фон для заголовка */
    }

    .main-header h1 {
        margin: 0 0 0.5em 0;
        color: #4a5568; /* Темный сине-серый для текста */
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
        border: 1px solid #a0aec0; /* Мягкий сине-серый бордер */
        border-radius: 4px;
        background-color: #fff;
    }

    button {
        padding: 8px 12px;
        border: none;
        background-color: #4299e1; /* Трендовый steel blue для кнопок */
        color: white;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s ease, box-shadow 0.2s ease; /* Мягкие переходы без резкости */
    }

    button:hover:not(:disabled) {
        background-color: #3182ce; /* Чуть темнее для hover */
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); /* Легкая тень для глубины */
    }

    /* --- Стили для основного контента --- */
    .main-content {
        flex-grow: 1; /* Занимает всё доступное пространство */
        overflow-y: auto; /* Включаем скролл только для этого блока */
        padding: 1em;
        background-color: #edf2f7; /* Очень светлый сине-серый фон для контента */
    }

    .welder-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .welder-item {
        display: block;
        padding: 15px;
        background-color: #e2e8f0; /* Светлый сине-серый для панелей */
        border: 1px solid #cbd5e0; /* Мягкий бордер */
        border-radius: 5px;
        text-decoration: none;
        color: #2d3748; /* Темный сине-серый текст */
        transition: background-color 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease;
        /* 7. НОВОЕ: Стили для корректной работы на мобильных устройствах */
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        outline: none;
        touch-action: manipulation;
        /* --- КОНЕЦ НОВЫХ СТИЛЕЙ --- */
    }

    .welder-item:hover, .welder-item:focus {
        background-color: #cbd5e0; /* Чуть темнее для hover */
        transform: translateY(-2px);
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); /* Легкая тень без резкости */
    }

   /* --- Стили для нижнего блока --- */
    .main-footer {
        flex-shrink: 0; /* Не сжимается */
        background-color: #4a5568; /* Темный сине-серый для футера */
        padding: 1em;
        text-align: center;
        box-sizing: border-box;
    }

    .nav-links {
        display: flex;
        justify-content: center; /* Распределяем кнопки по центру */
        gap: 15px; /* Добавляем немного пространства между кнопками */
    }

    .main-footer a {
        color: white;
        text-decoration: none;
        font-weight: bold;
        padding: 10px 20px;
        border-radius: 5px;
        background-color: #4299e1; /* Steel blue для ссылок в футере */
        transition: background-color 0.2s ease, box-shadow 0.2s ease;
        /* Убираем display: inline-block, так как flex управляет расположением */
    }

    .main-footer a:hover {
        background-color: #3182ce;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }   
</style>