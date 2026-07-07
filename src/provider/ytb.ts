import type { VideoStub, VideoDetail } from '../types';

const TS_API = 'https://ts-api.ytboob.com/multi_search?x-typesense-api-key=2mFxuIpLuESx5X1aPGkDOx4ZAtM5jG46';
const BASE_URL = 'https://ytboob.com';
export const BATCH = 50;

const PER_PAGE = 12;

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

interface TypesensePage {
    items: VideoStub[];
    found: number;
    hasMore: boolean;
}

async function fetchTypesensePage(page: number): Promise<TypesensePage> {
    const r = await fetch(TS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: tsSearchBody(page),
    });
    const data = await r.json() as TsResult;
    const result = data.results![0]!;

    const hits = result.hits!;
    const items: VideoStub[] = hits.map(hit => ({
        id: hit.document.post_id!,
        thumbnail: stripSize(hit.document.post_thumbnail!),
        pageUrl: hit.document.permalink!,
    }));

    const found = result.found!;
    const hasMore = hits.length >= PER_PAGE && items.length < found;
    return { items, found, hasMore };
}

export async function fetchTypesenseBatch(startPage: number): Promise<TypesensePage[]> {
    const pages = Array.from({ length: BATCH }, (_, i) => startPage + i);
    const results = await Promise.all(pages.map(p => fetchTypesensePage(p)));
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
    const hits = data.results![0]!.hits!;
    return hits.map(hit => ({
        id: hit.document.post_id!,
        thumbnail: stripSize(hit.document.post_thumbnail!),
        pageUrl: hit.document.permalink!,
    }));
}

export async function scrapeVideoDetail(pageUrl: string): Promise<VideoDetail> {
    const url = pageUrl.startsWith('http') ? pageUrl : `${BASE_URL}${pageUrl}`;
    const r = await fetch(url);
    const html = await r.text();

    let videoSrc: string | null = null;
    const metaMatch = html.match(/<meta[^>]+itemprop=["']contentURL["'][^>]+content=["']([^"']+)["']/i);
    if (metaMatch) {
        videoSrc = metaMatch[1];
    } else {
        const fallback = html.match(/https?:\/\/vidhost\.me\/videos\/[^"'\s#]+/);
        if (fallback) videoSrc = fallback[0];
    }
    if (!videoSrc) throw new Error(`No videoSrc found on ${pageUrl}`);

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

export async function fetchChannelVideos(termId: string, page: number): Promise<{ ids: string[]; pageUrls: string[]; hasMore: boolean }> {
    const r = await fetch(`${BASE_URL}/wp-json/wp/v2/posts?actors=${termId}&per_page=12&page=${page}`);
    const posts = await r.json() as Array<{ id: number; link: string }>;
    return {
        ids: posts.map(p => String(p.id)),
        pageUrls: posts.map(p => p.link),
        hasMore: posts.length >= 12,
    };
}
