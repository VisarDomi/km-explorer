import type { Actor } from '../types.js';
import * as api from '../services/api.js';

export interface DetailEntry {
    videoSrc: string;
    actors: Actor[];
}

type DetailStatus = 'idle' | 'loading' | 'ready';

export class VideoDetailState {
    details = $state<Record<string, DetailEntry>>({});
    statuses = $state<Record<string, DetailStatus>>({});

    private eventSource: EventSource | null = null;
    private sseConnected = false;

    getDetail(pageUrl: string): DetailEntry | undefined {
        return this.details[pageUrl];
    }

    getStatus(pageUrl: string): DetailStatus {
        return this.statuses[pageUrl] ?? 'idle';
    }

    async requestDetails(pageUrls: string[]) {
        const needed = pageUrls.filter(u => !this.details[u] && this.statuses[u] !== 'loading');
        if (needed.length === 0) return;

        // Mark as loading
        const newStatuses = { ...this.statuses };
        for (const url of needed) newStatuses[url] = 'loading';
        this.statuses = newStatuses;

        this.connectSSE();

        try {
            const resp = await api.requestVideoDetails(needed);

            // Apply cached results immediately
            if (Object.keys(resp.cached).length > 0) {
                const newDetails = { ...this.details };
                const updatedStatuses = { ...this.statuses };
                for (const [url, detail] of Object.entries(resp.cached)) {
                    newDetails[url] = detail;
                    updatedStatuses[url] = 'ready';
                }
                this.details = newDetails;
                this.statuses = updatedStatuses;
            }
            // pending URLs will arrive via SSE
        } catch {
            // Reset failed statuses
            const resetStatuses = { ...this.statuses };
            for (const url of needed) {
                if (resetStatuses[url] === 'loading') resetStatuses[url] = 'idle';
            }
            this.statuses = resetStatuses;
        }
    }

    private connectSSE() {
        if (this.sseConnected) return;
        this.sseConnected = true;

        this.eventSource = new EventSource('/api/video-details/stream');
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as { videoUrl: string; videoSrc: string; actors: Actor[] };
                this.details = { ...this.details, [data.videoUrl]: { videoSrc: data.videoSrc, actors: data.actors } };
                this.statuses = { ...this.statuses, [data.videoUrl]: 'ready' };
            } catch { /* ignore parse errors */ }
        };
        this.eventSource.onerror = () => {
            this.disconnectSSE();
            // Reconnect after 5s
            setTimeout(() => {
                if (Object.values(this.statuses).some(s => s === 'loading')) {
                    this.connectSSE();
                }
            }, 5000);
        };
    }

    disconnectSSE() {
        this.eventSource?.close();
        this.eventSource = null;
        this.sseConnected = false;
    }
}
