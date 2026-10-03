# Notes

Ytb is the only product: the iPhone app in `apps/ios` (see its `PORT.md`), with
its PC backup server in `server/`.

## Thumbnail → video → optional Copy

Thumbnails navigate immediately. They do not resolve video sources, scan related
pages, copy URLs, or wait for a cache/clipboard readiness state. Favorites and
selected-card highlighting remain; the small highlight write is queued without
blocking navigation.

The destination video route reads its own cached detail or fetches that page's
source when absent. A disposable cache write does not delay playback. Actor
metadata is optional for playback, and related thumbnails do not prefetch details.
There is no automatic clipboard write. Only a media error reveals a **Copy**
button over the video. A real tap copies the resolved URL; success says **Copied**,
rejection says **Copy failed — tap to retry**. Working playback has no copy UI.
If there is no source URL to copy, the page reports that instead of claiming success.

Listings use native document/link navigation so WebKit keeps history and bfcache.
Related-video selections use `location.replace()`: Back goes directly to the
originating listing, not through every related video. No custom Back control,
pushState router, or synthetic history entries are added.

## Storage and backups

IndexedDB reads and writes, backup JSON processing and PC networking run in the
storage worker. The `preferences` store holds favorites, the selected card and
scroll positions in one record; the `videos`, `details` and `channels` stores
cache the catalog. PC backups include all four stores, never video media or
cookies: see [PC backups](server/BACKUPS.md).

## Builds and tests

```bash
npm run build:ios -- --prepare-only
npm run test:ios
npm run test:server
```
