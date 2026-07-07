import { preloadFavs, mergeFavs, getVideosByIds, putVideos } from '../storage/db';
import { lookupByIds } from '../provider/ytb';
import { startInit, getGrid } from '../ui/shell';
import { createVideoCard } from '../ui/video-card';
import type { VideoStub } from '../types';

let _ids: string[] = [];
let _videos: VideoStub[] = [];

async function renderAll(): Promise<void> {
    const grid = getGrid();
    grid.innerHTML = '';

    for (const v of _videos) {
        if (!v) continue;
        grid.appendChild(createVideoCard(v, () => {}));
    }
}

function buildImportSection(): void {
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
        textarea.value = _ids.join('\n');
        showImport();
    };

    mergeBtn.onclick = async () => {
        const raw = textarea.value;
        const ids = [...raw.matchAll(/\d+/g)].map(m => m[0]).filter(Boolean);
        if (ids.length === 0) { status.textContent = 'No IDs found'; status.style.display = 'inline'; return; }
        mergeBtn.disabled = true;
        mergeBtn.textContent = 'Merging...';
        const added = await mergeFavs(ids);
        status.textContent = `Added ${added} of ${ids.length} IDs${ids.length - added > 0 ? ` (${ids.length - added} already existed)` : ''}`;
        status.style.display = 'inline';
        _ids = await preloadFavs();
        const map = await getVideosByIds(_ids);
        const missing = _ids.filter(id => !map.has(id));
        if (missing.length > 0) {
            const chunks: string[][] = [];
            for (let i = 0; i < missing.length; i += 100) chunks.push(missing.slice(i, i + 100));
            for (const chunk of chunks) {
                const fetched = await lookupByIds(chunk);
                if (fetched.length > 0) {
                    await putVideos(fetched);
                    for (const v of fetched) map.set(v.id, v);
                }
            }
        }
        _videos = _ids.map(id => map.get(id)!).filter(Boolean);
        void renderAll();
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

    _ids = await preloadFavs();

    if (_ids.length === 0) {
        getGrid().innerHTML = '<div class="ke-empty">No favorites yet</div>';
    } else {
        const map = await getVideosByIds(_ids);
        const missing = _ids.filter(id => !map.has(id));
        if (missing.length > 0) {
            const chunks: string[][] = [];
            for (let i = 0; i < missing.length; i += 100) chunks.push(missing.slice(i, i + 100));
            for (const chunk of chunks) {
                const fetched = await lookupByIds(chunk);
                if (fetched.length > 0) {
                    await putVideos(fetched);
                    for (const v of fetched) map.set(v.id, v);
                }
            }
        }
        _videos = _ids.map(id => map.get(id)!).filter(Boolean);
        void renderAll();
    }

    buildImportSection();
}
