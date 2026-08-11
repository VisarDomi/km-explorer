const FAVORITES_KEY = 'km-explorer-favorites-v1';
let cachedRaw: string | null | undefined;
let cachedFavorites: string[] = [];

function readFavorites(): string[] {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw === cachedRaw) return cachedFavorites;
    if (raw === null) {
        cachedRaw = null;
        cachedFavorites = [];
        return cachedFavorites;
    }

    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) throw new Error('Stored favorites are not an array');
    if (!value.every(item => typeof item === 'string' && item.length > 0)) {
        throw new Error('Stored favorites contain an invalid video ID');
    }
    cachedRaw = raw;
    cachedFavorites = value;
    return cachedFavorites;
}

function saveFavorites(favorites: string[]): void {
    const raw = JSON.stringify(favorites);
    localStorage.setItem(FAVORITES_KEY, raw);
    cachedRaw = raw;
    cachedFavorites = favorites;
}

export function getFavs(): string[] {
    return readFavorites();
}

export function isFav(id: string): boolean {
    return readFavorites().includes(id);
}

export function toggleFav(id: string): boolean {
    const favorites = readFavorites();
    const existingIndex = favorites.indexOf(id);
    if (existingIndex === -1) {
        saveFavorites([id, ...favorites]);
        return true;
    }

    favorites.splice(existingIndex, 1);
    saveFavorites(favorites);
    return false;
}

export function mergeFavs(ids: string[]): number {
    const favorites = readFavorites();
    const existing = new Set(favorites);
    const additions: string[] = [];
    for (const id of ids) {
        if (id.length === 0 || existing.has(id)) continue;
        existing.add(id);
        additions.push(id);
    }
    if (additions.length > 0) saveFavorites([...additions, ...favorites]);
    return additions.length;
}
