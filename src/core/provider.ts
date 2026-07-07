const BASE_URL = "https://ytboob.com";
const TS_API = "https://ts-api.ytboob.com/multi_search?x-typesense-api-key=2mFxuIpLuESx5X1aPGkDOx4ZAtM5jG46";
const PER_PAGE = 12;

function tsSearchBody(searches: object[]): string {
  return JSON.stringify({ searches });
}

export interface FetchRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export function latestRequest(page: number): FetchRequest {
  return {
    url: TS_API,
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: tsSearchBody([{
      collection: "post",
      q: "*",
      query_by: "post_title",
      sort_by: "sort_by_date:desc",
      per_page: PER_PAGE,
      page,
      include_fields: "permalink,post_title,post_thumbnail,post_id",
    }]),
  };
}

export function searchRequest(query: string, page: number): FetchRequest {
  return {
    url: TS_API,
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: tsSearchBody([{
      collection: "post",
      q: query,
      query_by: "post_title",
      sort_by: query ? "_text_match:desc,sort_by_date:desc" : "sort_by_date:desc",
      per_page: PER_PAGE,
      page,
      include_fields: "permalink,post_title,post_thumbnail,post_id",
    }]),
  };
}

export function videoDetailRequest(pageUrl: string): FetchRequest {
  const url = pageUrl.startsWith("http") ? pageUrl : `${BASE_URL}${pageUrl}`;
  return { url, method: "GET", headers: {} };
}

export function channelRequest(actorTermId: string, page: number): FetchRequest {
  return {
    url: `${BASE_URL}/wp-json/wp/v2/posts?actors=${actorTermId}&per_page=${PER_PAGE}&page=${page}&_embed`,
    method: "GET",
    headers: {},
  };
}

export function actorLookupUrl(slug: string): string {
  return `${BASE_URL}/wp-json/wp/v2/actors?slug=${encodeURIComponent(slug)}`;
}

export { BASE_URL, PER_PAGE };
