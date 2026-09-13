import assert from 'node:assert/strict';
import { build } from 'esbuild';
// Simulate a terminated startup worker, then a successful retry in the same
// cached document. A rejected singleton must not permanently poison startup.
const result = await build({entryPoints:['apps/ios/web/initialize.ts'],bundle:true,write:false,format:'esm',plugins:[{
    name:'interrupted-storage',setup(b) {
        b.onResolve({filter:/^\.\/transport$/},()=>({path:'transport',namespace:'fixture'}));
        b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`let calls=0; export async function compute(){if(++calls===1)throw new Error('Document suspended');return true;}`}));
    }
}]});
const {initializeStorage}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
await assert.rejects(initializeStorage(),/Document suspended/);
await initializeStorage();
console.log('PASS: interrupted storage initialization retries in the same document');
