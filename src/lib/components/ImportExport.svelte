<script lang="ts">
    import { db, type Welder, type Plan, type Record } from '$lib/db';

    // --- Функция экспорта данных (остаётся без изменений) ---
    async function handleExport() {
        try {
            const welders = await db.welders.toArray();
            const plans = await db.plans.toArray();
            const records = await db.records.toArray();

            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                data: { welders, plans, records }
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const today = new Date().toISOString().split('T')[0];
            a.download = `welding_data_${today}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('Данные успешно экспортированы!');
        } catch (error) {
            console.error('Ошибка при экспорте:', error);
            alert('Произошла ошибка при экспорте данных. Подробности в консоли (F12).');
        }
        console.log('>>> Начинаем диагностику таблицы records...');
            const records_via_toArray = await db.records.toArray();
            const records_via_query = await db.records.where('id').above(0).toArray(); // Простой запрос, который должен получить всё

            console.log('>>> Результат db.records.toArray():', records_via_toArray);
            console.log('>>> Результат db.records.where(...).toArray():', records_via_query);
            console.log('>>> Результаты одинаковы?', JSON.stringify(records_via_toArray) === JSON.stringify(records_via_query));
            // --- КОНЕЦ ТЕСТА ---

            const records = records_via_toArray; // Используем результат toArray для экспорта
    }

    // --- НОВОЕ: Полная логика импорта ---
    let fileInput: HTMLInputElement;

    function triggerImport() {
        fileInput.click();
    }

    async function handleFileSelect(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonString = e.target?.result as string;
                const importData = JSON.parse(jsonString);

                if (!importData.data) {
                    throw new Error('Неверный формат файла: отсутствует секция data.');
                }

                // Начинаем транзакцию для атомарности
                await db.transaction('rw', db.welders, db.plans, db.records, async () => {
                    // --- 1. Импорт сварщиков ---
                    const welderNameToIdMap = new Map<string, number>();
                    const existingWelders = await db.welders.toArray();
                    existingWelders.forEach(w => welderNameToIdMap.set(w.name, w.id!));

                    let addedWelders = 0;
                    for (const welder of importData.data.welders) {
                        if (!welderNameToIdMap.has(welder.name)) {
                            const id = await db.welders.add(welder);
                            welderNameToIdMap.set(welder.name, id);
                            addedWelders++;
                        }
                    }

                    // --- 2. Импорт планов ---
                    const planArticleToIdMap = new Map<string, number>();
                    const existingPlans = await db.plans.toArray();
                    existingPlans.forEach(p => planArticleToIdMap.set(p.article, p.id!));

                    let addedPlans = 0;
                    for (const plan of importData.data.plans) {
                        if (!planArticleToIdMap.has(plan.article)) {
                            const id = await db.plans.add(plan);
                            planArticleToIdMap.set(plan.article, id);
                            addedPlans++;
                        }
                    }

                    // --- 3. Импорт записей (самая важная часть) ---
                    let addedRecords = 0;
                    for (const record of importData.data.records) {
                        const welderId = welderNameToIdMap.get(record.welderName); // В файле мы ищем по имени
                        const planId = planArticleToIdMap.get(record.article);

                        // Импортируем запись, только если найдены и сварщик, и план
                        if (welderId && planId) {
                            await db.records.add({
                                ...record, // Копируем все поля (quantity, date, history)
                                welderId,  // Заменяем ID на наш, локальный
                            });
                            addedRecords++;
                        }
                    }
                    
                                        // Обновляем прогресс в планах после импорта всех записей
                    const allPlans = await db.plans.toArray();
                    for(const plan of allPlans) {
                        // ИЗМЕНЕНИЕ: Считаем сумму более надежным способом
                        const recordsForPlan = await db.records.where('article').equals(plan.article).toArray();
                        const totalCompleted = recordsForPlan.reduce((sum, record) => sum + record.quantity, 0);
                        await db.plans.update(plan.id!, { completed: totalCompleted });
                    }

                    alert(`Импорт завершен!\n\nДобавлено:\n- Сварщиков: ${addedWelders}\n- Планов: ${addedPlans}\n- Записей: ${addedRecords}`);
                });

            } catch (error) {
                console.error('Ошибка при импорте:', error);
                alert(`Ошибка при импорте файла: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
                // Сбрасываем значение input, чтобы можно было выбрать тот же файл снова
                target.value = '';
            }
        };

        reader.onerror = () => {
            alert('Не удалось прочитать файл.');
        };

        reader.readAsText(file);
    }
</script>

<!-- Скрытый input для выбора файла -->
<input bind:this={fileInput} type="file" accept=".json" on:change={handleFileSelect} style="display: none;" />

<div class="import-export-controls">
    <button class="export-button" on:click={handleExport}>
    ➡️ Экспорт
    </button>
    <button class="import-button" on:click={triggerImport}>
    ⬅️ Импорт
    </button>
</div>

<style>
    .import-export-controls {
        display: flex;
        gap: 10px;
    }

    .import-export-controls button {
        padding: 8px 12px;
        border: none;
        background-color: #555;
        color: white;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s, transform 0.1s;
        font-weight: bold;
    }

    .import-export-controls button:hover {
        background-color: #777;
        transform: translateY(-1px);
    }

    .import-export-controls button:active {
        transform: translateY(0);
    }

    .export-button {
        background-color: #5cb85c;
    }

    .export-button:hover {
        background-color: #4cae4c;
    }

    .import-button {
        background-color: #f0ad4e;
    }

    .import-button:hover {
        background-color: #ec971f;
    }
</style>