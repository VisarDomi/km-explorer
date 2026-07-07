import type { VideoStub, VideoDetail } from '../types';

const DB_NAME = 'km-explorer';
const DB_VERSION = 3;
const VIDEO_STORE = 'videos';
const DETAIL_STORE = 'details';
const FAV_STORE = 'favorites';

function openDB(): Promise<IDBDatabase> {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VIDEO_STORE)) db.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(DETAIL_STORE)) db.createObjectStore(DETAIL_STORE, { keyPath: 'video_url' });
        if (!db.objectStoreNames.contains(FAV_STORE)) db.createObjectStore(FAV_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('channels')) db.createObjectStore('channels', { keyPath: 'actorUrl' });
        // v3: migrate video_src → videoSrc
        if ((req as any).oldVersion < 3 && db.objectStoreNames.contains(DETAIL_STORE)) {
            const tx = (req as any).transaction(DETAIL_STORE, 'readwrite') as IDBTransaction;
            const store = tx.objectStore(DETAIL_STORE);
            store.openCursor().onsuccess = (e: Event) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const row = cursor.value;
                    if ('video_src' in row && !('videoSrc' in row)) {
                        row.videoSrc = row.video_src;
                        delete row.video_src;
                        cursor.update(row);
                    }
                    cursor.continue();
                }
            };
        }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    return promise;
}

// --- Videos ---

export async function getAllVideos(): Promise<VideoStub[]> {
    const db = await openDB();
    const { promise, resolve, reject } = Promise.withResolvers<VideoStub[]>();
    const req = db.transaction(VIDEO_STORE, 'readonly').objectStore(VIDEO_STORE).getAll();
    req.onsuccess = () => resolve(req.result as VideoStub[]);
    req.onerror = () => reject(req.error!);
    return promise;
}

export async function putVideos(videos: VideoStub[]): Promise<void> {
    if (videos.length === 0) return;
    const db = await openDB();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const tx = db.transaction(VIDEO_STORE, 'readwrite');
    const store = tx.objectStore(VIDEO_STORE);
    for (const v of videos) store.put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error!);
    return promise;
}

export async function getVideosByIds(ids: string[]): Promise<Map<string, VideoStub>> {
    const db = await openDB();
    const map = new Map<string, VideoStub>();
    if (ids.length === 0) return map;
    const { promise, resolve, reject } = Promise.withResolvers<Map<string, VideoStub>>();
    const tx = db.transaction(VIDEO_STORE, 'readonly');
    const store = tx.objectStore(VIDEO_STORE);
    let pending = ids.length;
    let firstError: DOMException | null = null;
    for (const id of ids) {
        const req = store.get(id);
        req.onsuccess = () => {
            if (req.result) map.set(id, req.result);
            if (--pending === 0) firstError ? reject(firstError) : resolve(map);
        };
        req.onerror = () => {
            if (!firstError) firstError = req.error;
            if (--pending === 0) reject(firstError!);
        };
    }
    return promise;
}

// --- Details ---

export async function getDetail(pageUrl: string): Promise<VideoDetail | null> {
    const db = await openDB();
    const { promise, resolve, reject } = Promise.withResolvers<VideoDetail | null>();
    const req = db.transaction(DETAIL_STORE, 'readonly').objectStore(DETAIL_STORE).get(pageUrl);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error!);
    return promise;
}

export async function putDetail(pageUrl: string, detail: VideoDetail): Promise<void> {
    const db = await openDB();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const tx = db.transaction(DETAIL_STORE, 'readwrite');
    tx.objectStore(DETAIL_STORE).put({ video_url: pageUrl, videoSrc: detail.videoSrc, actors: detail.actors });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error!);
    return promise;
}

// --- Favorites ---

let favsPromise: Promise<string[]> | null = null;
let favSet: Set<string> | null = null;

async function getAllFavs(): Promise<string[]> {
    const db = await openDB();
    const { promise, resolve, reject } = Promise.withResolvers<string[]>();
    const req = db.transaction(FAV_STORE, 'readonly').objectStore(FAV_STORE).getAll();
    req.onsuccess = () => {
        const items = req.result as { id: string; savedAt: number }[];
        items.sort((a, b) => b.savedAt - a.savedAt);
        resolve(items.map(x => x.id));
    };
    req.onerror = () => reject(req.error!);
    return promise;
}

export function preloadFavs(): Promise<string[]> {
    if (!favsPromise) favsPromise = getAllFavs().then(ids => { favSet = new Set(ids); return ids; });
    return favsPromise;
}

export async function isFav(id: string): Promise<boolean> {
    await preloadFavs();
    return favSet!.has(id);
}

export async function toggleFav(id: string): Promise<boolean> {
    await preloadFavs();
    const was = favSet!.has(id);
    const db = await openDB();
    const { promise, resolve, reject } = Promise.withResolvers<boolean>();
    const tx = db.transaction(FAV_STORE, 'readwrite');
    const store = tx.objectStore(FAV_STORE);

    if (was) {
        store.delete(id);
        tx.oncomplete = () => { favSet!.delete(id); favsPromise = Promise.resolve([...favSet!]); resolve(false); };
    } else {
        store.put({ id, savedAt: Date.now() });
        tx.oncomplete = () => { favSet!.add(id); favsPromise = Promise.resolve([...favSet!]); resolve(true); };
    }
    tx.onerror = () => reject(tx.error!);
    return promise;
}

export async function mergeFavs(ids: string[]): Promise<number> {
    await preloadFavs();
    const existing = favSet!;
    const db = await openDB();
    const { promise, resolve, reject } = Promise.withResolvers<number>();
    const tx = db.transaction(FAV_STORE, 'readwrite');
    const store = tx.objectStore(FAV_STORE);
    let added = 0;
    const now = Date.now();
    for (const id of ids) {
        if (existing.has(id)) continue;
        store.put({ id, savedAt: now });
        existing.add(id);
        added++;
    }
    tx.oncomplete = () => {
        favsPromise = getAllFavs().then(ids2 => { favSet = new Set(ids2); return ids2; });
        resolve(added);
    };
    tx.onerror = () => reject(tx.error!);
    return promise;
}

// --- Channels ---

export async function getCachedChannel(actorUrl: string): Promise<{ termId: string; videoIds: string[] } | null> {
    const db = await openDB();
    const { promise, resolve, reject } = Promise.withResolvers<{ termId: string; videoIds: string[] } | null>();
    const req = db.transaction('channels', 'readonly').objectStore('channels').get(actorUrl);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error!);
    return promise;
}

export async function setCachedChannel(actorUrl: string, termId: string, videoIds: string[]): Promise<void> {
    const db = await openDB();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const tx = db.transaction('channels', 'readwrite');
    tx.objectStore('channels').put({ actorUrl, termId, videoIds });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error!);
    return promise;
}
