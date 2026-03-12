import { ConnectionMonitor } from '../services/ConnectionMonitor.svelte.js';
import { watchdog } from '../services/WatchdogService.js';
import { UIState } from './ui.svelte.js';
import { SearchState } from './search.svelte.js';
import { ChannelState } from './channel.svelte.js';
import { VideoDetailState } from './videoDetail.svelte.js';
import { ToastState } from './toast.svelte.js';
import { saveSession, loadSession, clearSession, type SessionSnapshot } from './session.js';
import { RESUME_RECOVERY_MS, DEEP_SLEEP_MS } from '../constants.js';

export type AppStatus = 'BOOTING' | 'READY' | 'BACKGROUND' | 'RECONNECTING' | 'OFFLINE';

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

    constructor() {
        this.searchState = new SearchState(
            this.toast,
            () => this.recoverScrollContainers(),
        );
        this.channel = new ChannelState(this.toast, this.ui);

        // Wire up session save on every view transition
        this.ui.onViewChange = () => this.persistSession();
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

    // --- Session persistence ---

    private persistSession() {
        const snapshot: SessionSnapshot = {
            viewMode: this.ui.viewMode,
            viewStack: [...this.ui.viewStack],
        };

        if (this.channel.activeChannel) {
            snapshot.activeChannel = $state.snapshot(this.channel.activeChannel);
        }

        if (this.searchState.currentQuery) {
            snapshot.searchQuery = this.searchState.currentQuery;
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

        if (snapshot.viewMode === 'list') {
            await this.searchState.search(this.searchState.inputQuery);
            return true;
        }

        if (snapshot.viewMode === 'channel' && snapshot.activeChannel) {
            // Restore list in background, then open channel
            this.searchState.search(this.searchState.inputQuery);
            await this.channel.openChannel(snapshot.activeChannel);
            return true;
        }

        return false;
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
