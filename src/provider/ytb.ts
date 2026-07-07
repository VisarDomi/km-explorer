import type { VideoStub, VideoDetail } from '../types';

const TS_API = 'https://ts-api.ytboob.com/multi_search?x-typesense-api-key=2mFxuIpLuESx5X1aPGkDOx4ZAtM5jG46';
const BASE_URL = 'https://ytboob.com';
const PER_PAGE = 12;
export const BATCH = 50;

function tsSearchBody(page: number, perPage = PER_PAGE): string {
    return JSON.stringify({
        searches: [{
            collection: 'post',
            q: '*',
            query_by: 'post_title',
            sort_by: 'sort_by_date:desc',
            per_page: perPage,
            page,
            include_fields: 'permalink,post_thumbnail,post_id',
        }],
    });
}

function stripSize(url: string): string {
    return url.replace(/-\d+x\d+(\.\w+)$/, '$1');
}

interface TsDocument {
    permalink?: string;
    post_thumbnail?: string;
    post_id?: string;
}

interface TsResult {
    results?: Array<{
        found?: number;
        hits?: Array<{ document: TsDocument }>;
    }>;
}

export interface TypesensePage {
    items: VideoStub[];
    found: number;
    hasMore: boolean;
}

export async function fetchTypesensePage(page: number): Promise<TypesensePage> {
    const r = await fetch(TS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: tsSearchBody(page),
    });
    const data = await r.json() as TsResult;
    const result = data.results?.[0];
    if (!result) return { items: [], found: 0, hasMore: false };

    const hits = result.hits ?? [];
    const items: VideoStub[] = hits.map(hit => ({
        id: hit.document.post_id ?? '',
        thumbnail: stripSize(hit.document.post_thumbnail ?? ''),
        pageUrl: hit.document.permalink ?? '',
    }));

    const found = result.found ?? 0;
    const hasMore = hits.length >= PER_PAGE && items.length < found;
    return { items, found, hasMore };
}

export async function fetchTypesenseBatch(startPage: number): Promise<TypesensePage[]> {
    const pages = Array.from({ length: BATCH }, (_, i) => startPage + i);
    const results = await Promise.all(
        pages.map(p => fetchTypesensePage(p).catch(e => {
            console.error('[ytb] fetchTypesensePage failed for page', p, e);
            return { items: [], found: 0, hasMore: false } as TypesensePage;
        })),
    );
    return results;
}

export async function lookupByIds(ids: string[]): Promise<VideoStub[]> {
    if (ids.length === 0) return [];
    const body = JSON.stringify({
        searches: [{
            collection: 'post',
            q: '*',
            query_by: 'post_title',
            filter_by: `post_id:=[${ids.join(',')}]`,
            per_page: ids.length,
            page: 1,
            include_fields: 'permalink,post_thumbnail,post_id',
        }],
    });
    const r = await fetch(TS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body,
    });
    const data = await r.json() as TsResult;
    const hits = data.results?.[0]?.hits ?? [];
    return hits.map(hit => ({
        id: hit.document.post_id ?? '',
        thumbnail: stripSize(hit.document.post_thumbnail ?? ''),
        pageUrl: hit.document.permalink ?? '',
    }));
}

export async function scrapeVideoDetail(pageUrl: string): Promise<VideoDetail> {
    const url = pageUrl.startsWith('http') ? pageUrl : `${BASE_URL}${pageUrl}`;
    const r = await fetch(url);
    const html = await r.text();

    let videoSrc = '';
    const metaMatch = html.match(/<meta[^>]+itemprop=["']contentURL["'][^>]+content=["']([^"']+)["']/i);
    if (metaMatch) {
        videoSrc = metaMatch[1];
    } else {
        const fallback = html.match(/https?:\/\/vidhost\.me\/videos\/[^"'\s#]+/);
        if (fallback) videoSrc = fallback[0];
    }

    const actors: { name: string; url: string }[] = [];
    const actorRegex = /<a[^>]+href=["']((?:https?:\/\/[^"']*)?\/actor\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = actorRegex.exec(html)) !== null) {
        const actorUrl = m[1].replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
        const name = m[2].replace(/<[^>]+>/g, '').trim();
        if (name && !actors.some(a => a.url === actorUrl)) {
            actors.push({ name, url: actorUrl });
        }
    }

    return { videoSrc, actors };
}

export async function resolveTermId(actorUrl: string): Promise<string | null> {
    const slug = actorUrl.replace(/^\/actor\//, '').replace(/\/$/, '');
    const r = await fetch(`${BASE_URL}/wp-json/wp/v2/actors?slug=${encodeURIComponent(slug)}`);
    const data = await r.json() as Array<{ id: number }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    return String(data[0].id);
}

export async function fetchChannelVideos(termId: string, page: number): Promise<{ items: VideoStub[]; hasMore: boolean }> {
    const r = await fetch(`${BASE_URL}/wp-json/wp/v2/posts?actors=${termId}&per_page=12&page=${page}&_embed`);
    if (!r.ok) return { items: [], hasMore: false };
    const data = await r.json();
    return parseWpPostsResponse(data, 12);
}

interface WpPost {
    id: number;
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

function stripSizeSuffix(url: string): string {
    return url.replace(/-\d+x\d+(\.\w+)$/, '$1');
}

function parseWpPostsResponse(data: unknown, perPage: number): { items: VideoStub[]; hasMore: boolean } {
    const posts = data as WpPost[];
    if (!Array.isArray(posts)) return { items: [], hasMore: false };

    const items: VideoStub[] = posts.map(post => {
        const media = post._embedded?.['wp:featuredmedia']?.[0];
        const sizes = media?.media_details?.sizes;
        const thumb = stripSizeSuffix(sizes?.medium?.source_url ?? sizes?.thumbnail?.source_url ?? media?.source_url ?? '');
        return {
            id: String(post.id),
            thumbnail: thumb,
            pageUrl: post.link ?? '',
        };
    });

    return { items, hasMore: posts.length >= perPage };
}
