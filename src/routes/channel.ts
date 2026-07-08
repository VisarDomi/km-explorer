import { resolveTermId, fetchChannelVideos } from '../provider/ytb';
import { getVideosByIds, getCachedChannel, setCachedChannel } from '../storage/db';
import { startInit, getGrid } from '../ui/shell';
import { createVideoCard } from '../ui/video-card';
import type { VideoStub } from '../types';
import {getVideos} from "../core/videos";

export async function init(actorUrl: string): Promise<void> {
    startInit();

    // Check cache first
    const cached = await getCachedChannel(actorUrl);
    if (cached) {
        const map = await getVideosByIds(cached.videoIds);
        const videos = cached.videoIds.map(id => map.get(id)!);
        renderAll(videos);
        return
    }

    const grid = getGrid();
    grid.innerHTML = '<div class="ke-loading">Loading...</div>';

    const termId = await resolveTermId(actorUrl);
    if (!termId) {
        grid.innerHTML = '<div class="ke-empty">Channel not found</div>';
        return;
    }

    // Fetch all pages
    const ids: string[] = [];
    let pg = 1;
    while (true) {
        const result = await fetchChannelVideos(termId, pg);
        ids.push(...result.ids);
        if (!result.hasMore) break;
        pg++;
    }

    await setCachedChannel(actorUrl, termId, ids);

    const videos = await getVideos(ids);
    renderAll(videos);
}

function renderAll(videos: VideoStub[]): void {
    const grid = getGrid();
    grid.innerHTML = '';

    for (const v of videos) {
        grid.appendChild(createVideoCard(v, () => {}));
    }
}
