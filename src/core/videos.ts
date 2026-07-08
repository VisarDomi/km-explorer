import {getDetail, getVideosByIds, putVideos} from "../storage/db";
import {lookupByIds} from "../provider/ytb";
import type {VideoStub} from "../types";

export async function getVideos(ids: string[]) {
    const map = await getVideosByIds(ids);
    const missing = ids.filter(id => !map.has(id));
    if (missing.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < missing.length; i += 100) {
            chunks.push(missing.slice(i, i + 100));
        }
        for (const chunk of chunks) {
            const fetched = await lookupByIds(chunk);
            if (fetched.length > 0) {
                await putVideos(fetched);
                for (const v of fetched) {
                    map.set(v.id, v);
                }
            }
        }
    }
    const videos = ids.map(id => map.get(id)!);
    return videos;
}

export async function onVideoClick(video: VideoStub) {
    const detail = await getDetail(video.pageUrl);
    window.location.href = detail.actors[0].url;
}