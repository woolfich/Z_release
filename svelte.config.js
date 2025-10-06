import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),

    kit: {
        adapter: adapter({
            pages: 'build',
            assets: 'build',
            fallback: 'index.html',
            precompress: false,
            strict: false
        }),

        paths: {
            base: process.argv.includes('dev') ? '' : '/Z_release'
        },

        // --- ФИНАЛЬНАЯ ЛОГИКА ДЛЯ PRERENDER ---
        prerender: {
            // Эта функция будет вызвана для маршрутов, которые не были найдены краулером
            handleUnseenRoutes: ({ url}) => {
                // Если это наш динамический маршрут /welder/[id], просто игнорируем и не прерываем сборку
                if (url.pathname.startsWith('/welder/')) {
                    console.warn(`Пропущен динамический маршрут: ${url.pathname}`);
                    return;
                }
                // Для всех остальных не найденных маршрутов - выдаем ошибку
                throw new Error(`Unexpected ${status} for ${url.pathname}`);
            }
        }
    }
};

export default config;