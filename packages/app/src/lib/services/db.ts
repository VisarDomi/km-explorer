import type { VideoStub } from '../types.js';

const DB_NAME = 'km-explorer';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('favorites')) {
                db.createObjectStore('favorites', { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
}

// --- Favorites --- keyed by video id, stores VideoStub

export async function getAllFavorites(): Promise<VideoStub[]> {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction('favorites', 'readonly');
        const req = tx.objectStore('favorites').getAll();
        req.onsuccess = () => resolve(req.result as VideoStub[]);
        req.onerror = () => { console.error('[db] getAllFavorites failed:', req.error); resolve([]); };
    });
}

export async function addFavorite(video: VideoStub): Promise<void> {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction('favorites', 'readwrite');
        tx.objectStore('favorites').put(video);
        tx.oncomplete = () => resolve();
        tx.onerror = () => { console.error('[db] addFavorite failed:', tx.error); resolve(); };
    });
}

export async function removeFavorite(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction('favorites', 'readwrite');
        tx.objectStore('favorites').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => { console.error('[db] removeFavorite failed:', tx.error); resolve(); };
    });
}
