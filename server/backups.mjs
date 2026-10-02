#!/usr/bin/env node
// PC backups for the Ytb app (`ytb`) and the KM Explorer userscript (`km-explorer`): HTTPS on port
// 7733, a private access key, and per-phone files holding the current and at most one previous snapshot.
//   node server/backups.mjs          serve
//   node server/backups.mjs status   print received backups (counts and labels only)
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const PORT = 7733;
export const ROOT = path.join(os.homedir(), '.local/share/km-explorer/backups');
const APPS = ['ytb', 'km-explorer'];
const PROVIDERS = ['ytboob'];
const ORIGINS = new Set(['https://ytboob.com']);
const LIMIT = 50 * 1024 * 1024; // Includes URL/catalog caches, never video media.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function privateDirectory(directory) {
    if (fs.existsSync(directory)) return;
    const parent = path.dirname(directory);
    privateDirectory(parent);
    fs.mkdirSync(directory, { mode: 0o700 });
    syncDirectory(parent);
}

function syncDirectory(directory) {
    const descriptor = fs.openSync(directory, 'r');
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

/** Write, fsync, rename, and fsync the parent directory. */
function durableWrite(file, text) {
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
        fs.writeFileSync(descriptor, text);
        fs.fsyncSync(descriptor);
    } finally { fs.closeSync(descriptor); }
    try { fs.renameSync(temporary, file); } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
    syncDirectory(path.dirname(file));
}

/** Favorites count; also rejects malformed snapshots. */
export function contentCount(data) {
    if (data?.version !== 1) throw new Error('Invalid snapshot version');
    const state = data.indexedDB;
    if (!state || !['videos', 'details', 'channels'].every(name => Array.isArray(state[name]))) throw new Error('Missing KM cache stores');
    const preferences = state.preferences;
    if (!preferences || !Array.isArray(preferences.favorites) || !preferences.favorites.every(id => typeof id === 'string' && id.length > 0)) throw new Error('Invalid KM favorites');
    if (!preferences.scroll || typeof preferences.scroll !== 'object' || Array.isArray(preferences.scroll) || !Object.values(preferences.scroll).every(y => Number.isFinite(y) && y >= 0)) throw new Error('Invalid KM scroll positions');
    if (preferences.highlight !== null && (!preferences.highlight || typeof preferences.highlight !== 'object' || typeof preferences.highlight.id !== 'string' || typeof preferences.highlight.pageUrl !== 'string')) throw new Error('Invalid KM highlight');
    return preferences.favorites.length;
}

export class BackupStore {
    constructor(root) { this.root = root; privateDirectory(root); }
    directory(app, provider) {
        if (!APPS.includes(app) || !PROVIDERS.includes(provider)) throw new Error('Unknown reader/provider');
        return path.join(this.root, app, provider);
    }
    file(app, provider, id) {
        if (!uuid.test(id)) throw new Error('Invalid backup ID');
        return path.join(this.directory(app, provider), `${id}.json`);
    }
    read(app, provider, id) {
        try { return JSON.parse(fs.readFileSync(this.file(app, provider, id), 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }
    list(app, provider) {
        const directory = this.directory(app, provider);
        if (!fs.existsSync(directory)) return [];
        return fs.readdirSync(directory).filter(name => name.endsWith('.json'))
            .map(name => this.read(app, provider, name.slice(0, -5)))
            .sort((a, b) => b.current.savedAt.localeCompare(a.current.savedAt));
    }
    put(app, provider, id, body) {
        const file = this.file(app, provider, id);
        if (typeof body?.label !== 'string' || !body.label.trim() || body.label.length > 80) throw new Error('Invalid backup name');
        const count = contentCount(body.data);
        const old = this.read(app, provider, id);
        // An idempotent retry after a lost acknowledgement must not rotate history.
        if (old && JSON.stringify(old.current.data) === JSON.stringify(body.data)) return old;
        if ((old?.current.revision ?? null) !== body.baseRevision) throw new Error('CONFLICT: backup changed; reload home before retrying');
        if (old && count === 0 && contentCount(old.current.data) > 0) throw new Error('CONFLICT: local data is now empty; revisit home to choose Backup or Restore. Existing backup preserved.');
        const backup = {
            id, label: body.label.trim(),
            current: { revision: randomUUID(), savedAt: new Date().toISOString(), data: body.data },
            previous: old?.current ?? null,
        };
        // Both generations live in ONE atomic file; a power loss cannot split rotation and publication.
        privateDirectory(path.dirname(file));
        durableWrite(file, JSON.stringify(backup));
        return backup;
    }
}

function send(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => { size += chunk.length; if (size <= LIMIT) chunks.push(chunk); });
        req.on('end', () => size > LIMIT ? reject(Object.assign(new Error('Backup too large'), { status: 413 })) : resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

/** Request handler for /api/reader-backups/<ytb|km-explorer>/ytboob[/<id>]. */
export function handler(root) {
    const store = new BackupStore(root);
    const keyFile = path.join(root, 'access-key');
    if (!fs.existsSync(keyFile)) durableWrite(keyFile, randomBytes(32).toString('hex'));
    const key = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim());
    return async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vary', 'Origin');
        // Worker fetch is allowed only from the reader origin; every data request still requires the private key.
        if (ORIGINS.has(req.headers.origin)) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        if (req.method === 'OPTIONS') {
            res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,PUT', 'Access-Control-Allow-Headers': 'Content-Type,X-Reader-Backup-Key' }).end();
            return;
        }
        const supplied = Buffer.from(String(req.headers['x-reader-backup-key'] ?? ''));
        if (key.length !== supplied.length || !timingSafeEqual(key, supplied)) return send(res, 401, { error: 'Backup access key required' });
        try {
            const parts = new URL(req.url, 'https://localhost').pathname.split('/').filter(Boolean).map(decodeURIComponent);
            if (parts[0] !== 'api' || parts[1] !== 'reader-backups') return send(res, 404, { error: 'Not found' });
            const [app, provider, id] = parts.slice(2);
            if (req.method === 'GET' && parts.length === 4) return send(res, 200, store.list(app, provider));
            if (req.method === 'PUT' && parts.length === 5) {
                let body;
                try { body = JSON.parse(await readBody(req)); } catch (error) { return send(res, error.status ?? 400, { error: String(error) }); }
                return send(res, 200, store.put(app, provider, id, body));
            }
            return send(res, 404, { error: 'Not found' });
        } catch (error) {
            return send(res, String(error).includes('CONFLICT:') ? 409 : 400, { error: String(error) });
        }
    };
}

function status(root) {
    const store = new BackupStore(root);
    const rows = APPS.flatMap(app => store.list(app, 'ytboob').map(backup => {
        const db = backup.current.data.indexedDB;
        return { app, phone: backup.label, id: backup.id.slice(0, 8), saved: backup.current.savedAt,
                 records: `${db.preferences.favorites.length} favorites; ${db.videos.length} videos; ${db.details.length} details; ${db.channels.length} channels`,
                 previous: backup.previous?.savedAt ?? 'none' };
    }));
    if (rows.length) console.table(rows);
    else console.log('No phone backups received yet.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv[2] === 'status') status(ROOT);
    else {
        const tls = { key: fs.readFileSync(path.join(os.homedir(), '.local/share/mkcert/pwa/key.pem')),
                      cert: fs.readFileSync(path.join(os.homedir(), '.local/share/mkcert/pwa/cert.pem')) };
        const handle = handler(ROOT);
        https.createServer(tls, (req, res) => {
            res.on('finish', () => console.log(req.method, new URL(req.url, 'https://localhost').pathname.replace(/[0-9a-f-]{36}$/i, id => id.slice(0, 8)), res.statusCode));
            handle(req, res);
        }).listen(PORT, '0.0.0.0', () => console.log('Ytb backups on port ' + PORT));
    }
}
