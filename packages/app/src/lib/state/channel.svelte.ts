import type { VideoStub, Actor } from '../types.js';
import * as api from '../services/api.js';
import type { ToastState } from './toast.svelte.js';

export class ChannelState {
    activeChannel = $state<Actor | null>(null);
    videos = $state<VideoStub[]>([]);
    currentPage = $state(1);
    hasMore = $state(false);
    isLoading = $state(false);

    private toast: ToastState;

    constructor(toast: ToastState) {
        this.toast = toast;
    }

    async openChannel(actor: Actor, signal?: AbortSignal) {
        this.activeChannel = actor;
        this.videos = [];
        this.currentPage = 1;
        this.hasMore = false;
        this.isLoading = true;

        try {
            const data = await api.fetchChannel(actor.url, 1, signal);
            if (signal?.aborted) return;
            this.videos = data.items;
            this.hasMore = data.hasMore;
        } catch {
            if (signal?.aborted) return;
            this.toast.show('Failed to load channel');
        } finally {
            if (!signal?.aborted) this.isLoading = false;
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

    async paginateToTarget(targetId: string, signal?: AbortSignal): Promise<boolean> {
        if (this.videos.some(v => v.id === targetId)) return true;

        while (this.hasMore) {
            if (signal?.aborted) return false;
            this.currentPage++;
            try {
                const data = await api.fetchChannel(this.activeChannel!.url, this.currentPage, signal);
                if (signal?.aborted) return false;
                const seen = new Set(this.videos.map(v => v.id));
                const deduped = data.items.filter(v => !seen.has(v.id));
                this.videos = [...this.videos, ...deduped];
                this.hasMore = data.hasMore;
                if (deduped.some(v => v.id === targetId)) return true;
            } catch {
                if (signal?.aborted) return false;
                this.currentPage--;
                return false;
            }
        }
        return false;
    }

    close() {
        this.activeChannel = null;
        this.videos = [];
    }
}
