import type { VideoStub, Actor } from '../types.js';
import * as api from '../services/api.js';
import type { ToastState } from './toast.svelte.js';
import type { UIState } from './ui.svelte.js';

export class ChannelState {
    activeChannel = $state<Actor | null>(null);
    videos = $state<VideoStub[]>([]);
    currentPage = $state(1);
    hasMore = $state(false);
    isLoading = $state(false);

    private toast: ToastState;
    private ui: UIState;

    constructor(toast: ToastState, ui: UIState) {
        this.toast = toast;
        this.ui = ui;
    }

    async openChannel(actor: Actor, { skipPush = false } = {}) {
        this.activeChannel = actor;
        this.videos = [];
        this.currentPage = 1;
        this.hasMore = false;
        this.isLoading = true;
        if (!skipPush) this.ui.pushView('channel');

        try {
            const data = await api.fetchChannel(actor.url, 1);
            this.videos = data.items;
            this.hasMore = data.hasMore;
        } catch {
            this.toast.show('Failed to load channel');
        } finally {
            this.isLoading = false;
        }
    }

    async loadNextPage() {
        if (this.isLoading || !this.hasMore || !this.activeChannel) return;

        this.isLoading = true;
        this.currentPage++;

        try {
            const data = await api.fetchChannel(this.activeChannel.url, this.currentPage);
            const seen = new Set(this.videos.map(v => v.id));
            const deduped = data.items.filter(v => !seen.has(v.id));
            this.videos = [...this.videos, ...deduped];
            this.hasMore = data.hasMore;
        } catch {
            this.currentPage--;
            this.toast.show('Failed to load more');
        } finally {
            this.isLoading = false;
        }
    }

    close() {
        this.ui.popView();
        this.activeChannel = null;
        this.videos = [];
    }
}
