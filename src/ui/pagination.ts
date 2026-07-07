export function renderPagination(
    currentPage: number,
    totalPages: number,
    onPage: (page: number) => void,
): void {
    // Remove existing pagination
    document.querySelectorAll('.ke-pagination').forEach(el => el.remove());

    if (totalPages <= 1) return;

    const build = (container: HTMLElement) => {
        for (let i = 0; i < totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = 'ke-page-btn';
            if (i === currentPage) btn.classList.add('active');
            btn.textContent = String(i + 1);
            btn.addEventListener('click', () => onPage(i));
            container.appendChild(btn);
        }
    };

    // Top
    const top = document.createElement('div');
    top.className = 'ke-pagination';
    build(top);
    const grid = document.getElementById('ke-grid');
    if (grid) grid.before(top);

    // Bottom
    const bottom = document.createElement('div');
    bottom.className = 'ke-pagination';
    build(bottom);
    if (grid) grid.after(bottom);
}
