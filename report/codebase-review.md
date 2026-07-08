# Codebase Review

## Architecture (correct, stable)

Hard-navigation userscript. `document.open/close` is the takeover. `void` is the async-from-sync bridge. Module-level `let` where it remains is page state — one route per page load.

---

## What got fixed

| Before | After |
|--------|-------|
| Resolve pipeline inlined 3× (favs init, favs merge, channel init) | `getVideos(ids)` in `core/videos.ts` |
| Channel-open click handler inlined 2× (search, favs) | `onVideoClick(video)` in `core/videos.ts` |
| Module-level `let _ids`, `_videos` in favs.ts | Locals + parameters |
| Dead `if (length === 0) return` guards in db.ts, ytb.ts | Removed |
| `.filter(Boolean)` on non-empty regex matches | Removed |
| `selfRegister` inline `.then()` chain in video-card.ts | Named async function |

---

## Remaining issues

### 1. Prefetch worker dies silently

`video-card.ts:14-22` — if `scrapeVideoDetail` throws, `runWorker` crashes. Current item's `onReady` never fires. All remaining queue items are lost. Cards stay at opacity 0.4 forever with no indication. `void runWorker()` at line 23 swallows the crash entirely.

**Fix:** wrap the scrape in try/catch inside the loop. Call `onReady` with a sentinel or fire an error callback so cards show a distinct error state.

### 2. `onVideoClick` throws on zero actors

`core/videos.ts:28-31`:
```typescript
export async function onVideoClick(video: VideoStub) {
    const detail = await getDetail(video.pageUrl);
    window.location.href = detail.actors[0].url;
}
```

If a video has no actor links, `actors` is `[]`, `actors[0]` is `undefined`, `.url` throws TypeError. Unhandled rejection in console.

**Fix:** re-add the guard, or assert with a visible message. The old code had `if (detail?.actors.length)`.

### 3. `void` on route inits discards all errors (main.ts)

No change from before. If a route init throws, it vanishes. Architectural constraint, but a `window.onerror` / `unhandledrejection` handler would give visibility.

### 4. localStorage swallowing (search.ts:32,37)

Empty `catch` blocks on `setItem`/`getItem`. Minor — scroll position is non-critical. But the catch hides the failure mode.

### 5. `if (!v) return` dead code (search.ts:122)

`forEach` already skips sparse-array holes. This guard never fires. The real issue: the sparse-array construction at lines 49-55 — if a Typesense page returns fewer than 12 items, holes form and `forEach` silently drops them. The grid shows fewer videos than expected with no indication.

### 6. `if (src)` guard on clipboard path (video-card.ts:95)

`markReady` always sets `data-video-src` before `ready = true`. If `ready` passes, `src` should always be set. The guard can't fire in correct operation. If it ever does fire, copy silently fails.

---

## Honest patterns (keep)

| Location | Pattern | Why |
|----------|---------|-----|
| `ytb.ts:55-65,82-87` | `!` assertions on API results | API shape change → crash |
| `ytb.ts:96` | `throw new Error(...)` on missing videoSrc | No silent empty string |
| `core/videos.ts:24` | `map.get(id)!` | Invariant break → crash |
| `channel.ts:17` | cached path: `map.get(id)!` → crash on corrupt cache | Same |
| `video-card.ts:89` | `if (!ready \|\| busy) return` | Correct visual gating |
| `channel.ts:68` | `() => {}` click handler | Channel is leaf — correct |

---

## Cosmetic

- **Inline CSS strings** in `favs.ts:buildImportSection()` — 6 long `style.cssText` strings. Move to CSS classes (style block already injected by shell.ts).
- **`db.ts` v4 upgrade** — creates DETAIL_STORE then immediately deletes and recreates it. Correct migration but reads like a bug. Add a version-gated comment.
- **`100` chunk size** — unverified API upper limit, used in one place now (`core/videos.ts:10`). Fine as a local magic number until verified.
