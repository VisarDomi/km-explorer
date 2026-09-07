import { compute } from '../core/compute/transport';
import type { VideoStub, VideoDetail } from '../types';
export const getAllVideos = () => compute<VideoStub[]>('getAllVideos');
export const putVideos = (videos: VideoStub[]) => compute<void>('putVideos', videos);
export const getVideosByIds = (ids: string[]) => compute<Map<string, VideoStub>>('getVideosByIds', ids);
export const getDetail = (pageUrl: string) => compute<VideoDetail | undefined>('getDetail', pageUrl);
export const putDetail = (pageUrl: string, detail: VideoDetail) => compute<void>('putDetail', pageUrl, detail);
export const getCachedChannel = (actorUrl: string) => compute<{ termId: string; videoIds: string[] } | null>('getCachedChannel', actorUrl);
export const setCachedChannel = (actorUrl: string, termId: string, videoIds: string[]) => compute<void>('setCachedChannel', actorUrl, termId, videoIds);
