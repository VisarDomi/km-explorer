import type { Provider } from '../provider';
import { getDetail, isFav, putDetail, toggleFav } from '../storage/db';
import type { VideoStub } from '../types';

type CardClickHandler = (video: VideoStub) => void;
interface CardResolution {
    videoSrc: string;
    available: boolean;
}
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

const CARD_HIGHLIGHT_KEY = 'ke-card-highlight';

const tasks = new Map<string, CacheTask>();
const queue: string[] = [];
const queued = new Set<string>();
let workerGeneration = 0;
let runningGeneration: number | null = null;
let restartListenerInstalled = false;
let highlightCentered = false;

function readCardHighlight(): StoredCardIdentity | null {
    try {
        const value = JSON.parse(localStorage.getItem(CARD_HIGHLIGHT_KEY) ?? 'null') as StoredCardIdentity | null;
        return value
            && typeof value.id === 'string'
            && typeof value.pageUrl === 'string'
            ? value
            : null;
    } catch {
        return null;
    }
}

function writeCardHighlight(video: VideoStub): void {
    try {
        localStorage.setItem(CARD_HIGHLIGHT_KEY, JSON.stringify({
            id: video.id,
            pageUrl: video.pageUrl,
        } satisfies StoredCardIdentity));
    } catch {
        // Storage can be unavailable in private browsing.
    }
}

function cardMatchesHighlight(card: HTMLElement, highlight: StoredCardIdentity | null): boolean {
    return highlight !== null
        && card.dataset.videoId === highlight.id
        && card.dataset.videoPageUrl === highlight.pageUrl
        && card.getAttribute('aria-disabled') !== 'true';
}

function syncCardHighlight(card: HTMLElement, highlight = readCardHighlight()): void {
    card.classList.toggle('ke-returned-card', cardMatchesHighlight(card, highlight));
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
                const cached = await getDetail(pageUrl);
                if (generation !== workerGeneration) return;
                const detail = cached ?? await task.provider.fetchVideoDetail(pageUrl);
                if (generation !== workerGeneration) return;
                if (!cached) await putDetail(pageUrl, detail);
                if (generation !== workerGeneration) return;
                const resolution = {
                    videoSrc: detail.videoSrc,
                    available: isAvailableVideoSource(detail.videoSrc),
                };
                if (!resolution.available) task.terminalResolution = resolution;
                for (const callback of task.callbacks) callback(resolution);
            } catch (error) {
                console.warn(`Could not cache ${pageUrl}`, error);
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
    queue.length = 0;
    queued.clear();
    for (const pageUrl of tasks.keys()) queueTask(pageUrl);
    void runWorker();
}

function installRestartListener(): void {
    if (restartListenerInstalled) return;
    restartListenerInstalled = true;
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        const highlight = readCardHighlight();
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

    const favorite = document.createElement('button');
    favorite.className = 'ke-fav-toggle';
    favorite.textContent = '\u2661';
    favorite.addEventListener('click', async event => {
        event.stopPropagation();
        const nowFavorite = await toggleFav(video.id);
        favorite.textContent = nowFavorite ? '\u2764' : '\u2661';
        favorite.classList.toggle('active', nowFavorite);
    });
    void isFav(video.id).then(isFavorite => {
        favorite.textContent = isFavorite ? '\u2764' : '\u2661';
        favorite.classList.toggle('active', isFavorite);
    });
    card.appendChild(favorite);

    let ready = false;
    let checked = false;
    const markChecked = ({ videoSrc, available }: CardResolution): void => {
        if (checked) return;
        checked = true;
        card.setAttribute('data-video-checked', 'true');
        if (!available) {
            card.classList.add('ke-unavailable');
            card.setAttribute('data-video-unavailable', 'true');
            card.setAttribute('aria-disabled', 'true');
            return;
        }
        ready = true;
        card.setAttribute('data-video-src', videoSrc);
        card.style.opacity = '1';
    };

    card.addEventListener('click', async () => {
        if (disabled || !ready || card.hasAttribute('data-card-busy')) return;
        card.setAttribute('data-card-busy', 'true');
        writeCardHighlight(video);
        spinner.style.display = 'flex';
        const videoSrc = card.getAttribute('data-video-src');
        try {
            if (videoSrc) await navigator.clipboard.writeText(videoSrc);
        } catch (error) {
            console.warn('Could not copy media URL', error);
        } finally {
            spinner.style.display = 'none';
            copied.style.display = 'flex';
            onClick(video);
        }
    });

    enqueue(provider, video.pageUrl, markChecked);

    return card;
}
