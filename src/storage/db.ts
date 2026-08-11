import type { VideoStub, VideoDetail } from '../types';

const DB_NAME = 'km-explorer';
const DB_VERSION = 4;
const VIDEO_STORE = 'videos';
const DETAIL_STORE = 'details';
const CHANNEL_STORE = 'channels';
const DEFAULT_TRANSACTION_TIMEOUT_MS = 15_000;
const DETAIL_TRANSACTION_TIMEOUT_MS = 2_000;

interface TransactionOptions {
    abortOnPageHide?: boolean;
    timeoutMs?: number;
}

interface ActiveTransaction {
    transaction: IDBTransaction;
    abortOnPageHide: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let database: IDBDatabase | null = null;
let connectionGeneration = 0;
const activeTransactions = new Set<ActiveTransaction>();

function clearConnection(db: IDBDatabase): void {
    if (database !== db) return;
    database = null;
    dbPromise = null;
}

function closeDatabase(abortDisposableTransactions: boolean): void {
    connectionGeneration++;
    if (abortDisposableTransactions) {
        for (const active of activeTransactions) {
            if (!active.abortOnPageHide) continue;
            try {
                active.transaction.abort();
            } catch {
                // The transaction may already be finishing.
            }
        }
    }

    const db = database;
    database = null;
    dbPromise = null;
    db?.close();
}

window.addEventListener('pagehide', () => closeDatabase(true));

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    const generation = connectionGeneration;
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    let settled = false;
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
        const db = req.result;
        const oldVersion = event.oldVersion;

        if (!db.objectStoreNames.contains(VIDEO_STORE)) db.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(CHANNEL_STORE)) db.createObjectStore(CHANNEL_STORE, { keyPath: 'actorUrl' });

        // v4 replaced records using video_src with records using videoSrc.
        // Guarding this migration prevents a future version bump from clearing the cache again.
        if (oldVersion < 4) {
            if (db.objectStoreNames.contains(DETAIL_STORE)) db.deleteObjectStore(DETAIL_STORE);
            db.createObjectStore(DETAIL_STORE, { keyPath: 'pageUrl' });
        } else if (!db.objectStoreNames.contains(DETAIL_STORE)) {
            db.createObjectStore(DETAIL_STORE, { keyPath: 'pageUrl' });
        }
    };
    req.onsuccess = () => {
        const db = req.result;
        if (settled || generation !== connectionGeneration) {
            db.close();
            if (!settled) {
                settled = true;
                reject(new DOMException('IndexedDB open was cancelled by navigation', 'AbortError'));
            }
            return;
        }

        settled = true;
        database = db;
        db.onversionchange = () => {
            clearConnection(db);
            db.close();
        };
        db.onclose = () => clearConnection(db);
        resolve(db);
    };
    req.onerror = () => {
        if (settled) return;
        settled = true;
        reject(req.error ?? new DOMException('Could not open IndexedDB', 'UnknownError'));
    };
    req.onblocked = () => {
        if (settled) return;
        settled = true;
        reject(new DOMException('IndexedDB upgrade is blocked by another page', 'InvalidStateError'));
    };

    dbPromise = promise;
    void promise.catch(() => {
        if (dbPromise === promise) dbPromise = null;
    });
    return promise;
}

function waitForTransaction(
    transaction: IDBTransaction,
    { abortOnPageHide = false, timeoutMs = DEFAULT_TRANSACTION_TIMEOUT_MS }: TransactionOptions = {},
): Promise<void> {
    const active = { transaction, abortOnPageHide };
    activeTransactions.add(active);

    return new Promise<void>((resolve, reject) => {
        let timedOut = false;
        let settled = false;
        const timeout = window.setTimeout(() => {
            timedOut = true;
            try {
                transaction.abort();
            } catch {
                // Reject below even if Safari no longer considers the transaction abortable.
            }
            finish(() => reject(new DOMException('IndexedDB transaction timed out', 'TimeoutError')));
        }, timeoutMs);

        const finish = (complete: () => void): void => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            activeTransactions.delete(active);
            complete();
        };

        transaction.addEventListener('complete', () => finish(resolve), { once: true });
        transaction.addEventListener('abort', () => finish(() => reject(
            timedOut
                ? new DOMException('IndexedDB transaction timed out', 'TimeoutError')
                : transaction.error ?? new DOMException('IndexedDB transaction was aborted', 'AbortError'),
        )), { once: true });
    });
}

async function useTransaction(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => void,
    options?: TransactionOptions,
): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(storeName, mode);
    const done = waitForTransaction(transaction, options);
    try {
        operation(transaction.objectStore(storeName));
    } catch (error) {
        try {
            transaction.abort();
        } catch {
            // Preserve the original synchronous error.
        }
        void done.catch(() => undefined);
        throw error;
    }
    await done;
}

// --- Videos ---

export async function getAllVideos(): Promise<VideoStub[]> {
    let videos: VideoStub[] = [];
    await useTransaction(VIDEO_STORE, 'readonly', store => {
        const req = store.getAll();
        req.onsuccess = () => { videos = req.result as VideoStub[]; };
    }, { abortOnPageHide: true });
    return videos;
}

export async function putVideos(videos: VideoStub[]): Promise<void> {
    await useTransaction(VIDEO_STORE, 'readwrite', store => {
        for (const video of videos) store.put(video);
    }, { abortOnPageHide: true });
}

export async function getVideosByIds(ids: string[]): Promise<Map<string, VideoStub>> {
    const videos = new Map<string, VideoStub>();
    if (ids.length === 0) return videos;

    await useTransaction(VIDEO_STORE, 'readonly', store => {
        for (const id of ids) {
            const req = store.get(id);
            req.onsuccess = () => {
                if (req.result) videos.set(id, req.result as VideoStub);
            };
        }
    }, { abortOnPageHide: true });
    return videos;
}

// --- Details ---

export async function getDetail(pageUrl: string): Promise<VideoDetail | undefined> {
    let detail: VideoDetail | undefined;
    await useTransaction(DETAIL_STORE, 'readonly', store => {
        const req = store.get(pageUrl);
        req.onsuccess = () => { detail = req.result as VideoDetail | undefined; };
    }, { abortOnPageHide: true, timeoutMs: DETAIL_TRANSACTION_TIMEOUT_MS });
    return detail;
}

export async function putDetail(pageUrl: string, detail: VideoDetail): Promise<void> {
    await useTransaction(DETAIL_STORE, 'readwrite', store => {
        store.put({ pageUrl, videoSrc: detail.videoSrc, actors: detail.actors });
    }, { abortOnPageHide: true, timeoutMs: DETAIL_TRANSACTION_TIMEOUT_MS });
}

// --- Channels ---

export async function getCachedChannel(actorUrl: string): Promise<{ termId: string; videoIds: string[] } | null> {
    let channel: { termId: string; videoIds: string[] } | null = null;
    await useTransaction(CHANNEL_STORE, 'readonly', store => {
        const req = store.get(actorUrl);
        req.onsuccess = () => { channel = req.result ?? null; };
    }, { abortOnPageHide: true });
    return channel;
}

export async function setCachedChannel(actorUrl: string, termId: string, videoIds: string[]): Promise<void> {
    await useTransaction(CHANNEL_STORE, 'readwrite', store => {
        store.put({ actorUrl, termId, videoIds });
    }, { abortOnPageHide: true });
}
