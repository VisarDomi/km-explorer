<script lang="ts">
    import { onMount } from 'svelte';
    import { appState } from '$lib/state/index.svelte.js';
    import { swipeBack } from '$lib/actions/swipeBack.js';
    import VideoList from '$lib/components/VideoList.svelte';

    const items = $derived(appState.favorites.items);

    // Request video details for favorites
    $effect(() => {
        if (items.length > 0) {
            const urls = items.map(v => v.pageUrl);
            appState.videoDetails.requestDetails(urls);
        }
    });

    // Track which video card is visible at viewport center
    onMount(() => {
        const el = document.querySelector('#view-favorites .favorites-content') as HTMLElement | null;
        if (!el) return;

        let ticking = false;
        function onScroll() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const centerY = window.innerHeight / 2;
                const centerX = window.innerWidth / 2;
                const hit = document.elementFromPoint(centerX, centerY);
                if (!hit) return;
                const card = hit.closest('[data-video-id]');
                if (card) {
                    const id = card.getAttribute('data-video-id');
                    if (id) appState.trackVisibleVideo(id);
                }
            });
        }

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    });
</script>

<div
    class="favorites-view"
    use:swipeBack={{
        onClose: () => appState.closeFavorites(),
        onSwipeStart: () => { appState.ui.startSwipe(); appState.prepareBackNavigation(); },
        onSwipeUpdate: (p: number) => appState.ui.updateSwipe(p),
        onSwipeEnd: (c: boolean) => appState.ui.endSwipe(c),
    }}
>
    <div class="favorites-header">
        <button class="back-btn" onclick={() => appState.closeFavorites()}>&larr;</button>
        <h2 class="favorites-title">Favorites</h2>
        <span class="favorites-count">{items.length}</span>
    </div>

    <div class="favorites-content">
        {#if items.length > 0}
            <VideoList videos={items} />
        {:else}
            <div class="empty">No favorites yet</div>
        {/if}
    </div>
</div>

<style>
.favorites-view {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.favorites-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: max(15px, env(safe-area-inset-top)) 12px 12px;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid #222;
}

.back-btn {
    font-size: 20px;
    color: #4af626;
    padding: 4px 8px;
}

.favorites-title {
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    margin: 0;
    flex: 1;
}

.favorites-count {
    color: #aaa;
    font-size: 14px;
}

.favorites-content {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: max(20px, env(safe-area-inset-bottom));
}
</style>
