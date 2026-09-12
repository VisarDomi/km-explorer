# Ytb iPhone app

Ytb is the standalone iOS port of km-explorer, with ytboob built in. Its entry
imports `src/provider/ytb.ts` directly; there is no app provider registry or
provider argument. The userscript/extension source repository keeps its existing
name and build commands so Reader Extensions packaging continues to work.
`readme.md` and `test.txt` remain user-owned.

## Behavior and source ownership

The app bundles the existing routes, CSS, cards, pagination, favorites, metadata
cache, worker storage, immediate scrollend, player controls and scrubbing. It
streams with the same HTML video element: inline, muted autoplay, custom controls.
The existing Copy button appears on media error and copies only when tapped.
KMPlayer remains a possible external fallback in this first version. No VLC,
AVPlayer rewrite, media downloads or codec workaround is included.

Swift provides the full-screen WKWebView, normal Back/forward gestures, native
metadata/PC networking and clipboard access. The app loads bundled documents at
`ytb://app/`; remote source scripts never execute. Navigation keeps source paths
and real document history. Related videos still replace the current document.
`build.mjs` adapts only the platform boundaries, removes SOC, and gives storage
and backup identities Ytb names. It fails when an expected source boundary
changes. Shared UI fixes therefore reach the app on its next build.

Cold launch uses the same library-then-reader approach as the other apps,
retaining a Back destination underneath a resumed video. View checkpoints are
atomic native writes; IndexedDB still owns favorites and caches. Workers end on
pagehide and are recreated on Back, matching the gallery app: a frozen page must
not hold an IndexedDB transaction that blocks the next document. Existing stores
are checked read-only at startup; initialization writes only for a fresh database. Bootstrap pages
cannot overwrite the saved destination. No 100ms scroll stability timer is added.
Video playback itself starts as in the original userscript; no new watch-time
history semantics are introduced.

## Identity and manual import

- Display/product/target: **Ytb**, no custom icon.
- Bundle: `com.visar.Ytb.paid`; paid team `65U58U86DD`.
- IndexedDB: `ytb`; PC identity database: `ytb-pc-backup-state-v1`.
- Native view state: `Library/Application Support/Ytb/view.json`.
- New PC backups: `backups/readers/ytb/ytboob` in gallery-downloader.

Existing km-explorer backups remain unchanged at
`/home/visar/Documents/work/manga/gallery-downloader/backups/readers/km-explorer/ytboob`.
The user requested manual import and no migration code. Home retains the original
Import / Merge and Export controls. There is no legacy namespace discovery,
automatic import or backup copying. The PC server accepts the new Ytb namespace
with the same validation/size limit as km-explorer. Existing optional home backup
behavior is retained; an unavailable PC stays silent.

## Build and install

Start with `/home/visar/Documents/environment/mac-access.md`. Mac Ethernet:
`192.168.1.198`, SSH user `visar`; USB wireless remains DHCP. Use the trusted SSH
options in that document. The Mac mirror is `/Users/visar/Developer/ytb/apps/ios`.

From the km-explorer repository on Linux:

```sh
npm run build:ios -- --prepare-only
npm run test:ios
python apps/ios/scripts/deploy.py sync
python apps/ios/scripts/deploy.py build
python apps/ios/scripts/deploy.py status
python apps/ios/scripts/deploy.py install
python apps/ios/scripts/deploy.py finish
```

Wait for no build PID, exit 0 and BUILD SUCCEEDED before installation. The helper
checks the paid signature, bundle/display name, absence of custom icon, device
provisioning and expiry. Updates preserve the existing app container.
`build.sh`/`build-native.py` use the suite signing lock, including the renewal
runner's inherited lock. GUI LaunchAgents provide Xcode's Keychain session.
Generated Web bundles contain the private PC access key and stay ignored. Restore
the public LAN CA into `Resources/LocalCA.cer` from the trusted existing app setup;
do not substitute an accept-all TLS handler.

For inspection, use the Mac's existing inspector-venv Python with
`scripts/app-inspector.py --host-bundle com.visar.Ytb.paid --seconds 0`.
Only one inspector may attach at a time. Close it after navigation, then attach
a fresh session. Its default snapshot reports counts and media state, not URLs
from favorites. Real gestures and codec acceptance still require the iPhone.

## Renewal and recovery

Register `--ytb-root /Users/visar/Developer/ytb/apps/ios` with Reader Extensions'
`scripts/configure-refresh.py`, keeping all existing root arguments. The shared
`com.visar.installed-apps-refresh` scheduler then includes Ytb monthly. Pause only
an idle scheduler before updating approved build inputs; install/test, approve,
verify renewal and re-enable it. Do not add another daily/monthly job.
The setup copy is `/home/visar/Documents/environment/mac-renewal`; runtime source
stays here. See `verification.json` for this delivery's measured checks.

## Verified startup correction

The first physical cold-launch test restored the video URL but failed storage
initialization. A read-only probe opened IndexedDB immediately, while its read
remained blocked. The automatic home-to-video transition had retained the home
worker in the back cache. Build 2 uses Gallery-style worker termination on
pagehide and avoids an unnecessary per-page initialization write. Physical
relaunch then restored the video with readyState 4 and advancing playback; the
browser regression also verifies worker recreation and favorite edits on Back.
