import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from '../../../../manga/gallery-downloader/node_modules/playwright-core/index.mjs';
const result=await build({entryPoints:['src/core/compute/database.ts'],bundle:true,write:false,format:'iife',globalName:'KMDatabase'});
const source=result.outputFiles[0].text+`\nself.onmessage=async()=>{
    try {
        const db=KMDatabase;
        await db.migratePreferences({'km-explorer-favorites-v1':'["1","2"]','ke-card-highlight':'{"id":"2","pageUrl":"https://ytboob.com/two/"}','ke-scroll/page/2/':'100'});
        await db.putVideos([{id:'1',thumbnail:'https://ytboob.com/a.jpg',pageUrl:'https://ytboob.com/one/'}]);
        await db.putDetail('https://ytboob.com/one/',{videoSrc:'https://vidhost.me/videos/one.mp4',actors:[]});
        await db.setCachedChannel('/actor/test','7',['1']);
        const before=await db.captureSnapshot();
        const broken=structuredClone(before);
        broken.indexedDB.videos=[];
        broken.indexedDB.details.push({pageUrl:'https://ytboob.com/broken/',videoSrc:'https://vidhost.me/videos/broken.mp4',actors:[],uncloneable:()=>{}});
        let rejected=false;
        try{await db.restoreSnapshot(broken);}catch{rejected=true;}
        const after=await db.captureSnapshot();
        const malformed=structuredClone(before);malformed.indexedDB.preferences.favorites=[null];
        let invalidRejected=false;
        try{await db.restoreSnapshot(malformed);}catch{invalidRejected=true;}
        await db.migratePreferences({});
        self.postMessage({ok:true,rejected,invalidRejected,before,after,afterRepeat:await db.captureSnapshot()});
    }catch(error){self.postMessage({ok:false,error:String(error)});}
};`;
const server=http.createServer((_req,res)=>res.end('<!doctype html><p>Worker fixture</p>'));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const checked=await page.evaluate(source=>new Promise((resolve,reject)=>{
        const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),worker=new Worker(url);
        worker.onmessage=({data})=>{worker.terminate();URL.revokeObjectURL(url);data.ok?resolve(data):reject(new Error(data.error));};
        worker.onerror=e=>reject(new Error(e.message));worker.postMessage({});
    }),source);
    assert.equal(checked.rejected,true);assert.equal(checked.invalidRejected,true);
    assert.deepEqual(checked.after,checked.before);assert.deepEqual(checked.afterRepeat,checked.before);
    console.log('PASS: real worker transaction rollback preserves all four stores after mid-restore failure; invalid restore and repeated migration cannot overwrite data.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
