import type { VideoStub, ListingData } from "../core/types.js";

const DB_NAME = "km-explorer-cache";
const DB_VERSION = 1;
const LISTING_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("listings")) {
        db.createObjectStore("listings", { keyPath: "cacheKey" });
      }
      if (!db.objectStoreNames.contains("favorites")) {
        db.createObjectStore("favorites", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

// --- Listings ---

interface CachedListing {
  cacheKey: string;
  data: ListingData;
  cachedAt: number;
}

export async function getCachedListing(cacheKey: string): Promise<ListingData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("listings", "readonly");
    const req = tx.objectStore("listings").get(cacheKey);
    req.onsuccess = () => {
      const entry = req.result as CachedListing | undefined;
      if (!entry) { resolve(null); return; }
      if (Date.now() - entry.cachedAt > LISTING_CACHE_TTL_MS) {
        // stale — evict and return null
        const delTx = db.transaction("listings", "readwrite");
        delTx.objectStore("listings").delete(cacheKey);
        resolve(null);
        return;
      }
      resolve(entry.data);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function setCachedListing(cacheKey: string, data: ListingData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("listings", "readwrite");
    const entry: CachedListing = { cacheKey, data, cachedAt: Date.now() };
    tx.objectStore("listings").put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Favorites ---

export async function getAllFavorites(): Promise<VideoStub[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("favorites", "readonly");
    const req = tx.objectStore("favorites").getAll();
    req.onsuccess = () => resolve(req.result as VideoStub[]);
    req.onerror = () => reject(req.error);
  });
}

export async function addFavorite(video: VideoStub): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("favorites", "readwrite");
    tx.objectStore("favorites").put(video);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeFavorite(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("favorites", "readwrite");
    tx.objectStore("favorites").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function exportFavoriteIds(): Promise<string[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("favorites", "readonly");
        const req = tx.objectStore("favorites").getAll();
        req.onsuccess = () => {
            const items = req.result as VideoStub[];
            resolve(items.map(v => v.id));
        };
        req.onerror = () => reject(req.error);
    });
}

export async function mergeFavorites(ids: string[]): Promise<number> {
    const db = await openDB();
    const existing = await getAllFavorites();
    const existingIds = new Set(existing.map(v => v.id));
    let added = 0;

    return new Promise((resolve, reject) => {
        const tx = db.transaction("favorites", "readwrite");
        const store = tx.objectStore("favorites");
        for (const id of ids) {
            if (existingIds.has(id)) continue;
            store.put({ id, title: id, thumbnail: "", pageUrl: "" } as VideoStub);
            added++;
        }
        tx.oncomplete = () => resolve(added);
        tx.onerror = () => reject(tx.error);
    });
}
