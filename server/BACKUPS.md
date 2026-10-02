# PC backups

Ytb (and the KM Explorer userscript) back up favorites, the selected card, scroll
positions and the video/detail/channel caches (never media) to this repository's
PC server, on HTTPS port 7733. The app uses the `ytb` namespace and the userscript
`km-explorer`; they never share backups.

- On first use the app compares its data with the PC backups and offers **Back up
  this phone** or **Restore from PC**; later home visits back up silently. An
  unreachable PC is silent.
- `GET /api/reader-backups/<ytb|km-explorer>/ytboob` lists the phones' backups;
  `PUT …/ytboob/<installation-id>` saves one (up to 50 MB).
- Each phone has its own file holding the current and at most one previous
  snapshot in one atomic file. Identical retries do not rotate; a stale revision
  gets 409; an empty favorites list cannot replace a nonempty backup.

The service is the systemd user unit `km-explorer-backups.service` (a copy is in this folder); it runs
`server/backups.mjs` with the PC's mkcert certificate
(`~/.local/share/mkcert/pwa`). Data and the access key live in
`~/.local/share/km-explorer/backups/` (mode 0700/0600, never in Git). The server
creates the key on first start; builds read it from there unless
`VITE_READER_BACKUP_KEY` is set (see `.env.example`). Built bundles contain the
key: never publish them. Keep that folder, key included, when moving the service
to another PC; a new key means rebuilding the apps.

```sh
systemctl --user status km-explorer-backups.service --no-pager
npm run backups:status   # what each phone saved (counts, labels and dates only)
npm run test:server
```

Every response is `no-store`; requests without the key get 401, and CORS allows
only ytboob.com. Files are written durably: temporary file, fsync, rename,
directory fsync. This is a local-PC backup, not protection against losing the PC.
