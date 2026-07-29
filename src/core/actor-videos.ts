import type { Provider } from '../provider';
import { getCachedChannel, setCachedChannel } from '../storage/db';
import type { VideoStub } from '../types';
import { getVideos } from './videos';

export async function getCachedActorVideos(
    provider: Provider,
    actorUrl: string,
): Promise<VideoStub[] | null> {
    const cached = await getCachedChannel(actorUrl);
    return cached ? getVideos(cached.videoIds, provider) : null;
}

export async function fetchActorVideos(
    provider: Provider,
    actorUrl: string,
): Promise<VideoStub[]> {
    const actorId = await provider.resolveActorId(actorUrl);
    if (!actorId) return [];

    const ids: string[] = [];
    for (let page = 1; ; page++) {
        const result = await provider.fetchActorVideoPage(actorId, page);
        ids.push(...result.ids);
        if (!result.hasMore) break;
    }

    await setCachedChannel(actorUrl, actorId, ids);
    return getVideos(ids, provider);
}
