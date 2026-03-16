export type { VideoStub, VideoDetail, Actor } from '@km-explorer/provider-types';

export type ViewMode = 'list' | 'channel' | 'favorites';

export interface ViewFrame {
    mode: ViewMode;
    targetVideoId?: string;
    targetVideoPage?: number;
}
