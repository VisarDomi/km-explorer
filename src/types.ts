export interface VideoStub {
    id: string;
    thumbnail: string;
    pageUrl: string;
}

export interface Actor {
    name: string;
    url: string;
}

export interface VideoDetail {
    videoSrc: string;
    actors: Actor[];
}
