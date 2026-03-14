<script lang="ts">
    import { appState } from '$lib/state/index.svelte.js';
    import * as api from '$lib/services/api.js';
    import type { VideoStub, Actor } from '$lib/types.js';

    interface Props {
        video: VideoStub;
    }

    let { video }: Props = $props();

    type CopyState = 'idle' | 'loading' | 'copied';
    let copyState = $state<CopyState>('idle');

    const detail = $derived(appState.videoDetails.getDetail(video.pageUrl));
    const status = $derived(appState.videoDetails.getStatus(video.pageUrl));

    async function handleCopy() {
        if (copyState !== 'idle') return;

        if (!detail?.videoSrc) {
            copyState = 'loading';
            await appState.videoDetails.requestDetails([video.pageUrl]);
            const start = Date.now();
            while (Date.now() - start < 15000) {
                const d = appState.videoDetails.getDetail(video.pageUrl);
                if (d?.videoSrc) break;
                await new Promise(r => setTimeout(r, 500));
            }
        }

        const d = appState.videoDetails.getDetail(video.pageUrl);
        if (d?.videoSrc) {
            try {
                await navigator.clipboard.writeText(d.videoSrc);
                copyState = 'copied';
                setTimeout(() => { copyState = 'idle'; }, 1500);
            } catch {
                copyState = 'idle';
            }
        } else {
            copyState = 'idle';
        }
    }

    function handleChannel(actor: Actor) {
        appState.openChannel(actor);
    }

    let showActorDropdown = $state(false);

    function handleChannelClick(e: MouseEvent) {
        e.stopPropagation();
        if (!detail?.actors?.length) return;
        if (detail.actors.length === 1) {
            handleChannel(detail.actors[0]);
        } else {
            showActorDropdown = !showActorDropdown;
        }
    }

    const thumbnailUrl = $derived(api.imageProxyUrl(video.thumbnail));

    function handleImgError(e: Event) {
        const img = e.currentTarget as HTMLImageElement;
        if (img.dataset.fallback) return;
        // Original failed — try 320x180 sized variant
        const fallback = video.thumbnail.replace(/(\.\w+)$/, '-320x180$1');
        if (fallback !== video.thumbnail) {
            img.dataset.fallback = '1';
            img.src = api.imageProxyUrl(fallback);
        }
    }
</script>

<div class="video-card" data-video-id={video.id}>
    <div class="thumb-wrapper">
        <img src={thumbnailUrl} alt="" loading="eager" onerror={handleImgError} />
        <div class="actions">
            <button
                class="action-btn copy-btn"
                class:loading={copyState === 'loading' || status === 'loading'}
                class:copied={copyState === 'copied'}
                onclick={handleCopy}
            >
                {#if copyState === 'loading' || (copyState === 'idle' && status === 'loading')}
                    <span class="btn-spinner"></span>
                {:else if copyState === 'copied'}
                    Copied
                {:else}
                    Copy
                {/if}
            </button>
            {#if detail?.actors?.length}
                <div class="channel-wrapper">
                    <button class="action-btn channel-btn" onclick={handleChannelClick}>
                        {detail.actors.length === 1 ? detail.actors[0].name : `${detail.actors.length} actors`}
                    </button>
                    {#if showActorDropdown && detail.actors.length > 1}
                        <div class="actor-dropdown">
                            {#each detail.actors as actor (actor.url)}
                                <button class="actor-item" onclick={() => { showActorDropdown = false; handleChannel(actor); }}>
                                    {actor.name}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
.video-card {
    position: relative;
    aspect-ratio: 16 / 9;
    background: #222;
    overflow: hidden;
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

.actions {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    gap: 4px;
    padding: 4px;
}

.action-btn {
    flex: 1;
    padding: 10px 8px;
    background: rgba(0, 0, 0, 0.7);
    color: #ccc;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}

.action-btn:active {
    background: rgba(255, 255, 255, 0.3);
}

.copy-btn.loading {
    opacity: 0.7;
}

.copy-btn.copied {
    background: rgba(74, 246, 38, 0.9);
    color: #000;
}

.channel-btn {
    background: rgba(74, 246, 38, 0.9);
    color: #000;
}

.channel-btn:active {
    background: rgba(74, 246, 38, 1);
}

.channel-wrapper {
    position: relative;
    flex: 1;
    display: flex;
    min-width: 0;
}

.channel-wrapper .channel-btn {
    width: 100%;
}

.actor-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    background: #222;
    border: 1px solid #444;
    border-radius: 6px;
    margin-bottom: 2px;
    z-index: 10;
    max-height: 200px;
    overflow-y: auto;
}

.actor-item {
    display: block;
    width: 100%;
    padding: 8px 12px;
    color: #ccc;
    font-size: 13px;
    text-align: left;
    border-bottom: 1px solid #333;
}

.actor-item:last-child {
    border-bottom: none;
}

.actor-item:active {
    background: #333;
}

.btn-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: #4af626;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
</style>
