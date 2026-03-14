<script lang="ts">
    import { appState } from '$lib/state/index.svelte.js';

    function handleSubmit(e: Event) {
        e.preventDefault();
        appState.submitSearch(appState.inputQuery);
    }
</script>

<div class="search-bar-wrapper">
    <div class="search-row">
        <form class="input-container" onsubmit={handleSubmit}>
            <input
                type="text"
                placeholder="Search videos..."
                bind:value={appState.inputQuery}
                disabled={appState.searchState.isLoading}
            />
            {#if appState.searchState.isLoading}
                <div class="search-spinner"></div>
            {/if}
        </form>
        <button class="favs-btn" onclick={() => appState.openFavorites()}>
            Favs
        </button>
    </div>
</div>

<style>
.search-bar-wrapper {
    margin: max(15px, env(safe-area-inset-top)) auto 0;
    width: 95%;
    max-width: 600px;
    background-color: rgba(30, 30, 30, 0.90);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
    padding: 12px;
}

.search-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
}

.input-container {
    position: relative;
    flex: 1;
    min-width: 0;
}

.favs-btn {
    padding: 0 14px;
    border-radius: 8px;
    border: 1px solid #444;
    background: rgba(0, 0, 0, 0.3);
    color: #f87171;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
}

.favs-btn:active {
    background: rgba(255, 255, 255, 0.2);
}

.input-container input {
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid #444;
    background: rgba(0, 0, 0, 0.3);
    color: #fff;
    font-size: 16px;
}

.input-container input:focus {
    outline: none;
    border-color: #777;
    background: rgba(0, 0, 0, 0.5);
}

.input-container input:disabled {
    opacity: 0.7;
    cursor: wait;
}

.search-spinner {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: #4af626;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    pointer-events: none;
}

@keyframes spin {
    to { transform: translateY(-50%) rotate(360deg); }
}
</style>
