# Grain: WASM-Native, No Swallowing by Design

## What Grain Is

Grain is a strongly-typed, functional programming language built from the ground up to target WebAssembly. Unlike Rust or Zig (general-purpose languages that happen to compile to WASM), Grain was designed specifically for the web runtime. It's influenced by OCaml and Reason, with a modern, approachable syntax.

Released in 2017 by Philip Blair and Oscar Spencer, Grain is younger than Elm but shares the same philosophy: the type system should prevent errors, not just annotate them.

## What Grain Doesn't Have

| TypeScript construct | Grain equivalent | Why it can't swallow |
|---------------------|-----------------|---------------------|
| `try/catch { }` | Doesn't exist | No exceptions — errors are `Result` values |
| `data.field ?? ''` | Pattern match on `Option` | Compiler rejects unhandled `None` |
| `result.hits ?? []` | Pattern match on `Result` | Compiler rejects unhandled `Err` |
| `?.` optional chaining | Doesn't exist | Must pattern-match to access `Some(value)` |
| `\|\|` truthy fallback | Doesn't exist | Only `Bool` is boolean — no coercion |
| `.filter(Boolean)` | `List.filter` with explicit predicate | Must return `Bool` |
| `return null` | `None` of `Option<a>` | Caller forced to handle absence |
| `return []` on error | `Err(e)` of `Result<t,e>` | Caller forced to handle error |
| implicit `any` | Full type inference | Every expression is typed at compile time |
| `undefined` | Doesn't exist | No concept of `undefined` in the language |

## Core Types

### Option — No Null

```grain
enum Option<a> { Some(a), None }

// In TypeScript: let detail: VideoDetail | null = ...
// In Grain: getDetail returns Option<VideoDetail>

match (getDetail(pageUrl)) {
    Some(detail) => copyToClipboard(detail.videoSrc),
    None => print("Detail not found"),
}
```

`Option` is an enum — the compiler checks that both `Some` and `None` are handled. You cannot silently access the value inside `Some` without pattern matching. There is no `??` to provide a fallback — if you want a default, you write `Option.unwrapWithDefault(maybe, default)` which is explicit and visible in code review.

### Result — No Exceptions

```grain
enum Result<t, e> { Ok(t), Err(e) }

// In TypeScript: try { await fetch(...) } catch { return [] }
// In Grain: every fallible function returns Result

match (fetchChannelVideos(termId, page)) {
    Ok({ ids, pageUrls, hasMore }) => render(ids),
    Err(NetworkError) => print("Network error"),
    Err(NotFound) => print("Channel not found"),
}
```

In 2024, Grain's standard library migrated all `sys` functions to return `Result` instead of throwing — removing the last exception-based error paths from the core library. Every fallible operation now returns `Result`, and every caller must handle both `Ok` and `Err`.

### Pattern Matching — Exhaustive by Default

Grain's `match` expression requires handling all variants. The compiler rejects code with unhandled cases:

```grain
// This WON'T COMPILE — missing None case
match (getDetail(url)) {
    Some(detail) => detail.videoSrc,
}

// Error: non-exhaustive match, missing pattern: None
```

This is the structural prevention of swallowing. There is no way to accidentally forget an error case — the compiler catches it.

### Custom Types for State Machines

```grain
enum CardState {
    Loading,
    Ready(String),   // carries videoSrc
    Activating,
    Error(String),   // carries error message
}

let view = (state) => match (state) {
    Loading => div([style("opacity", "0.4")], [text("...")]),
    Ready(src) => div([style("opacity", "1")], [onClick(Copy(src)), ...]),
    Error(msg) => div([style("color", "red")], [text(msg)]),
    Activating => div([], [spinner()]),
}
```

The `Ready` variant carries the `videoSrc` string. It's impossible to create a `Ready` card with an empty or missing src — the type system prevents invalid states by construction. This is our "honest state machine" enforced at the language level.

## WebAssembly-Native Design

Grain compiles **directly to WASM**. There is no JavaScript intermediate step. This has both advantages and limitations:

**Advantages:**
- Binary sizes as small as 329 bytes (post-WASM GC switch, April 2026)
- No JavaScript runtime overhead — the WASM runtime handles GC, memory, execution
- v0.7 (Farro, April 2025) introduced `.gro` object files for incremental compilation
- Release builds with `--release` flag produce optimized, production-ready WASM

**Limitations for our use case:**
- **No direct DOM access.** WASM cannot touch the DOM. Grain must use JS interop for all DOM operations. The `dom` standard library was removed and is being reimplemented — the GitHub issue (#126) shows ongoing discussion about the best approach (JS glue layer vs. WIT-based DOM bindings).
- **IndexedDB requires JS interop.** Like DOM, browser APIs require JavaScript bridge code.
- **`navigator.clipboard` requires JS interop.** Same pattern.
- **Tampermonkey integration.** Grain compiles to `.wasm` — a userscript would need a JavaScript wrapper that loads the WASM module, sets up interop, and bridges to the page DOM. This is more complex than Elm's direct-JS-compilation approach.

### JS Interop Model

Grain's JS interop is through a binding layer — typically a JavaScript file that instantiates the WASM module and exposes Grain functions:

```js
// JS wrapper
const { Grain } = require('./app.gr.wasm');

Grain.register('copyToClipboard', (text) => {
    navigator.clipboard.writeText(text);
});

Grain.register('getDetail', async (pageUrl) => {
    // IndexedDB access from JS side
    const detail = await db.getDetail(pageUrl);
    return detail;
});
```

This is more flexible than Elm's ports (which are strictly typed and limited) but also less structured — the responsibility for correctness shifts to the JS binding layer.

## Production Readiness

| Aspect | Status |
|--------|--------|
| Language stability | v0.7 (April 2025). Pre-1.0. API may change. |
| WASM GC integration | Switched to WASM GC in April 2026. Major milestone. |
| Standard library | Growing but incomplete. JSON, HTTP, file I/O available. |
| DOM support | Being reimplemented. Currently requires custom JS glue. |
| Browser compatibility | Requires modern browser with WASM GC (Chrome 119+, Firefox 120+, Safari 17+) |
| Production users | No major public deployments known. Primarily community/experimental. |
| Ecosystem | Small. ~200 GitHub stars (as of 2026). Active Discord community. |
| Compiler maturity | Compiles and runs correctly. Fast compile times. Growing test suite. |

Grain is the most architecturally promising language for our use case — designed for the web, WASM-native, strong type system, no swallowing constructs — but it's not production-ready for a DOM-heavy userscript. The JS interop layer would need to handle everything our TypeScript currently does directly: `document.open/close`, IndexedDB, clipboard, routing, card rendering.

## Why Grain Prevents Swallowing

Same mechanism as Elm: the constructs that enable swallowing don't exist. But Grain adds one important dimension: **WASM as a compilation target.** Because Grain compiles to WASM rather than JavaScript, it avoids the entire JavaScript runtime semantics — no `undefined`, no prototype chain shenanigans, no implicit type coercion, no `this` binding surprises. The runtime is a clean WASM VM with GC.

For an LLM generating Grain code, there is no escape hatch. Every error path is a `Result.Err`, every absence is an `Option.None`, and the compiler enforces handling of both. An LLM cannot write `try/catch {}`, `?? ''`, or `.filter(Boolean)` because those constructs don't exist in Grain. It must either handle every case or the code doesn't compile.

## Comparison: Grain vs Elm for km-explorer

| | Grain | Elm |
|---|-------|-----|
| Compilation target | WASM | JavaScript |
| DOM access | JS interop required | Virtual DOM (built-in) |
| Browser API access | JS interop required | Ports (structured) |
| Type system | OCaml-like, full inference | Hindley-Milner, full inference |
| No runtime exceptions | ✓ (via Result) | ✓ (by design) |
| No null/undefined | ✓ (via Option) | ✓ (via Maybe) |
| Production maturity | Pre-1.0 | Stable since 2019 |
| Userscript compatibility | Complex (WASM loader) | Direct (compiles to JS) |
| Ecosystem | Small, growing | Mature, curated |
| Bundle size | 329B–few KB | ~20-50KB gzipped |

For a Tampermonkey userscript, Elm is more practical today — it compiles to JavaScript that Tampermonkey can inject directly. Grain's WASM approach is architecturally cleaner but requires a JS loader/wrapper, adding complexity for a userscript context. As WASM integration with browsers matures (ESM integration for WASM modules is coming), Grain becomes more viable.

## Sources

- Grain Language: https://grain-lang.org/
- Grain GitHub: https://github.com/grain-lang/grain
- "Built-in Types" — https://grain-lang.org/docs/builtin_types
- "Custom Data Types" — https://grain-lang.org/docs/guide/data_types
- "Pattern Matching" — https://grain-lang.org/docs/guide/pattern_matching
- "Option" — https://grain-lang.org/docs/stdlib/option
- "Building for Production" — https://grain-lang.org/docs/tooling/building_for_production
- "Grain v0.7 Farro" — https://grain-lang.org/blog/2025/04/28/new-release-grain-v0.7-farro/
- "Switch to Wasm GC" — https://github.com/grain-lang/grain/pull/2378
- "Reimplement DOM stdlib" — https://github.com/grain-lang/grain/issues/126
- "Meet Grain" (The New Stack) — https://thenewstack.io/meet-grain-the-high-level-language-optimized-for-webassembly/
- "How Grain Brings Functional Programming to WebAssembly" (Serokell) — https://serokell.io/blog/grain-with-oscar-spencer
- "Convert sys functions to Results" — https://github.com/grain-lang/grain/pull/792
