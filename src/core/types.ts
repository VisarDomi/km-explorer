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

export interface ListingData {
  items: VideoStub[];
  hasMore: boolean;
}
