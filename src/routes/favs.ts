import type { Provider } from '../provider';
import { getFavs, mergeFavs } from '../storage/favorites';
import { getVideos } from '../core/videos';
import { startInit, getGrid } from '../ui/shell';
import { centerStoredCardHighlight, createVideoCard } from '../ui/video-card';
import { replacePagination } from '../ui/pagination';
import type { VideoStub } from '../types';

function render(videos: VideoStub[], provider: Provider): void {
    const grid = getGrid();
    grid.innerHTML = '';
    for (const video of videos) {
        grid.appendChild(createVideoCard(video, selected => {
            window.location.href = selected.pageUrl;
        }, provider));
    }
    if (videos.length === 0) {
        grid.innerHTML = '<div class="ke-empty">No favorites yet</div>';
    }
}

function buildImportSection(provider: Provider): void {
    const panel = document.createElement('section');
    panel.className = 'ke-import-panel';

    const reveal = document.createElement('button');
    reveal.className = 'ke-io-btn';
    reveal.textContent = 'Import / Merge';

    const textarea = document.createElement('textarea');
    textarea.className = 'ke-import-textarea';
    textarea.placeholder = 'Paste IDs (space, newline, comma separated)';
    textarea.hidden = true;

    const actions = document.createElement('div');
    actions.className = 'ke-import-actions';

    const merge = document.createElement('button');
    merge.className = 'ke-io-btn ke-io-merge';
    merge.textContent = 'Merge';
    merge.hidden = true;

    const exportButton = document.createElement('button');
    exportButton.className = 'ke-io-btn';
    exportButton.textContent = 'Export';

    const status = document.createElement('span');
    status.className = 'ke-import-status';

    const showEditor = (): void => {
        reveal.hidden = true;
        textarea.hidden = false;
        merge.hidden = false;
    };

    reveal.addEventListener('click', showEditor);
    exportButton.addEventListener('click', () => {
        textarea.value = getFavs().join('\n');
        showEditor();
    });
    merge.addEventListener('click', async () => {
        const imported = [...textarea.value.matchAll(/\d+/g)].map(match => match[0]);
        if (imported.length === 0) {
            status.textContent = 'No IDs found';
            return;
        }

        merge.disabled = true;
        merge.textContent = 'Merging...';
        try {
            const added = mergeFavs(imported);
            render(await getVideos(getFavs(), provider), provider);
            status.textContent = `Added ${added} of ${imported.length} IDs`;
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
        } finally {
            merge.disabled = false;
            merge.textContent = 'Merge';
        }
    });

    actions.append(reveal, merge, exportButton, status);
    panel.append(textarea, actions);
    document.body.appendChild(panel);
}

export async function init(provider: Provider): Promise<void> {
    startInit();
    const grid = getGrid();
    grid.innerHTML = '<div class="ke-loading">Loading...</div>';

    const ids = getFavs();
    render(await getVideos(ids, provider), provider);
    centerStoredCardHighlight();
    replacePagination(0, 0, provider, grid);
    buildImportSection(provider);

    void provider.fetchListingPageCount().then(totalPages => {
        replacePagination(0, totalPages, provider, grid);
    }).catch(error => {
        console.warn('Could not load listing page count', error);
    });
}
