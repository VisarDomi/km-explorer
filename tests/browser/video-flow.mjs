// Complete built app + real worker/IDB. Provider/media/clipboard are controlled
// boundaries; Safari phone tests separately validate native clipboard and Back.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '../../../../manga/gallery-downloader/node_modules/playwright-core/index.mjs';
const bundle=fs.readFileSync(process.env.KM_TEST_BUNDLE || 'dist/km-explorer.user.js','utf8');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
try {
    const context=await browser.newContext();
    const source='https://vidhost.me/videos/fixture.mp4';
    let detailFetches=0;
    await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.port==='7777')return route.abort('connectionrefused');
        if(url.hostname==='ts-api.ytboob.com')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{results:[{found:1,hits:[]}]}});
        if(url.hostname==='vidhost.me')return route.fulfill({contentType:'video/mp4',body:'deliberately invalid media'});
        if(url.pathname.endsWith('.jpg'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'});
        if(req.resourceType()==='fetch')detailFetches++;
        return route.fulfill({contentType:'text/html',body:`<!doctype html><meta itemprop="contentURL" content="${source}"><p>Fixture</p>`});
    });
    await context.addInitScript(()=>{
        window.copyCalls=[];
        window.rejectCopy=false;
        Object.defineProperty(navigator,'clipboard',{value:{writeText(text){window.copyCalls.push(text);return window.rejectCopy?Promise.reject(new Error('Denied')):Promise.resolve();}}});
    });
    const page=await context.newPage();
    await page.goto('https://ytboob.com/');
    await page.evaluate(async()=>{
        localStorage.setItem('km-explorer-favorites-v1','["1"]');
        const db=await new Promise((resolve,reject)=>{
            const r=indexedDB.open('km-explorer',4);
            r.onupgradeneeded=()=>{r.result.createObjectStore('videos',{keyPath:'id'});r.result.createObjectStore('details',{keyPath:'pageUrl'});r.result.createObjectStore('channels',{keyPath:'actorUrl'});};
            r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
        });
        await new Promise((resolve,reject)=>{const tx=db.transaction('videos','readwrite');tx.objectStore('videos').put({id:'1',pageUrl:'https://ytboob.com/fixture/',thumbnail:'https://ytboob.com/fixture.jpg'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
        db.close();
    });
    await page.addScriptTag({content:bundle});
    await page.locator('.ke-card .ke-fav-toggle:enabled').waitFor();
    assert.equal(detailFetches,0,'Home must not resolve thumbnail video sources');
    assert.deepEqual(await page.evaluate(()=>window.copyCalls),[]);
    await page.locator('.ke-card img').click();
    await page.waitForURL('https://ytboob.com/fixture/');
    await page.addScriptTag({content:bundle});
    const copy=page.getByRole('button',{name:'Copy video URL',exact:true});
    await copy.waitFor({state:'visible'});
    assert.equal(await page.locator('video').getAttribute('src'),source);
    assert.equal(detailFetches,1,'Only destination resolves the uncached source');
    assert.deepEqual(await page.evaluate(()=>window.copyCalls),[],'Arrival and media failure never copy automatically');
    assert.equal(await page.locator('.ke-copied-overlay,.ke-spinner-overlay').count(),0);
    await copy.click();
    await page.waitForFunction(()=>document.querySelector('.ke-video-copy')?.textContent==='Copied');
    assert.deepEqual(await page.evaluate(()=>window.copyCalls),[source]);
    await page.evaluate(()=>{window.rejectCopy=true;});
    await copy.click();
    await page.waitForFunction(()=>document.querySelector('.ke-video-copy')?.textContent==='Copy failed — tap to retry');
    await page.locator('video').dispatchEvent('playing');
    assert.equal(await copy.isVisible(),false,'Playback recovery hides the failure control');
    console.log('PASS: no thumbnail source fetch or clipboard work; immediate destination navigation; uncached video without actor renders; real media failure exposes Copy; only a tap copies, rejection is truthful, playback hides it.');
} finally {await browser.close();}
