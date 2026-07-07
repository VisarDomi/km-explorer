import { resolveTermId, fetchChannelVideos, scrapeVideoDetail } from '../provider/ytb';
import { putDetail, getVideosByIds, putVideos, getCachedChannel, setCachedChannel } from '../storage/db';
import { lookupByIds } from '../provider/ytb';
import { startInit, getGrid } from '../ui/shell';
import { createVideoCard } from '../ui/video-card';
import type { VideoStub } from '../types';

export async function init(actorUrl: string): Promise<void> {
    startInit();

    // Check cache first
    const cached = await getCachedChannel(actorUrl);
    let allVideos: VideoStub[] = [];

    if (cached) {
        const map = await getVideosByIds(cached.videoIds);
        allVideos = cached.videoIds.map(id => map.get(id)!).filter(Boolean);
        if (allVideos.length > 0) {
            renderAll(allVideos);
            return;
        }
    }

    const grid = getGrid();
    grid.innerHTML = '<div class="ke-loading">Loading...</div>';

    const termId = await resolveTermId(actorUrl);
    if (!termId) {
        grid.innerHTML = '<div class="ke-empty">Channel not found</div>';
        return;
    }

    // Fetch all pages
    const allIds: string[] = [];
    let pg = 1;
    while (true) {
        const result = await fetchChannelVideos(termId, pg);
        allIds.push(...result.ids);
        if (!result.hasMore) break;
        pg++;
    }

    await setCachedChannel(actorUrl, termId, allIds);

    const map = await getVideosByIds(allIds);
    const missing = allIds.filter(id => !map.has(id));
    if (missing.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < missing.length; i += 100) chunks.push(missing.slice(i, i + 100));
        for (const chunk of chunks) {
            const fetched = await lookupByIds(chunk);
            if (fetched.length > 0) {
                await putVideos(fetched);
                for (const v of fetched) map.set(v.id, v);
            }
        }
    }

    allVideos = allIds.map(id => map.get(id)!).filter(Boolean);
    renderAll(allVideos);
}

function renderAll(videos: VideoStub[]): void {
    const grid = getGrid();
    grid.innerHTML = '';

    for (const v of videos) {
        grid.appendChild(createVideoCard(v, async () => {
            const detail = await scrapeVideoDetail(v.pageUrl);
            await putDetail(v.pageUrl, detail);
            if (detail.videoSrc) {
                navigator.clipboard.writeText(detail.videoSrc).catch(() => {});
            }
        }));
    }
}
