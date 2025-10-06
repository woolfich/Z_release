import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';

// ... импорты

export default defineConfig({
    plugins: [
        sveltekit(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'], // <-- Говорим скопировать иконки
            manifest: {
                name: 'Учёт сварщиков',
                short_name: 'Сварщики',
                description: 'PWA-приложение для учёта работы сварщиков',
                theme_color: '#555555',
                background_color: '#ffffff',
                display: 'standalone',
                start_url: '/Z_release/',
                scope: '/Z_release/',
                icons: [
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}']
            }
        })
    ]
});