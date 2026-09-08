import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

execFileSync('npx', ['vite', 'build', '--mode', 'extension'], { stdio: 'inherit' });
const file = 'dist/extension/content.js';
const source = readFileSync(file, 'utf8');
const revoke = '"(self.URL || self.webkitURL).revokeObjectURL(self.location.href);",';
if (!source.includes(revoke)) throw new Error('Vite inline-worker wrapper changed; inspect before shipping');
writeFileSync(file, source.replaceAll(revoke, '"",'));
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
writeFileSync('dist/extension/manifest.json', JSON.stringify({
    manifest_version: 3,
    name: 'KM Explorer',
    version,
    description: 'KM Explorer document-start takeover for ytboob.com.',
    host_permissions: ['https://ytboob.com/*'],
    content_scripts: [{
        matches: ['https://ytboob.com/*'], js: ['content.js'],
        run_at: 'document_start', world: 'MAIN', all_frames: false,
    }],
}, null, 2) + '\n');
console.log('Private extension built: dist/extension (contains PC backup key; do not publish).');
