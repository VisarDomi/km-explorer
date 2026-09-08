# Behavior checks and phone backup

`test.txt` is user-owned and unchanged. Its old pre-navigation copying and
thumbnail source-resolution requirements are superseded by the new flow below.

## Simplified media flow — September 8, 2026

- Thumbnail navigation is immediate, even without a detail-cache record.
- No thumbnail detail fetching, readiness gating or clipboard work.
- Only the destination resolves its source; no prior-page state is required.
- Playback works without actor metadata. Media failure alone reveals Copy.
- No automatic clipboard writes. A tap copies the destination source, reports
  success only after resolution, and reports denial truthfully with retry.
- Playback recovery hides Copy. Related-video replacement semantics remain.
- `tests/browser/video-flow.mjs` exercises the full build with a real worker/IDB,
  a missing detail, a real invalid-media response and controlled clipboard outcomes.
  It is not a substitute for iPhone permissions, codec or physical Back checks.

Run those same regression cases against the extension bundle as well:

```sh
npm run build:extension
KM_TEST_BUNDLE=dist/extension/content.js node tests/browser/video-flow.mjs
KM_TEST_BUNDLE=dist/extension/content.js node tests/browser/backup.mjs
```

## Native extension checks

### Scroll-delay audit — v92

The listing's only 100ms delay was a timer around saving scroll position.
It is removed: `scrollend` captures the current position immediately and sends
it to the existing worker; IndexedDB writes remain asynchronous. There is no
layout change or programmatic scroll in this handler. Backup/database failure
timeouts and initial migration yields are unrelated and remain unchanged.

`tests/browser/scroll-save.mjs` exercises both builds with real worker storage:
save the scrollend position rather than a later position, save another completed
scroll, and restore it on reload. Application main-thread IndexedDB access is
forbidden during the test. On the phone, open a numbered listing, scroll, then
reload and check that your position is restored. Video playback and Copy are
unchanged.

### Earlier native acceptance

The combined Reader Extensions app built/signed/installed with two independent
extensions. The initial iPhone run preserved 503 favorites, 21 scroll positions,
12,633 videos, 4,966 details, 105 channels and the selected-card preference.
The existing backup ID was retained; a normal home visit returned HTTP 200 from
the PC without a setup prompt. Viewport width was 428 CSS px with scale 1.

The initial extension exposed a history bug after asynchronous pre-navigation
copy/save: location.href replaced history while the document was still loading.
Native Safari probing showed history 1 → 1 using location.href, versus 1 → 2 → 3
with links; Back restored the exact original grid and boot object with persisted
true. The new flow removes the async navigation gate and uses native links.
The gallery repository's `tests/ios/native-inspector.py`, `km-history.py`, and
`back-gesture.py` use the Mac's trusted USB Web Inspector, not userscript injection.

The simplified v91 build was signed and installed in place. On the real iPhone,
the documented unsupported media returned a codec/source error (`video.error` 4)
and exposed Copy. A subsequent native snapshot observed **Copied** after the
user's tap (the only success path awaits clipboard.writeText). No clipboard read
or extension clipboard permission was used. The final automated trace was
interrupted by the inspector connection, but the user subsequently confirmed
both real Copy functionality and Safari Back/bfcache on the installed v91 build.

## Isolated tests

Run `npx tsc --noEmit 2>&1`, `npm run build`, then `npm run tests`.
These use disposable Chromium profiles and a disposable real PC backup store;
no live phone or personal backup files are modified.

- Upgrade a seeded v4 database without losing any of its three caches.
- Migrate favorites, selected card and scroll from legacy localStorage.
- Prohibit main-thread IndexedDB, then prohibit localStorage on later loads.
- Keep both fresh and enrolled phones quiet when PC connections are refused.
- Confirm initial backup, silently save later favorite edits, preserve previous.
- Restore a previous snapshot into a new identity without changing its source.
- Reload the restored phone and verify favorite cards/cache readiness.
- Force a real DataCloneError after restore has started clearing/replacing stores:
  all four stores roll back. Invalid snapshots and repeated migration preserve data.

The retired localStorage-mutating iPhone suite and old clipboard probe were
removed; their history remains in Git. Use the isolated behavioral tests above
and the native Safari inspectors for the current media flow.

## Authorized live migration and backup

Disable both the KM Explorer userscript and its Safari extension, leave only the
universal debugger enabled, and keep Safari unlocked/foregrounded on ytboob.com.
This runner injects the userscript; it is not an extension acceptance test. Then:

```bash
npm run phone:backup
```

The runner reads baseline data in a temporary worker, injects the production
build, chooses **Back up this phone**, and checks the private PC file against the
phone. It does not toggle favorites, choose Restore, clear data, or modify legacy
localStorage. It also checks home cards and a real reload. Worker audits return
hashes/counts and cache keys, not full cached metadata. Cleanup returns Safari
to example.com and shuts down the shared bridge.

The phone runner is an explicit backup operation, not the default test suite.
Do not run multiple phone controllers on port 37777 at the same time.

## Actual Safari result — 2026-09-07

- 503 favorites, 21 scroll positions, selected card: unchanged.
- 12,633 videos, 4,966 details, 105 channels: preserved through v4 → v5.
- Every saved cache record matched the phone, as did personal-data hashes.
- All 503 cards ready, with decoded thumbnails.
- Reload: same identity and preferences, zero backup notifications.
- Profile: **iPhone before iOS downgrade**.
- Phone data was backed up, not restored over. Legacy keys remain untouched.

Debugger injection does not install or enable the build permanently. Install
`dist/km-explorer.user.js` before re-enabling KM Explorer. After formatting,
reinstall/trust the PC certificate and choose Restore from PC on the home page.
