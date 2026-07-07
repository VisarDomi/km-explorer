import type { VideoStub } from '../types';
import { isFav, toggleFav } from '../storage/db';
import { getDetail, putDetail } from '../storage/db';
import { scrapeVideoDetail } from '../provider/ytb';

type CardClickHandler = (video: VideoStub) => void;

// --- Background prefetch worker ---

const pending: Array<{ pageUrl: string; onReady: (videoSrc: string) => void }> = [];
let workerRunning = false;

async function runWorker(): Promise<void> {
    workerRunning = true;
    while (pending.length > 0) {
        const item = pending.shift()!;
        const detail = await scrapeVideoDetail(item.pageUrl);
        await putDetail(item.pageUrl, detail);
        item.onReady(detail.videoSrc);
    }
    workerRunning = false;
}

function enqueue(pageUrl: string, onReady: (videoSrc: string) => void): void {
    pending.push({ pageUrl, onReady });
    if (!workerRunning) void runWorker();
}

// --- Card factory ---

export function createVideoCard(video: VideoStub, onClick: CardClickHandler): HTMLElement {
    const card = document.createElement('div');
    card.className = 'ke-card';
    card.style.opacity = '0.4';
    card.setAttribute('data-video-id', video.id);

    const img = document.createElement('img');
    img.src = video.thumbnail;
    img.loading = 'lazy';
    card.appendChild(img);

    const srcText = document.createElement('span');
    srcText.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:2px 4px;background:rgba(0,0,0,0.7);color:#4af626;font:9px monospace;word-break:break-all;z-index:2;line-height:1.2';
    card.appendChild(srcText);

    const spinner = document.createElement('div');
    spinner.className = 'ke-spinner-overlay';
    spinner.innerHTML = '<div class="ke-spinner"></div>';
    spinner.style.display = 'none';
    card.appendChild(spinner);

    const copied = document.createElement('div');
    copied.className = 'ke-copied-overlay';
    copied.textContent = 'Copied';
    copied.style.display = 'none';
    card.appendChild(copied);

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

    let ready = false;
    let busy = false;

    function markReady(videoSrc: string): void {
        ready = true;
        card.setAttribute('data-video-src', videoSrc);
        card.style.opacity = '1';
        srcText.textContent = videoSrc;
    }

    function markActivating(): void {
        busy = true;
        spinner.style.display = 'flex';
    }

    function markCopied(): void {
        spinner.style.display = 'none';
        copied.style.display = 'flex';
        setTimeout(() => { copied.style.display = 'none'; busy = false; }, 1200);
    }

    card.addEventListener('click', async () => {
        if (!ready || busy) return;
        markActivating();

        const src = card.getAttribute('data-video-src');
        if (src) {
            await navigator.clipboard.writeText(src);
        }

        markCopied();
        onClick(video);
    });

    // Self-register: check cache → ready or enqueue
    void getDetail(video.pageUrl).then(detail => {
        if (detail) {
            markReady(detail.videoSrc);
        } else {
            enqueue(video.pageUrl, markReady);
        }
    });

    return card;
}
