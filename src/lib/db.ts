import Dexie, { type Table } from 'dexie';

export interface DailyAllocation {
  id?: number;
  welderId: number;
  recordId: number;        // ← обязательно!
  article: string;
  dateStr: string;
  hours: number;
}

export interface Plan {
id?: number;
article: string;
quantity: number;
completed: number;
isUnlimited: boolean;
}

export interface Record {
id?: number;
welderId: number;
article: string;
quantity: number;
date: Date;
history: string;
}

// --- НОВОЕ: Интерфейс для таблицы "Нормы" ---
export interface Norm {
id?: number;
article: string; // Артикул, например "ХТ637"
time: number; // Нормативное время в часах, например 10
}
// --- КОНЕЦ НОВОГО ---

// --- НОВОЕ: Интерфейс для суточных распределений ---
export interface DailyAllocation {
id?: number;
welderId: number;
article: string;
dateStr: string; // 'YYYY-MM-DD'
hours: number;
}
// --- КОНЕЦ НОВОГО ---

export class MyDatabase extends Dexie {
welders!: Table<Welder>;
plans!: Table<Plan>;
records!: Table<Record>;
norms!: Table<Norm>;
dailies!: Table<DailyAllocation>;

constructor() {
super('MyDatabase');
// --- ИЗМЕНЕНО: Увеличиваем версию до 3 и добавляем таблицу dailies ---
this.version(3).stores({
welders: '++id, name',
plans: '++id, article, quantity, completed, isUnlimited', 
records: '++id, welderId, article, quantity, date, history',
norms: '++id, article, time',
dailies: '++id, welderId, article, dateStr, hours'
});
// --- КОНЕЦ ИЗМЕНЕНИЙ ---

// --- ИЗМЕНЕНО: Используем событие 'ready' для пост-инициализации ---
// Этот способ более надежен и не вызывает проблем с типами в TypeScript
this.on('ready', () => {
console.log("База данных готова. Проверяем и заполняем нормы...");
this.populateNorms();
});
// --- КОНЕЦ ИЗМЕНЕНИЙ ---
}

// --- НОВОЕ: Метод для начального заполнения таблицы норм ---
async populateNorms() {
// Проверяем, есть ли уже записи в таблице норм
const normCount = await this.norms.count();
if (normCount === 0) {
console.log('Таблица "Нормы" пуста, добавляем начальные данные...');
// ВАЖНО: Замените этот массив на ваши реальные данные.
const initialNorms = [
{ article: 'ХТ637', time: 10 },
{ article: 'ХТ55', time: 12 },
{ article: 'ХТ52', time: 8 },
{ article: 'АРТ123', time: 5.5 },
{ article: 'АРТ456', time: 15 }
];
// Используем транзакцию для атомарности
await this.transaction('rw', this.norms, async () => {
await this.norms.bulkAdd(initialNorms);
});
console.log('Таблица "Нормы" была успешно заполнена начальными данными.');
} else {
console.log(`Таблица "Нормы" уже содержит ${normCount} записей.`);
}
}
// --- КОНЕЦ НОВОГО ---
}

export const db = new MyDatabase();
