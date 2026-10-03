# Ytb iPhone app

Ytb is the iPhone app for ytboob favorites. The web code lives in `src/`: routes,
CSS, cards, pagination, favorites, metadata cache, worker storage, player controls
and scrubbing, with the app's entry points and native bridge in `src/app/`.
`src/provider/ytb.ts` is the only provider; there is no provider registry or
provider argument.

## Behavior

The app streams with the HTML video element: inline, muted autoplay, custom
controls. The Copy button appears on media error and copies only when tapped;
KMPlayer remains the external fallback. There is no VLC, AVPlayer, media download
or codec workaround.

Swift provides the full-screen WKWebView, Back/forward gestures, native metadata
and PC networking and clipboard access. The app loads bundled documents at
`ytb://app/`; remote site scripts never execute. Navigation keeps source paths and
real document history; related videos replace the current document.

Cold launch restores the library, then the reader, keeping a Back destination
underneath a resumed video. View checkpoints are atomic native writes; IndexedDB
owns favorites and caches. Workers end on pagehide and are recreated on Back, so a
frozen page never holds an IndexedDB transaction that blocks the next document.
Existing stores are checked read-only at startup; initialization writes only for a
fresh database.

## Identity

- Display/product/target: **Ytb**, no custom icon.
- Bundle: `com.visar.Ytb.paid`; paid team `65U58U86DD`.
- IndexedDB: `ytb`; PC identity database: `ytb-pc-backup-state-v1`.
- Native view state: `Library/Application Support/Ytb/view.json`.
- PC backups: this repository's server, `ytb` namespace (`server/BACKUPS.md`).

Home has Import / Merge and Export controls. An unavailable PC stays silent.

## Build, test and install

Start with `/home/visar/Documents/environment/mac-access.md`. Mac Ethernet:
`192.168.1.198`, SSH user `visar`; USB wireless remains DHCP. Use the trusted SSH
options in that document. The Mac mirror is `/Users/visar/Developer/km-explorer/apps/ios`.

From this repository on Linux:

```sh
npm run build:ios -- --prepare-only
npm run test:ios
python apps/ios/scripts/deploy.py sync
python apps/ios/scripts/deploy.py build
python apps/ios/scripts/deploy.py install
```

`build` runs attached in the Mac's GUI session (Xcode needs its Keychain) and
registers no background item; wait for BUILD SUCCEEDED. `install` checks the paid
signature, bundle and display name, absence of a custom icon, device provisioning
and expiry, then installs over the existing app, keeping its data. `build.sh` and
`build-native.py` use the shared signing lock. Generated Web bundles contain the
private PC access key and stay ignored. Restore the public LAN CA into
`Resources/LocalCA.cer` from the trusted existing setup; never substitute an
accept-all TLS handler.

`npm run test:ios` type-checks `src/`, then runs the storage-retry, app-flow,
media-recovery and image-recovery fixtures in WebKit. Native route checks run on
the Mac by combining `Ytb/Models.swift` and `Tests/Routes.swift`.

For inspection, use ios-tools' inspector on the Mac (`~/Developer/ios-tools/inspector`,
see its README) with `--bundle com.visar.Ytb.paid --url-prefix ytb://app/
--snapshot-file scripts/inspector-snapshot.js`. Only one inspector may attach at a
time; attach a fresh session after navigation. The snapshot reports counts and
media state, not URLs from favorites. Real gestures and codec acceptance still
require the iPhone.

## Renewal and recovery

Ytb renews monthly through this repository's scheduler,
`com.visar.renewal.km-explorer` ([ios-tools renewal](../../../../ios-tools/renewal/PAID-REFRESH.md));
`scripts/renewal.py` lists its entry. Pause only that idle scheduler before
updating approved build inputs; install and test, approve, verify renewal and
resume it. The setup copy is `/home/visar/Documents/environment/mac-renewal`.
