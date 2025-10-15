import Dexie, { type Table } from 'dexie';

// --- ИНТЕРФЕЙСЫ ---

export interface DailyAllocation {
  id?: number;
  welderId: number;
  recordId: number;        // <-- НОВОЕ: связь с Record
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
  totalHours: number;      // <-- НОВОЕ: ярлык времени
  date: Date;              // дата создания
  lastUpdated: Date;       // <-- НОВОЕ: дата последнего изменения
  history: string;
}

export interface Norm {
  id?: number;
  article: string;
  time: number;
}

// --- КЛАСС БАЗЫ ---

export class MyDatabase extends Dexie {
  welders!: Table<Welder>;
  plans!: Table<Plan>;
  records!: Table<Record>;
  norms!: Table<Norm>;
  dailies!: Table<DailyAllocation>;

  constructor() {
    super('MyDatabase');
    // Увеличиваем версию до 4 и обновляем схему
    this.version(4).stores({ // <-- Изменено: версия 4
      welders: '++id, name',
      plans: '++id, article, quantity, completed, isUnlimited',
      records: '++id, welderId, article, quantity, date, lastUpdated, totalHours', // <-- Изменено: добавлены lastUpdated, totalHours
      norms: '++id, article, time',
      dailies: '++id, welderId, recordId, article, dateStr, hours' // <-- Изменено: добавлен recordId
    });

    // Пост-инициализация
    this.on('ready', () => {
      console.log("База данных готова. Проверяем и заполняем нормы...");
      this.populateNorms();
    });
  }

  // --- Метод для начального заполнения норм ---
  async populateNorms() {
    const normCount = await this.norms.count();
    if (normCount === 0) {
      console.log('Таблица "Нормы" пуста, добавляем начальные данные...');
      const initialNorms = [
        { article: 'ХТ637', time: 10 },
        { article: 'ХТ55', time: 12 },
        { article: 'ХТ52', time: 8 },
        { article: 'АРТ123', time: 5.5 },
        { article: 'АРТ456', time: 15 }
      ];
      await this.transaction('rw', this.norms, async () => {
        await this.norms.bulkAdd(initialNorms);
      });
      console.log('Таблица "Нормы" была успешно заполнена начальными данными.');
    } else {
      console.log(`Таблица "Нормы" уже содержит ${normCount} записей.`);
    }
  }
  // --- Конец метода ---
}

export const db = new MyDatabase();

// --- ВАЖНО: Добавим интерфейс Welder, если он был определён в другом месте ---
// Если в твоём проекте нет файла, экспортирующего интерфейс Welder, добавь его:
export interface Welder {
  id?: number;
  name: string;
}
// ---
