// Shared data types used by providers and the app

export interface VideoStub {
  id: string;
  title: string;
  thumbnail: string;
  pageUrl: string;
}

export interface VideoDetail {
  videoSrc: string;
  actors: Actor[];
}

export interface Actor {
  name: string;
  url: string;
}

export interface PagedResult<T> {
  items: T[];
  hasMore: boolean;
}

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

// The interface each provider implements
export interface VideoProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly version: string;

  latestRequest(page: number): HttpRequest;
  parseLatestResponse(data: unknown): PagedResult<VideoStub>;

  searchRequest(query: string, page: number): HttpRequest;
  parseSearchResponse(data: unknown): PagedResult<VideoStub>;

  videoDetailRequest(pageUrl: string): HttpRequest;
  parseVideoDetailResponse(data: unknown): VideoDetail;

  channelRequest(channelSlug: string, page: number): HttpRequest;
  parseChannelResponse(data: unknown): PagedResult<VideoStub>;

  imageHeaders?(): Record<string, string>;
}
