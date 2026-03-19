import type { NavEntry } from './navStack.svelte.js';
import * as storage from '../services/storage.js';

const SESSION_KEY = 'session';

export interface SessionSnapshot {
    entries: NavEntry[];
}

export function saveSession(snapshot: SessionSnapshot): void {
    storage.setJson(SESSION_KEY, snapshot);
}

export function loadSession(): SessionSnapshot | null {
    return storage.getJson<SessionSnapshot | null>(SESSION_KEY, null);
}
