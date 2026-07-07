# km-explorer → userscript investigation

## Current architecture

km-explorer is a **SvelteKit PWA + Express server** monorepo that proxies ytboob.com:

```
packages/
  app/              # SvelteKit PWA frontend (runs in browser)
  server/           # Express HTTPS server (runs on LAN)
  extensions/       # ytboob.com provider (scraping/parsing logic)
  provider-types/   # shared TypeScript interfaces
```

**Server does:**
- Proxies all API calls to ytboob.com (Typesense search, WP REST, video pages) — `proxyFetch` with Cloudflare solving
- Caches thumbnail images to disk (`~/.local/state/km-explorer/thumbnails/`, SHA256 of URL → filesystem path)
- Caches listing data in SQLite (`video_details`, `actor_cache`, `cached_listings` tables)
- Scrapes video details in a queue, streams results to client via SSE
- Serves the PWA static build + service worker

**Client does:**
- IndexedDB → favorites only (`db.ts` with `favorites` object store)
- localStorage → session state (scroll position, last query, nav stack)
- Calls server API for everything else (`/api/latest`, `/api/search`, `/api/image`, `/api/video-details`)

## tango-explorer userscript pattern

tango-explorer (`/home/visar/Documents/work/video/tango-explorer`) is a standalone Tampermonkey userscript:

```
tango-explorer/
  package.json              # vite + vite-plugin-monkey + @types/tampermonkey
  vite.config.ts            # finalBundlePlugin() + monkey() plugin
  tsconfig.json
  src/
    main.ts                 # entry point
    app.ts                  # Application class, DI wiring
    app.controller.ts       # event wiring
    types.ts                # interfaces
    core/
      constants.ts          # API URLs, DOM ids, config
      environment.ts        # page-context setup (hijacks setInterval, blocks MutationObserver, etc.)
      xhr-fetch.ts          # XHR wrapper for API calls
      app.state.ts          # mutable state container
      emitter.ts            # typed event emitter
      events.ts             # event name constants
    services/
      api/                  # StreamerService, AuthService, ActionService, DownloadListService
      alias.service.ts
      alias-cache.ts        # localStorage cache
      stream-loader.service.ts
    video/
      live-url.service.ts
      live-url-cache.ts     # localStorage cache
      video.manager.ts
      player/hls.player.ts
    ui/
      ui.manager.ts         # DOM injection, view containers
      ui.resources.ts       # CSS styles constant
      list/list.manager.ts  # list rendering
      stream-unit/          # video card rendering
```

**Key patterns:**
- `finalBundlePlugin()` wraps bundled code in `<script>` injection → runs in **page context** (not isolated sandbox), giving access to page's `fetch`, `indexedDB`, and DOM
- `vite-plugin-monkey` generates the `// ==UserScript==` header block
- Match URLs: the site the userscript targets (e.g. `https://tango.me/*`)
- UI: vanilla TS + DOM manipulation (no framework)
- Caching: `localStorage` for small key-value data (live URLs, aliases)
- API calls: `XMLHttpRequest` wrapper (`xhr-fetch.ts`) for direct API access

## What changes

| Concern | Current (server + PWA) | New (userscript) |
|---|---|---|
| **Build** | SvelteKit + tsc | Vite + vite-plugin-monkey |
| **Runtime** | PWA installed on device | Tampermonkey userscript injected into ytboob.com |
| **API calls** | Via Express proxy (Cloudflare solving) | Direct `fetch()` from page context |
| **Thumbnail cache** | Server disk cache (binary bytes) | **None** — `<img>` loads directly from ytboob.com CDN |
| **Listing cache** | Server SQLite | **IndexedDB** (URLs only, no binary) |
| **Favorites** | Client IndexedDB | IndexedDB (keep, same schema) |
| **Video detail scrape** | Server queue + SSE | Client-side on-demand (fetch page → parse HTML) |
| **Actor channels** | Server resolves slug→term ID, caches in SQLite | Client resolves slug→term ID via WP REST API, caches in memory |
| **UI** | Svelte components | Vanilla TS + DOM (class-based managers) |
| **Network** | HTTPS server on LAN | None (runs in browser) |

## Files to create

```
userscript/
  package.json           # name: "km-explorer-userscript"
  vite.config.ts         # copy tango-explorer's verbatim, match: ["https://ytboob.com/*"]
  tsconfig.json          # ESNext, bundler, strict
  src/
    main.ts
    core/
      types.ts           # VideoStub, VideoDetail, Actor, PagedResult
      parse.ts           # lift verbatim from packages/extensions/providers/ytb/src/parse.ts
      provider.ts        # lift from ytb/src/index.ts, strip VideoProvider interface wrapper
      app-state.ts       # AppState class (mutable state container)
      app-controller.ts  # AppController class (orchestration)
    services/
      cache-db.ts        # IndexedDB: listings store + favorites store
      api.ts             # fetch wrappers + cache-then-fetch logic
    ui/
      styles.ts          # CSS constant (dark theme, card grid)
      ui-manager.ts      # DOM injection, view containers
      list-manager.ts    # search bar, video grid, infinite scroll
      channel-manager.ts # channel view, pagination
      favorites-manager.ts
      toast.ts
```


## Key decisions

1. **Page-context execution**: the `finalBundlePlugin()` from tango-explorer's config is load-bearing. Without it running in page context, cross-origin `fetch` to `ts-api.ytboob.com` would be blocked by CORS.

2. **No error swallowing**: no try/catch wrappers, no silent no-ops, no fallback values. If a fetch fails, the promise rejects. If IndexedDB is unavailable, the open fails. If parsing chokes on unexpected HTML, the error propagates. Bugs surface immediately — the console and the UI break visibly.

3. **TTL for listing cache**: 24 hours (86400000 ms). Stale entries evicted on read.

4. **Video details not cached**: scraped on demand each time — they're ephemeral (video source URLs may change). The server's approach of caching + SSE streaming is overkill for a client-side app.

5. **Actor term ID resolution**: the WP REST API endpoint `${BASE_URL}/wp-json/wp/v2/actors?slug=${slug}` returns the numeric term ID. Cache in a `Map<string, number>` for the session.

6. **No thumbnail proxy**: thumbnails load directly from ytboob.com CDN via plain `<img src>`. If the CDN 404s, the broken-image placeholder shows — no fallback URL, no proxy retry.

## Files to delete (old architecture)

- `packages/server/`
- `packages/app/`
- `packages/extensions/`
- `packages/provider-types/`

Root `package.json` updated: remove workspaces, `scripts.build` → `cd userscript && npm run build`.

## Verification

```bash
cd userscript && npm install && npm run build
# → produces dist/km-explorer-userscript.user.js
```

Then inject into a ytboob.com browser tab and verify:
1. UI overlay renders with search bar + video grid
2. Latest videos load from Typesense API
3. Search returns filtered results
4. Clicking a card scrapes detail, copies videoSrc, opens channel view
5. Favorites persist across page reloads (IndexedDB)
6. Infinite scroll loads more pages

## Assumptions

| Assumption | Why |
|---|---|
| Typesense API (`ts-api.ytboob.com`) allows CORS from ytboob.com | Subdomain of the page origin. If CORS blocks it, the fetch rejects — visible in console. |
| ytboob.com Cloudflare clearance cookie covers API calls | Userscript runs in-page; the browser already has the cookie from visiting ytboob.com. If not, the fetch gets a 403 and rejects. |
| WP REST API `/wp-json/wp/v2/actors?slug=X` returns actor term ID | Standard WordPress REST API endpoint. If missing, the fetch 404s and the error propagates. |
