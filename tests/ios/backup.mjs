// Authorized migration/backup. No favorite toggles, live Restore, or storage clearing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createController, createSession, sleep } from 'userscript-ios-test/controller';
import { BackupStore } from '../../../../manga/gallery-downloader/gallery-server/downloader/dist/reader-backups.js';
process.umask(0o077);
if (!process.argv.includes('--backup')) throw new Error('Explicit --backup required');
const root=path.resolve(import.meta.dirname,'../..');
const store=new BackupStore(path.resolve(root,'../../manga/gallery-downloader/backups/readers'));
const controller=createController({root,name:'km-migration-backup',connectionTimeoutMs:60000,commandTimeoutMs:30000});
const session=createSession({controller});
const bundle=fs.readFileSync(path.join(root,'dist/km-explorer.user.js'),'utf8');
const command=async(code,options)=>controller.command((await controller.foregroundClient()).client,code,options);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const cacheNames=['videos','details','channels'];
const keyNames={videos:'id',details:'pageUrl',channels:'actorUrl'};
function auditor(){
    const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
    const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');
    async function read(name){
        if(!(await indexedDB.databases()).some(db=>db.name===name))return {};
        const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
        try{return await new Promise((resolve,reject)=>{
            const names=[...db.objectStoreNames],out={};
            const tx=db.transaction(names,'readonly');
            for(const name of names){const r=name==='preferences'?tx.objectStore(name).get('state'):name==='identities'?tx.objectStore(name).get('km-explorer:ytboob'):tx.objectStore(name).getAll();r.onsuccess=()=>{out[name]=r.result;};}
            tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);
        });}finally{db.close();}
    }
    self.onmessage=async({data:config})=>{
        try{
            const stored=await read('km-explorer'),raw=config.legacy;
            const preferences=stored.preferences??{favorites:JSON.parse(raw['km-explorer-favorites-v1']||'[]'),highlight:JSON.parse(raw['ke-card-highlight']||'null'),scroll:Object.fromEntries(Object.entries(raw).filter(([k])=>k.startsWith('ke-scroll')).map(([k,v])=>[k.slice(9),Number(v)]))};
            const indexedDB={videos:stored.videos??[],details:stored.details??[],channels:stored.channels??[],preferences};
            const keys={videos:'id',details:'pageUrl',channels:'actorUrl'},cacheKeys={},cacheHashes={};
            for(const [name,key] of Object.entries(keys)){
                cacheKeys[name]=indexedDB[name].map(record=>record[key]);
                const wanted=config.cacheKeys?.[name];
                cacheHashes[name]=await hash(wanted?indexedDB[name].filter(record=>wanted.includes(record[key])):indexedDB[name]);
            }
            const identity=(await read('reader-pc-backup-state-v1')).identities??null;
            self.postMessage({ok:true,identity,cacheKeys,cacheHashes,preferencesHash:await hash(preferences),legacyHash:await hash(raw),fullHash:await hash({version:1,indexedDB}),counts:{favorites:preferences.favorites.length,scroll:Object.keys(preferences.scroll).length,highlight:preferences.highlight?1:0,videos:indexedDB.videos.length,details:indexedDB.details.length,channels:indexedDB.channels.length}});
        }catch(error){self.postMessage({ok:false,error:String(error)});}
    };
}
async function audit(cacheKeys){return command(`
    const legacy={};
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k==='km-explorer-favorites-v1'||k==='ke-card-highlight'||k.startsWith('ke-scroll'))legacy[k]=localStorage.getItem(k);}
    const source=${JSON.stringify('('+auditor.toString()+')();')};
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Phone audit timed out')),20000);
        worker.onmessage=({data})=>{clearTimeout(timer);data.ok?resolve(data):reject(new Error(data.error));};
        worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};
        worker.postMessage({legacy,cacheKeys:${JSON.stringify(cacheKeys)??'undefined'}});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
`);}
async function inject(){
    const fg=await controller.foregroundClient();
    await session.waitForNavigation(client=>client.client===fg.client,'foreground before takeover');
    try{await session.inject(bundle);}catch(error){if(!await command("return !!document.querySelector('#ke-grid,.ke-video-page,.ke-loading');"))throw error;}
}
try{
    await session.connect({allowedHosts:['ytboob.com']});
    console.log('Preflight',await command('return {href:location.href,visible:document.visibilityState};'));
    await session.navigate('https://ytboob.com/');
    const before=await audit();
    console.log('Before migration',before.counts);
    await inject();
    if(!before.identity)console.log('Choice',await command(`
        for(let i=0;i<100;i++){
            const shadow=document.querySelector('#reader-backup-setup')?.shadowRoot;
            if(shadow){shadow.querySelector('input').value='iPhone before iOS downgrade';[...shadow.querySelectorAll('button')].find(b=>b.textContent==='Back up this phone').click();return 'Back up this phone';}
            const error=document.querySelector('#reader-backup-status')?.textContent;
            if(error?.includes('NOT completed'))throw new Error(error);
            await new Promise(resolve=>setTimeout(resolve,200));
        }
        throw new Error('PC did not become available for backup setup');
    `));
    let saved,after;
    const deadline=Date.now()+30000;
    while(Date.now()<deadline){
        after=await audit(before.cacheKeys);
        if(after.identity?.revision){saved=store.read('km-explorer','ytboob',after.identity.id);if(saved?.current.revision===after.identity.revision)break;}
        await sleep(1000);
    }
    assert.ok(saved,'No acknowledged PC backup');
    assert.equal(after.preferencesHash,before.preferencesHash,'Personal data changed');
    assert.equal(after.legacyHash,before.legacyHash,'Legacy storage changed');
    assert.deepEqual(after.cacheHashes,before.cacheHashes,'Preexisting caches changed during migration');
    assert.equal(hash(saved.current.data.indexedDB.preferences),before.preferencesHash,'PC personal data differs');
    for(const name of cacheNames){
        const subset=saved.current.data.indexedDB[name].filter(record=>before.cacheKeys[name].includes(record[keyNames[name]]));
        assert.equal(hash(subset),before.cacheHashes[name],'PC lost preexisting '+name);
    }
    const savedKeys=Object.fromEntries(cacheNames.map(name=>[name,saved.current.data.indexedDB[name].map(record=>record[keyNames[name]])]));
    const checked=await audit(savedKeys);
    for(const name of cacheNames)assert.equal(hash(saved.current.data.indexedDB[name]),checked.cacheHashes[name],'PC cache differs from phone: '+name);
    console.log('VERIFIED PC backup',{id:saved.id,counts:after.counts,personalDataUnchanged:true,legacyUntouched:true,allPreexistingCachesPreserved:true,allSavedRecordsMatchPhone:true});
    const ui=await command(`
        for(let i=0;i<100;i++){
            if(document.querySelector('.ke-card[data-video-checked],.ke-empty'))break;
            await new Promise(resolve=>setTimeout(resolve,200));
        }
        return {cards:document.querySelectorAll('.ke-card').length,ready:document.querySelectorAll('.ke-card[data-video-checked]').length,images:[...document.images].filter(img=>img.naturalWidth>0).length,empty:!!document.querySelector('.ke-empty')};
    `);
    assert.ok(ui.ready||ui.empty,'Home did not become usable');
    console.log('Home UI',ui);
    await session.reload('https://ytboob.com/');await inject();
    await sleep(2000);
    const reload=await audit(before.cacheKeys);
    assert.equal(reload.preferencesHash,before.preferencesHash);
    assert.equal(reload.identity.id,saved.id);
    console.log('Reload',{sameIdentity:true,preferencesPreserved:true,notifications:await command("return document.querySelectorAll('#reader-backup-status,#reader-backup-setup').length;")});
}finally{try{await session.cleanup();}finally{session.close();}}
