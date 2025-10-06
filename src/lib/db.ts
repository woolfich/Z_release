import Dexie, { type Table } from 'dexie';

export interface Welder {
	id?: number;
	name: string;
}

// Было
export interface Plan {
    id?: number;
    article: string;
    quantity: number;
    completed: number;
}

// Стало
export interface Plan {
    id?: number;
    article: string;
    quantity: number;
    completed: number;
    isUnlimited: boolean; // <-- НОВОЕ СВОЙСТВО
}

export interface Record {
	id?: number;
	welderId: number;
	article: string;
	quantity: number;
	date: Date;
	history: string; // Или тип, который подойдёт для истории
}

export class MyDatabase extends Dexie {
	welders!: Table<Welder>;
	plans!: Table<Plan>;
	records!: Table<Record>;

	constructor() {
		super('MyDatabase');
		this.version(1).stores({
			welders: '++id, name',
			plans: '++id, article, quantity, completed, isUnlimited', 
			records: '++id, welderId, article, quantity, date, history'
		});
	}
}

export const db = new MyDatabase();