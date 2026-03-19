<script lang="ts">
    import { appState } from '$lib/state/index.svelte.js';
    import * as api from '$lib/services/api.js';
    import type { VideoStub, Actor } from '$lib/types.js';

    interface Props {
        video: VideoStub;
    }

    let { video }: Props = $props();

    // Ownership state machine: idle → activating → done
    // Once 'activating', the click owns navigation — no re-entry.
    type CardState = 'idle' | 'activating' | 'copied';
    let cardState = $state<CardState>('idle');

    const detail = $derived(appState.videoDetails.getDetail(video.pageUrl));
    const status = $derived(appState.videoDetails.getStatus(video.pageUrl));
    const blackout = $derived(detail != null && detail.actors.length === 0);

    let showActorDropdown = $state(false);

    // On channel (detail) view, card doesn't own navigation — only copies.
    const isDetailView = $derived(appState.nav.viewMode === 'channel');

    /**
     * Navigate to actor's channel and copy video source — atomic action.
     * Ownership transfers to the channel view; this card is "consumed".
     */
    async function activateCard(actor: Actor) {
        showActorDropdown = false;
        // Fire-and-forget clipboard copy (side-effect, non-blocking)
        copyVideoSrc();
        // Ownership transfer: navigate to channel
        appState.openChannel(actor);
        // State resets naturally when card remounts on back-navigation
        cardState = 'idle';
    }

    async function handleCardClick() {
        if (cardState !== 'idle') return;

        // On detail view: no navigation, just copy video source.
        // Track this video so session persists the channel scroll position.
        if (isDetailView) {
            appState.trackVisibleVideo(video.id, true);
            cardState = 'activating';
            const ok = await copyOrWait();
            if (ok) {
                cardState = 'copied';
                setTimeout(() => { cardState = 'idle'; }, 1200);
            } else {
                cardState = 'idle';
            }
            return;
        }

        // If detail loaded with actors, navigate immediately
        if (detail?.actors?.length) {
            if (detail.actors.length === 1) {
                cardState = 'activating';
                activateCard(detail.actors[0]);
            } else {
                showActorDropdown = !showActorDropdown;
            }
            return;
        }

        // Detail not loaded — take ownership, request, wait
        cardState = 'activating';
        await appState.videoDetails.requestDetails([video.pageUrl]);

        const start = Date.now();
        while (Date.now() - start < 15000) {
            const d = appState.videoDetails.getDetail(video.pageUrl);
            if (d?.actors?.length) {
                if (d.actors.length === 1) {
                    activateCard(d.actors[0]);
                } else {
                    cardState = 'idle';
                    showActorDropdown = true;
                }
                return;
            }
            await new Promise(r => setTimeout(r, 500));
        }

        // Timed out — release ownership
        cardState = 'idle';
    }

    /** Wait for videoSrc if needed, then copy. Returns true on success. */
    async function copyOrWait(): Promise<boolean> {
        if (detail?.videoSrc) {
            try { await navigator.clipboard.writeText(detail.videoSrc); return true; } catch { return false; }
        }

        await appState.videoDetails.requestDetails([video.pageUrl]);
        const start = Date.now();
        while (Date.now() - start < 15000) {
            const d = appState.videoDetails.getDetail(video.pageUrl);
            if (d?.videoSrc) {
                try { await navigator.clipboard.writeText(d.videoSrc); return true; } catch { return false; }
            }
            await new Promise(r => setTimeout(r, 500));
        }
        return false;
    }

    function copyVideoSrc() {
        const d = appState.videoDetails.getDetail(video.pageUrl);
        if (d?.videoSrc) {
            navigator.clipboard.writeText(d.videoSrc).catch(() => {});
        }
    }

    const thumbnailUrl = $derived(api.imageProxyUrl(video.thumbnail));
    const isFav = $derived(appState.favorites.isFavorited(video.id));

    function handleFav(e: MouseEvent) {
        e.stopPropagation();
        appState.toggleFavorite(video);
    }

    function handleActorSelect(e: MouseEvent, actor: Actor) {
        e.stopPropagation();
        cardState = 'activating';
        activateCard(actor);
    }

    function handleDropdownDismiss(e: MouseEvent) {
        if (showActorDropdown) {
            e.stopPropagation();
            showActorDropdown = false;
        }
    }

    function handleImgError(e: Event) {
        const img = e.currentTarget as HTMLImageElement;
        if (img.dataset.fallback) return;
        const fallback = video.thumbnail.replace(/(\.\w+)$/, '-320x180$1');
        if (fallback !== video.thumbnail) {
            img.dataset.fallback = '1';
            img.src = api.imageProxyUrl(fallback);
        }
    }
</script>

{#if blackout}
    <div class="video-card blackout" data-video-id={video.id}></div>
{:else}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="video-card"
        class:activating={cardState === 'activating'}
        class:copied={cardState === 'copied'}
        data-video-id={video.id}
        onclick={handleCardClick}
    >
        <div class="thumb-wrapper">
            <img src={thumbnailUrl} alt="" loading="eager" onerror={handleImgError} />
            <button class="fav-btn" class:fav-active={isFav} onclick={handleFav}>
                {isFav ? '\u2764' : '\u2661'}
            </button>
            {#if cardState === 'activating'}
                <div class="loading-overlay">
                    <span class="card-spinner"></span>
                </div>
            {:else if cardState === 'copied'}
                <div class="copied-overlay">Copied</div>
            {/if}
            {#if showActorDropdown && detail?.actors && detail.actors.length > 1}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="actor-overlay" onclick={handleDropdownDismiss}>
                    <div class="actor-dropdown">
                        {#each detail.actors as actor (actor.url)}
                            <button class="actor-item" onclick={(e) => handleActorSelect(e, actor)}>
                                {actor.name}
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
.video-card {
    position: relative;
    aspect-ratio: 16 / 9;
    background: #222;
    overflow: hidden;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}

.video-card.blackout {
    background: #000;
    cursor: default;
    pointer-events: none;
}

.video-card:active:not(.activating) {
    opacity: 0.8;
}

.video-card.activating,
.video-card.copied {
    pointer-events: none;
}

.copied-overlay {
    position: absolute;
    inset: 0;
    background: rgba(74, 246, 38, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3;
    color: #000;
    font-size: 16px;
    font-weight: 700;
}

.thumb-wrapper {
    position: absolute;
    inset: 0;
}

.thumb-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.fav-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 18px;
    color: #666;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    pointer-events: auto;
}

.fav-btn.fav-active {
    color: #f87171;
}

.fav-btn:active {
    background: rgba(255, 255, 255, 0.3);
}

.loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3;
}

.card-spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: #4af626;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

.actor-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 4;
}

.actor-dropdown {
    background: #222;
    border: 1px solid #444;
    border-radius: 8px;
    max-height: 200px;
    overflow-y: auto;
    min-width: 60%;
}

.actor-item {
    display: block;
    width: 100%;
    padding: 12px 16px;
    color: #ccc;
    font-size: 14px;
    text-align: center;
    border-bottom: 1px solid #333;
    background: none;
    border-left: none;
    border-right: none;
    border-top: none;
}

.actor-item:last-child {
    border-bottom: none;
}

.actor-item:active {
    background: #4af626;
    color: #000;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
</style>
