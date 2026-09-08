import { isFav, toggleFav } from '../storage/favorites';
import type { VideoStub } from '../types';
import { compute } from '../core/compute/transport';

type CardClickHandler = (video: VideoStub) => void;
interface StoredCardIdentity { id: string; pageUrl: string }
let highlightRead: Promise<StoredCardIdentity | null> | undefined;
let lifecycleInstalled = false;
let highlightCentered = false;

function readCardHighlight(): Promise<StoredCardIdentity | null> {
    return highlightRead ??= compute('highlight');
}

function syncCardHighlight(card: HTMLElement, highlight: StoredCardIdentity | null): void {
    card.classList.toggle('ke-returned-card', highlight !== null
        && card.dataset.videoId === highlight.id
        && card.dataset.videoPageUrl === highlight.pageUrl
        && card.getAttribute('aria-disabled') !== 'true');
}

export function centerStoredCardHighlight(): void {
    if (highlightCentered || !document.querySelector('.ke-card.ke-returned-card')) return;
    highlightCentered = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.querySelector('.ke-card.ke-returned-card')?.scrollIntoView({ block: 'center' });
    }));
}

function installLifecycle(): void {
    if (lifecycleInstalled) return;
    lifecycleInstalled = true;
    window.addEventListener('reader-data-restored', () => {
        highlightRead = undefined;
        highlightCentered = false;
    });
    window.addEventListener('pageshow', async event => {
        if (!event.persisted) return;
        highlightRead = undefined;
        try {
            const highlight = await readCardHighlight();
            document.querySelectorAll<HTMLElement>('.ke-card').forEach(card => {
                card.removeAttribute('data-card-busy');
                syncCardHighlight(card, highlight);
            });
        } catch (error) {
            document.querySelectorAll('.ke-card').forEach(card => card.removeAttribute('data-card-busy'));
            console.error(error);
        }
    });
}

export function createVideoCard(
    video: VideoStub,
    onClick: CardClickHandler,
    { disabled = false }: { disabled?: boolean } = {},
): HTMLElement {
    installLifecycle();
    const card = document.createElement('div');
    card.className = 'ke-card';
    card.dataset.videoId = video.id;
    card.dataset.videoPageUrl = video.pageUrl;
    if (disabled) card.setAttribute('aria-disabled', 'true');
    void readCardHighlight().then(value => {
        syncCardHighlight(card, value);
        centerStoredCardHighlight();
    }).catch(console.error);

    const image = document.createElement('img');
    image.src = video.thumbnail;
    image.loading = 'lazy';
    card.appendChild(image);

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

    card.addEventListener('click', () => {
        if (disabled || card.hasAttribute('data-card-busy')) return;
        card.setAttribute('data-card-busy', 'true');
        const highlight = { id: video.id, pageUrl: video.pageUrl };
        highlightRead = Promise.resolve(highlight);
        // Queue the small preference write, but never gate navigation on it.
        // The destination resolves its own source; cards do no detail requests.
        void compute('highlight-save', highlight).catch(console.error);
        onClick(video);
    });
    return card;
}
