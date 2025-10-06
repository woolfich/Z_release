<script lang="ts">
    import { onMount } from 'svelte';
    import { base } from '$app/paths';

    onMount(() => {
        if ('serviceWorker' in navigator) {
            const swUrl = `${base || ''}/sw.js`;
            navigator.serviceWorker.register(swUrl)
                .then(reg => console.log('Service Worker зарегистрирован!', reg))
                .catch(err => console.error('Ошибка регистрации SW:', err));
        }
    });
</script>

<slot />