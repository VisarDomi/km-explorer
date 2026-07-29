import type { Provider } from '../provider';
import { fetchActorVideos, getCachedActorVideos } from '../core/actor-videos';
import { startInit, getGrid } from '../ui/shell';
import { createVideoCard } from '../ui/video-card';
import type { VideoStub } from '../types';

function render(videos: VideoStub[], provider: Provider): void {
    const grid = getGrid();
    grid.innerHTML = '';
    for (const video of videos) {
        grid.appendChild(createVideoCard(video, selected => {
            window.location.href = selected.pageUrl;
        }, provider));
    }
    if (videos.length === 0) {
        grid.innerHTML = '<div class="ke-empty">No videos found</div>';
    }
}

export async function init(provider: Provider, actorUrl: string): Promise<void> {
    startInit();
    const grid = getGrid();
    grid.innerHTML = '<div class="ke-loading">Loading...</div>';

    const cached = await getCachedActorVideos(provider, actorUrl);
    if (cached) {
        render(cached, provider);
    }

    const fresh = await fetchActorVideos(provider, actorUrl);
    render(fresh, provider);
}
