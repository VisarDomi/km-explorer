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
    private videoPageMap = new Map<string, number>();

    constructor(toast: ToastState) {
        this.toast = toast;
    }

    pageOf(videoId: string): number | undefined {
        return this.videoPageMap.get(videoId);
    }

    /** Set active channel without fetching — used during restore before restoreToPage. */
    setChannel(actor: Actor) {
        this.activeChannel = actor;
        this.videos = [];
        this.currentPage = 0;
        this.hasMore = false;
        this.isLoading = false;
        this.videoPageMap.clear();
    }

    async openChannel(actor: Actor, signal?: AbortSignal) {
        this.activeChannel = actor;
        this.videos = [];
        this.currentPage = 1;
        this.hasMore = false;
        this.isLoading = true;
        this.videoPageMap.clear();

        try {
            const data = await api.fetchChannel(actor.url, 1, signal);
            if (signal?.aborted) return;
            this.videos = data.items;
            this.hasMore = data.hasMore;
            for (const v of data.items) this.videoPageMap.set(v.id, 1);
        } catch {
            if (signal?.aborted) return;
            this.toast.show('Failed to load channel');
        } finally {
            if (!signal?.aborted) this.isLoading = false;
        }
    }

    async restoreToPage(page: number, signal?: AbortSignal) {
        if (!this.activeChannel) return;
        this.currentPage = page;
        this.videoPageMap.clear();
        try {
            const data = await api.fetchChannel(this.activeChannel.url, page, signal);
            if (signal?.aborted) return;
            this.videos = data.items;
            this.hasMore = data.hasMore;
            for (const v of data.items) this.videoPageMap.set(v.id, page);
        } catch {
            if (signal?.aborted) return;
            this.videos = [];
            this.hasMore = false;
        }
    }

    async loadNextPage() {
        if (this.isLoading || !this.hasMore || !this.activeChannel) return;

        this.isLoading = true;
        this.currentPage++;

        try {
            const data = await api.fetchChannel(this.activeChannel.url, this.currentPage);
            const seenIds = new Set(this.videos.map(v => v.id));
            const seenUrls = new Set(this.videos.map(v => v.pageUrl));
            const deduped = data.items.filter(v => !seenIds.has(v.id) && !seenUrls.has(v.pageUrl));
            this.videos = [...this.videos, ...deduped];
            this.hasMore = data.hasMore;
            for (const v of deduped) this.videoPageMap.set(v.id, this.currentPage);
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
                const seenIds = new Set(this.videos.map(v => v.id));
                const seenUrls = new Set(this.videos.map(v => v.pageUrl));
                const deduped = data.items.filter(v => !seenIds.has(v.id) && !seenUrls.has(v.pageUrl));
                this.videos = [...this.videos, ...deduped];
                this.hasMore = data.hasMore;
                for (const v of deduped) this.videoPageMap.set(v.id, this.currentPage);
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
        this.videoPageMap.clear();
    }
}
