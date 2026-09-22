// The production bundle and real worker/IndexedDB, with only native I/O mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webkit } from '../../../../../manga/gallery-downloader/node_modules/playwright-core/index.mjs';
const bundle = fs.readFileSync(new URL('../build/Web/app.js',import.meta.url),'utf8');
const inputs = JSON.parse(fs.readFileSync(new URL('../build/inputs.json',import.meta.url),'utf8'));
assert(inputs.some(p=>p.endsWith('src/provider/ytb.ts')));
assert(!inputs.some(p=>p.endsWith('src/provider/index.ts')));
for (const text of ['km-explorer','document.open()','window.stop()','GalleryReader']) assert(!bundle.includes(text),text+' leaked into Ytb');
const browser = await webkit.launch({headless:true});
const state = {lastPath:'/',libraryPath:'/',positions:{}};
let boot = true, resume, active, copies = [], backupRequests = [], sourceRequests = 0;
let actorGate, releaseActor, detailGate, releaseDetail, releaseFetch;
let actorPending=0;
const cancelled=[];
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const videos = ['1','2'].map(id=>({id,pageUrl:`https://ytboob.com/video-${id}/`,thumbnail:`https://ytboob.com/${id}.jpg`}));
const payload = body=>({status:200,headers:{'Content-Type':'application/json'},body:Buffer.from(typeof body==='string'?body:JSON.stringify(body)).toString('base64')});
try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if (url.protocol === 'blob:') return route.continue();
        if(url.pathname==='/app.js') return route.fulfill({contentType:'text/javascript',body:bundle});
        if(url.pathname.endsWith('.mp4')) return route.fulfill({contentType:'video/mp4',body:'invalid media fixture'});
        if(url.pathname.endsWith('.jpg')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"/>'});
        return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script defer src="/app.js"></script>'});
    });
    await context.exposeBinding('bridge',async(_,{command,args})=>{
        if(command==='fetch-cancel') {cancelled.push(args.requestID);return '{}';}
        if(command==='fetch') {
            const url=new URL(args.url);
            if(url.hostname==='cancel.test') await new Promise(resolve=>{releaseFetch=resolve;});
            if(url.pathname.startsWith('/wp-json/wp/v2/actors') && actorGate) { actorPending++; try { await actorGate; } finally { actorPending--; } }
            if(url.pathname.startsWith('/video-') && detailGate) await detailGate;
            if(url.port==='7777') { backupRequests.push(args); throw new Error('PC offline'); }
            if(url.hostname==='ts-api.ytboob.com') {
                const query=JSON.parse(args.body).searches[0];
                const ids=query.filter_by?.match(/\d+/g);
                return JSON.stringify(payload({results:[{found:1200,hits:videos.filter(v=>!ids||ids.includes(v.id)).map(v=>({document:{post_id:v.id,post_thumbnail:v.thumbnail,permalink:v.pageUrl}}))}]}));
            }
            if(url.pathname.startsWith('/wp-json/wp/v2/actors')) return JSON.stringify(payload([{id:7}]));
            if(url.pathname.startsWith('/wp-json/wp/v2/posts')) return JSON.stringify({...payload([{id:1},{id:2}]),headers:{'X-WP-TotalPages':'1'}});
            sourceRequests++;
            return JSON.stringify(payload(`<meta itemprop="contentURL" content="https://media.test/${url.pathname.split('/')[1]}.mp4"><a href="/actor/example/">Example</a>`));
        }
        if(command==='clipboard') { copies.push(args.text); return '{}'; }
        if(command==='init') {
            active=args.document;
            const frameURL=new URL(_.frame.url());const path=frameURL.pathname+frameURL.search;
            const out={position:state.positions[path]};
            if(boot) {
                boot=false;
                if(state.lastPath.startsWith('/video-')) {
                    if(path===state.libraryPath) out.resumeReader=state.lastPath;
                    else { out.redirect=state.libraryPath; resume=state.lastPath; }
                } else if(path!==state.lastPath) out.redirect=state.lastPath;
            } else if(resume) { out.resumeReader=resume; resume=undefined; }
            return JSON.stringify(out);
        }
        if(command==='activate') active=args.document;
        if(command==='view-save'&&active===args.document) {
            const p=args.position; state.positions[p.path]=p;state.lastPath=p.path;
            if(!p.path.startsWith('/video-')) state.libraryPath=p.path;
        }
        return '{}';
    });
    await context.addInitScript(()=>{window.webkit={messageHandlers:{ytb:{postMessage:body=>window.bridge(body)}}}; const OriginalWorker=window.Worker; window.terminatedWorkers=0; window.Worker=class extends OriginalWorker { terminate(){window.terminatedWorkers++;super.terminate();} };});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://ytb.test/');
    await page.getByText('Import / Merge',{exact:true}).click();
    await page.locator('textarea').fill('1'); await page.getByText('Merge',{exact:true}).click();
    await page.locator('.ke-card .ke-fav-toggle:enabled').waitFor();
    assert.equal(sourceRequests,0); assert.deepEqual(copies,[]);
    assert.equal(await page.locator('#reader-backup-setup').count(),0,'Offline PC is silent');
    const gate=deferred();actorGate=gate.promise;releaseActor=gate.resolve;
    await page.locator('.ke-card img').click();
    await page.waitForURL('**/video-1/');
    await page.locator('video').waitFor();
    await page.evaluate(()=>window.ytbViewState.save());
    assert.equal(state.lastPath,'/video-1/','Visible video is checkpointed while related metadata is still pending');
    releaseActor();actorGate=undefined;
    await page.locator('.ke-video-copy:not([hidden])').waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('.ke-card').length===2);
    assert.equal(sourceRequests,1);assert.deepEqual(copies,[]);
    assert.deepEqual(await page.locator('video').evaluate(v=>[v.autoplay,v.muted,v.playsInline,v.controls]),[true,true,true,false]);
    assert.equal(await page.locator('.ke-progress-bar').evaluate(e=>getComputedStyle(e).height),'100px');
    await page.getByRole('button',{name:'Copy video URL'}).click();
    await page.waitForFunction(()=>document.querySelector('.ke-video-copy').textContent==='Copied');
    assert.deepEqual(copies,['https://media.test/video-1.mp4']);
    await page.locator('.ke-card:not(.selected) img').click();
    await page.waitForURL('**/video-2/');
    await page.locator('.ke-video-copy:not([hidden])').waitFor();
    await page.goBack();await page.waitForURL('https://ytb.test/');
    await page.locator('.ke-card img').waitFor();
    assert.equal(await page.locator('.ke-card').count(),1,'Favorites survive native documents');
    await page.locator('.ke-card img').click();await page.waitForURL('**/video-1/');
    await page.locator('.ke-card:not(.selected)').waitFor();
    await page.evaluate(()=>window.ytbViewState.save());
    for (let attempt=0;attempt<100 && state.lastPath!=='/video-1/';attempt++) await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(state.lastPath,'/video-1/');
    boot=true;await page.close();const reopened=await context.newPage();
    await reopened.goto('https://ytb.test/');await reopened.waitForURL('**/video-1/');
    await reopened.locator('video').waitFor();
    await reopened.goBack();await reopened.waitForURL('https://ytb.test/');
    await reopened.locator('.ke-card img').waitFor();
    await reopened.waitForFunction(()=>document.querySelector('.ke-returned-card')?.dataset.videoId==='1');
    await reopened.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    assert(await reopened.evaluate(()=>window.terminatedWorkers)>0,'A cached document releases its database worker');
    await reopened.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    const favorite = reopened.locator('.ke-card .ke-fav-toggle');
    await favorite.click(); await favorite.waitFor({state:'visible'});
    await reopened.waitForFunction(()=>document.querySelector('.ke-fav-toggle').textContent==='♡');
    await favorite.click();
    await reopened.waitForFunction(()=>document.querySelector('.ke-fav-toggle').textContent==='❤');
    assert(backupRequests.every(r=>r.url.includes('/ytb/ytboob')),'Ytb uses its own backup namespace');
    assert.deepEqual(errors,[]);
    const abort=await reopened.evaluate(async()=>{
        const controller=new AbortController();
        const result=fetch('https://cancel.test/delayed',{signal:controller.signal}).then(()=> 'resolved',e=>e.name);
        setTimeout(()=>controller.abort(),20);
        return Promise.race([result,new Promise(resolve=>setTimeout(()=>resolve('still waiting'),200))]);
    });
    assert.equal(abort,'AbortError');assert(cancelled.length>0,'Abort cancels native transfer, not only its JS waiter');releaseFetch();
    // Route queries must survive app checkpoints, unlike the previous path-only adapter.
    state.positions['/video-3/?variant=test']={path:'/video-3/?variant=test',y:500};
    const detail=deferred();detailGate=detail.promise;releaseDetail=detail.resolve;
    await reopened.goto('https://ytb.test/video-3/?variant=test');
    await reopened.waitForFunction(()=>!!window.ytbViewState);
    await reopened.evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown'})));
    releaseDetail();detailGate=undefined;
    await reopened.locator('video').waitFor();
    await reopened.waitForTimeout(100);
    assert.equal(await reopened.evaluate(()=>scrollY),0,'Keyboard input cancels delayed native restoration');
    await reopened.evaluate(()=>window.ytbViewState.save());
    assert.equal(state.lastPath,'/video-3/?variant=test','Checkpoint preserves provider query');
    // Freeze during the initial render: cancel native metadata, then recover
    // this unfinished history entry on Back rather than leaving it on Loading.
    const blocked=deferred();actorGate=blocked.promise;releaseActor=blocked.resolve;
    await reopened.goto('https://ytb.test/video-4/');await reopened.locator('video').waitFor();
    for(let i=0;i<100 && actorPending===0;i++) await new Promise(resolve=>setTimeout(resolve,20));
    assert(actorPending>0,'Fixture has a live metadata request before suspension');
    const beforeSuspend=cancelled.length;
    await reopened.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    for(let i=0;i<100 && cancelled.length===beforeSuspend;i++) await new Promise(resolve=>setTimeout(resolve,20));
    assert(cancelled.length>beforeSuspend,'Suspension cancels in-flight provider metadata');
    releaseActor();actorGate=undefined;
    const reload=reopened.waitForEvent('domcontentloaded');
    await reopened.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))).catch(error=>{ if (!error.message.includes('Execution context was destroyed')) throw error; });
    await reload;
    await reopened.waitForFunction(()=>document.querySelectorAll('.ke-card').length===2);
    assert.deepEqual(errors,[]);
    const dbs=await reopened.evaluate(()=>indexedDB.databases());
    assert(dbs.some(db=>db.name==='ytb'));assert(!dbs.some(db=>db.name==='km-explorer'));
    console.log('PASS: shared single source/UI; independent Ytb IDB; manual import; offline PC; muted inline video; existing controls; media failure Copy only on tap; related replace + single Back; kill/relaunch and Back.');
} finally { await browser.close(); }
