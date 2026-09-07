import type { VideoStub, VideoDetail } from '../../types';

const DB_NAME = 'km-explorer';
const DB_VERSION = 5;
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

export const suspendDatabase = () => closeDatabase(true);

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

        if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences');

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
        const timeout = self.setTimeout(() => {
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
            self.clearTimeout(timeout);
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

export interface Preferences {
    favorites: string[];
    highlight: { id: string; pageUrl: string } | null;
    scroll: Record<string, number>;
}
export interface Snapshot {
    version: 1;
    indexedDB: {
        videos: VideoStub[];
        details: Array<VideoDetail & { pageUrl: string }>;
        channels: Array<{ actorUrl: string; termId: string; videoIds: string[] }>;
        preferences: Preferences;
    };
}
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
export function validatePreferences(value: unknown): Preferences {
    const p = value as Preferences;
    if (!p || !strings(p.favorites)) throw new Error('Invalid KM favorites');
    if (p.highlight !== null && (!p.highlight || typeof p.highlight.id !== 'string' || typeof p.highlight.pageUrl !== 'string')) throw new Error('Invalid KM card highlight');
    if (!p.scroll || typeof p.scroll !== 'object' || Array.isArray(p.scroll) || !Object.values(p.scroll).every(y => Number.isFinite(y) && y >= 0)) throw new Error('Invalid KM scroll positions');
    return p;
}
export function validateSnapshot(value: unknown): Snapshot {
    const s = value as Snapshot;
    if (s?.version !== 1 || !s.indexedDB) throw new Error('Invalid KM backup version');
    const d = s.indexedDB;
    validatePreferences(d.preferences);
    if (!Array.isArray(d.videos) || !d.videos.every(v => v && typeof v.id === 'string' && typeof v.thumbnail === 'string' && typeof v.pageUrl === 'string')) throw new Error('Invalid KM video cache');
    if (!Array.isArray(d.details) || !d.details.every(v => v && typeof v.pageUrl === 'string' && typeof v.videoSrc === 'string' && Array.isArray(v.actors) && v.actors.every(a => a && typeof a.name === 'string' && typeof a.url === 'string'))) throw new Error('Invalid KM detail cache');
    if (!Array.isArray(d.channels) || !d.channels.every(v => v && typeof v.actorUrl === 'string' && typeof v.termId === 'string' && strings(v.videoIds))) throw new Error('Invalid KM channel cache');
    return s;
}
export async function preferences<T>(operation: (p: Preferences | undefined) => { value: T; next?: Preferences }, write = false): Promise<T> {
    const db = await openDB();
    const tx = db.transaction('preferences', write ? 'readwrite' : 'readonly', { durability: 'strict' });
    const done = waitForTransaction(tx);
    const store = tx.objectStore('preferences');
    let result: T;
    let failure: unknown;
    const request = store.get('state');
    request.onsuccess = () => {
        try {
            const outcome = operation(request.result);
            result = outcome.value;
            if (outcome.next) store.put(validatePreferences(outcome.next), 'state');
        } catch (error) { failure = error; tx.abort(); }
    };
    try { await done; } catch (error) { throw failure ?? error; }
    return result!;
}
export async function migratePreferences(raw: Record<string, string>): Promise<void> {
    await preferences(p => ({ value: undefined, next: p ?? validatePreferences({
        favorites: JSON.parse(raw['km-explorer-favorites-v1'] || '[]'),
        highlight: JSON.parse(raw['ke-card-highlight'] || 'null'),
        scroll: Object.fromEntries(Object.entries(raw).filter(([key]) => key.startsWith('ke-scroll')).map(([key, value]) => [key.slice(9), Number(value)])),
    }) }), true);
}
export async function captureSnapshot(): Promise<Snapshot> {
    const db = await openDB();
    const tx = db.transaction(['videos', 'details', 'channels', 'preferences'], 'readonly');
    const done = waitForTransaction(tx);
    const indexedDB = {} as Snapshot['indexedDB'];
    for (const name of ['videos', 'details', 'channels', 'preferences'] as const) {
        const request = name === 'preferences' ? tx.objectStore(name).get('state') : tx.objectStore(name).getAll();
        request.onsuccess = () => { (indexedDB as Record<string, unknown>)[name] = request.result; };
    }
    await done;
    return validateSnapshot({ version: 1, indexedDB });
}
export async function restoreSnapshot(value: unknown): Promise<void> {
    const { indexedDB } = validateSnapshot(value);
    const db = await openDB();
    const tx = db.transaction(['videos', 'details', 'channels', 'preferences'], 'readwrite', { durability: 'strict' });
    const done = waitForTransaction(tx);
    try {
        for (const name of ['videos', 'details', 'channels'] as const) {
            const store = tx.objectStore(name);
            store.clear();
            for (const record of indexedDB[name]) store.put(record);
        }
        tx.objectStore('preferences').put(indexedDB.preferences, 'state');
    } catch (error) { tx.abort(); await done.catch(() => {}); throw error; }
    await done;
}
export function snapshotStats(value: unknown): string {
    const d = validateSnapshot(value).indexedDB;
    return `${d.preferences.favorites.length} favorites, ${Object.keys(d.preferences.scroll).length} scroll positions, ${d.preferences.highlight ? 1 : 0} selected card, ${d.videos.length} videos, ${d.details.length} details, ${d.channels.length} channels`;
}
