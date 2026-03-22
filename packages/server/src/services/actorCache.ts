import { getCachedActor, setCachedActor } from './database.js';
import { getProvider } from './providerLoader.js';
import { proxyFetch, UpstreamError } from '../utils/proxyFetch.js';
import { USER_AGENT } from '../config.js';
import type { VideoStub, PagedResult } from '@km-explorer/provider-types';

const PAGE_DELAY_MS = 500;
const termIdCache = new Map<string, number>();

export async function resolveTermId(actorUrl: string): Promise<number | null> {
  const mem = termIdCache.get(actorUrl);
  if (mem !== undefined) return mem;

  const cached = getCachedActor(actorUrl);
  if (cached) {
    termIdCache.set(actorUrl, cached.termId);
    return cached.termId;
  }

  const provider = getProvider();
  const slug = actorUrl.replace(/^\/actor\//, '').replace(/\/$/, '');
  const taxonomyUrl = `${provider.baseUrl}/wp-json/wp/v2/actors?slug=${encodeURIComponent(slug)}`;
  const res = await proxyFetch(taxonomyUrl, {
    headers: { 'User-Agent': USER_AGENT },
  });
  const data = await res.json() as Array<{ id: number }>;
  if (!Array.isArray(data) || data.length === 0) return null;

  termIdCache.set(actorUrl, data[0].id);
  return data[0].id;
}

export async function fetchAllActorVideos(termId: number): Promise<VideoStub[]> {
  const provider = getProvider();
  const allItems: VideoStub[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (true) {
    let result: PagedResult<VideoStub>;
    try {
      const req = provider.channelRequest(String(termId), page);
      const res = await proxyFetch(req.url, {
        headers: { 'User-Agent': USER_AGENT, ...req.headers },
      });
      const data = await res.json();
      result = provider.parseChannelResponse(data);
    } catch (e) {
      if (e instanceof UpstreamError && e.status === 400) break;
      throw e;
    }

    for (const item of result.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        allItems.push(item);
      }
    }

    if (!result.hasMore) break;
    page++;
    await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }

  return allItems;
}

export async function getActorVideos(actorUrl: string, page = 1): Promise<{ items: VideoStub[]; hasMore: boolean }> {
  const cached = getCachedActor(actorUrl);

  if (cached) {
    return { items: cached.videos, hasMore: false };
  }

  const termId = await resolveTermId(actorUrl);
  if (termId === null) return { items: [], hasMore: false };

  if (page === 1) {
    void coldFillActor(actorUrl, termId);
  }

  try {
    const provider = getProvider();
    const req = provider.channelRequest(String(termId), page);
    const res = await proxyFetch(req.url, {
      headers: { 'User-Agent': USER_AGENT, ...req.headers },
    });
    const data = await res.json();
    return provider.parseChannelResponse(data);
  } catch {
    return { items: [], hasMore: false };
  }
}

async function coldFillActor(actorUrl: string, termId: number): Promise<void> {
  try {
    const videos = await fetchAllActorVideos(termId);
    setCachedActor(actorUrl, termId, videos);
    console.log(`[actorCache] Cold-filled ${videos.length} videos for ${actorUrl}`);
  } catch (e) {
    console.error(`[actorCache] Cold-fill failed for ${actorUrl}:`, (e as Error).message);
  }
}
