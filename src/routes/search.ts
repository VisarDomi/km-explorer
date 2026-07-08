import {getAllVideos, putVideos} from '../storage/db';
import {BATCH, fetchTypesenseBatch} from '../provider/ytb';
import {getGrid, startInit} from '../ui/shell';
import {createVideoCard} from '../ui/video-card';
import type {VideoStub} from '../types';
import {onVideoClick} from "../core/videos";

const CLIENT_SIZE = BATCH * 12;
const SITE_SIZE = 30;
const PER_SITE = CLIENT_SIZE / SITE_SIZE;

let totalClientPages = 0;

function siteToClient(sitePage: number): number {
    return Math.ceil(sitePage / PER_SITE);
}

function clientToSite(clientPage: number): number {
    return (clientPage - 1) * PER_SITE + 1;
}

function absoluteIndex(sitePage: number, clientPage: number): number {
    return (sitePage - 1) * SITE_SIZE - (clientPage - 1) * CLIENT_SIZE;
}

const LS_KEY = 'ke-scroll';
function saveScroll(): void {
    try { localStorage.setItem(LS_KEY + location.pathname, String(window.scrollY)); } catch { /* corrupt */ }
}
function loadScroll(): number | null {
    try {
        const v = localStorage.getItem(LS_KEY + location.pathname);
        return v !== null ? parseInt(v, 10) : null;
    } catch { return null; }
}

async function fetchBatch(page: number): Promise<VideoStub[]> {
    const startBatch = Math.max(1, (page - 1) * BATCH + 1);
    const results = await fetchTypesenseBatch(startBatch);
    const first = results[0];
    if (first && first.found > 0) {
        totalClientPages = Math.ceil(Math.ceil(first.found / 12) / BATCH);
    }

    const videos: VideoStub[] = [];
    let idx = (startBatch - 1) * 12;
    for (const p of results) {
        for (const v of p.items) {
            videos[idx++] = v;
        }
    }

    const knownIds = new Set((await getAllVideos()).map(v => v.id));
    const newVideos: VideoStub[] = [];
    for (const p of results) {
        for (const v of p.items) {
            if (!knownIds.has(v.id)) {
                knownIds.add(v.id);
                newVideos.push(v);
            }
        }
    }
    if (newVideos.length > 0) await putVideos(newVideos);

    return videos;
}

function makeBar(page: number): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'ke-pagination';

    const link = document.createElement('a');
    link.href = '/favs';
    link.textContent = 'Favs';
    link.className = 'ke-page-favs';
    link.style.cssText = 'color:#f87171;text-decoration:none;font-size:13px;font-weight:600;padding:0 6px;align-self:center';
    bar.appendChild(link);

    for (let i = 1; i <= totalClientPages; i++) {
        const btn = document.createElement('button');
        btn.className = 'ke-page-btn';
        if (i === page) btn.classList.add('active');
        btn.textContent = String(i);
        btn.addEventListener('click', () => {
            window.location.href = clientToSite(i) === 1 ? '/' : `/page/${clientToSite(i)}/`;
        });
        bar.appendChild(btn);
    }
    return bar;
}

function buildPagination(page: number, grid: HTMLElement): void {
    document.querySelectorAll('.ke-pagination').forEach(el => el.remove());
    grid.before(makeBar(page));
    grid.after(makeBar(page));
}

async function renderPage(page: number, scrollToIndex?: number): Promise<void> {
    const grid = getGrid();
    grid.innerHTML = '<div class="ke-loading">Loading...</div>';

    const videos = await fetchBatch(page);
    const start = (page - 1) * CLIENT_SIZE;
    const slice = videos.slice(start, start + CLIENT_SIZE);

    grid.innerHTML = '';
    slice.forEach((v, i) => {
        const card = createVideoCard(v, onVideoClick);
        card.id = `ke-${start + i}`;
        grid.appendChild(card);
    });

    buildPagination(page, grid);

    if (scrollToIndex !== undefined) {
        const card = document.getElementById(`ke-${scrollToIndex}`);
        if (card) card.scrollIntoView();
    }
}

export async function init(sitePage: number): Promise<void> {
    startInit();

    const clientPage = siteToClient(sitePage);
    const scrollIdx = absoluteIndex(sitePage, clientPage);

    await renderPage(clientPage, scrollIdx);

    const savedY = loadScroll();
    if (savedY !== null) {
        requestAnimationFrame(() => { window.scrollTo(0, savedY); });
    }
    window.addEventListener('scrollend', () => { setTimeout(saveScroll, 100); });
    window.addEventListener('pagehide', saveScroll);
}
