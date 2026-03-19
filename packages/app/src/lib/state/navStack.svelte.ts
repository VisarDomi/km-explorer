import type { Actor } from '../types.js';

export type NavEntry =
    | { mode: 'list'; query: string; page: number; scrollTarget: string | null }
    | { mode: 'channel'; actor: Actor; page: number; scrollTarget: string | null }
    | { mode: 'favorites'; scrollTarget: string | null };

export class NavStack {
    entries = $state<NavEntry[]>([{ mode: 'list', query: '', page: 1, scrollTarget: null }]);

    get foreground(): NavEntry {
        return this.entries[this.entries.length - 1];
    }

    get viewMode(): 'list' | 'channel' | 'favorites' {
        return this.foreground.mode;
    }

    canGoBack(): boolean {
        return this.entries.length > 1;
    }

    peekBack(): 'list' | 'channel' | 'favorites' {
        if (this.entries.length < 2) return 'list';
        return this.entries[this.entries.length - 2].mode;
    }

    push(entry: NavEntry) {
        this.entries = [...this.entries, entry];
    }

    pop(): NavEntry | null {
        if (this.entries.length <= 1) return null;
        const top = this.entries[this.entries.length - 1];
        this.entries = this.entries.slice(0, -1);
        return top;
    }

    updateScrollTarget(videoId: string | null) {
        const fg = this.foreground;
        this.entries = [...this.entries.slice(0, -1), { ...fg, scrollTarget: videoId } as NavEntry];
    }

    resetToList(query: string) {
        this.entries = [{ mode: 'list', query, page: 1, scrollTarget: null }];
    }

    serialize(): NavEntry[] {
        return $state.snapshot(this.entries);
    }

    restoreFrom(entries: NavEntry[]) {
        if (entries.length === 0 || entries[0].mode !== 'list') {
            this.entries = [{ mode: 'list', query: '', page: 1, scrollTarget: null }];
            return;
        }
        this.entries = entries;
    }
}
