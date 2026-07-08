# Codebase Review: Attack Surface & Refactoring

## Philosophy

**Hiding is attacking.** Every guard that silently returns empty, every `try/catch {}`, every `|| []`, every `.filter(Boolean)` on a path that should never produce falsy values — these are attack surface. They make bugs invisible. The codebase should surface failures, not pad over them. The `!` assertion that crashes on a broken invariant is honest. The dimmed card that stays at opacity 0.4 is honest. The empty-state guard you removed from `favs.ts init()` was dishonest.

## Architecture (correct, not changing)

These are not problems — they're correct for a hard-navigation userscript:

- `startInit()` + `document.open/close` — the takeover mechanism. Called from each route because each route is a separate page load via `window.location.href`.
- `void init*()` in `main.ts` — the userscript manager calls `main()` synchronously. `void` is the only way to call async from sync.
- Module-level `let _ids`, `_videos`, `totalClientPages` — these are page-level state. One route runs per page load. They exist for the page lifetime.
- Channel page click handler `() => {}` — correct. Channel is the leaf; navigating to the current actor would be a no-op.
- `!` assertions on `map.get(id)` — correct. If `lookupByIds` returned fewer results than requested, the invariant broke and the crash surfaces it.

---

## 1. Swallowing Attacks — Still Present

### 1a. Prefetch worker death (video-card.ts:13-22)

```typescript
async function runWorker(): Promise<void> {
    workerRunning = true;
    while (pending.length > 0) {
        const item = pending.shift()!;
        const detail = await scrapeVideoDetail(item.pageUrl);
        await putDetail(item.pageUrl, detail);
        item.onReady(detail.videoSrc);
    }
    workerRunning = false;
}

function enqueue(pageUrl: string, onReady: (videoSrc: string) => void): void {
    pending.push({ pageUrl, onReady });
    if (!workerRunning) void runWorker();
}
```

If `scrapeVideoDetail` throws (network error, page restructured, regex fails), the worker dies. The current item's `onReady` never fires — card stays dimmed. All remaining items in the queue are lost — their cards stay dimmed forever too. The `void` on line 23 swallows the error entirely. No card shows an error state. No retry. The only symptom: cards that never light up.

**Fix:** wrap the scrape in try/catch inside the while loop, call `onReady` with a sentinel or fire a per-card error callback so the card can show a distinct error state (e.g. red border, error icon). Don't let one bad scrape kill the whole queue.

### 1b. Dead defensive guards in `db.ts`

```typescript
// db.ts:66
export async function putVideos(videos: VideoStub[]): Promise<void> {
    if (videos.length === 0) return;  // ← every caller already guards with if (missing.length > 0)
    ...

// db.ts:73
export async function getVideosByIds(ids: string[]): Promise<Map<string, VideoStub>> {
    if (ids.length === 0) return map; // ← no caller ever passes empty
    ...
```

These guards are dead code. If they ever trigger, a caller has a bug (passing empty when it shouldn't). Returning silently hides that bug. Remove them — let the function proceed normally (empty transaction is fine, empty map is fine, but the caller's logic error goes undetected).

### 1c. Dead defensive guard in `ytb.ts`

```typescript
// ytb.ts:74
export async function lookupByIds(ids: string[]): Promise<VideoStub[]> {
    if (ids.length === 0) return []; // ← callers guard with if (missing.length > 0)
```

Same pattern. Dead code. If this triggers, a caller passed empty — that's a bug upstream. Returning `[]` hides it.

### 1d. localStorage swallowing (search.ts:32,37)

```typescript
function saveScroll(): void {
    try { localStorage.setItem(...); } catch { /* corrupt */ }
}
function loadScroll(): number | null {
    try { ...; return ...; } catch { return null; }
}
```

localStorage failures (quota, private browsing) are silently ignored. Scroll position is lost with no indication. For a non-critical feature this is borderline acceptable, but the empty catch blocks are pure swallowing. At minimum: if there's a legit reason to catch (Safari private browsing throws on `setItem`), make the catch explicit about what it handles.

### 1e. `void` on route inits discards all errors (main.ts)

```typescript
void initSearch(1);
void initFavs();
void initChannel(pathname);
```

If any route init throws (network down, DB corrupt, API changes), the error vanishes into `void`. The user sees a blank page or partial page. This is an architectural constraint of userscripts — `main()` can't be async. But it means there is zero error visibility at the route level. A top-level `window.onerror` or `unhandledrejection` handler that shows a visible error state would close this gap without changing the `void` pattern.

---

## 2. Defensive Padding — Dead Code That Could Hide

### 2a. `.filter(Boolean)` on non-empty matches (favs.ts:72)

```typescript
const ids = [...raw.matchAll(/\d+/g)].map(m => m[0]).filter(Boolean);
```

`/\d+/g` always produces non-empty matches. `.filter(Boolean)` is dead code. If the regex ever changes to have optional groups, it would silently drop entries instead of crashing. Remove it.

### 2b. `if (!v) return` inside forEach on a potentially-sparse array (search.ts:122)

```typescript
slice.forEach((v, i) => {
    if (!v) return;
    ...
});
```

`forEach` already skips holes in sparse arrays. `if (!v)` never triggers. But the sparse array pattern itself (lines 49-55) is worth examining — if `fetchTypesenseBatch` returns pages with fewer than 12 items, the `videos[idx++] = v` indexing creates holes. `forEach` silently skips them. The grid shows fewer videos than expected with no indication. This isn't `if (!v)`'s fault — the sparse-array construction is the root issue.

### 2c. `if (src)` guard in card click handler (video-card.ts:95)

```typescript
const src = card.getAttribute('data-video-src');
if (src) {
    await navigator.clipboard.writeText(src);
}
```

`markReady` always sets `data-video-src` before setting `ready = true`. If the `ready` check passes, `src` should always be set. The guard can't fire in correct operation. If it does fire (e.g. someone mutates the attribute externally), the copy silently fails. Remove the guard — if `src` is missing, let `writeText('')` or the null check crash visibly.

---

## 3. What's Honest (keep these)

| Location | Pattern | Why it's good |
|----------|---------|---------------|
| `ytb.ts:55-65` | `data.results![0]!`, `hits!`, `post_id!`, `found!` | API shape changes → crash, not silent wrong data |
| `ytb.ts:82-87` | Same `!` chain in `lookupByIds` | Same reason |
| `ytb.ts:96` | `throw new Error(...)` on missing videoSrc | No silent empty string flowing downstream |
| `favs.ts:90,126` | `map.get(id)!` | Invariant break → crash |
| `channel.ts:18,48,58` | `map.get(id)!` | Same |
| `video-card.ts:89-90` | `if (!ready \|\| busy) return` | Correct gating, not swallowing — the card shows its state visually |

---

## 4. Structural Duplication (main refactoring target)

The pipeline "resolve IDs → VideoStub[] with cache-fill" appears identically in three places:

| Step | favs init (105-127) | favs merge (76-91) | channel init (53-59) |
|------|---------------------|---------------------|---------------------|
| Query cache | `map = await getVideosByIds(_ids)` | same | `map = await getVideosByIds(allIds)` |
| Diff | `missing = _ids.filter(id => !map.has(id))` | same | `missing = allIds.filter(...)` |
| Chunk & fetch | chunk by 100 → `lookupByIds` → `putVideos` → `map.set` | same | same |
| Materialize | `_videos = _ids.map(id => map.get(id)!)` | `_videos = _ids.map(...)` | `allVideos = allIds.map(...)` |
| Render | `void renderAll()` | `void renderAll()` | `renderAll(allVideos)` |

This should be one function:

```typescript
// signature
async function resolveVideos(ids: string[]): Promise<VideoStub[]>
```

It encapsulates steps 1-4. Callers just assign the result and render. Each call site collapses from ~10 lines to 1-2.

**Where to put it:** a new file (e.g. `src/data/resolve.ts`). It depends on `db.ts` (getVideosByIds, putVideos) and `ytb.ts` (lookupByIds). Neither low-level module depends on the other — the new module is the glue. The dependency graph stays acyclic:

```
routes/ ──→ data/resolve.ts ──→ storage/db.ts
                             └─→ provider/ytb.ts
```

**Note:** `100` (the chunk size) is an unverified upper limit. Extract to a named constant shared between this function and its callers.

---

## 5. Secondary Duplication

### 5a. Channel-open click handler (search.ts:119-126, favs.ts:15-22)

Identical `getDetail` → navigate pattern. Extract to a named function (export from `video-card.ts` or a tiny helper).

### 5b. Pagination button loop (search.ts:80-89, 94-103)

Top and bottom bars share the same loop. Extract to a helper.

### 5c. `renderAll` functions (favs.ts:10-23, channel.ts:63-69)

Both clear the grid and loop-create cards. Only the click handler differs. After extracting the click handler (5a), these become identical — unify.

---

## 6. Cosmetic

- **Inline CSS strings in `favs.ts:buildImportSection()`** — 6 elements with raw `style.cssText`. `shell.ts` already injects a `<style>` block. Move these to CSS classes.
- **`db.ts` v4 upgrade logic** — the onupgradeneeded handler creates `DETAIL_STORE`, then immediately deletes and recreates it. The create-then-delete is the v4 migration but looks like a bug at first glance. A comment or version-gated branch would be clearer.
