import * as db from '../services/db.js';
import type { VideoStub } from '../types.js';
import type { ToastState } from './toast.svelte.js';

export class FavoritesState {
    items = $state<VideoStub[]>([]);
    private ids = $state<Set<string>>(new Set());

    constructor(private toast: ToastState) {}

    async init() {
        try {
            const all = await db.getAllFavorites();
            this.items = all;
            this.ids = new Set(all.map(v => v.id));
        } catch {
            // silent — favorites are non-critical
        }
    }

    isFavorited(id: string): boolean {
        return this.ids.has(id);
    }

    async toggle(video: VideoStub) {
        const was = this.isFavorited(video.id);
        // Optimistic update
        if (was) {
            this.items = this.items.filter(v => v.id !== video.id);
            this.ids = new Set(this.items.map(v => v.id));
        } else {
            this.items = [...this.items, video];
            this.ids = new Set(this.items.map(v => v.id));
        }
        try {
            if (was) {
                await db.removeFavorite(video.id);
                this.toast.show('Removed from favorites');
            } else {
                await db.addFavorite($state.snapshot(video));
                this.toast.show('Added to favorites');
            }
        } catch (e) {
            console.error('[favorites] toggle failed:', e);
            // Revert
            if (was) {
                this.items = [...this.items, video];
            } else {
                this.items = this.items.filter(v => v.id !== video.id);
            }
            this.ids = new Set(this.items.map(v => v.id));
            this.toast.show('Failed to update favorites');
        }
    }
}
