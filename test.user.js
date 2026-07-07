// ==UserScript==
// @name         test v2
// @namespace    https://github.com/VisarDomi
// @version      2
// @match        https://www.google.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Simulate our takeover
    document.open();
    document.close();

    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:20px;left:20px;z-index:99999;background:#111;color:#fff;padding:16px;border-radius:8px;font:13px monospace;max-width:320px';
    document.body.appendChild(div);

    function log(msg, ok) {
        const line = document.createElement('div');
        line.style.color = ok ? '#4af626' : '#f44';
        line.textContent = (ok ? 'OK ' : 'FAIL ') + msg;
        div.appendChild(line);
    }

    function btn(label, fn) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'display:block;width:100%;margin:4px 0;padding:8px;font:13px monospace;border:1px solid #555;border-radius:4px;background:#333;color:#ccc;cursor:pointer';
        b.onclick = fn;
        div.appendChild(b);
    }

    // Test with doc.open/close (our app's pattern)
    btn('After doc.open: writeText after fetch', async () => {
        try {
            const r = await fetch('https://www.google.com/');
            await navigator.clipboard.writeText(r.url);
            log('writeText after fetch (doc.open)', true);
        } catch(e) {
            log('FAIL: ' + e.message, false);
        }
    });

    btn('After doc.open: sync writeText', async () => {
        try {
            await navigator.clipboard.writeText('sync');
            log('sync writeText (doc.open)', true);
        } catch(e) {
            log('FAIL: ' + e.message, false);
        }
    });
})();
