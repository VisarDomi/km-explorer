// Built app + real worker/IndexedDB. Provider responses are local fixtures;
// no phone data or PC backup is touched. Run against userscript or extension.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '../../../../manga/gallery-downloader/node_modules/playwright-core/index.mjs';

const bundle = fs.readFileSync(process.env.KM_TEST_BUNDLE || 'dist/km-explorer.user.js', 'utf8');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 428, height: 800 } });
    await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.port === '7777') return route.abort('connectionrefused');
        if (url.hostname === 'ts-api.ytboob.com') {
            const page = JSON.parse(request.postData()).searches[0].page;
            const hits = page <= 5 ? Array.from({ length: 12 }, (_, i) => {
                const id = String((page - 1) * 12 + i + 1);
                return { document: { post_id: id, post_thumbnail: `https://ytboob.com/${id}.jpg`, permalink: `https://ytboob.com/fixture-${id}/` } };
            }) : [];
            return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { results: [{ found: 60, hits }] } });
        }
        if (url.pathname.endsWith('.jpg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>' });
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture</title>' });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(() => {
        // The test may inspect IDB, but the application must use its worker.
        window.fixtureIDB = indexedDB;
        Object.defineProperty(window, 'indexedDB', { get() { throw Error('Main-thread IndexedDB access'); } });
    });
    const inject = async () => {
        await page.addScriptTag({ content: bundle });
        await page.waitForFunction(() => document.querySelectorAll('.ke-card .ke-fav-toggle:enabled').length === 60);
    };
    const saved = () => page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
            const request = window.fixtureIDB.open('km-explorer');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise((resolve, reject) => {
                const request = db.transaction('preferences').objectStore('preferences').get('state');
                request.onsuccess = () => resolve(request.result?.scroll['/page/2/'] ?? null);
                request.onerror = () => reject(request.error);
            });
        } finally { db.close(); }
    });
    const waitSaved = async expected => {
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await saved() === expected) return;
            await page.waitForTimeout(20);
        }
        assert.equal(await saved(), expected, 'Persist the position captured when scrolling ended');
    };
    await page.goto('https://ytboob.com/page/2/');
    await inject();
    // Let initial provider-page alignment finish before driving scroll events.
    await page.waitForTimeout(150);
    await page.evaluate(() => {
        window.addEventListener('scrollend', event => {
            if (event.isTrusted) event.stopImmediatePropagation();
        }, true);
        scrollTo(0, 320);
        dispatchEvent(new Event('scrollend'));
        // A later position without another scrollend must not replace the
        // snapshot already sent to the worker (the old timer captured this).
        scrollTo(0, 640);
    });
    await waitSaved(320);
    await page.waitForTimeout(150);
    assert.equal(await saved(), 320);
    await page.evaluate(() => dispatchEvent(new Event('scrollend')));
    await waitSaved(640);
    await page.reload();
    await inject();
    await page.waitForFunction(() => Math.abs(scrollY - 640) < 1);
    assert.deepEqual(errors, []);
    console.log('PASS: scrollend captures position immediately; worker persistence, subsequent save, and reload restoration; no application main-thread IndexedDB access.');
} finally { await browser.close(); }
