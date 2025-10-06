import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        sveltekit(),
        // --- НОВОЕ: Включаем PWA только для продакшена ---
        ...(process.env.NODE_ENV === 'production' ? [
            VitePWA({
                registerType: 'autoUpdate',
                includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
                manifest: {
                    name: 'Учёт сварщиков',
                    short_name: 'Сварщики',
                    description: 'PWA-приложение для учёта работы сварщиков',
                    theme_color: '#555555',
                    background_color: '#ffffff',
                    display: 'standalone',
                    icons: [
                        {
                            src: 'pwa-192x192.png',
                            sizes: '192x192',
                            type: 'image/png'
                        },
                        {
                            src: 'pwa-512x512.png',
                            sizes: '512x512',
                            type: 'image/png'
                        }
                    ]
                },
                workbox: {
                    globPatterns: ['**/*.{js,css,html,ico,png,svg}']
                }
            })
        ] : [])
        // --- КОНЕЦ НОВОГО ---
    ]
});