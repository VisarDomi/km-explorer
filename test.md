# iOS Safari regression tests

The frozen product contract and provider URLs are defined in
[`test.txt`](test.txt). The suite builds and injects the current km-explorer
bundle on a real iPhone, then exercises Favorites, provider/client pagination,
card readiness, real video routes, playback UI, actor-video replacement
navigation, bfcache restoration, and IndexedDB-backed cache restart.

Install dependencies once:

```bash
npm install
```

Enable the universal `userscript-ios-test` debugger on the phone and disable
other installed copies of km-explorer. Before starting, foreground
`https://example.com/` in Safari and keep the phone unlocked.

Run the small connectivity and rendering path first:

```bash
npm run tests:smoke
```

Run the complete safe suite with:

```bash
npm run tests
```

Equivalent common selectors are:

```bash
npm run tests -- --test smoke --site ytboob
npm run tests -- --test full --site ytboob
```

The runner:

- type-checks with `npx tsc --noEmit`;
- builds with `npx vite build` without incrementing the production version;
- injects the freshly built bundle after each real navigation or reload;
- uses the live provider read-only except for one Favorite toggle that is
  immediately reversed and backed by full Favorites snapshot restoration;
- uses unique deterministic fixture records for the bfcache cache-restart
  check and removes them afterward;
- reports requirement-oriented `PASS`, `FAIL`, and `SKIP` results;
- returns Safari to exactly `https://example.com/` even after failure.

Synthetic card clicks can prove that the app attempts to copy the correct media
URL, but Safari only grants the real clipboard write to a physical trusted tap.
The trusted-tap behavior remains a manual iPhone check.
