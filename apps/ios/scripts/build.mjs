import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), app = resolve(root,'apps/ios');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--prepare-only')) throw new Error('Usage: npm run build:ios -- [--prepare-only]');
const out = resolve(app,'build/Web'); await mkdir(out,{recursive:true});
const backupURL = process.env.VITE_READER_BACKUP_URL || 'https://192.168.1.197:7777';
const key = process.env.VITE_READER_BACKUP_KEY || (await readFile(resolve(root,'../../manga/gallery-downloader/backups/readers/access-key'),'utf8')).trim();
const define = {__READER_BACKUP_URL__:JSON.stringify(backupURL),__READER_BACKUP_KEY__:JSON.stringify(key)};
function replace(source, from, to) {
    if (!source.includes(from)) throw new Error('Shared source changed: review Ytb adapter for ' + from);
    return source.replace(from,to);
}
// UI, CSS, storage and ytboob extraction stay in src. Only platform boundaries
// differ; fail the build if those boundaries change instead of silently drifting.
const platform = {name:'ytb-platform', setup(b) {
    b.onResolve({filter:/./},args => {
        const path = resolve(args.resolveDir,args.path);
        for (const [from,to] of [['src/core/compute/transport','transport'],['src/storage/initialize','initialize']]) {
            if (path === resolve(root,from)) return {path:resolve(app,'web',to+'.ts')};
        }
        if (args.path.endsWith('?inline')) return {path:resolve(args.resolveDir,args.path.slice(0,-7)),namespace:'inline'};
    });
    b.onLoad({filter:/.*/,namespace:'inline'},async args => ({contents:'export default '+JSON.stringify(await readFile(args.path,'utf8')),loader:'js'}));
    b.onLoad({filter:/\.ts$/},async args => {
        if (!args.path.startsWith(resolve(root,'src')+'/')) return;
        let source = await readFile(args.path,'utf8');
        source = source.replaceAll('Keep website data intact and reload to retry.','Reopen the app to retry.').replaceAll('km-explorer','ytb').replaceAll('KM','Ytb').replaceAll('reader-pc-backup-state-v1','ytb-pc-backup-state-v1');
        if (args.path.endsWith('/ui/shell.ts')) source = replace(source,'    window.stop();\n    document.open();\n    document.close();\n','');
        if (args.path.endsWith('/ui/navigation.ts')) source = `import { appURL } from '${resolve(app,'web/native')}';\n` + replace(source,'link.href = url','link.href = appURL(url)');
        if (args.path.endsWith('/routes/video.ts')) source = `import { appURL, copyText } from '${resolve(app,'web/native')}';\n` + replace(replace(source,'window.location.replace(selected.pageUrl)','window.location.replace(appURL(selected.pageUrl))'),'navigator.clipboard.writeText(videoSrc)','copyText(videoSrc)');
        if (args.path.endsWith('/compute/worker-entry.ts')) source = replace(source,'    const run = async () => {','    if (!data.op) return;\n    const run = async () => {');
        return {contents:source,loader:'ts',resolveDir:dirname(args.path)};
    });
}};
const worker = await build({entryPoints:[resolve(app,'web/worker.ts')],bundle:true,minify:true,write:false,format:'iife',target:'safari17',define,plugins:[platform]});
const result = await build({entryPoints:[resolve(app,'web/app.ts')],outfile:resolve(out,'app.js'),bundle:true,minify:true,format:'iife',target:'safari17',define,metafile:true,plugins:[platform,{name:'worker-source',setup(b) {
    b.onResolve({filter:/^@worker-code$/},()=>({path:'code',namespace:'worker'}));
    b.onLoad({filter:/.*/,namespace:'worker'},()=>({contents:'export default '+JSON.stringify(worker.outputFiles[0].text),loader:'js'}));
}}]});
await writeFile(resolve(out,'index.html'),await readFile(resolve(app,'web/index.html')));
await writeFile(resolve(out,'style.css'),'/* Styles are imported unchanged from src/css/style.css by the shared shell. */\n');
await writeFile(resolve(app,'build/inputs.json'),JSON.stringify(Object.keys(result.metafile.inputs),null,2)+'\n');
console.log('Prepared Ytb using the shared UI and built-in ytboob source.');
if (!args.includes('--prepare-only')) {
    if (process.platform !== 'darwin') throw new Error('Build/sign on the documented Mac; use --prepare-only on Linux.');
    process.exit(spawnSync('bash',[resolve(app,'scripts/build.sh')],{stdio:'inherit'}).status ?? 1);
}
