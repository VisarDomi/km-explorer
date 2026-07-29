import type { Provider } from '../provider';
import { getDetail, isFav, putDetail, toggleFav } from '../storage/db';
import type { VideoStub } from '../types';

type CardClickHandler = (video: VideoStub) => void;
type ReadyCallback = (videoSrc: string) => void;

interface CacheTask {
    provider: Provider;
    callbacks: Set<ReadyCallback>;
}

const tasks = new Map<string, CacheTask>();
const queue: string[] = [];
const queued = new Set<string>();
let workerRunning = false;

function queueTask(pageUrl: string): void {
    if (queued.has(pageUrl)) return;
    queued.add(pageUrl);
    queue.push(pageUrl);
}

async function runWorker(): Promise<void> {
    if (workerRunning) return;
    workerRunning = true;
    try {
        while (queue.length > 0) {
            const pageUrl = queue.shift()!;
            queued.delete(pageUrl);
            const task = tasks.get(pageUrl);
            if (!task) continue;

            try {
                const cached = await getDetail(pageUrl);
                const detail = cached ?? await task.provider.fetchVideoDetail(pageUrl);
                if (!cached) await putDetail(pageUrl, detail);
                for (const callback of task.callbacks) callback(detail.videoSrc);
                tasks.delete(pageUrl);
            } catch (error) {
                console.warn(`Could not cache ${pageUrl}`, error);
            }
        }
    } finally {
        workerRunning = false;
    }
}

function enqueue(provider: Provider, pageUrl: string, callback: ReadyCallback): void {
    const existing = tasks.get(pageUrl);
    if (existing) {
        existing.callbacks.add(callback);
    } else {
        tasks.set(pageUrl, {
            provider,
            callbacks: new Set([callback]),
        });
    }
    queueTask(pageUrl);
    void runWorker();
}

export function restartCardCacheWorker(): void {
    for (const pageUrl of tasks.keys()) queueTask(pageUrl);
    void runWorker();
}

window.addEventListener('pageshow', event => {
    if (event.persisted) restartCardCacheWorker();
});

export function createVideoCard(
    video: VideoStub,
    onClick: CardClickHandler,
    provider: Provider,
): HTMLElement {
    const card = document.createElement('div');
    card.className = 'ke-card';
    card.style.opacity = '0.4';
    card.setAttribute('data-video-id', video.id);

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
    let busy = false;

    const markReady = (videoSrc: string): void => {
        if (ready) return;
        ready = true;
        card.setAttribute('data-video-src', videoSrc);
        card.style.opacity = '1';
    };

    card.addEventListener('click', async () => {
        if (!ready || busy) return;
        busy = true;
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

    void getDetail(video.pageUrl).then(detail => {
        if (detail) {
            markReady(detail.videoSrc);
        } else {
            enqueue(provider, video.pageUrl, markReady);
        }
    });

    return card;
}
