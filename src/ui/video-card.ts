import type { VideoStub } from '../types';
import { isFav, toggleFav } from '../storage/db';
import { getDetail, putDetail } from '../storage/db';
import { scrapeVideoDetail } from '../provider/ytb';

type CardClickHandler = (video: VideoStub) => void;

export function createVideoCard(video: VideoStub, onClick: CardClickHandler): HTMLElement {
    const card = document.createElement('div');
    card.className = 'ke-card';
    card.setAttribute('data-video-id', video.id);

    const img = document.createElement('img');
    img.src = video.thumbnail;
    img.alt = '';
    img.loading = 'lazy';
    card.appendChild(img);

    // Loading spinner overlay
    const spinner = document.createElement('div');
    spinner.className = 'ke-spinner-overlay';
    spinner.innerHTML = '<div class="ke-spinner"></div>';
    spinner.style.display = 'none';
    card.appendChild(spinner);

    // Copied overlay
    const copied = document.createElement('div');
    copied.className = 'ke-copied-overlay';
    copied.textContent = 'Copied';
    copied.style.display = 'none';
    card.appendChild(copied);

    // Fav toggle button
    const favBtn = document.createElement('button');
    favBtn.className = 'ke-fav-toggle';
    favBtn.textContent = '\u2661';
    favBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const nowFav = await toggleFav(video.id);
        favBtn.textContent = nowFav ? '\u2764' : '\u2661';
        favBtn.classList.toggle('active', nowFav);
    });
    void isFav(video.id).then(fav => {
        favBtn.textContent = fav ? '\u2764' : '\u2661';
        favBtn.classList.toggle('active', fav);
    });
    card.appendChild(favBtn);

    // Click handler with state machine: idle → activating → copied
    let busy = false;
    card.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        spinner.style.display = 'flex';

        try {
            const cached = await getDetail(video.pageUrl);
            if (!cached) {
                const detail = await scrapeVideoDetail(video.pageUrl);
                await putDetail(video.pageUrl, detail);
            }
        } catch { /* scroll prefetch coverage, data will be there */ }

        spinner.style.display = 'none';
        copied.style.display = 'flex';
        setTimeout(() => { copied.style.display = 'none'; busy = false; }, 1200);

        onClick(video);
    });

    return card;
}

export async function prefetchDetails(videos: VideoStub[]): Promise<void> {
    const toScrape: VideoStub[] = [];
    for (const v of videos) {
        const cached = await getDetail(v.pageUrl);
        if (!cached) toScrape.push(v);
    }
    if (toScrape.length === 0) return;

    for (const v of toScrape) {
        try {
            const detail = await scrapeVideoDetail(v.pageUrl);
            await putDetail(v.pageUrl, detail);
        } catch (e) {
            console.error('[prefetch] scrape failed for', v.pageUrl, e);
        }
    }
}
