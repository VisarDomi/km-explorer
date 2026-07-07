# WASM and the Userscript Deployment Flow

## Your Current Workflow

1. Push `.user.js` to a docs location
2. Copy the file to a document editor on iPhone
3. Save as `.js` file
4. Userscripts app on iOS loads it
5. Navigate to ytboob.com, refresh → script activates

This is a **single-file pipeline.** The userscript manager injects one JavaScript string into the page. That's all it knows how to do.

## Where WASM Fits (and Doesn't)

### Option A: Inline WASM as base64

You can encode a `.wasm` binary as a base64 string and embed it directly in the `.user.js` file:

```js
// Inside your userscript
const wasmBase64 = "AGFzbQEAAAABCAJgAn9/AX9gAAF/..."; // huge string

const wasmBytes = Uint8Array.from(atob(wasmBase64), c => c.charCodeAt(0));
const module = await WebAssembly.instantiate(wasmBytes);
```

This keeps the single-file workflow. The `.user.js` just gets bigger — but a typical Grain or Rust WASM binary is 30-200KB uncompressed. Base64 inflates that by ~33% (40-270KB). For a userscript that's currently 27KB gzipped, this is a 2-10x size increase. Manageable.

**But:** the browser's Content Security Policy can block it. If ytboob.com sets `script-src` without `wasm-unsafe-eval`, the `WebAssembly.instantiate` call throws. The userscript manager cannot override the site's CSP. This is an open issue in Violentmonkey (#1866) and Tampermonkey (#586) — neither has solved it.

**On iPhone Safari specifically:** Safari supports `WebAssembly.instantiate` for inline WASM since iOS 15. But CSP enforcement varies. If ytboob.com doesn't set restrictive CSP headers (and most adult sites don't), it would work. You'd need to test.

### Option B: External WASM file via fetch

```js
// Inside your userscript
const response = await fetch('https://your-host.com/app.wasm');
const module = await WebAssembly.instantiateStreaming(response);
```

This requires:
- Hosting the `.wasm` file at a public URL
- The userscript to have network access to that URL
- No CORS blocking (cross-origin fetch from ytboob.com to your-host.com)

**On iPhone:** this breaks the single-file flow. Instead of just copying a `.js` file, you now need to maintain a hosted server, handle CORS, and deal with network latency on every page load. The script won't work offline. If your host goes down, the script breaks.

### Option C: Elm / ReScript / PureScript (compile-to-JS, no WASM)

These compile directly to JavaScript. No WASM binary involved. They drop into your existing pipeline unchanged:

```
Write Elm → elm make → Main.js → wrap in userscript header → push → iPhone
```

Same single-file flow. Same injection mechanism. Same behavior on Safari iOS. The compiled JavaScript is typically 20-50KB gzipped — same ballpark as your current TypeScript output (27KB).

## Which Languages Survive the Pipeline

| Language | Compiles to | Single-file flow? | CSP issues? | iPhone compatible? |
|----------|------------|:-----------------:|:-----------:|:------------------:|
| TypeScript | JavaScript | ✓ | ✗ | ✓ |
| Elm | JavaScript | ✓ | ✗ | ✓ |
| ReScript | JavaScript | ✓ | ✗ | ✓ |
| PureScript | JavaScript | ✓ | ✗ | ✓ |
| Kotlin/JS | JavaScript | ✓ | ✗ | ✓ |
| Grain | WASM | △ (base64) | ✓ (CSP risk) | △ (needs testing) |
| Rust | WASM | △ (base64) | ✓ (CSP risk) | △ (needs testing) |
| Zig | WASM | △ (base64) | ✓ (CSP risk) | △ (needs testing) |
| Haskell | WASM | △ (base64) | ✓ (CSP risk) | △ (needs testing) |

✓ = works in current pipeline. △ = works in theory, untested, CSP-dependent.

## The Bottom Line

The divide isn't "JavaScript vs WASM" — it's "compile-to-JS vs compile-to-WASM." 

All the protective languages we researched (Elm, ReScript, PureScript) that compile directly to JavaScript drop into your iPhone workflow with zero changes. Same push-copy-save-refresh flow. Same single-file deployment. Same userscript manager compatibility.

WASM-based languages (Grain, Rust, Zig, Haskell) require either base64 inlining (CSP risk, size increase) or external hosting (breaks single-file flow, adds network dependency). Both add complexity to a pipeline that currently Just Works.

For km-explorer specifically: **Elm is the practical choice.** It compiles to JavaScript, eliminates the 22+ swallowing paths, and preserves your exact deployment workflow. Grain is architecturally cleaner but practically harder — the WASM tax isn't worth paying until browsers and userscript managers support it natively.
