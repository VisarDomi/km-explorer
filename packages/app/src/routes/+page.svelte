<script lang="ts">
    import { onMount } from 'svelte';
    import { appState } from '$lib/state/index.svelte.js';
    import { initAppDimensions } from '$lib/state/appDimensions.js';
    import ListView from '$lib/views/ListView.svelte';
    import ChannelView from '$lib/views/ChannelView.svelte';
    import FavoritesView from '$lib/views/FavoritesView.svelte';
    import Toast from '$lib/components/Toast.svelte';

    onMount(() => {
        initAppDimensions();
        appState.init();
    });

    const viewMode = $derived(appState.ui.viewMode);
    const isSwiping = $derived(appState.ui.isSwiping);
    const swipeAnimating = $derived(appState.ui.swipeAnimating);
    const swipeProgress = $derived(appState.ui.swipeProgress);

    const backView = $derived(isSwiping ? appState.ui.peekBack() : null);
    const inChannel = $derived(viewMode === 'channel');
    const inFavorites = $derived(viewMode === 'favorites');
</script>

<div
    id="view-list"
    class="view-layer"
    class:view-hidden={viewMode !== 'list' && backView !== 'list'}
    class:swipe-back={backView === 'list'}
    class:swipe-animating={backView === 'list' && swipeAnimating}
>
    <ListView />
</div>

<div
    id="view-channel"
    class="view-layer"
    class:view-hidden={viewMode !== 'channel' && backView !== 'channel'}
    class:swipe-back={backView === 'channel'}
    class:swipe-animating={backView === 'channel' && swipeAnimating}
    class:swipe-active={inChannel && isSwiping}
    style="{inChannel && isSwiping ? `transform:translateX(${swipeProgress * 100}%)` : ''}"
>
    <ChannelView />
</div>

<div
    id="view-favorites"
    class="view-layer"
    class:view-hidden={viewMode !== 'favorites' && backView !== 'favorites'}
    class:swipe-back={backView === 'favorites'}
    class:swipe-animating={backView === 'favorites' && swipeAnimating}
    class:swipe-active={inFavorites && isSwiping}
    style="{inFavorites && isSwiping ? `transform:translateX(${swipeProgress * 100}%)` : ''}"
>
    <FavoritesView />
</div>

<Toast />

<style>
.view-layer {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: #000;
}

.view-layer.view-hidden {
    visibility: hidden;
    pointer-events: none;
}

.view-layer.swipe-active {
    z-index: 4;
    box-shadow: -10px 0 30px rgba(0, 0, 0, 0.3);
}

.view-layer.swipe-back {
    visibility: visible;
    pointer-events: none;
}

.view-layer.swipe-animating {
    transition: transform 250ms ease-out, opacity 250ms ease-out;
}
</style>
