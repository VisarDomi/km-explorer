import { ConnectionMonitor } from '../services/ConnectionMonitor.svelte.js';
import { watchdog } from '../services/WatchdogService.js';
import { UIState } from './ui.svelte.js';
import { NavStack, type NavEntry } from './navStack.svelte.js';
import { SearchState } from './search.svelte.js';
import { ChannelState } from './channel.svelte.js';
import { FavoritesState } from './favorites.svelte.js';
import { VideoDetailState } from './videoDetail.svelte.js';
import { ToastState } from './toast.svelte.js';
import { saveSession, loadSession } from './session.js';
import { RESUME_RECOVERY_MS, DEEP_SLEEP_MS, VISIBLE_VIDEO_DEBOUNCE_MS, SESSION_TOAST_DURATION } from '../constants.js';
import * as storage from '../services/storage.js';
import type { Actor, VideoStub } from '../types.js';

export type AppStatus = 'BOOTING' | 'READY' | 'BACKGROUND' | 'RECONNECTING' | 'OFFLINE';

class AppState {
    ui = new UIState();
    nav = new NavStack();
    toast = new ToastState();
    searchState: SearchState;
    channel: ChannelState;
    favorites: FavoritesState;
    videoDetails = new VideoDetailState();
    inputQuery = $state(storage.getString('lastQuery', ''));

    // Restore
    private restoreController = $state<AbortController | null>(null);
    get isRestoring() { return this.restoreController !== null; }

    // Lifecycle
    status = $state<AppStatus>('BOOTING');
    private monitor!: ConnectionMonitor;
    private backgroundedAt = 0;
    private bgSentinelId: ReturnType<typeof setInterval> | null = null;
    private bgSentinelTick = 0;

    // Scroll
    private visibleVideoDebounce: ReturnType<typeof setTimeout> | null = null;
    private initialized = false;

    constructor() {
        this.searchState = new SearchState(
            this.toast,
            () => this.recoverScrollContainers(),
        );
        this.channel = new ChannelState(this.toast);
        this.favorites = new FavoritesState(this.toast);
    }

    // --- Navigation ---

    async openChannel(actor: Actor) {
        this.cancelRestore();
        this.nav.push({ mode: 'channel', actor, page: 1, scrollTarget: null });
        this.persistSession();
        await this.channel.openChannel(actor);
    }

    prepareBackNavigation() {
        if (!this.nav.canGoBack()) return;
        const backEntry = this.nav.entries[this.nav.entries.length - 2];
        if (backEntry.scrollTarget) {
            const container = backEntry.mode === 'favorites' ? '#view-favorites' : undefined;
            this.scrollToTarget(backEntry.scrollTarget, container);
        }
    }

    closeChannel() {
        this.nav.pop();
        this.channel.close();
        this.ui.bumpListGeneration();
        const fg = this.nav.foreground;
        if (fg.scrollTarget) {
            this.scrollToTarget(fg.scrollTarget);
        }
        this.persistSession();
    }

    openFavorites() {
        this.nav.push({ mode: 'favorites', scrollTarget: null });
        this.persistSession();
    }

    closeFavorites() {
        this.nav.pop();
        this.ui.bumpListGeneration();
        const fg = this.nav.foreground;
        if (fg.scrollTarget) {
            this.scrollToTarget(fg.scrollTarget);
        }
        this.persistSession();
    }

    toggleFavorite(video: VideoStub) {
        this.favorites.toggle(video);
    }

    submitSearch(query: string) {
        this.cancelRestore();
        this.nav.resetToList(query);
        this.ui.bumpListGeneration();
        this.searchState.search(query);
    }

    private cancelRestore() {
        if (this.restoreController) {
            this.restoreController.abort();
            this.restoreController = null;
        }
    }

    private recoverScrollContainers() {
        const ids = ['view-list', 'view-channel', 'view-favorites'];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.style.overflow = 'hidden';
        }
        requestAnimationFrame(() => {
            for (const id of ids) {
                const el = document.getElementById(id);
                if (el) el.style.overflow = '';
            }
        });
    }

    // --- Visible video tracking ---

    trackVisibleVideo(videoId: string, immediate = false) {
        this.nav.updateScrollTarget(videoId);

        if (this.visibleVideoDebounce) clearTimeout(this.visibleVideoDebounce);

        if (immediate) {
            this.visibleVideoDebounce = null;
            this.persistSession();
            return;
        }

        this.visibleVideoDebounce = setTimeout(() => {
            this.visibleVideoDebounce = null;
            this.persistSession();
        }, VISIBLE_VIDEO_DEBOUNCE_MS);
    }

    // --- Session persistence ---

    private persistSession() {
        const entries = this.nav.serialize();
        // Enrich page values from data stores
        for (const entry of entries) {
            if (entry.mode === 'list' && entry.scrollTarget) {
                const page = this.searchState.pageOf(entry.scrollTarget);
                if (page) entry.page = page;
            } else if (entry.mode === 'channel' && entry.scrollTarget) {
                const page = this.channel.pageOf(entry.scrollTarget);
                if (page) entry.page = page;
            }
        }
        saveSession({ entries });
    }

    // --- Session restore ---

    private async restoreSession(): Promise<boolean> {
        const snapshot = loadSession();
        if (!snapshot?.entries?.length) return false;

        const entries = snapshot.entries;
        if (entries[0].mode !== 'list') return false;

        this.nav.restoreFrom(entries);
        const listEntry = entries[0] as Extract<NavEntry, { mode: 'list' }>;
        const foreground = entries[entries.length - 1];

        this.restoreController = new AbortController();
        const restoreSignal = this.restoreController.signal;

        // Set input query from list entry
        this.inputQuery = listEntry.query;

        // Step 1: Restore list data
        if (listEntry.page > 1) {
            const token = this.searchState.writeGate.acquire('restore');
            this.searchState.currentQuery = listEntry.query;
            storage.setString('lastQuery', listEntry.query);
            await this.searchState.restoreToPage(listEntry.page, token.signal);
            if (!token.cancelled) this.searchState.writeGate.release(token);
        } else {
            const token = this.searchState.writeGate.acquire('restore');
            await this.searchState.search(listEntry.query, token);
        }

        if (restoreSignal.aborted) return true;

        // Step 2: Mode-specific restore
        if (foreground.mode === 'list') {
            await this.restoreForegroundList(foreground, restoreSignal);
        } else if (foreground.mode === 'channel') {
            await this.restoreForegroundChannel(foreground, listEntry, restoreSignal);
        } else if (foreground.mode === 'favorites') {
            this.restoreForegroundFavorites(foreground, listEntry);
        }

        if (!restoreSignal.aborted) {
            this.restoreController = null;
            this.persistSession();
        }

        return true;
    }

    private async restoreForegroundList(
        entry: Extract<NavEntry, { mode: 'list' }>,
        restoreSignal: AbortSignal,
    ) {
        if (!entry.scrollTarget) return;

        const token = this.searchState.writeGate.acquire('restore-paginate');
        const found = await this.searchState.paginateToTarget(entry.scrollTarget, token.signal);
        if (!token.cancelled) this.searchState.writeGate.release(token);

        if (found && !restoreSignal.aborted) {
            await this.waitForLayout();
            if (!restoreSignal.aborted) {
                const scrolled = this.scrollToTarget(entry.scrollTarget);
                if (!scrolled) this.showScrollToast(entry.scrollTarget);
            }
        }
    }

    private async restoreForegroundChannel(
        channelEntry: Extract<NavEntry, { mode: 'channel' }>,
        listEntry: Extract<NavEntry, { mode: 'list' }>,
        restoreSignal: AbortSignal,
    ) {
        // Background: paginate list to its scroll target (gate prevents sentinel interference)
        if (listEntry.scrollTarget) {
            const bgToken = this.searchState.writeGate.acquire('bg-park');
            void this.searchState.paginateToTarget(listEntry.scrollTarget, bgToken.signal).finally(() => {
                if (!bgToken.cancelled) this.searchState.writeGate.release(bgToken);
            });
        }

        // Foreground: restore channel
        if (channelEntry.page > 1) {
            this.channel.setChannel(channelEntry.actor);
            const token = this.channel.writeGate.acquire('restore');
            await this.channel.restoreToPage(channelEntry.page, token.signal);
            if (!token.cancelled) this.channel.writeGate.release(token);
        } else {
            const token = this.channel.writeGate.acquire('restore');
            await this.channel.openChannel(channelEntry.actor, token);
        }

        if (restoreSignal.aborted) return;

        if (channelEntry.scrollTarget) {
            const token = this.channel.writeGate.acquire('restore-paginate');
            const found = await this.channel.paginateToTarget(channelEntry.scrollTarget, token.signal);
            if (!token.cancelled) this.channel.writeGate.release(token);

            if (found && !restoreSignal.aborted) {
                await this.waitForLayout('view-channel', '.channel-content');
                if (!restoreSignal.aborted) {
                    const scrolled = this.scrollToTarget(channelEntry.scrollTarget, '#view-channel');
                    if (!scrolled) this.showScrollToast(channelEntry.scrollTarget, '#view-channel');
                }
            }
        }
    }

    private restoreForegroundFavorites(
        favEntry: Extract<NavEntry, { mode: 'favorites' }>,
        listEntry: Extract<NavEntry, { mode: 'list' }>,
    ) {
        // Background: paginate list to its scroll target
        if (listEntry.scrollTarget) {
            const bgToken = this.searchState.writeGate.acquire('bg-park');
            void this.searchState.paginateToTarget(listEntry.scrollTarget, bgToken.signal).finally(() => {
                if (!bgToken.cancelled) this.searchState.writeGate.release(bgToken);
            });
        }

        if (favEntry.scrollTarget) {
            const targetId = favEntry.scrollTarget;
            void this.waitForLayout('view-favorites', '.favorites-content').then(() => {
                if (!this.restoreController?.signal.aborted) {
                    this.scrollToTarget(targetId, '#view-favorites');
                }
            });
        }
    }

    // --- Scroll restore helpers ---

    private waitForLayout(containerId = 'view-list', scrollSelector?: string): Promise<void> {
        return new Promise(resolve => {
            const check = () => {
                const root = document.getElementById(containerId);
                if (!root) { setTimeout(check, 16); return; }
                const el = scrollSelector ? root.querySelector(scrollSelector) as HTMLElement | null : root;
                if (el && el.scrollHeight > el.clientHeight) {
                    resolve();
                } else {
                    setTimeout(check, 16);
                }
            };
            // First check on next microtask to let Svelte flush DOM updates
            setTimeout(check, 0);
        });
    }

    private scrollToTarget(targetId: string, containerSelector?: string): boolean {
        const selector = containerSelector
            ? `${containerSelector} [data-video-id="${CSS.escape(targetId)}"]`
            : `[data-video-id="${CSS.escape(targetId)}"]`;
        const card = document.querySelector(selector);
        if (card) {
            card.scrollIntoView({ block: 'center' });
            return true;
        }
        return false;
    }

    private showScrollToast(targetId: string, containerSelector?: string) {
        this.toast.show('Tap to scroll to last position', SESSION_TOAST_DURATION, () => {
            const selector = containerSelector
                ? `${containerSelector} [data-video-id="${CSS.escape(targetId)}"]`
                : `[data-video-id="${CSS.escape(targetId)}"]`;
            const card = document.querySelector(selector);
            if (card) {
                card.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        });
    }

    // --- Init ---

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        await this.favorites.init();

        const restored = await this.restoreSession();
        if (!restored) {
            await this.searchState.search(this.inputQuery);
        }

        // Start lifecycle monitoring
        this.monitor = new ConnectionMonitor(
            (online) => this.handleConnectivityChange(online),
            (visible) => this.handleVisibilityChange(visible)
        );

        watchdog.setOnFreeze((gap) => {
            if (this.status === 'READY') {
                void this.resumeFromSleep(gap);
            }
        });
        watchdog.start();

        this.status = 'READY';
    }

    // --- Connectivity ---

    private handleConnectivityChange(online: boolean) {
        if (online) {
            this.toast.show('Back online');
            void this.refreshCurrentView();
            if (this.status === 'OFFLINE') this.status = 'READY';
        } else {
            this.status = 'OFFLINE';
            this.toast.show('No connection');
        }
    }

    // --- Visibility ---

    private handleVisibilityChange(visible: boolean) {
        if (!visible) {
            if (this.status === 'READY') {
                this.backgroundedAt = Date.now();
                this.status = 'BACKGROUND';
                watchdog.stop();
                this.startBackgroundSentinel();
            }
        } else {
            this.stopBackgroundSentinel();
            if (this.status === 'BACKGROUND') {
                this.executeResume();
            }
        }
    }

    // --- Resume ---

    private executeResume() {
        if (this.status !== 'BACKGROUND') return;

        const elapsed = Date.now() - this.backgroundedAt;
        this.backgroundedAt = 0;
        this.stopBackgroundSentinel();
        watchdog.start();

        if (elapsed > RESUME_RECOVERY_MS) {
            void this.resumeFromSleep(elapsed);
        } else {
            this.status = 'READY';
        }
    }

    private async resumeFromSleep(elapsed: number) {
        this.status = 'RECONNECTING';
        await this.refreshCurrentView();
        this.status = 'READY';

        if (elapsed > DEEP_SLEEP_MS) {
            this.toast.show('Session restored');
        }
    }

    private async refreshCurrentView() {
        const view = this.nav.viewMode;
        if (view === 'list') {
            await this.searchState.search(this.searchState.currentQuery);
        } else if (view === 'channel' && this.channel.activeChannel) {
            const fg = this.nav.foreground;
            const scrollTarget = fg.mode === 'channel' ? fg.scrollTarget : null;
            const page = this.channel.currentPage;

            // Refresh channel data up to the page the user was on
            if (page > 1) {
                const token = this.channel.writeGate.acquire('refresh-restore');
                await this.channel.restoreToPage(page, token.signal);
                if (!token.cancelled) this.channel.writeGate.release(token);
            } else {
                await this.channel.openChannel(this.channel.activeChannel);
            }

            // Paginate further if scroll target is beyond current page
            if (scrollTarget) {
                if (!this.channel.videos.some(v => v.id === scrollTarget)) {
                    const token = this.channel.writeGate.acquire('refresh-paginate');
                    await this.channel.paginateToTarget(scrollTarget, token.signal);
                    if (!token.cancelled) this.channel.writeGate.release(token);
                }
                await this.waitForLayout('view-channel', '.channel-content');
                const scrolled = this.scrollToTarget(scrollTarget, '#view-channel');
                if (!scrolled) this.showScrollToast(scrollTarget, '#view-channel');
            }
        }
        // favorites: local data, no refresh needed
    }

    // --- iOS background sentinel ---

    private startBackgroundSentinel() {
        this.stopBackgroundSentinel();
        this.bgSentinelTick = Date.now();

        this.bgSentinelId = setInterval(() => {
            const now = Date.now();
            const delta = now - this.bgSentinelTick;
            this.bgSentinelTick = now;

            if (delta > 3000 && this.status === 'BACKGROUND' && document.visibilityState === 'visible') {
                console.warn(`[AppState] Sentinel: visibilitychange missed, forcing resume (frozen ${Math.round(delta / 1000)}s)`);
                this.executeResume();
            }
        }, 1000);
    }

    private stopBackgroundSentinel() {
        if (this.bgSentinelId) {
            clearInterval(this.bgSentinelId);
            this.bgSentinelId = null;
        }
    }

    destroy() {
        this.cancelRestore();
        if (this.visibleVideoDebounce) clearTimeout(this.visibleVideoDebounce);
        this.monitor.destroy();
        this.videoDetails.disconnectSSE();
        watchdog.stop();
        this.stopBackgroundSentinel();
    }
}

export const appState = new AppState();
