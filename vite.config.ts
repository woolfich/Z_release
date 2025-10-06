import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        sveltekit(),
        VitePWA({
            registerType: 'autoUpdate',
            // В dev-режиме плагин будет работать, но не будет навязчивым
            devOptions: {
                enabled: true 
            },
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
    ]
});