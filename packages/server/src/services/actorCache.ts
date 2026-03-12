import { getCachedActor, setCachedActor } from './database.js';
import { getProvider } from './providerLoader.js';
import { proxyFetch } from '../utils/proxyFetch.js';
import { USER_AGENT } from '../config.js';
import type { VideoStub, PagedResult } from '@km-explorer/provider-types';

const PAGE_DELAY_MS = 500;
const termIdCache = new Map<string, number>();

/** Resolve actor slug → WP term ID. Checks memory cache, DB cache, then WP API. */
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

/** Fetch ALL pages of videos for an actor term ID from WP API. */
export async function fetchAllActorVideos(termId: number): Promise<VideoStub[]> {
  const provider = getProvider();
  const allItems: VideoStub[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (true) {
    const req = provider.channelRequest(String(termId), page);
    const res = await proxyFetch(req.url, {
      headers: { 'User-Agent': USER_AGENT, ...req.headers },
    });
    const data = await res.json();
    const result: PagedResult<VideoStub> = provider.parseChannelResponse(data);

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

/** Get actor videos: return from cache (+ background refresh) or fall back to WP API page-by-page. */
export async function getActorVideos(actorUrl: string, page = 1): Promise<{ items: VideoStub[]; hasMore: boolean }> {
  const cached = getCachedActor(actorUrl);

  if (cached) {
    // Fire-and-forget background refresh
    void refreshActor(actorUrl, cached.termId);
    return { items: cached.videos, hasMore: false };
  }

  // Not cached: resolve term ID, return requested page from WP API directly
  const termId = await resolveTermId(actorUrl);
  if (termId === null) return { items: [], hasMore: false };

  // On first page request, kick off background full-fetch
  if (page === 1) {
    void backgroundFetchAndCache(actorUrl, termId);
  }

  const provider = getProvider();
  const req = provider.channelRequest(String(termId), page);
  const res = await proxyFetch(req.url, {
    headers: { 'User-Agent': USER_AGENT, ...req.headers },
  });
  const data = await res.json();
  return provider.parseChannelResponse(data);
}

async function refreshActor(actorUrl: string, termId: number): Promise<void> {
  try {
    const videos = await fetchAllActorVideos(termId);
    setCachedActor(actorUrl, termId, videos);
  } catch (e) {
    console.error(`[actorCache] Background refresh failed for ${actorUrl}:`, (e as Error).message);
  }
}

async function backgroundFetchAndCache(actorUrl: string, termId: number): Promise<void> {
  try {
    const videos = await fetchAllActorVideos(termId);
    setCachedActor(actorUrl, termId, videos);
    console.log(`[actorCache] Cached ${videos.length} videos for ${actorUrl}`);
  } catch (e) {
    console.error(`[actorCache] Background fetch failed for ${actorUrl}:`, (e as Error).message);
  }
}
