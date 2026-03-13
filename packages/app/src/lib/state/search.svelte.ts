import { LOADING_TIMEOUT_MS } from '../constants.js';
import type { VideoStub } from '../types.js';
import * as api from '../services/api.js';
import * as storage from '../services/storage.js';
import type { ToastState } from './toast.svelte.js';

type SearchMachineState = 'idle' | 'searching' | 'loading-page';

class SearchMachine {
    state = $state<SearchMachineState>('idle');
    private controller: AbortController | null = null;

    get isActive() { return this.state !== 'idle'; }
    get signal() { return this.controller?.signal; }

    enter(next: 'searching' | 'loading-page') {
        this.controller?.abort();
        this.controller = new AbortController();
        this.state = next;
    }

    done() {
        this.controller = null;
        this.state = 'idle';
    }

    abort() {
        this.controller?.abort();
        this.controller = null;
        this.state = 'idle';
    }
}

export class SearchState {
    results = $state<VideoStub[]>([]);
    currentQuery = $state('');
    currentPage = $state(1);
    hasMore = $state(false);

    private toast: ToastState;
    private machine = new SearchMachine();
    private loadingWatchdog: ReturnType<typeof setTimeout> | null = null;
    private onStuck: (() => void) | null = null;
    onNewSearch: (() => void) | null = null;

    get isLoading() { return this.machine.isActive; }

    constructor(toast: ToastState, onStuck?: () => void) {
        this.toast = toast;
        this.onStuck = onStuck ?? null;
    }

    private startWatchdog() {
        this.clearWatchdog();
        this.loadingWatchdog = setTimeout(() => {
            if (this.machine.isActive) {
                this.machine.abort();
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

    async search(query: string) {
        this.onNewSearch?.();
        this.machine.enter('searching');
        const signal = this.machine.signal!;
        this.startWatchdog();

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
        } catch (e) {
            if (signal.aborted) return;
            this.results = [];
            this.hasMore = false;
            this.toast.show('Search failed');
        } finally {
            this.clearWatchdog();
            if (!signal.aborted) {
                this.machine.done();
            }
        }
    }

    private async fetchAndAppendPage(page: number, signal?: AbortSignal): Promise<VideoStub[]> {
        const data = this.currentQuery
            ? await api.searchVideos(this.currentQuery, page, signal)
            : await api.fetchLatest(page, signal);
        if (signal?.aborted) return [];
        const seen = new Set(this.results.map(v => v.id));
        const deduped = data.items.filter(v => !seen.has(v.id));
        this.results = [...this.results, ...deduped];
        this.hasMore = data.hasMore;
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

    async loadNextPage() {
        if (this.machine.isActive || !this.hasMore) return;

        this.machine.enter('loading-page');
        const signal = this.machine.signal!;

        this.startWatchdog();
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
                this.machine.done();
            }
        }
    }
}
