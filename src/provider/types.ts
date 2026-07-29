import type { VideoDetail, VideoStub } from '../types';

export type ProviderRoute =
    | { kind: 'favorites' }
    | { kind: 'listing'; sitePage: number }
    | { kind: 'actor'; actorUrl: string }
    | { kind: 'video'; videoUrl: string }
    | { kind: 'unsupported' };

export interface ListingResult {
    videos: VideoStub[];
    totalClientPages: number;
}

export interface ActorVideoPage {
    ids: string[];
    hasMore: boolean;
}

export interface Provider {
    readonly hostname: string;
    readonly clientPageSize: number;
    recognize(url: URL): ProviderRoute;
    clientPageForSitePage(sitePage: number): number;
    sitePageForClientPage(clientPage: number): number;
    indexForSitePage(sitePage: number, clientPage: number): number;
    fetchListing(clientPage: number): Promise<ListingResult>;
    fetchListingPageCount(): Promise<number>;
    lookupVideos(ids: string[]): Promise<VideoStub[]>;
    fetchVideoDetail(pageUrl: string): Promise<VideoDetail>;
    resolveActorId(actorUrl: string): Promise<string | null>;
    fetchActorVideoPage(actorId: string, page: number): Promise<ActorVideoPage>;
}
