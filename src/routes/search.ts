import type { Provider } from '../provider';
import { getAllVideos, putVideos } from '../storage/db';
import { getGrid, startInit } from '../ui/shell';
import { createVideoCard } from '../ui/video-card';
import { replacePagination } from '../ui/pagination';

const SCROLL_KEY = 'ke-scroll';

function saveScroll(): void {
    try {
        localStorage.setItem(SCROLL_KEY + location.pathname, String(window.scrollY));
    } catch {
        // Storage can be unavailable in private browsing.
    }
}

function loadScroll(): number | null {
    try {
        const value = localStorage.getItem(SCROLL_KEY + location.pathname);
        return value === null ? null : Number.parseInt(value, 10);
    } catch {
        return null;
    }
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
