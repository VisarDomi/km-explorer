import { LOADING_TIMEOUT_MS } from '../constants.js';
import type { VideoStub } from '../types.js';
import * as api from '../services/api.js';
import * as storage from '../services/storage.js';
import type { ToastState } from './toast.svelte.js';
import { WriteGate, type WriteToken } from './writeGate.js';

export class SearchState {
    results = $state<VideoStub[]>([]);
    currentQuery = $state('');
    currentPage = $state(1);
    hasMore = $state(false);

    private toast: ToastState;
    readonly writeGate = new WriteGate();
    private loadingWatchdog: ReturnType<typeof setTimeout> | null = null;
    private onStuck: (() => void) | null = null;
    private videoPageMap = new Map<string, number>();

    get isLoading() { return this.writeGate.isHeld; }

    pageOf(videoId: string): number | undefined {
        return this.videoPageMap.get(videoId);
    }

    constructor(toast: ToastState, onStuck?: () => void) {
        this.toast = toast;
        this.onStuck = onStuck ?? null;
    }

    private startWatchdog(token: WriteToken) {
        this.clearWatchdog();
        this.loadingWatchdog = setTimeout(() => {
            if (!token.cancelled) {
                this.writeGate.release(token);
                this.toast.show('Loading timed out — scroll to retry');
                this.onStuck?.();
            }
        }, LOADING_TIMEOUT_MS);
    }

    private clearWatchdog() {
        if (this.loadingWatchdog != null) {
            clearTimeout(this.loadingWatchdog);
            this.loadingWatchdog = null;
        }
    }

    async search(query: string, externalToken?: WriteToken) {
        const token = externalToken ?? this.writeGate.acquire('user-search');
        const signal = token.signal;
        this.startWatchdog(token);

        this.currentQuery = query;
        this.currentPage = 1;
        storage.setString('lastQuery', query);

        try {
            const data = query
                ? await api.searchVideos(query, 1, signal)
                : await api.fetchLatest(1, signal);
            if (signal.aborted) return;
            this.results = data.items;
            this.hasMore = data.hasMore;
            this.videoPageMap.clear();
            for (const v of data.items) this.videoPageMap.set(v.id, 1);
        } catch (e) {
            if (signal.aborted) return;
            this.results = [];
            this.hasMore = false;
            this.videoPageMap.clear();
            this.toast.show('Search failed');
        } finally {
            this.clearWatchdog();
            if (!signal.aborted) {
                this.writeGate.release(token);
            }
        }
    }

    private async fetchAndAppendPage(page: number, signal?: AbortSignal): Promise<VideoStub[]> {
        const data = this.currentQuery
            ? await api.searchVideos(this.currentQuery, page, signal)
            : await api.fetchLatest(page, signal);
        if (signal?.aborted) return [];
        const seenIds = new Set(this.results.map(v => v.id));
        const seenUrls = new Set(this.results.map(v => v.pageUrl));
        const deduped = data.items.filter(v => !seenIds.has(v.id) && !seenUrls.has(v.pageUrl));
        this.results = [...this.results, ...deduped];
        this.hasMore = data.hasMore;
        for (const v of deduped) this.videoPageMap.set(v.id, page);
        return deduped;
    }

    async paginateToTarget(targetId: string, signal?: AbortSignal): Promise<boolean> {
        if (this.results.some(v => v.id === targetId)) return true;

        while (this.hasMore) {
            if (signal?.aborted) return false;
            this.currentPage++;
            try {
                const added = await this.fetchAndAppendPage(this.currentPage, signal);
                if (signal?.aborted) return false;
                if (added.some(v => v.id === targetId)) return true;
            } catch {
                if (signal?.aborted) return false;
                this.currentPage--;
                return false;
            }
        }
        return false;
    }

    async restoreToPage(page: number, signal?: AbortSignal) {
        this.currentPage = page;
        this.videoPageMap.clear();
        try {
            const data = this.currentQuery
                ? await api.searchVideos(this.currentQuery, page, signal)
                : await api.fetchLatest(page, signal);
            if (signal?.aborted) return;
            this.results = data.items;
            this.hasMore = data.hasMore;
            for (const v of data.items) this.videoPageMap.set(v.id, page);
        } catch {
            if (signal?.aborted) return;
            this.results = [];
            this.hasMore = false;
        }
    }

    async loadNextPage() {
        if (!this.hasMore) return;
        const token = this.writeGate.tryAcquire('sentinel');
        if (!token) return;

        const signal = token.signal;
        this.startWatchdog(token);
        this.currentPage++;

        try {
            await this.fetchAndAppendPage(this.currentPage, signal);
        } catch (e) {
            if (signal.aborted) return;
            this.currentPage--;
            this.toast.show('Failed to load more results');
        } finally {
            this.clearWatchdog();
            if (!signal.aborted) {
                this.writeGate.release(token);
            }
        }
    }
}
