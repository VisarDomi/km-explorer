import type { Provider } from '../provider';
import { navigate } from '../ui/navigation';
import { getAllVideos, putVideos } from '../storage/db';
import { getGrid, startInit } from '../ui/shell';
import { centerStoredCardHighlight, createVideoCard } from '../ui/video-card';
import { replacePagination } from '../ui/pagination';
import { compute } from '../core/compute/transport';
import { onSettledScroll } from '../core/scroll-settle';

function saveScroll(): void {
    void compute('scroll-save', location.pathname, Math.max(0, window.scrollY)).catch(console.error);
}

function loadScroll(): Promise<number | null> {
    return compute('scroll', location.pathname);
}

export async function init(provider: Provider, sitePage: number): Promise<void> {
    await startInit();

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
            navigate(selected.pageUrl);
        });
        card.id = `ke-${index}`;
        grid.appendChild(card);
    });
    replacePagination(clientPage, result.totalClientPages, provider, grid);
    centerStoredCardHighlight();

    const savedY = await loadScroll();
    if (savedY !== null) {
        requestAnimationFrame(() => window.scrollTo(0, savedY));
    } else {
        document.getElementById(`ke-${targetIndex}`)?.scrollIntoView();
    }

    onSettledScroll(saveScroll);
    window.addEventListener('pagehide', saveScroll);
}
