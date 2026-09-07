import { defineConfig, loadEnv } from "vite";
import { readFileSync } from 'node:fs';
import monkey from "vite-plugin-monkey";
import pkg from "./package.json";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const backupUrl = env.VITE_READER_BACKUP_URL || 'https://192.168.1.197:7777';
    const backupKey = env.VITE_READER_BACKUP_KEY || readFileSync(new URL('../../manga/gallery-downloader/backups/readers/access-key', import.meta.url), 'utf8').trim();
    if (!backupKey) throw new Error('PC backup access key is missing');
    return {
    define: { __READER_BACKUP_URL__: JSON.stringify(backupUrl), __READER_BACKUP_KEY__: JSON.stringify(backupKey) },
    build: {
        minify: false,
        sourcemap: false,
        target: "esnext",
        modulePreload: false,
        cssCodeSplit: false,
    },
    plugins: [
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
