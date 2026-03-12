import { fetchJson } from './fetchJson.js';
import { imageProxyUrl as _imageProxyUrl } from '../config.js';
import type { VideoStub, VideoDetail, Actor } from '../types.js';

export { ApiError } from './fetchJson.js';

// --- Image proxy URL ---

export function imageProxyUrl(url: string): string {
    return _imageProxyUrl(url, 'https://ytboob.com');
}

// --- Latest ---

export interface ListResult {
    items: VideoStub[];
    hasMore: boolean;
}

export async function fetchLatest(page = 1, signal?: AbortSignal): Promise<ListResult> {
    return fetchJson<ListResult>(`/api/latest?page=${page}`, { signal });
}

// --- Search ---

export async function searchVideos(query: string, page = 1, signal?: AbortSignal): Promise<ListResult> {
    return fetchJson<ListResult>(`/api/search?q=${encodeURIComponent(query)}&page=${page}`, { signal });
}

// --- Channel ---

export async function fetchChannel(channelUrl: string, page = 1, signal?: AbortSignal): Promise<ListResult> {
    return fetchJson<ListResult>(`/api/channel?url=${encodeURIComponent(channelUrl)}&page=${page}`, { signal });
}

// --- Video Details ---

export interface CachedDetail {
    videoSrc: string;
    actors: Actor[];
}

export interface VideoDetailsResponse {
    cached: Record<string, CachedDetail>;
    pending: string[];
}

export async function requestVideoDetails(urls: string[], signal?: AbortSignal): Promise<VideoDetailsResponse> {
    return fetchJson<VideoDetailsResponse>('/api/video-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
        signal,
    });
}
