# September 22 recovery pass — Ytb build 4

Public metadata GET/HEAD and the read-only Typesense multi_search POST retry
transient transport/HTTP failures automatically. PC checks and writes retain
single-attempt behavior. Cancellation reaches native transfers and backoff.

WebKit still decodes videos. Native-adapter media recovery reloads network-error
or stalled playing sources, preserving the video element, mute, pause choice and
VOD position. Unsupported-format errors still use the existing Copy control.
Failed thumbnails retry automatically and resume on network return. No new UI.

The shared card handler now commits its small local highlight before navigation
can terminate the storage worker. It does not fetch video metadata before opening.
This fix is built into the userscript/extension as well. Native cold reader/list
checkpoints and interrupted-render recovery retain their existing behavior.

Validation: `npm run build:ios -- --prepare-only`, `npm run test:ios`, and
`bash apps/ios/scripts/test-network.sh` on the Mac. Native fixtures cover real
URLSession failure/503 recovery, search POST versus writes, cancellation and
reader/list checkpoint recreation. Browser fixtures use WebKit, including the
actual production bundle/worker/IndexedDB and media/thumbnail recovery.

## Physical validation

All provider builds were installed in place using their existing paid identities.
See `robustness-verification.json` for sanitized results. Cold-launch checks passed on the iPhone. A read queued with both Wi-Fi and cellular off completed with HTTP 200 after Wi-Fi returned, using the same pending request without a reload or manual retry.

The existing monthly runner successfully renewed every delivered provider build,
retaining the same app identities/data. The scheduler is resumed and its installed-app
scan exits successfully. No new background item or power-setting change was made.
