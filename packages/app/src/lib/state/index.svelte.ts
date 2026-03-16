import { ConnectionMonitor } from '../services/ConnectionMonitor.svelte.js';
import { watchdog } from '../services/WatchdogService.js';
import { UIState } from './ui.svelte.js';
import { SearchState } from './search.svelte.js';
import { ChannelState } from './channel.svelte.js';
import { FavoritesState } from './favorites.svelte.js';
import { VideoDetailState } from './videoDetail.svelte.js';
import { ToastState } from './toast.svelte.js';
import { saveSession, loadSession, clearSession, type SessionSnapshot } from './session.js';
import { RESUME_RECOVERY_MS, DEEP_SLEEP_MS, VISIBLE_VIDEO_DEBOUNCE_MS, SESSION_TOAST_DURATION } from '../constants.js';
import * as storage from '../services/storage.js';
import type { Actor, VideoStub, ViewFrame, ViewMode } from '../types.js';

export type AppStatus = 'BOOTING' | 'READY' | 'BACKGROUND' | 'RECONNECTING' | 'OFFLINE';

type RestorePhase = 'replaying-search' | 'paginating-to-target' | 'scrolling';
type RestoreInner =
    | { kind: 'idle' }
    | { kind: 'active'; phase: RestorePhase; controller: AbortController; targetId: string };

class RestoreMachine {
    private inner = $state<RestoreInner>({ kind: 'idle' });

    get isActive() { return this.inner.kind === 'active'; }
    get signal() { return this.inner.kind === 'active' ? this.inner.controller.signal : undefined; }
    get targetVideoId() { return this.inner.kind === 'active' ? this.inner.targetId : null; }
    get phase() { return this.inner.kind === 'active' ? this.inner.phase : null; }

    start(targetId: string) {
        this.cancel();
        this.inner = { kind: 'active', phase: 'replaying-search', controller: new AbortController(), targetId };
    }

    transition(next: 'paginating-to-target' | 'scrolling') {
        if (this.inner.kind !== 'active') return;
        this.inner = { ...this.inner, phase: next };
    }

    cancel() {
        if (this.inner.kind !== 'active') return;
        this.inner.controller.abort();
        this.inner = { kind: 'idle' };
    }

    done() {
        this.inner = { kind: 'idle' };
    }
}

class AppState {
    ui = new UIState();
    toast = new ToastState();
    searchState: SearchState;
    channel: ChannelState;
    favorites: FavoritesState;
    videoDetails = new VideoDetailState();
    inputQuery = $state(storage.getString('lastQuery', ''));

    // Lifecycle
    status = $state<AppStatus>('BOOTING');
    private monitor!: ConnectionMonitor;
    private backgroundedAt = 0;
    private bgSentinelId: ReturnType<typeof setInterval> | null = null;
    private bgSentinelTick = 0;

    // Scroll restore
    private restore = new RestoreMachine();
    private lastVisibleVideoIds: Record<ViewMode, string | null> = { list: null, channel: null, favorites: null };
    private visibleVideoDebounce: ReturnType<typeof setTimeout> | null = null;
    private initialized = false;

    constructor() {
        this.searchState = new SearchState(
            this.toast,
            () => this.recoverScrollContainers(),
        );
        this.channel = new ChannelState(this.toast);
        this.favorites = new FavoritesState(this.toast);

        // Wire up session save on every view transition
        this.ui.onViewChange = () => this.persistSession();

        // Wire up scroll target capture: moves lastVisibleVideoId + page into the pushed frame
        this.ui.captureScrollTarget = () => {
            const viewMode = this.ui.viewMode;
            const videoId = this.lastVisibleVideoIds[viewMode] ?? undefined;
            this.lastVisibleVideoIds[viewMode] = null;
            if (!videoId) return {};
            const page = viewMode === 'channel'
                ? this.channel.pageOf(videoId)
                : this.searchState.pageOf(videoId);
            return { videoId, page };
        };

        // Wire up frame restore: when popping back, scroll to the frame's target
        this.ui.onFrameRestored = (frame) => {
            if (frame.targetVideoId) {
                const container = frame.mode === 'favorites' ? '#view-favorites' : undefined;
                this.scrollToTarget(frame.targetVideoId!, container);
            }
        };

        // Cancel restore when a new user-initiated search fires (unless we're replaying)
        this.searchState.onNewSearch = () => {
            if (this.restore.phase !== 'replaying-search') {
                this.restore.cancel();
            }
        };
    }

    // --- Navigation ---

    async openChannel(actor: Actor) {
        this.restore.cancel();
        this.ui.pushView('channel');
        await this.channel.openChannel(actor);
    }

    prepareBackNavigation() {
        const stack = this.ui.viewStack;
        if (stack.length === 0) return;
        const frame = stack[stack.length - 1];
        if (frame.targetVideoId) {
            this.scrollToTarget(frame.targetVideoId);
        }
    }

    closeChannel() {
        this.ui.popView();
        this.channel.close();
    }

    openFavorites() {
        this.ui.pushView('favorites');
    }

    closeFavorites() {
        this.ui.popView();
    }

    toggleFavorite(video: VideoStub) {
        this.favorites.toggle(video);
    }

    submitSearch(query: string) {
        this.restore.cancel();
        this.lastVisibleVideoIds.list = null;
        this.ui.resetTo('list');
        this.searchState.search(query);
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
        const viewMode = this.ui.viewMode;
        this.lastVisibleVideoIds[viewMode] = videoId;

        if (this.visibleVideoDebounce) clearTimeout(this.visibleVideoDebounce);

        if (immediate) {
            this.visibleVideoDebounce = null;
            this.persistSession();
            return;
        }

        this.visibleVideoDebounce = setTimeout(() => {
            this.visibleVideoDebounce = null;
            if (viewMode === 'list' || viewMode === 'channel' || viewMode === 'favorites') {
                this.persistSession();
            }
        }, VISIBLE_VIDEO_DEBOUNCE_MS);
    }

    // --- Session persistence ---

    private persistSession() {
        const snapshot: SessionSnapshot = {
            viewMode: this.ui.viewMode,
            viewStack: $state.snapshot(this.ui.viewStack),
        };

        if (this.channel.activeChannel) {
            snapshot.activeChannel = $state.snapshot(this.channel.activeChannel);
        }

        if (this.searchState.currentQuery) {
            snapshot.searchQuery = this.searchState.currentQuery;
        }

        const listTarget = this.lastVisibleVideoIds.list;
        if (listTarget) {
            snapshot.listTargetVideoId = listTarget;
            snapshot.listCurrentPage = this.searchState.pageOf(listTarget);
        }

        const channelTarget = this.lastVisibleVideoIds.channel;
        if (channelTarget) {
            snapshot.channelTargetVideoId = channelTarget;
            snapshot.channelCurrentPage = this.channel.pageOf(channelTarget);
        }

        const favTarget = this.lastVisibleVideoIds.favorites;
        if (favTarget) snapshot.favoritesTargetVideoId = favTarget;

        saveSession(snapshot);
    }

    // --- Session restore ---

    private async restoreSession(): Promise<boolean> {
        const snapshot = loadSession();

        if (!snapshot) return false;

        clearSession();

        if (snapshot.searchQuery) {
            this.inputQuery = snapshot.searchQuery;
        }

        if (snapshot.viewMode === 'list') {
            return this.restoreListView(snapshot);
        }
        if (snapshot.viewMode === 'channel' && snapshot.activeChannel) {
            return this.restoreChannelView(snapshot);
        }
        if (snapshot.viewMode === 'favorites') {
            return this.restoreFavoritesView(snapshot);
        }

        return false;
    }

    private async restoreListView(snapshot: SessionSnapshot): Promise<boolean> {
        const listTargetId = snapshot.listTargetVideoId ?? this.findListTargetInStack(snapshot.viewStack);

        if (listTargetId) this.restore.start(listTargetId);
        await this.searchState.search(this.inputQuery);
        if (listTargetId && this.restore.isActive) {
            this.restore.transition('paginating-to-target');
            void this.bgPaginateToTarget();
        }

        return true;
    }

    private async restoreChannelView(snapshot: SessionSnapshot): Promise<boolean> {
        const listTargetId = snapshot.listTargetVideoId ?? this.findListTargetInStack(snapshot.viewStack);

        // Restore list in background (fire-and-forget, no signal)
        void this.searchState.search(this.inputQuery).then(() => {
            if (listTargetId) {
                void this.bgPaginateAndPark(listTargetId);
            }
        });

        // Restore the view stack and open channel
        this.ui.setViewDirect('channel', snapshot.viewStack);
        await this.channel.openChannel(snapshot.activeChannel!);

        // Paginate channel to target if needed
        const channelTargetId = snapshot.channelTargetVideoId;
        if (channelTargetId) {
            this.restore.start(channelTargetId);
            this.restore.transition('paginating-to-target');
            void this.bgPaginateChannelToTarget(channelTargetId);
        }

        return true;
    }

    private async restoreFavoritesView(snapshot: SessionSnapshot): Promise<boolean> {
        const listTargetId = snapshot.listTargetVideoId ?? this.findListTargetInStack(snapshot.viewStack);

        // Restore list in background (fire-and-forget, no signal)
        void this.searchState.search(this.inputQuery).then(() => {
            if (listTargetId) {
                void this.bgPaginateAndPark(listTargetId);
            }
        });

        this.ui.setViewDirect('favorites', snapshot.viewStack);

        const favTargetId = snapshot.favoritesTargetVideoId;
        if (favTargetId) {
            void this.waitForLayout('view-favorites').then(() => {
                this.scrollToTarget(favTargetId, '#view-favorites');
            });
        }

        return true;
    }

    /**
     * Find the list view's targetVideoId from the view stack frames.
     */
    private findListTargetInStack(stack: ViewFrame[]): string | undefined {
        for (const frame of stack) {
            if (frame.mode === 'list' && frame.targetVideoId) {
                return frame.targetVideoId;
            }
        }
        return undefined;
    }

    /**
     * Paginate search results until the list's target video is present,
     * but don't scroll — just park the results so they're ready when user pops back.
     * Fire-and-forget: does NOT use restore.signal.
     */
    private async bgPaginateAndPark(targetId: string) {
        try {
            if (this.searchState.results.some(v => v.id === targetId)) return;
            await this.searchState.paginateToTarget(targetId);
        } catch {
            // Best-effort: if pagination fails, list will just show page 1
        }
    }

    // --- Scroll restore helpers ---

    private async bgPaginateToTarget() {
        const targetId = this.restore.targetVideoId;
        if (!targetId || !this.restore.isActive) {
            this.restore.done();
            return;
        }

        try {
            if (this.searchState.results.some(v => v.id === targetId)) {
                this.restore.transition('scrolling');
                await this.waitForLayout();
                if (!this.restore.isActive) return;
                this.onTargetFound(targetId);
                return;
            }

            const found = await this.searchState.paginateToTarget(targetId, this.restore.signal);
            if (!this.restore.isActive) return;

            if (found) {
                this.restore.transition('scrolling');
                await this.waitForLayout();
                if (!this.restore.isActive) return;
                this.onTargetFound(targetId);
            } else {
                this.restore.done();
            }
        } catch {
            this.restore.done();
        }
    }

    private async bgPaginateChannelToTarget(targetId: string) {
        if (!this.restore.isActive) return;

        try {
            if (this.channel.videos.some(v => v.id === targetId)) {
                this.restore.transition('scrolling');
                await this.waitForLayout('view-channel');
                if (!this.restore.isActive) return;
                const scrolled = this.scrollToTarget(targetId, '#view-channel');
                if (!scrolled) this.showScrollToast(targetId, '#view-channel');
                this.restore.done();
                return;
            }

            const found = await this.channel.paginateToTarget(targetId, this.restore.signal);
            if (!this.restore.isActive) return;

            if (found) {
                this.restore.transition('scrolling');
                await this.waitForLayout('view-channel');
                if (!this.restore.isActive) return;
                const scrolled = this.scrollToTarget(targetId, '#view-channel');
                if (!scrolled) this.showScrollToast(targetId, '#view-channel');
                this.restore.done();
            } else {
                this.restore.done();
            }
        } catch {
            this.restore.done();
        }
    }

    private onTargetFound(targetId: string) {
        const scrolled = this.scrollToTarget(targetId);
        if (!scrolled) this.showScrollToast(targetId);
        this.restore.done();
    }

    private waitForLayout(containerId = 'view-list'): Promise<void> {
        return new Promise(resolve => {
            const check = () => {
                const el = document.getElementById(containerId);
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
        const view = this.ui.viewMode;
        if (view === 'list') {
            await this.searchState.search(this.searchState.currentQuery);
        }
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
        this.restore.cancel();
        if (this.visibleVideoDebounce) clearTimeout(this.visibleVideoDebounce);
        this.monitor.destroy();
        this.videoDetails.disconnectSSE();
        watchdog.stop();
        this.stopBackgroundSentinel();
    }
}

export const appState = new AppState();
