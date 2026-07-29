import type { Provider } from '../provider';

export function createPagination(
    activePage: number,
    totalPages: number,
    provider: Provider,
): HTMLElement {
    const bar = document.createElement('nav');
    bar.className = 'ke-pagination';
    bar.setAttribute('aria-label', 'Client pages');

    const favorites = document.createElement('button');
    favorites.className = 'ke-page-btn ke-page-favs';
    favorites.textContent = '0';
    favorites.setAttribute('aria-label', 'Favorites');
    favorites.classList.toggle('active', activePage === 0);
    favorites.addEventListener('click', () => {
        window.location.href = '/';
    });
    bar.appendChild(favorites);

    for (let page = 1; page <= totalPages; page++) {
        const button = document.createElement('button');
        button.className = 'ke-page-btn';
        button.classList.toggle('active', page === activePage);
        button.textContent = String(page);
        button.addEventListener('click', () => {
            window.location.href = `/page/${provider.sitePageForClientPage(page)}/`;
        });
        bar.appendChild(button);
    }

    return bar;
}

export function replacePagination(
    activePage: number,
    totalPages: number,
    provider: Provider,
    grid: HTMLElement,
): void {
    document.querySelectorAll('.ke-pagination').forEach(element => element.remove());
    grid.before(createPagination(activePage, totalPages, provider));
    grid.after(createPagination(activePage, totalPages, provider));
}
