import { loadProvider, getProvider } from '../services/providerLoader.js';
import { getCachedDetails, setCachedDetail, getDirtyActorUrls, clearDirtyActors, getCachedActor, setCachedActor } from '../services/database.js';
import { resolveTermId, fetchAllActorVideos } from '../services/actorCache.js';
import { proxyFetch } from '../utils/proxyFetch.js';
import { USER_AGENT } from '../config.js';
import type { VideoStub } from '@km-explorer/provider-types';

const DETAIL_DELAY_MS = 500;

async function backfillVideoDetails() {
  const provider = getProvider();

  console.log('[backfill] Phase 1: Fetching all video stubs from Typesense...');
  const allStubs: VideoStub[] = [];
  const seen = new Set<string>();
  const CONCURRENCY = 50;
  let page = 1;
  let exhausted = false;

  while (!exhausted) {
    const pages = Array.from({ length: CONCURRENCY }, (_, i) => page + i);
    const results = await Promise.all(
      pages.map(async (p) => {
        const req = provider.latestRequest(p);
        const r = await proxyFetch(req.url, {
          method: req.method ?? 'GET',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'text/plain', ...req.headers },
          body: req.body,
        });
        const contentType = r.headers.get('content-type') || '';
        const data = contentType.includes('json') ? await r.json() : await r.text();
        return { page: p, ...provider.parseLatestResponse(data) };
      }),
    );

    for (const result of results.sort((a, b) => a.page - b.page)) {
      for (const stub of result.items) {
        if (!seen.has(stub.id)) {
          seen.add(stub.id);
          allStubs.push(stub);
        }
      }
      if (!result.hasMore) {
        exhausted = true;
        break;
      }
    }
    page += CONCURRENCY;
  }
  console.log(`[backfill] Collected ${allStubs.length} stubs`);

  const allUrls = allStubs.map(s => s.pageUrl);
  const cached = getCachedDetails(allUrls);
  const uncached = allStubs.filter(s => !cached.has(s.pageUrl));
  console.log(`[backfill] ${cached.size} cached, ${uncached.length} uncached`);

  if (uncached.length === 0) {
    console.log('[backfill] All video details cached.');
    return;
  }

  console.log('[backfill] Scraping uncached video details...');
  let done = 0;
  let errors = 0;

  for (const stub of uncached) {
    try {
      const req = provider.videoDetailRequest(stub.pageUrl);
      const r = await proxyFetch(req.url, {
        headers: { 'User-Agent': USER_AGENT, ...req.headers },
      });
      const html = await r.text();
      const detail = provider.parseVideoDetailResponse(html);
      setCachedDetail(stub.pageUrl, detail.videoSrc, detail.actors);
    } catch (e) {
      errors++;
      console.error(`[backfill] Error scraping ${stub.pageUrl}:`, (e as Error).message);
    }

    done++;
    if (done % 10 === 0) {
      console.log(`[backfill] Video progress: ${done}/${uncached.length} (${errors} errors)`);
    }

    if (done < uncached.length) {
      await new Promise(r => setTimeout(r, DETAIL_DELAY_MS));
    }
  }

  console.log(`[backfill] Video details done: ${done} processed, ${errors} errors`);
}

async function backfillActorCache() {
  const dirtyUrls = getDirtyActorUrls();

  const uncachedNew = dirtyUrls.filter(url => !getCachedActor(url));
  const dirtyExisting = dirtyUrls.filter(url => getCachedActor(url));
  const total = dirtyUrls.length;

  console.log(`[backfill] Actor cache: ${total} dirty (${uncachedNew.length} new, ${dirtyExisting.length} existing to refresh)`);

  if (total === 0) {
    console.log('[backfill] No dirty actors — nothing to do.');
    return;
  }

  let done = 0;
  let errors = 0;
  const completed: string[] = [];

  for (const actorUrl of dirtyUrls) {
    try {
      const termId = await resolveTermId(actorUrl);
      if (termId === null) {
        errors++;
        console.error(`[backfill] Could not resolve term ID for ${actorUrl}`);
      } else {
        const videos = await fetchAllActorVideos(termId);
        setCachedActor(actorUrl, termId, videos);
        completed.push(actorUrl);
      }
    } catch (e) {
      errors++;
      console.error(`[backfill] Error caching actor ${actorUrl}: ${(e as Error).message}`);
    }

    done++;
    if (done % 10 === 0) {
      console.log(`[backfill] Actor progress: ${done}/${total} (${errors} errors)`);
      clearDirtyActors(completed.splice(0));
    }
  }

  clearDirtyActors(completed);
  console.log(`[backfill] Actor cache done: ${done} processed, ${errors} errors`);
}

async function main() {
  await loadProvider();

  await backfillVideoDetails();
  await backfillActorCache();

  console.log('[backfill] All done.');
}

main().catch(err => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});
