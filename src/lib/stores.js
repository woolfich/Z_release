// /src/lib/stores.js

import { writable } from 'svelte/store';

// --- НОВОЕ: Создаем постоянное хранилище на базе localStorage ---

// Ключ, под которым данные будут храниться в localStorage
const STORAGE_KEY = 'activatedDays';

// Пытаемся загрузить сохраненные данные при старте
const storedValue = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

// Если данные есть, используем их, иначе — пустой массив
const initialValue = storedValue ? JSON.parse(storedValue) : [];

// Создаем writable store с начальным значением
const store = writable(initialValue);

// Подписываемся на изменения в store и сохраняем их в localStorage
store.subscribe(value => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
});

export const activatedDays = store;