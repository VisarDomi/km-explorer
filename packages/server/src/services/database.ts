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

db.exec(`
  CREATE TABLE IF NOT EXISTS actor_cache (
    actor_url TEXT PRIMARY KEY,
    term_id INTEGER NOT NULL,
    videos TEXT NOT NULL DEFAULT '[]',
    cached_at INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS dirty_actors (
    actor_url TEXT PRIMARY KEY
  )
`);

// Migration: strip WP size suffixes from cached thumbnail URLs → use originals
{
  const rows = db.prepare("SELECT actor_url, videos FROM actor_cache").all() as { actor_url: string; videos: string }[];
  const update = db.prepare("UPDATE actor_cache SET videos = ? WHERE actor_url = ?");
  const batch = db.transaction(() => {
    for (const row of rows) {
      const fixed = row.videos.replace(
        /"thumbnail":"(https?:\/\/[^"]+)-\d+x\d+(\.\w+)"/g,
        '"thumbnail":"$1$2"'
      );
      if (fixed !== row.videos) update.run(fixed, row.actor_url);
    }
  });
  batch();
}

const getOne = db.prepare('SELECT video_src, actors, scraped_at FROM video_details WHERE video_url = ?');
const getMany = db.prepare('SELECT video_url, video_src, actors FROM video_details WHERE video_url IN (SELECT value FROM json_each(?))');
const upsert = db.prepare('INSERT OR REPLACE INTO video_details (video_url, video_src, actors, scraped_at) VALUES (?, ?, ?, ?)');

const getActor = db.prepare('SELECT term_id, videos, cached_at FROM actor_cache WHERE actor_url = ?');
const upsertActor = db.prepare('INSERT OR REPLACE INTO actor_cache (actor_url, term_id, videos, cached_at) VALUES (?, ?, ?, ?)');
const markDirty = db.prepare('INSERT OR IGNORE INTO dirty_actors (actor_url) VALUES (?)');
const getDirtyActors = db.prepare('SELECT actor_url FROM dirty_actors');
const clearDirty = db.prepare('DELETE FROM dirty_actors WHERE actor_url IN (SELECT value FROM json_each(?))');

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

const setCachedDetailTx = db.transaction((videoUrl: string, videoSrc: string, actors: { name: string; url: string }[]) => {
  upsert.run(videoUrl, videoSrc, JSON.stringify(actors), Date.now());
  for (const actor of actors) {
    markDirty.run(actor.url);
  }
});

export function setCachedDetail(videoUrl: string, videoSrc: string, actors: { name: string; url: string }[]): void {
  setCachedDetailTx(videoUrl, videoSrc, actors);
}

// --- Actor cache ---

export interface CachedActor {
  termId: number;
  videos: import('@km-explorer/provider-types').VideoStub[];
  cachedAt: number;
}

export function getCachedActor(actorUrl: string): CachedActor | null {
  const row = getActor.get(actorUrl) as { term_id: number; videos: string; cached_at: number } | undefined;
  if (!row) return null;
  return { termId: row.term_id, videos: JSON.parse(row.videos), cachedAt: row.cached_at };
}

export function setCachedActor(actorUrl: string, termId: number, videos: import('@km-explorer/provider-types').VideoStub[]): void {
  upsertActor.run(actorUrl, termId, JSON.stringify(videos), Date.now());
}

// --- Dirty actor tracking ---
// Ownership: only setCachedDetail writes to dirty_actors (via transaction).
// Only the backfill script reads and clears dirty_actors.

export function getDirtyActorUrls(): string[] {
  const rows = getDirtyActors.all() as { actor_url: string }[];
  return rows.map(r => r.actor_url);
}

export function clearDirtyActors(urls: string[]): void {
  if (urls.length === 0) return;
  clearDirty.run(JSON.stringify(urls));
}

