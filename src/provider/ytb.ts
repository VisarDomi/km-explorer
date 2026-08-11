import type { VideoStub, VideoDetail } from '../types';
import type { Provider, ProviderRoute } from './types';

const TS_API = 'https://ts-api.ytboob.com/multi_search?x-typesense-api-key=2mFxuIpLuESx5X1aPGkDOx4ZAtM5jG46';
const BASE_URL = 'https://ytboob.com';
export const BATCH = 50;

const PER_PAGE = 12;
const SITE_SIZE = 30;
const CLIENT_SIZE = BATCH * PER_PAGE;
const PROVIDER_PAGES_PER_CLIENT = CLIENT_SIZE / SITE_SIZE;

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

async function fetchTypesenseBatch(startPage: number): Promise<TypesensePage[]> {
    const pages = Array.from({ length: BATCH }, (_, i) => startPage + i);
    const results = await Promise.all(pages.map(p => fetchTypesensePage(p)));
    return results;
}

async function lookupByIds(ids: string[]): Promise<VideoStub[]> {
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

async function scrapeVideoDetail(pageUrl: string): Promise<VideoDetail> {
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

async function resolveTermId(actorUrl: string): Promise<string | null> {
    const slug = actorUrl.replace(/^\/actor\//, '').replace(/\/$/, '');
    const r = await fetch(`${BASE_URL}/wp-json/wp/v2/actors?slug=${encodeURIComponent(slug)}`);
    if (!r.ok) throw new Error(`Actor lookup failed: ${r.status}`);
    const data = await r.json() as unknown;
    if (!Array.isArray(data)) throw new Error('Actor lookup response is not an array');
    if (data.length === 0) return null;
    if (typeof data[0] !== 'object' || data[0] === null || typeof data[0].id !== 'number') {
        throw new Error('Actor lookup response contains an invalid actor');
    }
    return String(data[0].id);
}

async function fetchChannelVideos(termId: string, page: number): Promise<{ ids: string[]; hasMore: boolean }> {
    const r = await fetch(`${BASE_URL}/wp-json/wp/v2/posts?actors=${termId}&per_page=12&page=${page}`);
    if (!r.ok) throw new Error(`Actor posts failed: ${r.status}`);
    const data: unknown = await r.json();
    if (!Array.isArray(data)) throw new Error('Actor posts response is not an array');
    if (!data.every(post => typeof post === 'object' && post !== null && typeof post.id === 'number')) {
        throw new Error('Actor posts response contains an invalid post');
    }
    const totalPages = Number(r.headers.get('X-WP-TotalPages'));
    if (!Number.isInteger(totalPages) || totalPages < 0) {
        throw new Error('Actor posts response has an invalid page count');
    }
    return {
        ids: data.map(post => String(post.id)),
        hasMore: page < totalPages,
    };
}

function recognize(url: URL): ProviderRoute {
    if (url.hostname !== new URL(BASE_URL).hostname) return { kind: 'unsupported' };
    if (url.pathname === '/') return { kind: 'favorites' };
    if (url.pathname === '/favs' || url.pathname === '/favs/') {
        return { kind: 'unsupported' };
    }

    const page = url.pathname.match(/^\/page\/(\d+)\/?$/);
    if (page) {
        const sitePage = Number.parseInt(page[1], 10);
        return sitePage >= 2
            ? { kind: 'listing', sitePage }
            : { kind: 'unsupported' };
    }

    if (/^\/actor\/[^/]+\/?$/.test(url.pathname)) {
        return { kind: 'actor', actorUrl: url.pathname.replace(/\/$/, '') };
    }

    if (/^\/[^/]+\/?$/.test(url.pathname)) {
        return { kind: 'video', videoUrl: url.href };
    }

    return { kind: 'unsupported' };
}

async function fetchListing(clientPage: number) {
    const startPage = Math.max(1, (clientPage - 1) * BATCH + 1);
    const results = await fetchTypesenseBatch(startPage);
    const videos = results.flatMap(result => result.items);
    const found = results[0]?.found ?? 0;
    return {
        videos,
        totalClientPages: Math.ceil(found / CLIENT_SIZE),
    };
}

async function fetchListingPageCount(): Promise<number> {
    const first = await fetchTypesensePage(1);
    return Math.ceil(first.found / CLIENT_SIZE);
}

export const ytboob: Provider = {
    hostname: new URL(BASE_URL).hostname,
    clientPageSize: CLIENT_SIZE,
    recognize,
    clientPageForSitePage: sitePage => Math.ceil(sitePage / PROVIDER_PAGES_PER_CLIENT),
    sitePageForClientPage: clientPage =>
        Math.max(2, (clientPage - 1) * PROVIDER_PAGES_PER_CLIENT + 1),
    indexForSitePage: (sitePage, clientPage) =>
        (sitePage - 1) * SITE_SIZE - (clientPage - 1) * CLIENT_SIZE,
    fetchListing,
    fetchListingPageCount,
    lookupVideos: lookupByIds,
    fetchVideoDetail: scrapeVideoDetail,
    resolveActorId: resolveTermId,
    fetchActorVideoPage: fetchChannelVideos,
};
