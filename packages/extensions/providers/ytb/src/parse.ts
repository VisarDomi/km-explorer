import type { VideoStub, VideoDetail, Actor, PagedResult } from '@km-explorer/provider-types';

const PER_PAGE = 12;

/** Canonical thumbnail size — the only WP image size allowed through Cloudflare. */
const THUMB_SIZE = '320x180';

/**
 * Normalize a WP thumbnail URL to the only CDN-allowed size.
 * Rewrites `-{W}x{H}.ext` → `-320x180.ext`. Passes through non-WP URLs unchanged.
 */
function normalizeThumbnailUrl(url: string): string {
  if (!url) return url;
  return url.replace(/-\d+x\d+(\.\w+)$/, `-${THUMB_SIZE}$1`);
}

// --- Typesense JSON response parsing ---

interface TsDocument {
  permalink?: string;
  post_title?: string;
  post_thumbnail?: string;
  post_id?: string;
}

interface TsResult {
  results?: Array<{
    found?: number;
    hits?: Array<{ document: TsDocument }>;
  }>;
}

export function parseTypesenseResponse(data: unknown): PagedResult<VideoStub> {
  const ts = data as TsResult;
  const result = ts.results?.[0];
  if (!result) return { items: [], hasMore: false };

  const hits = result.hits ?? [];
  const items: VideoStub[] = hits.map(hit => {
    const doc = hit.document;
    return {
      id: doc.post_id ?? '',
      title: doc.post_title ?? '',
      thumbnail: normalizeThumbnailUrl(doc.post_thumbnail ?? ''),
      pageUrl: doc.permalink ?? '',
    };
  });

  const found = result.found ?? 0;
  const hasMore = hits.length >= PER_PAGE && items.length < found;
  return { items, hasMore };
}

// --- Video detail HTML parsing ---

export function parseVideoDetailHtml(html: string): VideoDetail {
  // Extract video source from meta itemprop="contentURL"
  let videoSrc = '';
  const contentUrlMatch = html.match(/<meta[^>]+itemprop=["']contentURL["'][^>]+content=["']([^"']+)["']/i);
  if (contentUrlMatch) {
    videoSrc = contentUrlMatch[1];
  } else {
    // Fallback: look for vidhost.me URL in source tags or video src
    const vidHostMatch = html.match(/https?:\/\/vidhost\.me\/videos\/[^"'\s#]+/);
    if (vidHostMatch) videoSrc = vidHostMatch[0];
  }

  // Extract actors from <a href="...actor/...">...Name</a> (may contain inner tags like <i>)
  const actors: Actor[] = [];
  const actorRegex = /<a[^>]+href=["']((?:https?:\/\/[^"']*)?\/actor\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = actorRegex.exec(html)) !== null) {
    // Normalize to relative path
    const url = match[1].replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
    // Strip inner HTML tags to get plain text name
    const name = match[2].replace(/<[^>]+>/g, '').trim();
    if (name && !actors.some(a => a.url === url)) {
      actors.push({ name, url });
    }
  }

  return { videoSrc, actors };
}

// --- WordPress REST API posts response parsing ---

interface WpPost {
  id: number;
  title?: { rendered?: string };
  link?: string;
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      media_details?: {
        sizes?: Record<string, { source_url?: string }>;
      };
      source_url?: string;
    }>;
  };
}

export function parseWpPostsResponse(data: unknown, perPage: number): PagedResult<VideoStub> {
  const posts = data as WpPost[];
  if (!Array.isArray(posts)) return { items: [], hasMore: false };

  const items: VideoStub[] = posts.map(post => {
    const media = post._embedded?.['wp:featuredmedia']?.[0];
    const sizes = media?.media_details?.sizes;
    const thumbnail = normalizeThumbnailUrl(sizes?.medium?.source_url ?? sizes?.thumbnail?.source_url ?? media?.source_url ?? '');

    return {
      id: String(post.id),
      title: post.title?.rendered?.replace(/&#\d+;/g, m => {
        const code = parseInt(m.slice(2, -1));
        return String.fromCharCode(code);
      }) ?? '',
      thumbnail,
      pageUrl: post.link ?? '',
    };
  });

  return { items, hasMore: posts.length >= perPage };
}
