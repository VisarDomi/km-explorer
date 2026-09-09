
## Thumbnail → video → optional Copy

Thumbnails navigate immediately. They do not resolve video sources, scan related
pages, copy URLs, or wait for a cache/clipboard readiness state. Favorites and
selected-card highlighting remain; the small highlight write is queued without
blocking navigation. No thumbnail spinner or “Copied” overlay remains.

The destination video route reads its own cached detail or fetches that page's
source when absent. A disposable cache write does not delay playback. Actor
metadata is optional for playback, and related thumbnails do not prefetch details.
There is no automatic clipboard write. Only a media error reveals a **Copy**
button over the video. A real tap copies the resolved URL; success says **Copied**,
rejection says **Copy failed — tap to retry**. Working playback has no copy UI.
If there is no source URL to copy, the page reports that instead of claiming success.

Listings use native document/link navigation so Safari retains history and can
restore bfcache even if the takeover stopped the original document while loading.
Related-video selections retain the existing `location.replace()` behavior:
Back goes directly to the originating listing, not through every related video.
No custom Back control, pushState router, or synthetic history entries are added.


## Safari extension

`npm run build:extension` builds the same routes, UI, worker and backup logic from
`extension/main.ts`. `src/main.ts` stays the userscript entry point. Unsupported
routes do nothing; recognized routes take over before initializing storage.
The extension uses MAIN-world, top-frame `document_start` on `ytboob.com` only.
It guards repeated injection and stops/replaces the original DOM instead of
Safari's recursively reinjecting document.open/close sequence. It owns the mobile
viewport. This is not a guarantee that zero original website bytes/scripts run.

The iOS host lives in the separate
[Reader Extensions](https://github.com/VisarDomi/reader-extensions) repo
(default checkout: `../../reader-extensions`). Its
[setup/deployment guide](https://github.com/VisarDomi/reader-extensions#fresh-machine-setup)
covers all four independent extensions. From that repo, `npm run build -- km-explorer`
builds/stages KM only, or `npm run stage -- km-explorer` stages this existing bundle.
KM's bundle identifier is
`com.visar.galleryreader.extensiontest.KMExplorer`. Enable KM and allow ytboob.com
in Safari settings; disable its Userscripts version. Existing origin IndexedDB
and backup identity are shared, not copied or reset. No clipboard extension
permission is needed: Copy is a real user gesture on the failed video.

Private `dist/extension` contains the PC backup key. Do not publish it.

## Conditional PC backups

The favorites home at `https://ytboob.com/` uses the existing HTTPS backup service
on `https://192.168.1.197:7777`. No separate service is needed.

- PC unavailable or timed out: no prompt, no notification, and normal local use.
- First online visit: compare phone/PC counts and choose **Back up this phone**
  or **Restore from PC**. Initial success is confirmed once.
- Enrolled home visits and bfcache returns: automatic, silent backups. The next
  home visit retries after an outage. Online access/data errors remain visible.
- Each phone/data reset gets an independent ID. Restore copies a selected current
  or previous snapshot into a new ID, leaving the source backup untouched.
- The PC keeps current plus one previous snapshot in one atomic private file.

Backups include all three URL/catalog caches (`videos`, `details`, `channels`),
favorites, selected-card identity and listing scroll positions. They do **not**
contain downloaded video media, cookies, or unrelated website storage.

## Storage and startup

`main.ts` still only recognizes/routes the page. On supported routes, takeover
runs stop/open/close first, paints loading UI, then initializes a lazy worker.
The Safari extension substitutes stop/DOM replacement as described above.
IndexedDB reads/writes, backup JSON processing and PC networking run in that worker.
The existing provider/UI flow is otherwise retained; this is not a provider rewrite.

IndexedDB `km-explorer` upgrades from v4 to v5 without clearing existing caches.
The new `preferences` store holds favorites/highlight/scroll in one record.
The only localStorage access is a one-time, yielding migration bridge: it reads
`km-explorer-favorites-v1`, `ke-card-highlight`, and `ke-scroll*`. The worker parses
and commits them atomically. The old keys are left untouched, then ignored.
Do not re-enable an older build after migration: it uses stale localStorage and
the old database version. Restore replaces all four stores in one strict transaction.

## Builds and restore after formatting

```bash
npx tsc --noEmit 2>&1
npm run build
npm run tests
```

Install `dist/km-explorer.user.js`. The build reads the existing private backup
key from `../../manga/gallery-downloader/backups/readers/access-key`; overrides
are described in `.env.example`. Do not publish the built userscript: it embeds
that key. The script uses native worker fetch, not an extra GM request grant.

After formatting, reinstall/trust the PC HTTPS certificate, install this build,
then visit the favorites home on the same LAN and choose **Restore from PC**.
Select **iPhone before iOS downgrade**. PC snapshots live under
`gallery-downloader/backups/readers/km-explorer/ytboob/` and appear in that repo's
`npm run backups:status` output. Keep these files and the access key when moving PCs.

See [test.md](test.md) for verified phone results and safe tests, and
[the shared backup guide](../../manga/gallery-downloader/READER-BACKUPS.md) for
retention, authentication and recovery details.
