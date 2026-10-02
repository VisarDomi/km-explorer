import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BackupStore, handler } from './backups.mjs';

const snapshot = { version: 1, indexedDB: { videos: [{ id: '42', thumbnail: 'https://example.test/thumb.jpg', pageUrl: 'https://ytboob.com/fixture/' }],
    details: [], channels: [], preferences: { favorites: ['42'], highlight: null, scroll: { '/page/2/': 123 } } } };
const withFavorites = favorites => ({ ...snapshot, indexedDB: { ...snapshot.indexedDB, preferences: { ...snapshot.indexedDB.preferences, favorites } } });

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytb-backup-test-'));
    return { root, store: new BackupStore(root), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

for (const app of ['ytb', 'km-explorer']) {
    test(`${app} snapshots retain all caches, isolate phones, rotate once, and reject empty favorite loss`, () => {
        const { root, store, cleanup } = fixture();
        const id = randomUUID();
        try {
            const first = store.put(app, 'ytboob', id, { label: 'Phone', baseRevision: null, data: snapshot });
            assert.deepEqual(store.put(app, 'ytboob', id, { label: 'Phone', baseRevision: null, data: snapshot }), first);
            const second = store.put(app, 'ytboob', id, { label: 'Phone', baseRevision: first.current.revision, data: withFavorites(['42', '43']) });
            assert.deepEqual(second.previous, first.current);
            assert.throws(() => store.put(app, 'ytboob', id, { label: 'Phone', baseRevision: second.current.revision, data: withFavorites([]) }), /local data is now empty/);
            const copy = store.put(app, 'ytboob', randomUUID(), { label: 'Restored phone', baseRevision: null, data: second.current.data });
            assert.notEqual(copy.id, id);
            assert.deepEqual(store.read(app, 'ytboob', id), second);
            assert.equal(store.list(app === 'ytb' ? 'km-explorer' : 'ytb', 'ytboob').length, 0);
            assert.equal(fs.statSync(store.file(app, 'ytboob', id)).mode & 0o777, 0o600);
            assert.equal(fs.statSync(root).mode & 0o777, 0o700);
        } finally { cleanup(); }
    });
}

test('invalid readers, IDs and snapshots are rejected', () => {
    const { store, cleanup } = fixture();
    try {
        assert.throws(() => store.list('gallery-reader', 'hitomi'));
        assert.throws(() => store.list('../elsewhere', 'ytboob'));
        assert.throws(() => store.read('ytb', 'ytboob', '../secret'));
        assert.throws(() => store.put('ytb', 'ytboob', randomUUID(), { label: 'Phone', data: { version: 1, indexedDB: {} }, baseRevision: null }));
    } finally { cleanup(); }
});

test('HTTP backups require the private key, allow only the reader origin, and never cache', async t => {
    const { root, cleanup } = fixture();
    const server = http.createServer(handler(root)).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); cleanup(); });
    const base = `http://127.0.0.1:${server.address().port}/api/reader-backups/ytb/ytboob`;
    const denied = await fetch(base);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('cache-control'), 'no-store');
    const preflight = await fetch(base, { method: 'OPTIONS', headers: { Origin: 'https://ytboob.com', 'Access-Control-Request-Method': 'PUT' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://ytboob.com');
    assert.equal((await fetch(base, { headers: { Origin: 'https://hitomi.la' } })).headers.get('access-control-allow-origin'), null);
    const headers = { 'X-Reader-Backup-Key': fs.readFileSync(path.join(root, 'access-key'), 'utf8'), 'Content-Type': 'application/json' };
    const saved = await fetch(base + '/' + randomUUID(), { method: 'PUT', headers, body: JSON.stringify({ label: 'Phone', baseRevision: null, data: snapshot }) });
    assert.equal(saved.status, 200);
    assert.equal((await (await fetch(base, { headers })).json()).length, 1);
    assert.equal((await fetch(base.replace('/ytb/', '/gallery-reader/'), { headers })).status, 400);
});
