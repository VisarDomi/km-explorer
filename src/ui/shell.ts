import cssContent from '../css/style.css?inline';
import { initializeStorage } from '../storage/initialize';

export async function startInit(): Promise<void> {
    window.stop();
    document.open();
    document.close();
    if (!document.documentElement) document.appendChild(document.createElement('html'));
    if (!document.head) document.documentElement.appendChild(document.createElement('head'));
    if (!document.body) document.documentElement.appendChild(document.createElement('body'));
    const style = document.createElement('style');
    style.textContent = cssContent;
    document.head.appendChild(style);
    const loading = document.createElement('div');
    loading.className = 'ke-loading';
    loading.textContent = 'Loading…';
    document.body.appendChild(loading);
    try { await initializeStorage(); loading.remove(); }
    catch (error) { loading.textContent = 'Could not load KM data. Keep website data intact and reload to retry.'; throw error; }
}

export function getGrid(): HTMLElement {
    let grid = document.getElementById('ke-grid');
    if (!grid) {
        grid = document.createElement('div');
        grid.id = 'ke-grid';
        grid.className = 'ke-grid';
        document.body.appendChild(grid);
    }
    return grid;
}
