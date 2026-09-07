// Full built userscript, real worker IndexedDB, disposable phones and PC backup store.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '../../../../manga/gallery-downloader/node_modules/playwright-core/index.mjs';
import { BackupStore } from '../../../../manga/gallery-downloader/gallery-server/downloader/dist/reader-backups.js';
const bundle = fs.readFileSync('dist/km-explorer.user.js','utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'km-backup-test-'));
const store = new BackupStore(dir);
const videos = [1,2].map(id=>({id:String(id),thumbnail:`https://ytboob.com/${id}.jpg`,pageUrl:`https://ytboob.com/video-${id}/`}));
const details = videos.map(v=>({pageUrl:v.pageUrl,videoSrc:`https://vidhost.me/videos/${v.id}.mp4`,actors:[{name:'Fixture',url:'/actor/fixture'}]}));
const channels = [{actorUrl:'/actor/fixture',termId:'7',videoIds:['1','2']}];
let offline = false, attempts = 0;
let browser;
async function until(predicate) {
    const deadline = Date.now()+15000;
    while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,100));}
    throw new Error('Behavior did not become ready');
}
try {
    browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
    async function phone(seed) {
        const context = await browser.newContext();
        await context.route('**/*',async route=>{
            const url=new URL(route.request().url());
            const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-Reader-Backup-Key','Access-Control-Allow-Methods':'GET,PUT,OPTIONS'};
            if(url.port==='7777'){
                if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
                attempts++;
                if(offline)return route.abort('connectionrefused');
                const data=route.request().method()==='GET'?store.list('km-explorer','ytboob'):store.put('km-explorer','ytboob',url.pathname.split('/').at(-1),JSON.parse(route.request().postData()));
                return route.fulfill({headers,json:data});
            }
            if(url.hostname==='ts-api.ytboob.com')return route.fulfill({headers,json:{results:[{found:2,hits:videos.map(v=>({document:{post_id:v.id,post_thumbnail:v.thumbnail,permalink:v.pageUrl}}))}]}});
            if(url.pathname.endsWith('.jpg'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="gray"/></svg>'});
            const detail=details.find(d=>new URL(d.pageUrl).pathname===url.pathname);
            return route.fulfill({contentType:'text/html',body:detail?`<meta itemprop="contentURL" content="${detail.videoSrc}"><a href="/actor/fixture">Fixture</a>`:'<!doctype html><title>Fixture</title><p>Native</p>'});
        });
        const page=await context.newPage();
        page.on('pageerror',error=>{throw error;});
        await page.goto('https://ytboob.com/');
        if(seed)await page.evaluate(async ({videos,details,channels})=>{
            localStorage.setItem('km-explorer-favorites-v1','["1","2"]');
            localStorage.setItem('ke-card-highlight','{"id":"2","pageUrl":"https://ytboob.com/video-2/"}');
            localStorage.setItem('ke-scroll/page/2/','456');
            localStorage.setItem('unrelated-site-key','untouched');
            const db=await new Promise((resolve,reject)=>{
                const r=indexedDB.open('km-explorer',4);
                r.onupgradeneeded=()=>{r.result.createObjectStore('videos',{keyPath:'id'});r.result.createObjectStore('details',{keyPath:'pageUrl'});r.result.createObjectStore('channels',{keyPath:'actorUrl'});};
                r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
            });
            await new Promise((resolve,reject)=>{const tx=db.transaction(['videos','details','channels'],'readwrite');for(const [name,items]of Object.entries({videos,details,channels}))for(const item of items)tx.objectStore(name).put(item);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
        },{videos,details,channels});
        await inject(page);
        return {page,context};
    }
    async function inject(page, forbidLegacy=false){
        await page.evaluate(forbidLegacy=>{
            Object.defineProperty(window,'indexedDB',{get(){throw new Error('Main-thread IndexedDB access');}});
            if(forbidLegacy)Object.defineProperty(window,'localStorage',{get(){throw new Error('Repeated legacy storage access');}});
        },forbidLegacy);
        await page.addScriptTag({content:bundle});
    }
    offline=true;
    const original=await phone(true);
    await until(async()=>await original.page.locator('.ke-card[data-video-checked]').count()===2);
    await until(()=>attempts>0);
    await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(await original.page.locator('#reader-backup-status,#reader-backup-setup').count(),0);
    assert.equal(await original.page.evaluate(()=>localStorage.getItem('km-explorer-favorites-v1')),'["1","2"]');
    assert.equal(await original.page.evaluate(()=>localStorage.getItem('unrelated-site-key')),'untouched');
    offline=false;
    await original.page.reload();await inject(original.page,true);
    await original.page.getByRole('button',{name:'Back up this phone',exact:true}).click();
    await until(async()=>await original.page.locator('#reader-backup-status').count()===1);
    const first=store.list('km-explorer','ytboob')[0];
    assert.deepEqual(first.current.data.indexedDB,{videos,details,channels,preferences:{favorites:['1','2'],highlight:{id:'2',pageUrl:videos[1].pageUrl},scroll:{'/page/2/':456}}});
    await original.page.locator('.ke-fav-toggle').first().click();
    await until(async()=>!await original.page.locator('.ke-fav-toggle').first().evaluate(el=>el.classList.contains('active')));
    await original.page.reload();await inject(original.page,true);
    await until(()=>store.read('km-explorer','ytboob',first.id).current.data.indexedDB.preferences.favorites.length===1);
    assert.equal(await original.page.locator('#reader-backup-status,#reader-backup-setup').count(),0);
    const second=store.read('km-explorer','ytboob',first.id);
    assert.deepEqual(second.previous,first.current);
    offline=true;
    const copy=await phone(false);
    const beforeAttempts=attempts;
    await until(()=>attempts>beforeAttempts);
    await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(await copy.page.locator('#reader-backup-status,#reader-backup-setup').count(),0);
    offline=false;
    await copy.page.reload();await inject(copy.page,true);
    const dialog=copy.page.getByRole('dialog');
    await dialog.getByRole('combobox').selectOption(first.id+':previous');
    await dialog.getByRole('button',{name:'Restore from PC',exact:true}).click();
    await until(()=>store.list('km-explorer','ytboob').length===2);
    await until(async()=>await copy.page.locator('.ke-card[data-video-checked]').count()===2);
    const restored=store.list('km-explorer','ytboob').find(b=>b.id!==first.id);
    assert.deepEqual(restored.current.data,first.current.data);
    assert.deepEqual(store.read('km-explorer','ytboob',first.id),second);
    await copy.page.reload();await inject(copy.page,true);
    await until(async()=>await copy.page.locator('.ke-card[data-video-checked]').count()===2);
    assert.equal(await copy.page.locator('#reader-backup-status,#reader-backup-setup').count(),0);
    await original.context.close();await copy.context.close();
    console.log('PASS: v4 caches + legacy favorites/highlight/scroll survive worker migration; offline fresh/enrolled phones stay quiet; edits persist; previous snapshot restores all stores into an independent ID; reload needs no localStorage.');
} finally {await browser?.close();fs.rmSync(dir,{recursive:true,force:true});}
