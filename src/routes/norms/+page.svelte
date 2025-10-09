<script lang="ts">
    import { onMount } from 'svelte';
    import { base } from '$app/paths';
    import { db, type Norm } from '$lib/db';

    let norms: Norm[] = [];
    let newArticle = '';
    let newTime = '';

    let showNormModal = false;
    let selectedNorm: Norm | null = null;
    let editArticle = '';
    let editTime = '';

    async function loadNorms() {
        norms = await db.norms.orderBy('article').toArray();
    }

    async function addNorm() {
        const time = parseFloat(newTime);
        if (newArticle.trim() === '' || isNaN(time) || time <= 0) {
            alert('Введите артикул и корректное время!');
            return;
        }

        await db.norms.add({
            article: newArticle.trim().toUpperCase(),
            time: time
        });

        newArticle = '';
        newTime = '';
        await loadNorms();
    }

    // --- LONG PRESS IMPLEMENTATION (реиспользуем с экрана План) ---
    const LONG_PRESS_MS = 500;
    const MOVE_CANCEL_PX = 10;

    type PressState = {
        timeoutId: number | null;
        startX: number;
        startY: number;
        triggered: boolean;
    };
    const pressStates = new Map<number, PressState>();

    function startPress(e: PointerEvent, norm: Norm) {
        if ((e instanceof PointerEvent) && e.button && e.button !== 0) return;
        const id = e.pointerId;
        const startX = (e as PointerEvent).clientX ?? 0;
        const startY = (e as PointerEvent).clientY ?? 0;
        if (pressStates.has(id)) clearPressState(id);
        const timeoutId = window.setTimeout(() => {
            const st = pressStates.get(id);
            if (st) st.triggered = true;
            handleNormLongPress(norm);
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
    // --- END LONG PRESS ---

    // Модалка и действия
    function handleNormLongPress(norm: Norm) {
        selectedNorm = norm;
        showNormModal = true;
    }

    function openEditNorm() {
        if (selectedNorm) {
            editArticle = selectedNorm.article;
            editTime = selectedNorm.time.toString();
        }
    }

    async function deleteNorm() {
        if (!selectedNorm) return;
        if (confirm(`Удалить норму "${selectedNorm.article}"?`)) {
            await db.norms.delete(selectedNorm.id!);
            closeNormModal();
            await loadNorms();
        }
    }

    async function saveNormChanges(changes: Partial<Norm>) {
        if (!selectedNorm) return;
        try {
            await db.norms.update(selectedNorm.id!, changes);
            closeNormModal();
            await loadNorms();
        } catch (error) {
            console.error("Ошибка при сохранении нормы:", error);
            alert("Не удалось сохранить изменения.");
        }
    }

    function closeNormModal() {
        showNormModal = false;
        selectedNorm = null;
        editArticle = '';
        editTime = '';
    }

    onMount(() => {
        loadNorms();
    });
</script>

<main>
    <h1>Нормы времени</h1>

    <div class="add-norm">
        <input
            type="text"
            placeholder="Артикул"
            bind:value={newArticle}
            on:keydown={(e) => {
                if (e.key === 'Enter') {
                    document.getElementById('time-input')?.focus();
                }
            }}
        />
        <input
            id="time-input"
            type="number"
            step="0.1"
            placeholder="Время (ч)"
            bind:value={newTime}
            on:keydown={(e) => e.key === 'Enter' && addNorm()}
        />
        <button on:click={addNorm}>Добавить</button>
    </div>

    <div class="norm-list">
        {#each norms as norm (norm.id)}
            <div
                class="norm-item"
                role="button"
                tabindex="0"
                on:pointerdown={(e) => startPress(e as PointerEvent, norm)}
                on:pointermove={(e) => movePress(e as PointerEvent)}
                on:pointerup={(e) => endPress(e as PointerEvent)}
                on:pointercancel={(e) => cancelPress(e as PointerEvent)}
                on:keydown={(e) => e.key === 'Enter' && handleNormLongPress(norm)}
            >
                <span class="article">{norm.article}</span>
                <span class="time">{norm.time}ч</span>
            </div>
        {/each}
    </div>

    {#if showNormModal && selectedNorm}
        <div class="modal-overlay" on:click={closeNormModal}>
            <div class="modal-content" on:click|stopPropagation>
                <h3>Действия с нормой: {selectedNorm.article}</h3>

                <div class="edit-section">
                    <h4>Редактировать:</h4>
                    <input type="text" placeholder="Артикул" bind:value={editArticle} />
                    <input type="number" step="0.1" placeholder="Время (ч)" bind:value={editTime} />
                    <button class="save-button" on:click={() => saveNormChanges({ article: editArticle.trim().toUpperCase(), time: parseFloat(editTime) })}>
                        Сохранить изменения
                    </button>
                </div>

                <div class="modal-actions">
                    <button class="delete-button" on:click={deleteNorm}>
                        🗑️ Удалить
                    </button>
                    <button class="cancel-button" on:click={closeNormModal}>Отмена</button>
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
        padding-bottom: 80px; /* Место для нижней навигации */
    }

    .add-norm {
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

    .norm-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .norm-item {
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

    .norm-item:hover, .norm-item:focus {
        background-color: #e8e8e8;
    }

    .article {
        font-weight: bold;
    }

    .time {
        color: #555;
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

    /* --- Стили для модального окна --- */
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