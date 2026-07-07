# Safari Clipboard Investigation

## Transient activation

Safari iOS grants clipboard access only within a "transient activation" window that starts on user gesture (click/tap) and expires after the first async gap. WebKit bug 222262 confirms this.

What counts as an async gap:
- `await` on any Promise (even already-resolved microtasks)
- `setTimeout`/`setInterval`
- DOM state changes in some cases
- IndexedDB reads/writes
- `fetch` network requests

## Why the test worked but our app doesn't

**v1 test 2 (`await fetch` → `writeText`)**: The `fetch` call initiates a network request synchronously. Safari may extend the transient activation window for network-bound operations started during the gesture. The `writeText` call happens after the fetch resolves, still within the extended window.

**Our app (`await getDetail` → `writeText`)**: `getDetail` does an IndexedDB read. Safari **does not** extend transient activation for local storage operations. By the time `writeText` runs, the gesture has expired.

The test succeeded because it used `fetch` (network). Our app fails because it uses IndexedDB (local). Both are `await` operations, but Safari treats them differently — network operations started during the gesture keep the window open, local async does not.

## The fix: ClipboardItem

The workaround documented across multiple sources (WebKit bug, Wolfgang Rittner, GitHub PR 2441):

```ts
const item = new ClipboardItem({
    'text/plain': (async () => {
        const detail = await getDetail(pageUrl);  // async work
        return new Blob([detail.videoSrc], { type: 'text/plain' });
    })(),
});
await navigator.clipboard.write([item]);
```

The `ClipboardItem` constructor is called **synchronously** during the click. The Promise inside it does the async work. Safari's clipboard API considers the write as initiated during the gesture, even though the data resolves later.

## Firefox compatibility

Firefox requires `dom.events.asyncClipboard.clipboardItem` pref enabled for `ClipboardItem`. Without it, the above fix won't work. Fall back to `execCommand('copy')` or `writeText` on Firefox.

The Firefox regression in our current build may be unrelated — check for JS errors first.

## Sources

- WebKit bug 222262: clipboard.write() fails after await
- Wolfgang Rittner: "How to use Clipboard API in Safari async"
- GitHub PR 2441: three-tier fallback (ClipboardItem → writeText → execCommand)
- Juanchi.dev: transient activation timeout includes microtasks and DOM state changes
- Stack Overflow 62327358: NotAllowedError on iOS Safari after async callback
