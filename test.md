# Behavior checks and phone backup

`test.txt` is unchanged. The previous media/navigation contract remains there.

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

The old `tests/ios/run.mjs` is intentionally guarded before connection: its
localStorage snapshots can no longer restore authoritative v5 state. Its media
fixture cases remain available for a future port, but it must not mutate a live
phone under the old restoration assumptions.

## Authorized live migration and backup

Disable KM Explorer in the userscript manager, leave only the universal debugger
enabled, and keep Safari unlocked/foregrounded on example.com. Then:

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
