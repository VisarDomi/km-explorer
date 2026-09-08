import { defineConfig, loadEnv } from "vite";
import { readFileSync } from 'node:fs';
import monkey from "vite-plugin-monkey";
import pkg from "./package.json";

export default defineConfig(({ mode }) => {
    const extension = mode === 'extension';
    const env = loadEnv(mode, process.cwd(), '');
    const backupUrl = env.VITE_READER_BACKUP_URL || 'https://192.168.1.197:7777';
    const backupKey = env.VITE_READER_BACKUP_KEY || readFileSync(new URL('../../manga/gallery-downloader/backups/readers/access-key', import.meta.url), 'utf8').trim();
    if (!backupKey) throw new Error('PC backup access key is missing');
    return {
    define: { __READER_BACKUP_URL__: JSON.stringify(backupUrl), __READER_BACKUP_KEY__: JSON.stringify(backupKey) },
    build: {
        emptyOutDir: extension,
        ...(extension ? {
            outDir: 'dist/extension',
            lib: { entry: 'extension/main.ts', name: 'KMExplorer', formats: ['iife' as const], fileName: () => 'content.js' },
        } : {}),
        minify: false,
        sourcemap: false,
        target: "esnext",
        modulePreload: false,
        cssCodeSplit: false,
    },
    plugins: extension ? [{
        name: 'safari-document-takeover',
        enforce: 'pre',
        transform(source, id) {
            if (!id.endsWith('/src/ui/shell.ts')) return;
            const original = 'document.open();\n    document.close();';
            if (!source.includes(original)) throw new Error('KM takeover changed; inspect the Safari adapter');
            return source.replace(original, 'document.documentElement?.replaceChildren();');
        },
    }] : [
        monkey({
            entry: "src/main.ts",
            userscript: {
                name: `${pkg.name} v${pkg.version}`,
                namespace: "https://github.com/VisarDomi",
                description: "video takeover",
                match: ["https://ytboob.com/*"],
                "run-at": "document-start",
            },
        }),
    ],
    };
});
