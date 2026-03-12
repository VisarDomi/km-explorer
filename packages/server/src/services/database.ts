import Database from 'better-sqlite3';
import fs from 'node:fs';
import { DB_DIR } from '../config.js';

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(`${DB_DIR}/km-explorer.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS video_details (
    video_url TEXT PRIMARY KEY,
    video_src TEXT NOT NULL,
    actors TEXT NOT NULL DEFAULT '[]',
    scraped_at INTEGER NOT NULL
  )
`);

const getOne = db.prepare('SELECT video_src, actors, scraped_at FROM video_details WHERE video_url = ?');
const getMany = db.prepare('SELECT video_url, video_src, actors FROM video_details WHERE video_url IN (SELECT value FROM json_each(?))');
const upsert = db.prepare('INSERT OR REPLACE INTO video_details (video_url, video_src, actors, scraped_at) VALUES (?, ?, ?, ?)');

export interface CachedDetail {
  videoSrc: string;
  actors: { name: string; url: string }[];
}

export function getCachedDetail(videoUrl: string): CachedDetail | null {
  const row = getOne.get(videoUrl) as { video_src: string; actors: string } | undefined;
  if (!row) return null;
  return { videoSrc: row.video_src, actors: JSON.parse(row.actors) };
}

export function getCachedDetails(urls: string[]): Map<string, CachedDetail> {
  const map = new Map<string, CachedDetail>();
  if (urls.length === 0) return map;
  const rows = getMany.all(JSON.stringify(urls)) as { video_url: string; video_src: string; actors: string }[];
  for (const row of rows) {
    map.set(row.video_url, { videoSrc: row.video_src, actors: JSON.parse(row.actors) });
  }
  return map;
}

export function setCachedDetail(videoUrl: string, videoSrc: string, actors: { name: string; url: string }[]): void {
  upsert.run(videoUrl, videoSrc, JSON.stringify(actors), Date.now());
}
