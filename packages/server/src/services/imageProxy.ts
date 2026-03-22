import { Readable } from 'node:stream';
import type { Response } from 'express';
import { CACHE_MAX_AGE, USER_AGENT } from '../config';
import { proxyFetch } from '../utils/proxyFetch';

export function isAllowedImageDomain(_hostname: string): boolean {
  return true;
}

function sizedUrl(url: string): string | null {
  if (/-\d+x\d+\.\w+$/.test(url)) return null;
  return url.replace(/(\.\w+)$/, '-320x180$1');
}

export async function streamImage(imageUrl: string, res: Response, referer?: string): Promise<void> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (referer) headers['Referer'] = referer;

  let r = await proxyFetch(imageUrl, { headers });

  if (!r.ok) {
    const fallback = sizedUrl(imageUrl);
    if (fallback) {
      r = await proxyFetch(fallback, { headers });
    }
  }

  const contentType = r.headers.get('content-type') || 'image/jpeg';
  res.set('Content-Type', contentType);
  res.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE}`);

  const contentLength = r.headers.get('content-length');
  if (contentLength) {
    res.set('Content-Length', contentLength);
  }

  if (!r.body) {
    throw new Error('Upstream returned empty body for image');
  }

  Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
}
