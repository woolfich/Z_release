<script lang="ts">
    import { db, type Welder, type Plan, type Norm, type Record as DbRecord, type DailyAllocation } from '$lib/db';
    import { base } from '$app/paths';
    import { onMount } from 'svelte';

    let isExporting = false;
    let isImporting = false;
    let importStatus = '';
    let exportStatus = '';

    // Проверяем, есть ли данные в базе
    async function hasData(): Promise<boolean> {
        const weldersCount = await db.welders.count();
        const plansCount = await db.plans.count();
        const normsCount = await db.norms.count();
        const recordsCount = await db.records.count();
        const dailiesCount = await db.dailies.count();
        
        return weldersCount > 0 || plansCount > 0 || normsCount > 0 || recordsCount > 0 || dailiesCount > 0;
    }

    // Экспорт всех данных в JSON
    async function exportAllData() {
        isExporting = true;
        exportStatus = 'Сбор данных...';
        
        try {
            // Собираем все данные из всех таблиц
            const welders = await db.welders.toArray();
            const plans = await db.plans.toArray();
            const norms = await db.norms.toArray();
            const records = await db.records.toArray();
            const dailies = await db.dailies.toArray();
            
            exportStatus = 'Формирование файла...';
            
            // Создаем объект с данными и метаданными
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                data: {
                    welders,
                    plans,
                    norms,
                    records,
                    dailies
                }
            };
            
            // Создаем и скачиваем JSON-файл
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `welders_data_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            exportStatus = 'Экспорт завершен!';
            setTimeout(() => { exportStatus = ''; }, 3000);
        } catch (error) {
            console.error('Ошибка при экспорте:', error);
            exportStatus = 'Ошибка экспорта!';
            setTimeout(() => { exportStatus = ''; }, 3000);
        } finally {
            isExporting = false;
        }
    }

    // Импорт данных из JSON
    async function importAllData(event: Event) {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        
        isImporting = true;
        importStatus = 'Чтение файла...';
        
        try {
            const fileContent = await file.text();
            const importData = JSON.parse(fileContent);
            
            // Проверяем структуру импортируемых данных
            if (!importData.data || !importData.version) {
                throw new Error('Неверный формат файла импорта');
            }
            
            // Проверяем, есть ли данные в базе
            const hasExistingData = await hasData();
            
            // Если есть данные, создаем бэкап
            if (hasExistingData) {
                importStatus = 'Создание бэкапа...';
                // Вызываем экспорт, но без перезагрузки страницы
                const welders = await db.welders.toArray();
                const plans = await db.plans.toArray();
                const norms = await db.norms.toArray();
                const records = await db.records.toArray();
                const dailies = await db.dailies.toArray();
                const backupData = {
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    data: { welders, plans, norms, records, dailies }
                };
                const dataStr = JSON.stringify(backupData, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(dataBlob);
                link.download = `backup_welders_data_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            
            importStatus = 'Очистка базы данных...';
            
            // Очищаем все таблицы
            await db.transaction('rw', [db.welders, db.plans, db.norms, db.records, db.dailies], async () => {
                await db.welders.clear();
                await db.plans.clear();
                await db.norms.clear();
                await db.records.clear();
                await db.dailies.clear();
            });
            
            importStatus = 'Импорт данных...';
            
            // Импортируем данные
            await db.transaction('rw', [db.welders, db.plans, db.norms, db.records, db.dailies], async () => {
                if (importData.data.welders && importData.data.welders.length > 0) {
                    await db.welders.bulkAdd(importData.data.welders);
                }
                
                if (importData.data.plans && importData.data.plans.length > 0) {
                    await db.plans.bulkAdd(importData.data.plans);
                }
                
                if (importData.data.norms && importData.data.norms.length > 0) {
                    await db.norms.bulkAdd(importData.data.norms);
                }
                
                if (importData.data.records && importData.data.records.length > 0) {
                    await db.records.bulkAdd(importData.data.records);
                }
                
                if (importData.data.dailies && importData.data.dailies.length > 0) {
                    await db.dailies.bulkAdd(importData.data.dailies);
                }
            });
            
            importStatus = 'Импорт завершен! Перезагрузка страницы...';
            
            // Перезагружаем страницу, чтобы обновить все данные
            setTimeout(() => {
                window.location.reload();
            }, 2000);
            
        } catch (error) {
            console.error('Ошибка при импорте:', error);
            importStatus = `Ошибка импорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`;
            setTimeout(() => { importStatus = ''; }, 5000);
        } finally {
            isImporting = false;
        }
    }

    onMount(() => {
        // Инициализация компонента
    });
</script>

<div class="import-export-container">
    <!-- <h3>Импорт/Экспорт данных</h3> ЗАКОММЕНТИРОВАЛИ И УДАЛИЛИ -->
    
    <div class="button-group">
        <button 
            class="export-button" 
            on:click={exportAllData} 
            disabled={isExporting}
        >
            {isExporting ? 'Экспорт...' : 'Экспорт'}
        </button>
        
        <label class="import-button">
            <input 
                type="file" 
                accept=".json" 
                on:change={importAllData} 
                disabled={isImporting}
            />
            {isImporting ? 'Импорт...' : 'Импорт'}
        </label>
    </div>
    
    {#if exportStatus}
        <div class="status export-status">{exportStatus}</div>
    {/if}
    
    {#if importStatus}
        <div class="status import-status">{importStatus}</div>
    {/if}
</div>

<style>
    .import-export-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        background-color: #f5f5f5;
        border-radius: 5px;
        margin-top: 10px;
    }
    
    /* УДАЛИЛИ СТИЛЬ ДЛЯ h3, так как он больше не нужен */
    /* 
    .import-export-container h3 {
        margin: 0 0 5px 0;
        font-size: 16px;
        color: #333;
    }
    */
    
    .button-group {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }
    
    .export-button, .import-button {
        padding: 8px 12px;
        background-color: #4299e1;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 14px;
    }
    
    .export-button:hover:not(:disabled), .import-button:hover:not(:disabled) {
        background-color: #3182ce;
    }
    
    .export-button:disabled, .import-button:disabled {
        background-color: #a0aec0;
        cursor: not-allowed;
    }
    
    .import-button {
        position: relative;
        overflow: hidden;
        display: inline-block;
    }
    
    .import-button input[type="file"] {
        position: absolute;
        left: -9999px;
    }
    
    .status {
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 14px;
        margin-top: 5px;
    }
    
    .export-status {
        background-color: #e6fffa;
        color: #00796b;
        border: 1px solid #b2dfdb;
    }
    
    .import-status {
        background-color: #e3f2fd;
        color: #0277bd;
        border: 1px solid #bbdefb;
    }
</style>