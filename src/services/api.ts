import {
  latestRequest,
  searchRequest,
  videoDetailRequest,
  channelRequest,
  actorLookupUrl,
  PER_PAGE,
} from "../core/provider.js";
import { parseTypesenseResponse, parseVideoDetailHtml, parseWpPostsResponse } from "../core/parse.js";
import { getCachedListing, setCachedListing } from "./cache-db.js";
import type { ListingData, VideoDetail } from "../core/types.js";

// --- Actor term-id resolution (session cache) ---

const termIdCache = new Map<string, number>();

async function resolveTermId(actorUrl: string): Promise<number> {
  const cached = termIdCache.get(actorUrl);
  if (cached !== undefined) return cached;

  const slug = actorUrl.replace(/^\/actor\//, "").replace(/\/$/, "");
  const url = actorLookupUrl(slug);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Actor lookup failed: ${res.status} ${url}`);
  const data = await res.json() as Array<{ id: number }>;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No actor found for slug: ${slug}`);
  }
  termIdCache.set(actorUrl, data[0].id);
  return data[0].id;
}

// --- Fetch helpers ---

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

// --- Public API ---

export async function fetchLatest(page: number): Promise<ListingData> {
  const cacheKey = `latest:${page}`;
  const cached = await getCachedListing(cacheKey);
  if (cached) return cached;

  const req = latestRequest(page);
  const data = await fetchJson(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  const result = parseTypesenseResponse(data);
  await setCachedListing(cacheKey, result);
  return result;
}

export async function searchVideos(query: string, page: number): Promise<ListingData> {
  const cacheKey = `search:${query}:${page}`;
  const cached = await getCachedListing(cacheKey);
  if (cached) return cached;

  const req = searchRequest(query, page);
  const data = await fetchJson(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  const result = parseTypesenseResponse(data);
  await setCachedListing(cacheKey, result);
  return result;
}

export async function fetchChannel(actorUrl: string, page: number): Promise<ListingData> {
  const cacheKey = `channel:${actorUrl}:${page}`;
  const cached = await getCachedListing(cacheKey);
  if (cached) return cached;

  const termId = await resolveTermId(actorUrl);
  const req = channelRequest(String(termId), page);
  const data = await fetchJson(req.url);
  const result = parseWpPostsResponse(data, PER_PAGE);
  await setCachedListing(cacheKey, result);
  return result;
}

export async function scrapeVideoDetail(pageUrl: string): Promise<VideoDetail> {
  const req = videoDetailRequest(pageUrl);
  const html = await fetchText(req.url);
  return parseVideoDetailHtml(html);
}
