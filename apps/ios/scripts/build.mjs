import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), app = resolve(root,'apps/ios');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--prepare-only')) throw new Error('Usage: npm run build:ios -- [--prepare-only]');
const out = resolve(app,'build/Web'); await mkdir(out,{recursive:true});
const backupURL = process.env.VITE_READER_BACKUP_URL || 'https://192.168.1.197:7733';
const key = process.env.VITE_READER_BACKUP_KEY || (await readFile(resolve(homedir(),'.local/share/km-explorer/backups/access-key'),'utf8')).trim();
const define = {__READER_BACKUP_URL__:JSON.stringify(backupURL),__READER_BACKUP_KEY__:JSON.stringify(key)};
// The app's sources live in src (src/app holds the native entry points). The build only
// serves CSS imported as text.
const platform = {name:'ytb-inline-css', setup(b) {
    b.onResolve({filter:/\?inline$/},args => ({path:resolve(args.resolveDir,args.path.slice(0,-7)),namespace:'inline'}));
    b.onLoad({filter:/.*/,namespace:'inline'},async args => ({contents:'export default '+JSON.stringify(await readFile(args.path,'utf8')),loader:'js'}));
}};
const worker = await build({entryPoints:[resolve(root,'src/app/worker.ts')],bundle:true,minify:true,write:false,format:'iife',target:'safari17',define,plugins:[platform]});
const result = await build({entryPoints:[resolve(root,'src/app/app.ts')],outfile:resolve(out,'app.js'),bundle:true,minify:true,format:'iife',target:'safari17',define,metafile:true,plugins:[platform,{name:'worker-source',setup(b) {
    b.onResolve({filter:/^@worker-code$/},()=>({path:'code',namespace:'worker'}));
    b.onLoad({filter:/.*/,namespace:'worker'},()=>({contents:'export default '+JSON.stringify(worker.outputFiles[0].text),loader:'js'}));
}}]});
await writeFile(resolve(out,'index.html'),await readFile(resolve(root,'src/app/index.html')));
await writeFile(resolve(out,'style.css'),'/* Styles are imported unchanged from src/css/style.css by the shared shell. */\n');
await writeFile(resolve(app,'build/inputs.json'),JSON.stringify(Object.keys(result.metafile.inputs),null,2)+'\n');
console.log('Prepared Ytb using the shared UI and built-in ytboob source.');
if (!args.includes('--prepare-only')) {
    if (process.platform !== 'darwin') throw new Error('Build/sign on the documented Mac; use --prepare-only on Linux.');
    process.exit(spawnSync('bash',[resolve(app,'scripts/build.sh')],{stdio:'inherit'}).status ?? 1);
}
