import cssContent from '../css/style.css?inline';

export function startInit(): void {
    document.open();
    document.close();
    const style = document.createElement('style');
    style.textContent = cssContent;
    document.head.appendChild(style);
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
