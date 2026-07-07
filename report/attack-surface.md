# Attack Surface: Language Design and the Swallowing Problem

## The Insight

After 30 versions of hunting swallowed errors in TypeScript, and after researching languages that structurally prevent swallowing (Elm, Grain, Rust, Haskell), a pattern emerged: **no language eliminates the swallowing problem entirely.** But languages differ dramatically in how many ways an LLM (or a tired developer) can silently hide an error.

The advantage of Elm and Grain is not that they make swallowing impossible. It's that they concentrate all swallowing paths into a handful of named, grep-able functions. The attack surface is smaller, and every entry point is visible.

## The Numbers

### Elm — 5 Swallowing Paths

| # | Pattern | Example | What it hides |
|---|---------|---------|---------------|
| 1 | `Maybe.withDefault` | `Maybe.withDefault "" maybeVal` | Absence → empty string |
| 2 | `Result.withDefault` | `Result.withDefault [] result` | Error → empty list |
| 3 | `_` wildcard in case | `Err _ -> []` | Error variant → default |
| 4 | `Result.toMaybe` | Converts `Err` to `Nothing` | Loses error information |
| 5 | `Maybe.map (always default)` | `Maybe.map (\_ -> "") maybeVal` | Value mapped to constant |

**Every one is `grep`-able:**
```
grep -rn "withDefault" src/
grep -rn "Err _" src/
grep -rn "-> "".*"" " src/
grep -rn "toMaybe" src/
```

### Grain — 4 Swallowing Paths

| # | Pattern | Example | What it hides |
|---|---------|---------|---------------|
| 1 | `Option.unwrapWithDefault` | `Option.unwrapWithDefault("", maybe)` | Absence → empty string |
| 2 | `Result.unwrapWithDefault` | `Result.unwrapWithDefault([], result)` | Error → empty list |
| 3 | `_` wildcard in match | `Err(_) => default` | Error variant → default |
| 4 | `Option.toResult` / `Result.toOption` | Loses information on conversion |

**Every one is `grep`-able:**
```
grep -rn "unwrapWithDefault" src/
grep -rn "_ => " src/
grep -rn "toResult\|toOption" src/
```

### TypeScript — 22+ Swallowing Paths

| # | Pattern | Example | What it hides |
|---|---------|---------|---------------|
| 1 | `try/catch { }` | Empty catch block | Any error |
| 2 | `try/catch { console.error(...) }` | Log and continue | Any error |
| 3 | `try/catch { return [] }` | Return default on error | Any error |
| 4 | `try/catch { return null }` | Return null on error | Any error |
| 5 | `try/catch { resolve(null) }` | Resolve Promise with null | Async error |
| 6 | `.catch(() => {})` | Empty Promise catch | Async error |
| 7 | `.catch(() => resolve([]))` | Resolve with default | Async error |
| 8 | `data.field ?? ''` | Nullish → empty string | Missing field |
| 9 | `data.field ?? []` | Nullish → empty array | Missing field |
| 10 | `data.field ?? 0` | Nullish → zero | Missing field |
| 11 | `data.field ?? {}` | Nullish → empty object | Missing field |
| 12 | `x \|\| default` | Any falsy → default | Falsy values (0, '', false) |
| 13 | `x \|\| ''` | Falsy → empty string | Falsy values |
| 14 | `x \|\| []` | Falsy → empty array | Falsy values |
| 15 | `data?.nested?.field` | Silent undefined on missing | Missing nested property |
| 16 | `data?.result?.[0]?.hits` | Deep optional chain | Multiple missing levels |
| 17 | `arr.filter(Boolean)` | Drop null/undefined/0/''/false | Falsy entries |
| 18 | `arr.map(x => x!).filter(Boolean)` | Assert then drop | Missing entries |
| 19 | `if (!data) return null` | Guard → null | Missing data |
| 20 | `if (!r.ok) return { ids: [] }` | Guard → empty | Bad HTTP response |
| 21 | `as Type` | Type assertion | Wrong field names, shape |
| 22 | implicit `any` | No type checking | Everything |

**Not `grep`-able as a single pattern.** Each requires a different regex, AST pattern, or manual review:
```
grep -rn "try\s*{" src/            # only finds try blocks, not the swallow inside
grep -rn "??" src/                 # too many false positives (non-swallowing uses)
grep -rn "||" src/                 # hopeless — every OR in a conditional matches
grep -rn "?." src/                 # too common to filter
grep -rn "filter(Boolean)" src/    # works, but misses 21 other patterns
grep -rn "as " src/                # every type assertion, most are legitimate
grep -rn "any" src/                # thousands of false positives
```

## Why the Difference Matters

### For Human Developers

In Elm or Grain, you learn 4-5 patterns to watch for during code review. "Does this `withDefault` hide a real error?" is a single question you can ask at every occurrence.

In TypeScript, you need a mental checklist of 22 patterns, spread across syntax (`??`), control flow (`try/catch`), type system (`as`, `any`), array methods (`.filter(Boolean)`), and Promise chains (`.catch()`). Review fatigue is real — patterns 15-22 get missed routinely.

### For LLM Code Generation

LLMs learn from training data. TypeScript training data is full of defensive patterns — they're idiomatic, even taught as best practice. The model has 22 different ways to accidentally swallow an error, and many of them are rewarded during training ("this code doesn't crash, good job").

Elm and Grain training data is sparser but structurally constrained. The model has 4-5 ways to swallow, and they're all **named function calls** — `withDefault`, `unwrapWithDefault` — that stand out in code. An LLM is less likely to produce them accidentally, and when it does, they're immediately visible.

### For Automated Detection

| | Elm | Grain | TypeScript |
|---|-----|-------|------------|
| Lint rules needed | 1-2 | 1-2 | ~10+ |
| False positive rate | Near zero | Near zero | High (many `??` are legitimate) |
| Can be caught by grep | Yes | Yes | No (requires AST) |
| Review effort per PR | Seconds | Seconds | Minutes |

A single ESLint rule in Elm would catch all swallowing: `no-withDefault-with-empty-literal` — flag any `withDefault` call where the default is `""`, `[]`, `0`, or `{}`. In TypeScript, you'd need 10+ rules with complex AST matching, and you'd still miss pattern 15-22.

## The Attack Surface Hierarchy

```
TypeScript    ████████████████████████████████████████  22+ paths
              scattered across syntax, types, arrays,
              promises, control flow

C             ████████                                  8 paths
              ignore return values, unchecked NULL,
              errno not checked, missing free()

Rust          ████                                      4 paths
              unwrap(), expect(), _, if let Ok(x) = ...

Zig           ████                                      4 paths
              try (propagates not swallow), catch |_|,
              unreachable, _ = (discard)

Elm           ███                                       3 paths
              withDefault, _, toMaybe

Grain         ███                                       3 paths
              unwrapWithDefault, _, toOption
```

The hierarchy is language design expressing the same tradeoff: more expressive power → more ways to misuse it. C has no syntactic sugar for swallowing, so its failures are loud (segfaults). TypeScript has maximum sugar, so its failures are silent (empty strings flowing through the clipboard). Elm and Grain sit at the sweet spot for web development: enough expressiveness to be productive, few enough swallowing paths to be auditable.

## The Real Lesson

The problem isn't that LLMs or developers make mistakes. It's that TypeScript provides 22 different ways to hide those mistakes, many of which look idiomatic and pass code review undetected. The fix isn't better linters or more careful review — it's choosing a language where the attack surface is small enough that **one person can hold the whole list in their head.**

In Elm: "watch for `withDefault`, `_`, and `toMaybe`."
In Grain: "watch for `unwrapWithDefault`, `_ =>`, and `toOption`."
In TypeScript: "here's a 22-item checklist, good luck."

## Sources

- This report is a synthesis of the author's direct experience refactoring a TypeScript userscript (km-explorer) across 30+ versions, plus the research compiled in:
  - `report/llm-swallowing.md` — literature review of LLM error-swallowing patterns
  - `report/languages-without-swallowing.md` — comparison of language design and swallowing constructs
  - `report/elm.md` — deep dive on Elm
  - `report/grain.md` — deep dive on Grain
