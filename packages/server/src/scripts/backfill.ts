import { loadProvider, getProvider } from '../services/providerLoader.js';
import { getCachedDetails, setCachedDetail, getUniqueActorUrls, getCachedActor, setCachedActor } from '../services/database.js';
import { resolveTermId, fetchAllActorVideos } from '../services/actorCache.js';
import { proxyFetch } from '../utils/proxyFetch.js';
import { USER_AGENT } from '../config.js';
import type { VideoStub } from '@km-explorer/provider-types';

const DETAIL_DELAY_MS = 500;

async function main() {
  await loadProvider();
  const provider = getProvider();

  // Phase 1: Collect all video URLs from Typesense via provider pagination
  console.log('[backfill] Phase 1: Fetching all video stubs...');
  const allStubs: VideoStub[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (true) {
    const req = provider.latestRequest(page);
    const r = await proxyFetch(req.url, {
      method: req.method ?? 'GET',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'text/plain', ...req.headers },
      body: req.body,
    });
    const contentType = r.headers.get('content-type') || '';
    const data = contentType.includes('json') ? await r.json() : await r.text();
    const result = provider.parseLatestResponse(data);

    for (const stub of result.items) {
      if (!seen.has(stub.id)) {
        seen.add(stub.id);
        allStubs.push(stub);
      }
    }

    if (!result.hasMore) break;
    page++;
  }
  console.log(`[backfill] Collected ${allStubs.length} stubs across ${page} pages`);

  // Phase 2: Filter to uncached URLs only
  const allUrls = allStubs.map(s => s.pageUrl);
  const cached = getCachedDetails(allUrls);
  const uncached = allStubs.filter(s => !cached.has(s.pageUrl));
  console.log(`[backfill] Phase 2: ${cached.size} cached, ${uncached.length} uncached`);

  if (uncached.length === 0) {
    console.log('[backfill] Nothing to backfill, exiting.');
    return;
  }

  // Phase 3: Scrape details for uncached URLs sequentially
  console.log('[backfill] Phase 3: Scraping details...');
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
      console.log(`[backfill] Progress: ${done}/${uncached.length} (${errors} errors)`);
    }

    if (done < uncached.length) {
      await new Promise(r => setTimeout(r, DETAIL_DELAY_MS));
    }
  }

  console.log(`[backfill] Phase 3 done: ${done} processed, ${errors} errors`);

  // Phase 4: Backfill actor cache
  console.log('[backfill] Phase 4: Backfilling actor cache...');
  const actorUrls = getUniqueActorUrls();
  console.log(`[backfill] Found ${actorUrls.length} unique actors`);

  const ACTOR_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  let actorDone = 0;
  let actorErrors = 0;
  let actorSkipped = 0;

  for (const actorUrl of actorUrls) {
    const existing = getCachedActor(actorUrl);
    if (existing && (Date.now() - existing.cachedAt) < ACTOR_CACHE_MAX_AGE_MS) {
      actorSkipped++;
      actorDone++;
      if (actorDone % 10 === 0) {
        console.log(`[backfill] Actor progress: ${actorDone}/${actorUrls.length} (${actorSkipped} skipped, ${actorErrors} errors)`);
      }
      continue;
    }

    try {
      const termId = await resolveTermId(actorUrl);
      if (termId === null) {
        actorErrors++;
        console.error(`[backfill] Could not resolve term ID for ${actorUrl}`);
      } else {
        const videos = await fetchAllActorVideos(termId);
        setCachedActor(actorUrl, termId, videos);
      }
    } catch (e) {
      actorErrors++;
      console.error(`[backfill] Error caching actor ${actorUrl}:`, (e as Error).message);
    }

    actorDone++;
    if (actorDone % 10 === 0) {
      console.log(`[backfill] Actor progress: ${actorDone}/${actorUrls.length} (${actorSkipped} skipped, ${actorErrors} errors)`);
    }
  }

  console.log(`[backfill] Phase 4 done: ${actorDone} actors, ${actorSkipped} skipped, ${actorErrors} errors`);
}

main().catch(err => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});
