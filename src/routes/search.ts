import type { Provider } from '../provider';
import { getAllVideos, putVideos } from '../storage/db';
import { getGrid, startInit } from '../ui/shell';
import { centerStoredCardHighlight, createVideoCard } from '../ui/video-card';
import { replacePagination } from '../ui/pagination';

const SCROLL_KEY = 'ke-scroll';

function saveScroll(): void {
    localStorage.setItem(SCROLL_KEY + location.pathname, String(window.scrollY));
}

function loadScroll(): number | null {
    const raw = localStorage.getItem(SCROLL_KEY + location.pathname);
    if (raw === null) return null;

    const position = Number(raw);
    if (!Number.isFinite(position) || position < 0) throw new Error('Stored scroll position is invalid');
    return position;
}

export async function init(provider: Provider, sitePage: number): Promise<void> {
    startInit();

    const clientPage = provider.clientPageForSitePage(sitePage);
    const targetIndex = provider.indexForSitePage(sitePage, clientPage);
    const grid = getGrid();
    grid.innerHTML = '<div class="ke-loading">Loading...</div>';

    const result = await provider.fetchListing(clientPage);
    const knownIds = new Set((await getAllVideos()).map(video => video.id));
    const unseen = result.videos.filter(video => !knownIds.has(video.id));
    if (unseen.length > 0) await putVideos(unseen);

    grid.innerHTML = '';
    result.videos.forEach((video, index) => {
        const card = createVideoCard(video, selected => {
            window.location.href = selected.pageUrl;
        }, provider);
        card.id = `ke-${index}`;
        grid.appendChild(card);
    });
    replacePagination(clientPage, result.totalClientPages, provider, grid);
    centerStoredCardHighlight();

    const savedY = loadScroll();
    if (savedY !== null) {
        requestAnimationFrame(() => window.scrollTo(0, savedY));
    } else {
        document.getElementById(`ke-${targetIndex}`)?.scrollIntoView();
    }

    window.addEventListener('scrollend', () => {
        setTimeout(saveScroll, 100);
    });
    window.addEventListener('pagehide', saveScroll);
}
