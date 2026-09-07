import * as db from './database';
import { backupControl, type BackupCommand } from '../backup-engine';
interface Request { id: number; op: string; args?: any[] }
let writes = Promise.resolve();
async function handle({ op, args = [] }: Request): Promise<unknown> {
    if (op === 'backup-control') return backupControl(args[0] as BackupCommand, {
        capture: async () => { await writes; return db.captureSnapshot(); },
        restore: async value => {
            const task = writes.then(() => db.restoreSnapshot(value));
            writes = task.catch(() => {});
            await task;
        }, stats: db.snapshotStats,
    });
    if (op === 'suspend') { db.suspendDatabase(); return; }
    const methods = { getAllVideos: db.getAllVideos, putVideos: db.putVideos, getVideosByIds: db.getVideosByIds, getDetail: db.getDetail, putDetail: db.putDetail, getCachedChannel: db.getCachedChannel, setCachedChannel: db.setCachedChannel };
    if (Object.hasOwn(methods, op)) return (methods[op as keyof typeof methods] as Function)(...args);
    if (op === 'ready') return db.preferences(p => ({ value: Boolean(p) }));
    if (op === 'migrate') return db.migratePreferences(args[0]);
    const write = ['favorite-toggle', 'favorite-merge', 'highlight-save', 'scroll-save'].includes(op);
    return db.preferences(p => {
        if (!p) throw new Error('KM storage not initialized');
        let value: unknown;
        switch (op) {
            case 'favorites': value = p.favorites; break;
            case 'favorite-is': value = p.favorites.includes(args[0]); break;
            case 'favorite-toggle': {
                const id = args[0];
                if (typeof id !== 'string' || !id) throw new Error('Invalid favorite');
                const index = p.favorites.indexOf(id);
                if (index < 0) p.favorites.unshift(id); else p.favorites.splice(index, 1);
                value = index < 0; break;
            }
            case 'favorite-merge': {
                if (!Array.isArray(args[0]) || !args[0].every((id: unknown) => typeof id === 'string')) throw new Error('Invalid favorite import');
                const existing = new Set(p.favorites);
                const added = args[0].filter((id: string) => { if (!id || existing.has(id)) return false; existing.add(id); return true; });
                p.favorites.unshift(...added); value = added.length; break;
            }
            case 'highlight': value = p.highlight; break;
            case 'highlight-save': p.highlight = args[0]; break;
            case 'scroll': value = p.scroll[args[0]] ?? null; break;
            case 'scroll-save': p.scroll[args[0]] = args[1]; break;
            default: throw new Error('Unknown storage operation');
        }
        return { value, next: write ? p : undefined };
    }, write);
}
self.onmessage = ({ data }: MessageEvent<Request>) => {
    const run = async () => {
        try { self.postMessage({ id: data.id, ok: true, value: await handle(data) }); }
        catch (error) { self.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) }); }
    };
    if (data.op === 'backup-control' || data.op === 'suspend') void run();
    else writes = writes.then(run);
};
