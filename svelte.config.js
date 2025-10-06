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

        // --- НАСТРОЙКА ДЛЯ GitHub Pages ---
        paths: {
            base: process.argv.includes('dev') ? '' : '/Z_release' // <-- ПРАВИЛЬНЫЙ ВАРИАНТ
        },
        // --- КОНЕЦ НАСТРОЙКИ ---

        prerender: {
            handleUnseenRoutes: 'warn'
        }
    }
};

export default config;