import { ConnectionMonitor } from '../services/ConnectionMonitor.svelte.js';
import { watchdog } from '../services/WatchdogService.js';
import { UIState } from './ui.svelte.js';
import { SearchState } from './search.svelte.js';
import { ChannelState } from './channel.svelte.js';
import { VideoDetailState } from './videoDetail.svelte.js';
import { ToastState } from './toast.svelte.js';
import { saveSession, loadSession, clearSession, type SessionSnapshot } from './session.js';
import { RESUME_RECOVERY_MS, DEEP_SLEEP_MS, VISIBLE_VIDEO_DEBOUNCE_MS, SESSION_TOAST_DURATION } from '../constants.js';
import type { ViewFrame } from '../types.js';

export type AppStatus = 'BOOTING' | 'READY' | 'BACKGROUND' | 'RECONNECTING' | 'OFFLINE';

type RestoreState = 'idle' | 'replaying-search' | 'paginating-to-target' | 'scrolling';

class RestoreMachine {
    state = $state<RestoreState>('idle');
    private controller: AbortController | null = null;
    targetVideoId: string | null = null;

    get isActive() { return this.state !== 'idle'; }
    get signal() { return this.controller?.signal; }

    start(targetId: string) {
        this.cancel();
        this.targetVideoId = targetId;
        this.controller = new AbortController();
        this.state = 'replaying-search';
    }

    transition(next: 'paginating-to-target' | 'scrolling') {
        if (!this.isActive) return;
        this.state = next;
    }

    cancel() {
        this.controller?.abort();
        this.controller = null;
        this.targetVideoId = null;
        this.state = 'idle';
    }

    done() {
        this.controller = null;
        this.targetVideoId = null;
        this.state = 'idle';
    }
}

class AppState {
    ui = new UIState();
    toast = new ToastState();
    searchState: SearchState;
    channel: ChannelState;
    videoDetails = new VideoDetailState();

    // Lifecycle
    status = $state<AppStatus>('BOOTING');
    private monitor!: ConnectionMonitor;
    private backgroundedAt = 0;
    private bgSentinelId: ReturnType<typeof setInterval> | null = null;
    private bgSentinelTick = 0;

    // Scroll restore
    private restore = new RestoreMachine();
    private lastVisibleVideoId: string | null = null;
    private visibleVideoDebounce: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        this.searchState = new SearchState(
            this.toast,
            () => this.recoverScrollContainers(),
        );
        this.channel = new ChannelState(this.toast, this.ui);

        // Wire up session save on every view transition
        this.ui.onViewChange = () => this.persistSession();

        // Wire up scroll target capture: moves lastVisibleVideoId into the pushed frame
        this.ui.captureScrollTarget = () => {
            const target = this.lastVisibleVideoId ?? undefined;
            this.lastVisibleVideoId = null;
            return target;
        };

        // Wire up frame restore: when popping back, restore scroll target from the frame
        this.ui.onFrameRestored = (frame) => {
            if (frame.targetVideoId) {
                this.lastVisibleVideoId = frame.targetVideoId;
                requestAnimationFrame(() => {
                    this.scrollListToTarget(frame.targetVideoId!);
                });
            }
        };
    }

    private recoverScrollContainers() {
        const ids = ['view-list', 'view-channel'];
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

    trackVisibleVideo(videoId: string) {
        this.lastVisibleVideoId = videoId;

        if (this.visibleVideoDebounce) clearTimeout(this.visibleVideoDebounce);
        this.visibleVideoDebounce = setTimeout(() => {
            this.visibleVideoDebounce = null;
            if (this.ui.viewMode === 'list' || this.ui.viewMode === 'channel') {
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

        const target = this.lastVisibleVideoId;
        if (target) {
            snapshot.targetVideoId = target;
        }

        saveSession(snapshot);
    }

    // --- Session restore ---

    private async restoreSession(): Promise<boolean> {
        const snapshot = loadSession();
        if (!snapshot) return false;

        clearSession();

        if (snapshot.searchQuery) {
            this.searchState.inputQuery = snapshot.searchQuery;
        }

        const targetId = snapshot.targetVideoId;

        if (snapshot.viewMode === 'list') {
            // Restore list's own scroll target (could be from stack frame or direct)
            const listTargetId = targetId ?? this.findListTargetInStack(snapshot.viewStack);

            await this.searchState.search(this.searchState.inputQuery);

            if (listTargetId) {
                this.restore.start(listTargetId);
                this.restore.transition('paginating-to-target');
                void this.bgPaginateToTarget();
            }

            return true;
        }

        if (snapshot.viewMode === 'channel' && snapshot.activeChannel) {
            // Find the list's scroll target from the stack frame
            const listTargetId = this.findListTargetInStack(snapshot.viewStack);

            // Restore list in background with its own target
            void this.searchState.search(this.searchState.inputQuery).then(() => {
                if (listTargetId) {
                    void this.bgPaginateAndPark(listTargetId);
                }
            });

            // Restore the view stack (without triggering session save)
            this.ui.setViewDirect('channel', snapshot.viewStack);
            await this.channel.openChannel(snapshot.activeChannel, { skipPush: true });

            // Scroll to last visible video in channel view
            if (targetId) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        this.scrollChannelToTarget(targetId);
                    });
                });
            }
            return true;
        }

        return false;
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
     * Paginate search results until the list's target video is present in DOM,
     * but don't scroll — just park the results so they're ready when user pops back.
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
                this.onTargetFound(targetId);
                return;
            }

            const found = await this.searchState.paginateToTarget(targetId, this.restore.signal!);
            if (!this.restore.isActive) return;

            if (found) {
                this.restore.transition('scrolling');
                this.onTargetFound(targetId);
            } else {
                this.restore.done();
            }
        } catch {
            this.restore.done();
        }
    }

    private onTargetFound(targetId: string) {
        const scrolled = this.scrollListToTarget(targetId);
        if (scrolled) {
            this.restore.done();
        } else {
            this.showScrollToast(targetId);
            this.restore.done();
        }
    }

    private scrollListToTarget(targetId: string): boolean {
        const card = document.querySelector(`[data-video-id="${CSS.escape(targetId)}"]`);
        if (card) {
            card.scrollIntoView({ block: 'center' });
            return true;
        }
        return false;
    }

    private scrollChannelToTarget(targetId: string) {
        const card = document.querySelector(`#view-channel [data-video-id="${CSS.escape(targetId)}"]`);
        if (card) {
            card.scrollIntoView({ block: 'center' });
        }
    }

    private showScrollToast(targetId: string) {
        this.toast.show('Tap to scroll to last position', SESSION_TOAST_DURATION, () => {
            const card = document.querySelector(`[data-video-id="${CSS.escape(targetId)}"]`);
            if (card) {
                card.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        });
    }

    // --- Init ---

    async init() {
        const restored = await this.restoreSession();
        if (!restored) {
            await this.searchState.search(this.searchState.inputQuery);
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
        this.monitor.destroy();
        this.videoDetails.disconnectSSE();
        watchdog.stop();
        this.stopBackgroundSentinel();
    }
}

export const appState = new AppState();
