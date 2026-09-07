# What

A repo that replaces UI and uses our own UI to make opening links to KMPlayer easier.

# Why

UX of site itself is not good enough

# How

Cache the urls in indexeddb so that navigation is faster

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
