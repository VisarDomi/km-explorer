# Elm: A Language Without Swallowing

## What Elm Is

Elm is a purely functional, statically typed language that compiles to JavaScript and runs in browsers. It was designed by Evan Czaplicki with one explicit goal: **no runtime exceptions**. Not "fewer runtime exceptions" — *none*. The compiler guarantees it.

If Elm code compiles, it won't crash. There is no `null`, no `undefined`, no `try/catch`, no `throw`, no `??`, no `?.`, no truthy/falsy coercion, no implicit type conversions. Every code path that could fail must be handled explicitly at compile time.

## The Constructs Elm Doesn't Have

Every anti-pattern we spent 30 versions removing from our TypeScript codebase is structurally impossible in Elm:

| TypeScript construct | Elm equivalent | Why it can't swallow |
|---------------------|----------------|---------------------|
| `try/catch { }` | Doesn't exist | No exceptions in the language |
| `data.field ?? ''` | Pattern match on `Maybe` | Compiler rejects unhandled `Nothing` |
| `result.hits ?? []` | Pattern match on `Result` | Compiler rejects unhandled `Err` |
| `?.` optional chaining | Doesn't exist | Must pattern-match to access inner value |
| `\|\|` truthy fallback | Doesn't exist | No truthy/falsy — only `Bool` is boolean |
| `.filter(Boolean)` | `List.filter` with explicit predicate | Closure must return `Bool`, not truthy |
| `return null` | `Nothing` of `Maybe a` | Caller forced to handle absence |
| `return []` on error | `Err error` of `Result` | Caller forced to handle error |
| implicit `any` | Full type inference | No escape hatch — every expression is typed |
| `as Type` casting | Doesn't exist | No type assertions — compiler proves correctness |

## How Elm Handles Errors and Absence

### Maybe — For Values That Might Not Exist

```elm
type Maybe a = Just a | Nothing

-- In TypeScript: let detail: VideoDetail | null = ...
-- In Elm: getDetail always returns Maybe VideoDetail

case getDetail pageUrl of
    Just detail ->
        copyToClipboard detail.videoSrc  -- can only access videoSrc here
    Nothing ->
        -- MUST handle this case or compiler rejects
        text "Detail not found"
```

The compiler enforces exhaustive pattern matching. Forgetting the `Nothing` case is a compile error. There's no `??` to silently substitute an empty string — if you want a default, you write it explicitly.

### Result — For Operations That Can Fail

```elm
type Result error value = Ok value | Err error

-- In TypeScript: try { await fetch(...) } catch { return [] }
-- In Elm: HTTP requests return Result Http.Error Response

case fetchChannelVideos termId page of
    Ok { ids, pageUrls, hasMore } ->
        -- data is guaranteed valid
        render ids
    Err Http.BadStatus 404 ->
        text "Channel not found"
    Err Http.NetworkError ->
        text "Network error — try again"
```

Every error variant is a tag in a custom type. The compiler checks that all variants are handled. You cannot silently return `[]` on error — the compiler won't let you access the data without handling the error case.

### Custom Types — For Domain-Specific State

```elm
type CardState
    = Loading
    | Ready String          -- carries videoSrc
    | Activating
    | Copied String         -- carries videoSrc
    | Error String          -- carries error message

view cardState =
    case cardState of
        Loading -> div [ style "opacity" "0.4" ] [ text "..." ]
        Ready src -> div [ style "opacity" "1" ] [ onClick (Copy src) ] [ ... ]
        Error msg -> div [ style "color" "red" ] [ text msg ]
        -- ...
```

This is our "honest state machine" — but enforced by the compiler. Every state transition is explicit. No card can be `Ready` with an empty src — `Ready` *carries* the src string. The type system prevents invalid states by construction.

## The Elm Architecture (TEA)

Elm enforces a single architecture for all programs:

```
Model → View → Message → Update → Model → ...
```

- **Model**: The entire application state as a single immutable value
- **View**: A pure function from Model to HTML
- **Update**: A pure function from Message and Model to (Model, Cmd Msg)
- **Cmd**: Describes side effects (HTTP, ports, random) without executing them

Side effects are *declared*, not performed. The Elm runtime executes them. This means:
- No function can silently do I/O, mutate state, or throw
- Every effect is visible in the type signature
- Testing is trivial — `update` is a pure function

### Ports: The JavaScript Bridge

Elm doesn't have a traditional FFI. Communication with JavaScript goes through typed ports:

```elm
-- Elm side
port module Main exposing (main)

port copyToClipboard : String -> Cmd msg
port onClipboardError : (String -> msg) -> Sub msg
```

```js
// JavaScript side
const app = Elm.Main.init({ node: document.getElementById('app') });

app.ports.copyToClipboard.subscribe(text => {
    navigator.clipboard.writeText(text).catch(err => {
        app.ports.onClipboardError.send(err.message);
    });
});
```

This is deliberately restrictive. Elm cannot call arbitrary JS. JS cannot mutate Elm's state. All interop is explicit, typed, and traceable. For a Tampermonkey userscript, the JS wrapper handles `document.open/close`, DOM takeover, and IndexedDB access, while Elm handles all UI logic, state management, and routing.

## What Elm *Does* Allow

Elm has a few deliberate escape hatches:

- **`Debug.todo`**: Marks incomplete code. Crashes at runtime with a message — loud, not silent.
- **`Debug.crash`**: Intentional crash. Used only for impossible states that the type system can't express (rare).
- **`Maybe.withDefault`**: `Maybe.withDefault "fallback" maybeValue`. Explicitly provides a default — visible in code review.

None of these are silent. `Debug.todo` and `Debug.crash` are loud failures. `withDefault` is an explicit, named function call that reviewers can see and question.

## Limitations for Our Use Case

| Concern | Impact |
|---------|--------|
| No direct DOM access from Elm | The Virtual DOM handles rendering. `document.open/close` takeover must happen in JS wrapper |
| IndexedDB is JS-only | Must use ports to read/write IndexedDB from Elm |
| `navigator.clipboard` is JS-only | Clipboard operations go through ports |
| No `document-start`-equivalent | JS wrapper handles injection timing |
| Tampermonkey must load compiled JS | Elm compiles to a `.js` file; wrapper includes it |
| Elm packages are curated | Fewer packages than npm, but core is stable |
| Elm 0.19 has been stable since 2019 | No breaking changes, but also minimal evolution |

## Real-World Production Use

- **NoRedInk**: 200K+ lines of Elm in production since 2015. Zero runtime exceptions in user-facing code.
- **Microsoft**: Elm used in internal tools and the Monaco editor's settings UI
- **Culture Amp**: Elm for survey rendering (millions of responses)
- **Ford Motor Company**: Internal dashboards
- **IBM**: Elm for blockchain visualization tools

All report the same experience: "if it compiles, it works." The compiler replaces entire categories of tests.

## Academic and Formal Work

**"Refinement Types for Elm"** (RISC, 2021): Extended Elm's Hindley-Milner type system with liquid/refinement types. Formalized Elm's syntax, denotational semantics, and typing rules. Proved soundness of the refinement type extension using Z3 SMT solver. Directly addresses: making compile-time guarantees even stronger — not just "no null" but "this integer is between 1 and 100."

**"ConCert: Extracting Elm from Coq"** (AU-COBRA): Framework for extracting verified Coq definitions into Elm source code. Every extracted function carries a machine-checked correctness proof. Demonstrates that Elm's type system is strong enough to host formally verified code without runtime overhead.

**"Explicit Refinement Types"** (arXiv:2311.13995): Introduces lambda_ert, a calculus with explicit refinement proofs. While not Elm-specific, the approach is directly applicable — programmers embed proofs in types rather than relying on SMT solvers, aligning with Elm's philosophy of explicit, compiler-checked correctness.

**"Uncrashable Languages Aren't"** (Zelazny, 2019): Critiques the "no runtime exceptions" claim. Notes that infinite loops and non-termination are still possible in Elm — the type system prevents *type errors* and *unhandled cases*, but cannot prove termination. Fair critique, but the practical experience of Elm teams is that non-termination bugs are vanishingly rare compared to null-reference and unhandled-exception bugs.

## Why Elm Specifically Prevents Swallowing

The key insight is not that Elm is "safer" than TypeScript — it's that **Elm structurally prevents the specific anti-patterns that LLMs over-produce.**

LLMs learn to wrap code in `try/catch`, default to `?? ''`, chain `?.` on everything, and `.filter(Boolean)` away problems because these patterns work in TypeScript — they keep the code running, they satisfy the type checker, they prevent crashes during evaluation. Elm doesn't have these constructs at all. An LLM generating Elm code must either:

1. Handle every case explicitly (pattern match exhaustively), or
2. The code doesn't compile

There is no third option. The language forces correctness — not through convention, linting, or discipline, but through the absence of the constructs that enable swallowing.

## Sources

- Elm Guide: "Error Handling" — https://guide.elm-lang.org/error_handling/
- Elm Guide: "The Elm Architecture" — https://guide.elm-lang.org/architecture/
- Elm Guide: "JavaScript Interop / Ports" — https://guide.elm-lang.org/interop/ports
- "Where Did Null and Undefined Go?" — https://github.com/elm-guides/elm-for-js
- "Writing a Chrome Plugin with Elm" — https://www.dev-log.me/writing_a_chrome_pluging_with_elm/
- "Elm: No Runtime Exceptions" — https://sota.io/blog/deploy-elm-europe-eu-hosting
- "Elm's Type System: Making Runtime Errors a Thing of the Past" — https://dev.to/jigargosar/elms-type-system-making-runtime-errors-a-thing-of-the-past-40j2
- Ben Hoyt: "Learning Elm by Porting a Web Frontend from React" — https://benhoyt.com/writings/learning-elm/
- "Differences between TypeScript and Elm" — https://dev.to/lucamug/typescript-and-elm-3g38
- "Refinement Types for Elm" — https://doi.org/10.35011/risc.21-10
- "ConCert: Extracting Elm from Coq" — https://github.com/AU-COBRA/ConCert
- "Explicit Refinement Types" — https://arxiv.org/abs/2311.13995
- "Uncrashable Languages Aren't" — https://pzel.github.io/2019/03/31/Uncrashable-languages-arent.html
- Elm Wikipedia — https://en.wikipedia.org/wiki/Elm_(programming_language)
- InfoQ: "Language-Level Reactivity with Elm" — https://www.infoq.com/articles/language-reactivity-with-elm/
