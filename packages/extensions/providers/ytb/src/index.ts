import type { VideoProvider, VideoStub, VideoDetail, Actor, PagedResult, HttpRequest } from '@km-explorer/provider-types';
import { parseTypesenseResponse, parseVideoDetailHtml, parseWpPostsResponse } from './parse.js';

const BASE_URL = 'https://ytboob.com';
const TS_API = 'https://ts-api.ytboob.com/multi_search?x-typesense-api-key=2mFxuIpLuESx5X1aPGkDOx4ZAtM5jG46';
const PER_PAGE = 12;

function tsSearchBody(searches: object[]): string {
  return JSON.stringify({ searches });
}

const provider: VideoProvider = {
  id: 'ytb',
  name: 'YTB',
  baseUrl: BASE_URL,
  version: '1.0.0',

  // --- Latest ---

  latestRequest(page: number): HttpRequest {
    return {
      url: TS_API,
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: tsSearchBody([{
        collection: 'post',
        q: '*',
        query_by: 'post_title',
        sort_by: 'sort_by_date:desc',
        per_page: PER_PAGE,
        page,
        include_fields: 'permalink,post_title,post_thumbnail,post_id',
      }]),
    };
  },

  parseLatestResponse(data: unknown): PagedResult<VideoStub> {
    return parseTypesenseResponse(data);
  },

  // --- Search ---

  searchRequest(query: string, page: number): HttpRequest {
    return {
      url: TS_API,
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: tsSearchBody([{
        collection: 'post',
        q: query,
        query_by: 'post_title',
        sort_by: query ? '_text_match:desc,sort_by_date:desc' : 'sort_by_date:desc',
        per_page: PER_PAGE,
        page,
        include_fields: 'permalink,post_title,post_thumbnail,post_id',
      }]),
    };
  },

  parseSearchResponse(data: unknown): PagedResult<VideoStub> {
    return parseTypesenseResponse(data);
  },

  // --- Video Detail ---

  videoDetailRequest(pageUrl: string): HttpRequest {
    const url = pageUrl.startsWith('http') ? pageUrl : `${BASE_URL}${pageUrl}`;
    return { url };
  },

  parseVideoDetailResponse(data: unknown): VideoDetail {
    return parseVideoDetailHtml(data as string);
  },

  // --- Channel (WP REST API with actors taxonomy) ---
  // Two-step: first resolve slug → term ID, then fetch posts.
  // channelRequest builds the posts query given a numeric actor term ID.

  channelRequest(actorTermId: string, page: number): HttpRequest {
    return {
      url: `${BASE_URL}/wp-json/wp/v2/posts?actors=${actorTermId}&per_page=${PER_PAGE}&page=${page}&_embed`,
    };
  },

  parseChannelResponse(data: unknown): PagedResult<VideoStub> {
    return parseWpPostsResponse(data, PER_PAGE);
  },

  imageHeaders(): Record<string, string> {
    return { Referer: BASE_URL };
  },
};

export default provider;
