import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {webkit} from '../../../../../manga/gallery-downloader/node_modules/playwright-core/index.mjs';
const output=await build({entryPoints:['apps/ios/web/image-recovery.ts'],bundle:true,write:false,format:'iife',globalName:'Recovery'});
const browser=await webkit.launch();
try {
 const page=await browser.newPage();await page.goto('about:blank');
 await page.addScriptTag({content:output.outputFiles[0].text});
 const result=await page.evaluate(()=>{
  const timers=new Map();let id=0,online=true,loads=0,source='https://fixture.invalid/image';
  window.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};window.clearTimeout=id=>timers.delete(id);
  Object.defineProperty(navigator,'onLine',{get:()=>online});
  Recovery.installImageRecovery();
  const image=document.createElement('img');Object.defineProperty(image,'src',{get:()=>source,set:value=>{source=value;loads++;}});document.body.append(image);
  const tick=()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(job=>job.fn());};
  image.dispatchEvent(new Event('error'));tick();const automatic=loads===1;
  image.dispatchEvent(new Event('error'));online=false;tick();const held=loads===1;
  online=true;dispatchEvent(new Event('online'));const resumed=loads===2;
  image.dispatchEvent(new Event('load'));dispatchEvent(new Event('online'));const completed=loads===2;
  image.dispatchEvent(new Event('error'));source='https://fixture.invalid/new';tick();
  return {automatic,held,resumed,completed,obsoleteIgnored:loads===2};
 });
 assert(Object.values(result).every(Boolean));
 console.log('PASS: thumbnail errors retry automatically, wait offline, resume online, and stop after load or source replacement');
} finally {await browser.close();}
