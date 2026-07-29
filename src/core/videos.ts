import { getVideosByIds, putVideos } from '../storage/db';
import type { Provider } from '../provider';
import type {VideoStub} from "../types";

export async function getVideos(ids: string[], provider: Provider): Promise<VideoStub[]> {
    const map = await getVideosByIds(ids);
    const missing = ids.filter(id => !map.has(id));
    if (missing.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < missing.length; i += 100) {
            chunks.push(missing.slice(i, i + 100));
        }
        for (const chunk of chunks) {
            const fetched = await provider.lookupVideos(chunk);
            if (fetched.length > 0) {
                await putVideos(fetched);
                for (const v of fetched) {
                    map.set(v.id, v);
                }
            }
        }
    }
    return ids
        .map(id => map.get(id))
        .filter((video): video is VideoStub => video !== undefined);
}
