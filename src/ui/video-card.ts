import type { Provider } from '../provider';
import { getDetail, putDetail } from '../storage/db';
import { isFav, toggleFav } from '../storage/favorites';
import type { VideoDetail, VideoStub } from '../types';
import { compute } from '../core/compute/transport';

type CardClickHandler = (video: VideoStub) => void;
type CardResolution =
    | { state: 'ready'; videoSrc: string }
    | { state: 'unavailable' }
    | { state: 'failed'; message: string };
type ReadyCallback = (resolution: CardResolution) => void;

interface CacheTask {
    provider: Provider;
    callbacks: Set<ReadyCallback>;
    terminalResolution?: CardResolution;
}

interface StoredCardIdentity {
    id: string;
    pageUrl: string;
}

let highlightRead: Promise<StoredCardIdentity | null> | undefined;

const tasks = new Map<string, CacheTask>();
const queue: string[] = [];
const queued = new Set<string>();
let workerGeneration = 0;
let runningGeneration: number | null = null;
let restartListenerInstalled = false;
let highlightCentered = false;
let detailCacheAvailable = true;

function disableDetailCache(error: unknown): void {
    if (!detailCacheAvailable) return;
    detailCacheAvailable = false;
    console.warn('IndexedDB detail cache is unavailable; continuing without it', error);
}

function readCardHighlight(): Promise<StoredCardIdentity | null> {
    return highlightRead ??= compute('highlight');
}

async function writeCardHighlight(video: VideoStub): Promise<void> {
    const value = { id: video.id, pageUrl: video.pageUrl };
    await compute('highlight-save', value);
    highlightRead = Promise.resolve(value);
}

function cardMatchesHighlight(card: HTMLElement, highlight: StoredCardIdentity | null): boolean {
    return highlight !== null
        && card.dataset.videoId === highlight.id
        && card.dataset.videoPageUrl === highlight.pageUrl
        && card.getAttribute('aria-disabled') !== 'true';
}

function syncCardHighlight(card: HTMLElement, highlight?: StoredCardIdentity | null): void {
    if (highlight !== undefined) card.classList.toggle('ke-returned-card', cardMatchesHighlight(card, highlight));
    else void readCardHighlight().then(value => {
        card.classList.toggle('ke-returned-card', cardMatchesHighlight(card, value));
        centerStoredCardHighlight();
    }).catch(console.error);
}

export function centerStoredCardHighlight(): void {
    if (highlightCentered) return;
    const card = document.querySelector<HTMLElement>('.ke-card.ke-returned-card');
    if (!card) return;
    highlightCentered = true;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.querySelector<HTMLElement>('.ke-card.ke-returned-card')
                ?.scrollIntoView({ block: 'center' });
        });
    });
}

function queueTask(pageUrl: string): void {
    if (tasks.get(pageUrl)?.terminalResolution) return;
    if (queued.has(pageUrl)) return;
    queued.add(pageUrl);
    queue.push(pageUrl);
}

async function runWorker(): Promise<void> {
    const generation = workerGeneration;
    if (runningGeneration === generation) return;
    runningGeneration = generation;
    try {
        while (queue.length > 0) {
            const pageUrl = queue.shift()!;
            queued.delete(pageUrl);
            const task = tasks.get(pageUrl);
            if (!task) continue;

            try {
                let cached: VideoDetail | undefined;
                if (detailCacheAvailable) {
                    try {
                        cached = await getDetail(pageUrl);
                    } catch (error) {
                        if (generation !== workerGeneration) return;
                        disableDetailCache(error);
                    }
                }
                const detail = cached ?? await task.provider.fetchVideoDetail(pageUrl);
                if (generation !== workerGeneration) return;
                const resolution: CardResolution = isAvailableVideoSource(detail.videoSrc)
                    ? { state: 'ready', videoSrc: detail.videoSrc }
                    : { state: 'unavailable' };
                if (resolution.state === 'unavailable') task.terminalResolution = resolution;
                for (const callback of task.callbacks) callback(resolution);

                // Cache persistence is disposable and must never gate card readiness.
                if (!cached && detailCacheAvailable) {
                    try {
                        await putDetail(pageUrl, detail);
                    } catch (error) {
                        if (generation !== workerGeneration) return;
                        disableDetailCache(error);
                    }
                }
            } catch (error) {
                console.warn(`Could not resolve ${pageUrl}`, error);
                if (generation !== workerGeneration) return;
                const resolution: CardResolution = {
                    state: 'failed',
                    message: error instanceof Error ? error.message : String(error),
                };
                for (const callback of task.callbacks) callback(resolution);
            }
        }
    } finally {
        if (runningGeneration === generation) runningGeneration = null;
    }
}

function enqueue(provider: Provider, pageUrl: string, callback: ReadyCallback): void {
    const existing = tasks.get(pageUrl);
    if (existing) {
        existing.callbacks.add(callback);
        if (existing.terminalResolution) {
            callback(existing.terminalResolution);
            return;
        }
    } else {
        tasks.set(pageUrl, {
            provider,
            callbacks: new Set([callback]),
        });
    }
    queueTask(pageUrl);
    void runWorker();
}

function isAvailableVideoSource(videoSrc: string): boolean {
    try {
        const url = new URL(videoSrc);
        return url.protocol === 'https:' && url.hostname === 'vidhost.me';
    } catch {
        return false;
    }
}

export function restartCardCacheWorker(): void {
    workerGeneration++;
    detailCacheAvailable = true;
    queue.length = 0;
    queued.clear();
    for (const pageUrl of tasks.keys()) queueTask(pageUrl);
    void runWorker();
}

function installRestartListener(): void {
    if (restartListenerInstalled) return;
    restartListenerInstalled = true;
    window.addEventListener('pagehide', () => {
        workerGeneration++;
    });
    window.addEventListener('reader-data-restored', () => {
        highlightRead = undefined;
        highlightCentered = false;
        workerGeneration++;
        tasks.clear(); queue.length = 0; queued.clear();
    });
    window.addEventListener('pageshow', async event => {
        if (!event.persisted) return;
        highlightRead = undefined;
        const highlight = await readCardHighlight();
        document.querySelectorAll<HTMLElement>('.ke-card').forEach(card => {
            card.removeAttribute('data-card-busy');
            const spinner = card.querySelector<HTMLElement>('.ke-spinner-overlay');
            const copied = card.querySelector<HTMLElement>('.ke-copied-overlay');
            if (spinner) spinner.style.display = 'none';
            if (copied) copied.style.display = 'none';
            syncCardHighlight(card, highlight);
        });
        restartCardCacheWorker();
    });
}

export function createVideoCard(
    video: VideoStub,
    onClick: CardClickHandler,
    provider: Provider,
    { disabled = false }: { disabled?: boolean } = {},
): HTMLElement {
    installRestartListener();

    const card = document.createElement('div');
    card.className = 'ke-card';
    card.style.opacity = '0.4';
    card.setAttribute('data-video-id', video.id);
    card.setAttribute('data-video-page-url', video.pageUrl);
    if (disabled) card.setAttribute('aria-disabled', 'true');
    syncCardHighlight(card);

    const image = document.createElement('img');
    image.src = video.thumbnail;
    image.loading = 'lazy';
    card.appendChild(image);

    const spinner = document.createElement('div');
    spinner.className = 'ke-spinner-overlay';
    spinner.innerHTML = '<div class="ke-spinner"></div>';
    card.appendChild(spinner);

    const copied = document.createElement('div');
    copied.className = 'ke-copied-overlay';
    copied.textContent = 'Copied';
    card.appendChild(copied);

    const failed = document.createElement('div');
    failed.className = 'ke-failed-overlay';
    failed.textContent = 'Failed to load';
    card.appendChild(failed);

    const favorite = document.createElement('button');
    favorite.className = 'ke-fav-toggle';
    favorite.textContent = '\u2661';
    favorite.disabled = true;
    favorite.addEventListener('click', async event => {
        event.stopPropagation();
        favorite.disabled = true;
        try {
            const nowFavorite = await toggleFav(video.id);
            favorite.textContent = nowFavorite ? '\u2764' : '\u2661';
            favorite.classList.toggle('active', nowFavorite);
        } catch (error) { favorite.title = String(error); console.error(error); }
        finally { favorite.disabled = false; }
    });
    void isFav(video.id).then(isFavorite => {
        favorite.textContent = isFavorite ? '\u2764' : '\u2661';
        favorite.classList.toggle('active', isFavorite);
        favorite.disabled = false;
    }).catch(error => { favorite.title = String(error); console.error(error); });
    card.appendChild(favorite);

    let ready = false;
    let checked = false;
    const markChecked = (resolution: CardResolution): void => {
        if (resolution.state === 'failed') {
            ready = false;
            card.classList.add('ke-failed');
            card.setAttribute('aria-disabled', 'true');
            failed.title = resolution.message;
            failed.style.display = 'flex';
            syncCardHighlight(card);
            return;
        }
        if (checked) return;
        checked = true;
        card.setAttribute('data-video-checked', 'true');
        card.classList.remove('ke-failed');
        failed.style.display = 'none';
        if (resolution.state === 'unavailable') {
            card.classList.add('ke-unavailable');
            card.setAttribute('data-video-unavailable', 'true');
            card.setAttribute('aria-disabled', 'true');
            return;
        }
        ready = true;
        if (!disabled) card.removeAttribute('aria-disabled');
        card.setAttribute('data-video-src', resolution.videoSrc);
        card.style.opacity = '1';
        syncCardHighlight(card);
    };

    card.addEventListener('click', async () => {
        if (disabled || !ready || card.hasAttribute('data-card-busy')) return;
        card.setAttribute('data-card-busy', 'true');
        spinner.style.display = 'flex';
        const videoSrc = card.getAttribute('data-video-src');
        try {
            // Invoke clipboard while the click still has user activation; persist before navigation.
            await Promise.all([
                writeCardHighlight(video),
                videoSrc ? navigator.clipboard.writeText(videoSrc).catch(error => console.warn('Could not copy media URL', error)) : Promise.resolve(),
            ]);
            copied.style.display = 'flex';
            onClick(video);
        } catch (error) {
            card.removeAttribute('data-card-busy');
            console.error('Could not save selected card', error);
        } finally {
            spinner.style.display = 'none';
        }
    });

    enqueue(provider, video.pageUrl, markChecked);

    return card;
}
