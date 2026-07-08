import { preloadFavs, mergeFavs } from '../storage/db';
import { startInit, getGrid } from '../ui/shell';
import { createVideoCard } from '../ui/video-card';
import type { VideoStub } from '../types';
import {getVideos, onVideoClick} from "../core/videos";

async function renderAll(videos: VideoStub[]): Promise<void> {
    const grid = getGrid();
    grid.innerHTML = '';

    for (const v of videos) {
        const videoCard = createVideoCard(v, onVideoClick)
        grid.appendChild(videoCard);
    }
}

function buildImportSection(ids: string[]): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'text-align:center;margin:16px 0';

    const btn = document.createElement('button');
    btn.textContent = 'Import / Merge';
    btn.style.cssText = 'background:#333;color:#ccc;border:1px solid #555;border-radius:4px;padding:6px 16px;font:13px monospace;cursor:pointer';

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Paste IDs (space, newline, comma separated)';
    textarea.style.cssText = 'display:none;width:100%;max-width:500px;min-height:40px;margin:8px auto;padding:8px;background:#111;color:#aaa;border:1px solid #555;border-radius:4px;font:13px monospace;resize:none;overflow:hidden;box-sizing:border-box';

    const mergeBtn = document.createElement('button');
    mergeBtn.textContent = 'Merge';
    mergeBtn.style.cssText = 'display:none;background:#4a4;color:#fff;border:none;border-radius:4px;padding:6px 16px;font:13px monospace;cursor:pointer;margin-left:8px';

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.style.cssText = 'background:#333;color:#ccc;border:1px solid #555;border-radius:4px;padding:6px 16px;font:13px monospace;cursor:pointer;margin-left:8px';

    const status = document.createElement('span');
    status.style.cssText = 'display:none;color:#aaa;font:12px monospace;margin-left:8px';

    const homeBtn = document.createElement('button');
    homeBtn.textContent = 'Home';
    homeBtn.style.cssText = 'background:#333;color:#ccc;border:1px solid #555;border-radius:4px;padding:6px 16px;font:13px monospace;cursor:pointer;margin-right:8px';
    homeBtn.addEventListener('click', () => { window.location.href = '/page/2/'; });

    const showImport = () => {
        textarea.style.display = 'block';
        mergeBtn.style.display = 'inline-block';
        btn.style.display = 'none';
        status.style.display = 'none';
    };

    btn.onclick = showImport;
    exportBtn.onclick = () => {
        textarea.value = ids.join('\n');
        showImport();
    };

    mergeBtn.onclick = async () => {
        const raw = textarea.value;
        const ids = [...raw.matchAll(/\d+/g)].map(m => m[0]);
        if (ids.length === 0) { status.textContent = 'No IDs found'; status.style.display = 'inline'; return; }
        mergeBtn.disabled = true;
        mergeBtn.textContent = 'Merging...';
        const added = await mergeFavs(ids);
        status.textContent = `Added ${added} of ${ids.length} IDs${ids.length - added > 0 ? ` (${ids.length - added} already existed)` : ''}`;
        status.style.display = 'inline';
        const newIds = await preloadFavs();
        const newVideos = await getVideos(newIds);
        void renderAll(newVideos);
        mergeBtn.disabled = false;
        mergeBtn.textContent = 'Merge';
    };

    wrap.appendChild(homeBtn);
    wrap.appendChild(btn);
    wrap.appendChild(textarea);
    wrap.appendChild(mergeBtn);
    wrap.appendChild(exportBtn);
    wrap.appendChild(status);
    document.body.appendChild(wrap);
}

export async function init(): Promise<void> {
    startInit();

    const ids = await preloadFavs();
    const videos = await getVideos(ids);
    void renderAll(videos);

    buildImportSection(ids);
}
