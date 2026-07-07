// ==UserScript==
// @name         test v6
// @namespace    https://github.com/VisarDomi
// @version      6
// @description  clipboard test
// @match        https://ytboob.com/*
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    document.open();
    document.close();

    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:20px;left:20px;z-index:99999;background:#111;color:#fff;padding:16px;border-radius:8px;font:12px monospace;max-width:400px';
    document.body.appendChild(div);

    const srcs = [
        'https://vidhost.me/videos/un97nv.mp4',
        'https://vidhost.me/uploads/20260705_YTB_1.mp4',
        'https://vidhost.me/uploads/20260705_YTB_2.mp4',
        'https://vidhost.me/videos/1lcljra.mp4',
    ];

    function log(msg, ok) {
        const line = document.createElement('div');
        line.style.color = ok ? '#4af626' : '#f44';
        line.textContent = (ok ? 'OK ' : 'FAIL ') + msg;
        div.appendChild(line);
    }

    // Test 1: sync writeText
    doBtn(`writeText sync: ${srcs[0]}`, async () => {
        await navigator.clipboard.writeText(srcs[0]);
        log('writeText sync', true);
    });

    // Test 2: IndexedDB read + writeText (cached path)
    doBtn(`writeText after IDB: ${srcs[1]}`, async () => {
        const DB = 'test-db';
        const db = await new Promise((res, rej) => {
            const r = indexedDB.open(DB, 1);
            r.onupgradeneeded = () => r.result.createObjectStore('t', {keyPath:'k'});
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        });
        await new Promise(res => {
            db.transaction('t','readonly').objectStore('t').get('x').onsuccess = e => res(e.target.result);
        });
        await navigator.clipboard.writeText(srcs[1]);
        log('writeText after IDB', true);
    });

    // Test 3: fetch scrape + writeText (cache-miss path)
    doBtn(`writeText after fetch: ${srcs[2]}`, async () => {
        const r = await fetch('/vidcon-2019-final-day-model-photoshoots-venice-beach/');
        const html = await r.text();
        const m = html.match(/<meta[^>]+itemprop=["']contentURL["'][^>]+content=["']([^"']+)["']/i);
        const src = m ? m[1] : html.match(/https?:\/\/vidhost\.me\/videos\/[^"'\s#]+/)?.[0] || srcs[2];
        await navigator.clipboard.writeText(src);
        log('writeText after fetch', true);
    });

    // Test 4: ClipboardItem (Safari transient activation fix)
    doBtn(`ClipboardItem: ${srcs[3]}`, async () => {
        const item = new ClipboardItem({
            'text/plain': (async () => {
                const r = await fetch('/big-tits-big-ass-blonde-girl-in-pink-lace-panties/');
                const html = await r.text();
                const m = html.match(/<meta[^>]+itemprop=["']contentURL["'][^>]+content=["']([^"']+)["']/i);
                const src = m ? m[1] : srcs[3];
                return new Blob([src], { type: 'text/plain' });
            })(),
        });
        await navigator.clipboard.write([item]);
        log('ClipboardItem', true);
    });

    function doBtn(label, fn) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = 'display:block;width:100%;margin:4px 0;padding:8px;font:10px monospace;border:1px solid #555;border-radius:4px;background:#333;color:#ccc;cursor:pointer;text-align:left';
        btn.addEventListener('click', async () => {
            try { await fn(); } catch(e) { log(label + ': ' + e.message, false); }
        });
        div.appendChild(btn);
    }
})();
