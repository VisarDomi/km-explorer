# Languages Without the Swallowing Constructs

## The Anti-Patterns We Hit

In our TypeScript codebase, these constructs enabled silent failure:

| Construct | Example | What it hides |
|-----------|---------|---------------|
| `try/catch` | `catch { /* nothing */ }` | Any error in the try block |
| `?? ''` | `data.field ?? ''` | Missing field → empty string |
| `?? []` | `result.hits ?? []` | Missing API data → no results |
| `?? 0` | `result.found ?? 0` | Missing count → silently zero |
| `?.` | `data.results?.[0]?.hits` | Missing nested property → undefined |
| `\|\|` fallback | `x \|\| default` | Any falsy value → default |
| `.filter(Boolean)` | `arr.map(...).filter(Boolean)` | null/undefined entries dropped |
| `return null` | `if (!data) return null` | Missing data masquerading as "not found" |
| `return []` | `if (!r.ok) return { ids: [] }` | HTTP failure → empty results |
| Implicit `any` | `req.result as VideoDetail` | Wrong field names, no type error |

## Languages That Lack These Constructs

### C

C has **none** of the above. No exceptions, no try/catch. No `??`, no `?.`, no optional chaining. No `.filter()`. No truthy/falsy coercion. No implicit `any` type.

What C *does* have: functions return error codes or sentinel values (`NULL`, `-1`). You can ignore them.

```c
FILE *f = fopen("missing.txt", "r");  // returns NULL
fprintf(f, "hello");                   // SEGFAULT — but crashes, doesn't swallow
```

C's failure mode is *loud* (crash) rather than *silent* (wrong data flowing through). A segfault is a crash you notice. An empty string in the clipboard is a bug you hunt for hours.

**Gaps:** `NULL` can propagate silently if you pass it around without dereferencing. But C lacks the *syntactic sugar* for easy swallowing — there's no one-character `?` that hides an error path.

---

### Zig

Zig has no exceptions, no try/catch, no null coalescing, no optional chaining. Errors are **explicit return types**:

```zig
fn openFile(path: []const u8) !File {
    // Returns File or an error — both are visible in the type
}
```

To get the value, you MUST handle the error:
```zig
const f = try openFile("data.txt");  // try = propagate error upward
// or
const f = openFile("data.txt") catch |err| {
    // explicit error handling
};
```

There is no `??` that silently provides a default. `catch` requires a block. `try` propagates — it doesn't swallow. You cannot write `openFile("x") ?? defaultFile` — the language doesn't have the syntax.

**What it lacks:** No exceptions, no `??`, no `?.`, no `.filter()`, no truthy/falsy, no implicit conversions, no `undefined`, no `null` (uses optional types instead).

---

### Rust

Rust has no exceptions, no null, no `?? ''`. Errors and absence are types:

```rust
fn get_detail(url: &str) -> Option<VideoDetail> { ... }
//                              ^^^^^^ callers MUST handle None
```

The `?` operator propagates errors upward — it never provides a default:
```rust
let detail = get_detail(url)?;  // returns Err if None, never gives a default
```

`unwrap()` crashes loudly if the value is missing. There's no `?? ''` to silently substitute an empty string. There's no truthy/falsy — `if x` only works on `bool`. `.filter()` on an iterator requires an explicit closure returning `bool`, not just `Boolean` — but you can still write `.filter(|x| x.is_some())`, which is explicit.

**What it lacks:** No exceptions, no null, no `??`, no `?.` (has `?` for error propagation which is the *opposite* of swallowing — it forces handling upstream), no truthy/falsy coercion, no implicit `any`.

**Gap:** `unwrap_or(default)` exists but requires an explicit default. It's visible in code review, not hidden.

---

### Haskell

Haskell has no null, no exceptions in pure code, no `??`, no `?.`, no truthy/falsy.

```haskell
getDetail :: PageUrl -> IO (Maybe VideoDetail)
--                        ^^^^^^^^^^^^^^^^^^^^
--  IO = effectful, Maybe = possibly absent
```

To use the value, you MUST pattern match:
```haskell
case getDetail url of
    Just detail -> copyToClipboard (videoSrc detail)
    Nothing     -> -- must handle absence explicitly
```

The compiler *rejects* code that doesn't handle `Nothing`. You cannot accidentally treat a `Maybe VideoDetail` as a `VideoDetail`. There is no `?? ''` — the language doesn't have the concept. There's `fromMaybe default` but it requires an explicit import and an explicit default value.

**What it lacks:** No null, no exceptions (pure code), no `??`, no `?.`, no truthy/falsy, no `.filter(Boolean)` (list filtering uses explicit predicates), no implicit type coercion, no `undefined` as a value (it exists but crashes immediately).

---

### Elm

Elm goes further than Haskell: **no runtime exceptions at all**. The compiler guarantees it.

```elm
getDetail : PageUrl -> Task Http.Error VideoDetail
--                        ^^^^^^^^^^^^^^^^^^^^^^^^
--  Error is explicit in the type
```

Every possible error path must be handled. The compiler enforces exhaustive pattern matching. You cannot forget to handle an error case — it won't compile. There's no `??`, no `?.`, no `try/catch` at all.

**What it lacks:** No exceptions, no null, no `undefined`, no `??`, no `?.`, no truthy/falsy, no implicit conversions, no runtime errors.

---

### Summary Table

| Construct | C | Zig | Rust | Haskell | Elm | TypeScript |
|-----------|:--:|:---:|:----:|:-------:|:---:|:----------:|
| try/catch | ✗ | ✗ | ✗ | ✗¹ | ✗ | ✓ |
| `??` null coalescing | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `?.` optional chaining | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `\|\|` truthy fallback | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `.filter(Boolean)` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Implicit `any` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| null / undefined | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Silent default values | ✗ | ✗ | ✗² | ✗² | ✗ | ✓ |
| Exceptions as control flow | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

¹ Haskell has exceptions in IO but idiomatic code uses types  
² Requires explicit function call, visible in review

## The Pattern

Languages that prevent swallowing share a design philosophy: **error and absence are types, not control flow or magic values.** When a function can fail, its return type says so. When a value can be absent, its type says so. The compiler enforces handling of both cases. There is no syntactic sugar that silently provides "safe" defaults — because safe defaults hide bugs.

TypeScript, by contrast, provides *maximum* syntactic sugar for silent fallbacks. Every `??`, `?.`, `catch {}`, `||`, and implicit `any` is a potential swallow. The language doesn't force you to handle errors — it gives you a dozen ways to hide them.

## Sources

- Rust: "Result and Option: Replacing try/catch and null" — https://rs4ts.dev/08-error-handling/00-result-option/
- Zig: "No hidden control flow" — https://ziggit.dev/t/what-does-zig-mean-by-no-hidden-control-flow/3618
- Haskell/Elm: "How functional programming achieves no runtime exceptions" — https://softwareengineering.stackexchange.com/questions/420872
- C: "ERR05-C: Application-independent code should provide error detection" — https://wiki.sei.cmu.edu/confluence/display/c/ERR05-C
- C: "C Error Handling" — https://www.w3schools.com/c/c_error_handling.php

## arXiv & Academic Research

**"A Simple Blame Calculus for Explicit Nulls"** (Wadler et al., JFP)
Formal calculus for explicit nulls in gradually typed languages. Proves blame safety: null failures can never be silent — blame always falls on the less-precisely typed side. Mechanized in Coq. Directly addresses: null tracking in types eliminates silent null propagation across language boundaries.
https://homepages.inf.ed.ac.uk/wadler/papers/blame-null/blame-null.pdf

**"Verifying the Option Type with Rely–Guarantee Reasoning"** (ASE 2024)
Sound modular type system for verifying correct Option usage. Empirical study: their Optional Checker found more bugs across 1M lines than SpotBugs, Error Prone, and IntelliJ IDEA combined — at 93% precision. Core rule: "Optional should never be null." Shows that even in Java (a language with null), type-level enforcement eliminates silent absent-value bugs.
https://homes.cs.washington.edu/~jmsy/pubs/optional-checker-ase2024.pdf

**"Guard Analysis and Safe Erasure Gradual Typing: a Type System for Elixir"** (arXiv:2408.14345, 2024)
Gradual typing for Elixir using semantic subtyping with safe erasure. Addresses: how to add compile-time error prevention to a dynamic language without breaking existing code. Type errors at dynamic/static boundaries become loud failures, not silent coercions.
https://arxiv.org/abs/2408.14345

**"NVLang: Unified Static Typing for Actor-Based Concurrency on the BEAM"** (arXiv:2512.05224, 2025)
Statically typed language for Erlang VM. Uses algebraic data types (sum types) to encode message protocols. Compile-time enforcement: well-typed programs cannot send messages that violate actor protocols — a whole class of silent runtime errors eliminated by construction.
https://arxiv.org/abs/2512.05224

**"Semantic-Type-Guided Bug Finding"** (arXiv:2409.13896, 2024)
Type-directed bug finding for higher-order functional languages. Detects incorrect semantic typing — code that type-checks but has wrong runtime behavior. Shows that even rich type systems need semantic verification to catch "types pass but logic fails" errors.
https://arxiv.org/abs/2409.13896

**"Practical Optional Types for Clojure"** (arXiv:1812.03571)
Typed Clojure adapts occurrence typing for a dynamic Lisp. Nil becomes a distinct static type; typed code cannot silently pass nil where a value is expected. Demonstrates that even Lisp-family languages can achieve null safety through type design.
https://arxiv.org/abs/1812.03571

**"Contextual Modal Types for Algebraic Effects and Handlers"** (arXiv:2103.02976)
The ECMTT calculus tracks effects in types via contextual modal types. Guarantees "effect safety": no unhandled operations can silently execute. Errors and side effects are compiler-checked, not runtime-surprises.
https://arxiv.org/abs/2103.02976

**"Backwards-Compatible Row-Based Exceptions in ML"**
Row-polymorphic type system for tracking exceptions in ML-like languages. Types encode which exceptions a function may raise; compiler catches unhandled exception paths. Replaces unchecked (silent) exception propagation with typed, explicit handling.
https://devilhena-paulo.github.io/files/exceptional.pdf

## Can JavaScript Be Replaced in the Browser?

JavaScript's monopoly position: it's the only language that runs natively in every browser without a compilation step. But that position is weakening. Here's the current landscape of languages that can target the browser while providing the protective type systems discussed above.

### Compile-to-JS (Same Runtime, Better Types)

These compile to JavaScript and run in any browser today, with zero WASM overhead. They add type safety on top of the JS runtime.

**ReScript** (formerly BuckleScript/ReasonML)
- Compiles to readable JavaScript. No runtime library overhead.
- Sound type system. No `null`, no `undefined` — uses `option<'a> = None | Some('a)`.
- No `any` type. No implicit type coercion. No truthy/falsy.
- Has exceptions (`try...catch`) but idiomatic code uses `result` types instead.
- Direct JS interop: import any JS library, export to JS/TS. Zero friction.
- Fast compiler (written in OCaml). Production users include Facebook Messenger.
- **Protects against:** null, undefined, implicit `any`, truthy/falsy coercion. Still has `try/catch` and `??` (belt library). Less protective than Elm but far more than TypeScript.

**Elm**
- Compiles to JavaScript. No runtime exceptions *at all* — compiler guarantees it.
- No null, no undefined, no exceptions, no `try/catch`, no `??`, no `?.`.
- Every possible state must be handled explicitly. Exhaustiveness checking on pattern matches.
- The most protective option. If it compiles, it won't crash and won't silently swallow.
- **Gap:** small ecosystem, interop with JS is deliberately restricted (ports system). Hard to incrementally adopt.

**PureScript**
- Haskell-like language compiling to JavaScript. Pure functional, strict types.
- No null, no exceptions in pure code. `Maybe`/`Either` types with exhaustive pattern matching.
- Strong JS interop via Foreign Function Interface.
- **Gap:** smaller community than TypeScript, Haskell-like syntax may be unfamiliar.

**Kotlin/JS**
- Kotlin compiles to JavaScript via Kotlin/JS backend. Full Kotlin type system preserved.
- Null safety: `T` and `T?` are distinct types. No implicit null.
- Sealed classes enable `Result<T, E>` patterns with exhaustive `when` — compiler rejects unhandled branches.
- Full JS interop via `@JsExport` / `@JsName`. Can use any JS library with typed wrappers.
- Also targets WASM via Kotlin/Wasm, sharing code with JS target.
- **Protects against:** null, unhandled error cases. Still has exceptions (from Java heritage), but idiomatic code uses sealed result types.

### Compile-to-WASM (Different Runtime, Stronger Guarantees)

These compile to WebAssembly, running in a sandboxed VM inside the browser. They typically have smaller bundles and stronger type guarantees than JS-targeting languages.

**Rust** (via wasm-pack / wasm-bindgen)
- The most mature WASM ecosystem. Production users: Figma, Cloudflare, Discord.
- Full Rust type system: `Result<T, E>`, `Option<T>`, no null, no exceptions.
- JS interop via wasm-bindgen: auto-generates JS glue code with TypeScript types.
- Bundle sizes as small as a few KB for simple modules.
- **Gap:** WASM can't directly manipulate the DOM (must call JS for that). GC integration is still maturing.

**Zig** (via wasm32-emscripten or wasm32-wasi)
- WASM target support via emscripten. Zig's explicit error handling preserved.
- No hidden control flow, no exceptions, no null.
- Tiny WASM output — Zig's minimal runtime is well-suited for size-constrained web deployments.
- **Gap:** WASM ecosystem for Zig is less mature than Rust. DOM access still requires JS interop.

**Grain**
- Designed specifically for the web. Compiles directly to WASM (recently switched to WASM GC).
- Strongly typed, functional. No runtime type errors, no null.
- Purpose-built for browser use — not a general-purpose language ported to WASM.
- **Gap:** very young language. Small ecosystem. WASM GC requires modern browsers (Chrome 119+, Firefox 120+, Safari 17+).

**Haskell** (via GHC WASM backend)
- GHC 9.12+ supports `wasm32-wasi` target. Compiles Haskell to WASM.
- Full Haskell type system: `Maybe`, `Either`, no null, exhaustive pattern matching.
- JS FFI supported — can call JS from Haskell WASM modules.
- Template Haskell works in the browser.
- **Gap:** requires custom GHC build (not stock). Large bundle sizes due to RTS. Still experimental for production web use.

**OCaml** (via Js_of_ocaml or Melange)
- Js_of_ocaml compiles OCaml bytecode to JavaScript. Melange compiles OCaml directly to JS.
- Full OCaml type system: algebraic types, exhaustive pattern matching, no null.
- Has exceptions but idiomatic code uses `result` types.
- Used in production by Ahrefs, Jane Street (internal tools).
- **Gap:** Js_of_ocaml can produce large bundles. Melange is newer, smaller ecosystem than ReScript.

### Summary: Browser Language Options by Protection Level

| Language | Target | No null | No try/catch | No `??` | Exhaustive handling | DOM access | Production-ready |
|----------|--------|:-------:|:------------:|:-------:|:-------------------:|:----------:|:----------------:|
| TypeScript | JS | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| ReScript | JS | ✓ | ✗ | △¹ | ✓ | ✓ | ✓ |
| Elm | JS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PureScript | JS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kotlin/JS | JS | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Rust | WASM | ✓ | ✓ | ✓ | ✓ | △² | ✓ |
| Zig | WASM | ✓ | ✓ | ✓ | ✓ | △² | △ |
| Grain | WASM | ✓ | ✓ | ✓ | ✓ | △² | ✗ |
| Haskell | WASM | ✓ | ✓ | ✓ | ✓ | △² | ✗ |
| OCaml | JS/WASM | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ |

¹ Belt library provides `??` but idiomatic code uses pattern matching  
² WASM can't touch DOM directly; must call JS for DOM operations

### The Bottom Line

JavaScript's browser monopoly is real but eroding. WASM GC (standardized 2025) removes the last major barrier for high-level languages. Every language in the table above can run in browsers today, and every one of them would have prevented the swallowing bugs we spent 30 versions hunting.

The practical choice for a project like km-explorer (Tampermonkey userscript, browser-first, IndexedDB, DOM-heavy): **ReScript** or **Elm**. Both compile to JS, preserving full DOM access and userscript compatibility. Elm is more protective (no runtime errors, period) but harder to adopt incrementally. ReScript is more pragmatic — looks like JS, interoperates with JS seamlessly, and eliminates the worst offenders (null, undefined, implicit any) while allowing gradual migration from TypeScript.
- Dart: "Understanding null safety" — https://dart.dev/null-safety/understanding-null-safety
- Scala: "Explicit Nulls" — https://www.scala-lang.org/api/3.x/docs/experimental/explicit-nulls.html
- "Null Was a Mistake" — https://siliconopera.com/null-was-a-mistake-we-still-havent-fixed-it/
