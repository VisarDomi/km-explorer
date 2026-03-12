import { loadProvider, getProvider } from '../services/providerLoader.js';
import { getCachedDetails, setCachedDetail } from '../services/database.js';
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

  console.log(`[backfill] Done: ${done} processed, ${errors} errors`);
}

main().catch(err => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});
