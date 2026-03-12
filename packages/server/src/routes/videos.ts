import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getProvider } from '../services/providerLoader.js';
import { proxyFetch } from '../utils/proxyFetch.js';
import { USER_AGENT } from '../config.js';
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
  const provider = getProvider();

  // Extract actor slug from URL like /actor/silent-chaos
  const slug = url.replace(/^\/actor\//, '').replace(/\/$/, '');

  // Step 1: Resolve slug → term ID via WP REST API
  const taxonomyUrl = `${provider.baseUrl}/wp-json/wp/v2/actors?slug=${encodeURIComponent(slug)}`;
  const taxRes = await proxyFetch(taxonomyUrl, {
    headers: { 'User-Agent': USER_AGENT },
  });
  const taxData = await taxRes.json() as Array<{ id: number }>;
  if (!Array.isArray(taxData) || taxData.length === 0) {
    res.json({ items: [], hasMore: false });
    return;
  }
  const termId = String(taxData[0].id);

  // Step 2: Fetch posts for this actor term ID
  const req2 = provider.channelRequest(termId, page);
  const r = await proxyFetch(req2.url, {
    headers: { 'User-Agent': USER_AGENT, ...req2.headers },
  });
  const data = await r.json();
  const result = provider.parseChannelResponse(data);
  res.json(result);
}));

export default router;
