import { compute } from '../core/compute/transport';
export const getFavs = () => compute<string[]>('favorites');
export const isFav = (id: string) => compute<boolean>('favorite-is', id);
export const toggleFav = (id: string) => compute<boolean>('favorite-toggle', id);
export const mergeFavs = (ids: string[]) => compute<number>('favorite-merge', ids);
