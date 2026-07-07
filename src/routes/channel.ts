import { resolveTermId, fetchChannelVideos, scrapeVideoDetail } from '../provider/ytb';
import { putDetail } from '../storage/db';
import { startInit, getGrid } from '../ui/shell';
import { createVideoCard, prefetchDetails } from '../ui/video-card';
import { renderPagination } from '../ui/pagination';
import type { VideoStub } from '../types';

let allVideos: VideoStub[] = [];
let totalPages = 0;
let currentTermId = '';

async function renderPage(page: number): Promise<void> {
    const grid = getGrid();
    grid.innerHTML = '';

    if (allVideos.length === 0) {
        const result = await fetchChannelVideos(currentTermId, page + 1);
        allVideos = result.items;
        totalPages = Math.max(1, Math.ceil(allVideos.length / 12));
    }

    const start = page * 12;
    const slice = allVideos.slice(start, start + 12);

    for (const v of slice) {
        grid.appendChild(createVideoCard(v, async () => {
            const detail = await scrapeVideoDetail(v.pageUrl);
            await putDetail(v.pageUrl, detail);
            if (detail.videoSrc) {
                navigator.clipboard.writeText(detail.videoSrc).catch(() => {});
            }
        }));
    }

    renderPagination(page, totalPages, p => { void renderPage(p); });
    void prefetchDetails(slice);
}

export async function init(actorUrl: string): Promise<void> {
    startInit();

    const grid = getGrid();
    grid.innerHTML = '<div class="ke-loading">Loading...</div>';

    const termId = await resolveTermId(actorUrl);
    if (!termId) {
        grid.innerHTML = '<div class="ke-empty">Channel not found</div>';
        return;
    }
    currentTermId = termId;

    void renderPage(0);
}
