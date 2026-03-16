<script lang="ts">
    import { onMount } from 'svelte';
    import { appState } from '$lib/state/index.svelte.js';
    import { sentinel } from '$lib/actions/sentinel.js';
    import { swipeBack } from '$lib/actions/swipeBack.js';
    import { SENTINEL_ROOT_MARGIN } from '$lib/constants.js';
    import VideoList from '$lib/components/VideoList.svelte';

    const channel = $derived(appState.channel);
    const videos = $derived(channel.videos);
    const isLoading = $derived(channel.isLoading);
    const hasMore = $derived(channel.hasMore);
    const name = $derived(channel.activeChannel?.name ?? '');

    // Request video details for channel videos
    $effect(() => {
        if (videos.length > 0) {
            const urls = videos.map(v => v.pageUrl);
            appState.videoDetails.requestDetails(urls);
        }
    });

    // Track which video card is visible at viewport center
    onMount(() => {
        const channelEl = document.querySelector('#view-channel .channel-content') as HTMLElement | null;
        if (!channelEl) return;

        let ticking = false;
        function onScroll() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const centerY = window.innerHeight / 2;
                const centerX = window.innerWidth / 2;
                const el = document.elementFromPoint(centerX, centerY);
                if (!el) return;
                const card = el.closest('[data-video-id]');
                if (card) {
                    const id = card.getAttribute('data-video-id');
                    if (id) appState.trackVisibleVideo(id);
                }
            });
        }

        channelEl.addEventListener('scroll', onScroll, { passive: true });
        return () => channelEl.removeEventListener('scroll', onScroll);
    });
</script>

<div
    class="channel-view"
    use:swipeBack={{
        onClose: () => appState.closeChannel(),
        onSwipeStart: () => { appState.ui.startSwipe(); appState.prepareBackNavigation(); },
        onSwipeUpdate: (p: number) => appState.ui.updateSwipe(p),
        onSwipeEnd: (c: boolean) => appState.ui.endSwipe(c),
    }}
>
    <div class="channel-header">
        <button class="back-btn" onclick={() => appState.closeChannel()}>&larr;</button>
        <h2 class="channel-name">{name}</h2>
    </div>

    <div class="channel-content">
        <VideoList {videos} />

        {#if hasMore && !appState.isRestoring}
            <div class="sentinel" use:sentinel={{
                getRoot: () => document.getElementById('view-channel'),
                rootMargin: SENTINEL_ROOT_MARGIN,
                onIntersect: () => { channel.loadNextPage(); },
                disabled: isLoading,
            }}></div>
        {/if}

        {#if isLoading}
            <div class="empty">Loading...</div>
        {:else if videos.length === 0}
            <div class="empty">No videos</div>
        {/if}
    </div>
</div>

<style>
.channel-view {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.channel-header {
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

.channel-name {
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.channel-content {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: max(20px, env(safe-area-inset-bottom));
}
</style>
