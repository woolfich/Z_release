<script lang="ts">
    import { db, type Welder, type Plan, type Record } from '$lib/db';

    // --- Экспорт данных ---
    async function handleExport() {
        try {
            const welders = await db.welders.toArray();
            const plans = await db.plans.toArray();
            let records = await db.records.toArray();

            // Диагностика для records (внутри try)
            console.log('>>> Начинаем диагностику таблицы records...');
            const records_via_query = await db.records.where('id').above(0).toArray();
            console.log('>>> Результат db.records.toArray():', records);
            console.log('>>> Результат db.records.where(...).toArray():', records_via_query);
            console.log('>>> Результаты одинаковы?', JSON.stringify(records) === JSON.stringify(records_via_query));

            // Если query возвращает больше — используем его (на случай бага toArray)
            if (records_via_query.length > records.length) {
                records = records_via_query;
            }

            // Добавляем welderName к records для импорта (join по welderId)
            const welderIdToNameMap = new Map<number, string>(welders.map(w => [w.id!, w.name]));
            const enhancedRecords = records.map(record => ({
                ...record,
                welderName: welderIdToNameMap.get(record.welderId) || 'Unknown' // Fallback на случай ошибки
            }));

            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                data: { welders, plans, records: enhancedRecords }
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
    }

    // --- Импорт данных ---
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

                if (importData.version !== '1.0' || !importData.data) {
                    throw new Error('Неверный формат или версия файла.');
                }

                await db.transaction('rw', db.welders, db.plans, db.records, async () => {
                    // 1. Импорт сварщиков (bulk для скорости)
                    const welderNameToIdMap = new Map<string, number>();
                    const existingWelders = await db.welders.toArray();
                    existingWelders.forEach(w => welderNameToIdMap.set(w.name, w.id!));

                    const newWelders: Welder[] = [];
                    for (const welder of importData.data.welders) {
                        if (!welderNameToIdMap.has(welder.name)) {
                            newWelders.push(welder);
                        }
                    }
                    if (newWelders.length > 0) {
                        const newIds = await db.welders.bulkAdd(newWelders, { allKeys: true });
                        newWelders.forEach((w, i) => welderNameToIdMap.set(w.name, newIds[i]));
                    }
                    const addedWelders = newWelders.length;

                    // 2. Импорт планов (bulk)
                    const planArticleToIdMap = new Map<string, number>();
                    const existingPlans = await db.plans.toArray();
                    existingPlans.forEach(p => planArticleToIdMap.set(p.article, p.id!));

                    const newPlans: Plan[] = [];
                    for (const plan of importData.data.plans) {
                        if (!planArticleToIdMap.has(plan.article)) {
                            newPlans.push(plan);
                        }
                    }
                    if (newPlans.length > 0) {
                        const newIds = await db.plans.bulkAdd(newPlans, { allKeys: true });
                        newPlans.forEach((p, i) => planArticleToIdMap.set(p.article, newIds[i]));
                    }
                    const addedPlans = newPlans.length;

                    // 3. Импорт записей (теперь с welderName в JSON)
                    const newRecords: Omit<Record, 'id'>[] = [];
                    for (const record of importData.data.records) {
                        const welderId = welderNameToIdMap.get(record.welderName);
                        const planId = planArticleToIdMap.get(record.article); // Не нужен для add, но для проверки

                        if (welderId && planId) {
                            newRecords.push({
                                welderId,
                                article: record.article,
                                quantity: record.quantity,
                                date: new Date(record.date), // Парсим дату
                                history: record.history
                            });
                        }
                    }
                    let addedRecords = 0;
                    if (newRecords.length > 0) {
                        await db.records.bulkAdd(newRecords);
                        addedRecords = newRecords.length;
                    }

                    // 4. Обновляем completed в планах
                    const allPlans = await db.plans.toArray();
                    for (const plan of allPlans) {
                        const recordsForPlan = await db.records.where('article').equals(plan.article).toArray();
                        const totalCompleted = recordsForPlan.reduce((sum, rec) => sum + rec.quantity, 0);
                        await db.plans.update(plan.id!, { completed: totalCompleted });
                    }

                    alert(`Импорт завершен!\n\nДобавлено:\n- Сварщиков: ${addedWelders}\n- Планов: ${addedPlans}\n- Записей: ${addedRecords}`);
                });
            } catch (error) {
                console.error('Ошибка при импорте:', error);
                alert(`Ошибка при импорте файла: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
                target.value = '';
            }
        };

        reader.onerror = () => {
            alert('Не удалось прочитать файл.');
        };

        reader.readAsText(file);
    }
</script>

<!-- Остальной HTML/CSS без изменений -->
<input bind:this={fileInput} type="file" accept=".json" on:change={handleFileSelect} style="display: none;" />

<div class="import-export-controls">
    <button class="export-button" on:click={handleExport}>
        📤 Экспорт
    </button>
    <button class="import-button" on:click={triggerImport}>
        📥 Импорт
    </button>
</div>

<style>
    /* Без изменений */
</style>