import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getCachedDetails, type CachedDetail } from '../services/database.js';
import { scrapeQueue } from '../services/scrapeQueue.js';

const router = Router();

router.post('/video-details', asyncHandler(async (req, res) => {
  const { urls } = req.body as { urls?: string[] };
  if (!Array.isArray(urls) || urls.length === 0) {
    res.status(400).json({ error: 'Missing urls array' });
    return;
  }

  const cached = getCachedDetails(urls);
  const pending: string[] = [];
  for (const url of urls) {
    if (!cached.has(url)) pending.push(url);
  }

  // Queue uncached URLs for scraping
  if (pending.length > 0) {
    scrapeQueue.enqueue(pending);
  }

  // Convert Map to plain object for JSON
  const cachedObj: Record<string, CachedDetail> = {};
  for (const [k, v] of cached) cachedObj[k] = v;

  res.json({ cached: cachedObj, pending });
}));

router.get('/video-details/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(':\n\n'); // SSE comment to keep alive

  const onDetail = (videoUrl: string, detail: CachedDetail) => {
    const data = JSON.stringify({ videoUrl, ...detail });
    res.write(`data: ${data}\n\n`);
  };

  scrapeQueue.on('detail', onDetail);

  req.on('close', () => {
    scrapeQueue.off('detail', onDetail);
  });
});

export default router;
