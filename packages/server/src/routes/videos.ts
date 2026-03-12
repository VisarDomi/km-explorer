import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getProvider } from '../services/providerLoader.js';
import { proxyFetch } from '../utils/proxyFetch.js';
import { USER_AGENT } from '../config.js';
import { getActorVideos } from '../services/actorCache.js';
import type { VideoStub, PagedResult } from '@km-explorer/provider-types';

const router = Router();
const BATCH_SIZE = 10;

async function fetchProviderPage(
  buildRequest: (page: number) => { url: string; method?: string; headers?: Record<string, string>; body?: string },
  parseFn: (data: unknown) => PagedResult<VideoStub>,
  page: number,
): Promise<PagedResult<VideoStub>> {
  const provider = getProvider();
  const req = buildRequest(page);
  const r = await proxyFetch(req.url, {
    method: req.method ?? 'GET',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'text/plain', ...req.headers },
    body: req.body,
  });
  const contentType = r.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await r.json() : await r.text();
  return parseFn(data);
}

async function fetchBatch(
  buildRequest: (page: number) => { url: string; method?: string; headers?: Record<string, string>; body?: string },
  parseFn: (data: unknown) => PagedResult<VideoStub>,
  clientPage: number,
): Promise<{ items: VideoStub[]; hasMore: boolean }> {
  const startPage = (clientPage - 1) * BATCH_SIZE + 1;
  const pages = Array.from({ length: BATCH_SIZE }, (_, i) => startPage + i);

  const results = await Promise.all(
    pages.map(p => fetchProviderPage(buildRequest, parseFn, p).catch(() => null)),
  );

  const allItems: VideoStub[] = [];
  const seen = new Set<string>();
  let anyHasMore = false;

  for (const result of results) {
    if (!result) continue;
    for (const item of result.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      allItems.push(item);
    }
    if (result.hasMore) anyHasMore = true;
  }

  return { items: allItems, hasMore: anyHasMore };
}

router.get('/latest', asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const provider = getProvider();
  const result = await fetchBatch(
    p => provider.latestRequest(p),
    d => provider.parseLatestResponse(d),
    page,
  );
  res.json(result);
}));

router.get('/search', asyncHandler(async (req, res) => {
  const q = (req.query.q as string) || '';
  const page = parseInt(req.query.page as string) || 1;
  const provider = getProvider();
  const result = await fetchBatch(
    p => provider.searchRequest(q, p),
    d => provider.parseSearchResponse(d),
    page,
  );
  res.json(result);
}));

router.get('/channel', asyncHandler(async (req, res) => {
  const url = (req.query.url as string) || '';
  const page = parseInt(req.query.page as string) || 1;
  if (!url) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }
  const result = await getActorVideos(url, page);
  res.json(result);
}));

export default router;
