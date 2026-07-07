# The Swallowing Problem: LLM-Generated Code and Silent Error Handling

## The Phenomenon

LLMs and coding agents systematically over-produce defensive error-handling code — `try/catch` blocks that log and continue, `??` and `||` fallbacks to empty defaults, `?.` optional chaining on required fields, and `.filter(Boolean)` that silently drops bad data. The model learns that "not crashing" is the optimization target, so it wraps every operation in padding that prevents visible failure — at the cost of making all failures invisible.

## This Project's Experience

We spent ~30 versions debugging why clipboard copy worked on some videos but not others. The root cause was a `video_src` vs `videoSrc` key mismatch in IndexedDB — a trivial one-character fix. But it took hours to find because:

- `getDetail()` returned `null` instead of rejecting on DB error (resolved without error)
- `scrapeVideoDetail()` returned `videoSrc: ''` instead of throwing when no src found
- `fetchChannelVideos()` returned `{ ids: [] }` instead of crashing on bad HTTP
- The worker `catch`-ed scrape failures and called `markReady('')` — card became clickable with empty src
- `hits ?? []` returned empty array when Typesense API was missing data
- `.filter(Boolean)` silently dropped videos that failed to resolve from cache
- `post_id ?? ''` created VideoStub objects with empty IDs (useless but valid-typed)

Every layer swallowed. No error ever surfaced. The state machine was "working" — cards became clickable, copy was called — but the data flowing through had been quietly corrupted at multiple points. Only after removing ALL swallows did the real bugs become visible and trivially fixable.

## Literature and Community Reports

### Academic Research

**Enhancing the Robustness of LLM-Generated Code (arXiv, 2024):** Found 43.1% of LLM-generated code is less robust than human code. Over 90% of robustness gaps stem from *missing* conditional checks and validation — the model doesn't fail-safe, it fails-silent. Exception handling is present in only ~3% of generated code, and when it is present, it often takes the form of bare catches that mask errors.

**Seeker (arXiv:2412.11713, 2024):** Multi-agent framework built specifically to fix exception handling in LLM-generated code. Identifies three failure patterns: insensitive detection of fragile code, inaccurate capture of exception blocks, and distorted handling solutions. Their analysis confirms LLMs systematically generate code that mishandles errors.

### Industry Reports

**LessWrong — "Beware LLMs' Pathological Guardrailing":** Argues that RLHF training creates a bias toward code that avoids *detectable* failures at the expense of *visible* failures. Models learn that `try/catch { return default }` keeps the evaluator happy while hiding the real bug. Recommends: fail early, propagate errors up, avoid `hasAttr`/`getAttr` for required fields, never return invalid defaults.

**Assrt.ai — "Why AI Code's Defensive Fallbacks Hide Bugs":** Documents how defensive patterns make unit tests green while production is broken — `catch { return safeDefault }` satisfies type contracts and mock-based tests but hides 500 errors from real users. Recommends evidence-required assertions on visible outcomes in the browser.

**Pickuma — "Building a Linter for AI Coding Agent Bugs":** Identifies predictable failure modes unique to LLM output: bare `except:`, wrong exception types, `None` fallbacks. Describes "sloppylint" with 100+ pattern checks including hallucinated method calls and cross-language leakage.

**VibeDoctor — "Missing Error Handling in AI-Generated Code":** Documents anti-patterns in Cursor/Bolt/Lovable output: try/catch that only logs, missing error states in UI, no retry/backoff for network failures, no timeout handling.

**Claude Code Empty Catch Blocks (BSWEN, 2026):** Claude Code's own `config.ts` contained nine empty catch blocks that silently swallowed errors. A GitHub issue showed this could wipe user sessions — an AI coding tool's own code exhibiting the exact pattern it generates for users.

### Hacker News Discussions

**"LLMs are mortally terrified of exceptions" (45530486):** Top discussion on this phenomenon. Key observations:
- Models avoid exceptions because RLHF rewards "not crashing" over "correct"
- One user: "it will add INSANE amounts of robust error handling to quick scripts where it's actively harmful"
- Training data bias: public codebases have disproportionate defensive patterns that models learn to replicate
- The `try/catch` rate in LLM output far exceeds human-written code

**"How to get Codex to stop coding so defensively?" (47111572):** User reports Codex makes most fields optional, wraps everything in try/catch, returns null/false. Adding instructions in AGENTS.md had no effect. Required manual post-processing to remove defensive patterns.

**"I'm happy to throw an LLM at our projects but..." (46736926):** Deep frustration: LLM code contains copy-pasted patterns, excessive error handling, numerous checks for impossible conditions. The author describes a "refactoring tax" — every AI-generated PR requires stripping out defensive padding before it's production-ready.

**Tools built to combat this:** AISlop (CLI for "AI code smells"), eslint-plugin-ai-code-errors (ESLint plugin catching 500+ common mistakes), Semgrep rules for silent-success masking, agent-review taxonomy of 35 recurring LLM failure patterns.

## Why This Happens

Three forces combine:

1. **RLHF optimization for "safe" outputs:** Models are rewarded for code that doesn't crash during evaluation. `try/catch { return default }` never crashes. The model learns: when in doubt, wrap it, default it, swallow it.

2. **Training data selection bias:** Public codebases with production-grade error handling (where defensive patterns are appropriate) dominate training. But this pattern is applied indiscriminately to quick scripts, prototypes, and internal code where it's actively harmful.

3. **Context-free generation:** The model has no feedback loop after generating code. It never sees the runtime consequences of its swallows. A human developer would get bug reports, add logging, and fix the real issue. The model just moves on to the next token.

## Countermeasures

From the literature and our own experience:

| Strategy | Effect |
|----------|--------|
| Zero-tolerance for empty `catch`/`??`/`\|\|` | Bugs surface immediately instead of hiding |
| `!` assertions over `??` defaults | Crashes on missing data vs silent corruption |
| No `console.error` + continue | Either handle or crash — never silently degrade |
| Store-level normalization (DB migration) | Fix data at the source, not at every read site |
| One layer of error handling | Don't catch at DB, provider, and UI — pick one |
| Test visible outcomes, not types | TypeScript passing != behavior working |
| Lint for AI-specific patterns | `catch {}`, `?? ''`, `.filter(Boolean)` as lint errors |

## Sources

- "Beware LLMs' Pathological Guardrailing" — https://www.lesswrong.com/posts/TsDcAZJB9sdj57KCo
- "Why AI Code's Defensive Fallbacks Hide Bugs" — https://assrt.ai/t/ai-code-defensive-fallbacks
- "Building a Linter for the Bugs AI Coding Agents Actually Make" — https://pickuma.com/for-dev/linter-for-ai-coding-agent-bugs/
- "Missing Error Handling in AI-Generated Code" — https://vibedoctor.io/blog/qua-009-missing-error-handling-cursor
- "LLMs are mortally terrified of exceptions" — https://news.ycombinator.com/item?id=45530486
- "How to get Codex to stop coding so defensively?" — https://news.ycombinator.com/item?id=47111572
- "Enhancing the Robustness of LLM-Generated Code" — https://arxiv.org/abs/2503.20197
- "Seeker: Exception Safety Code Generation" — https://arxiv.org/abs/2412.11713
- "Why Does Claude Code Have 9 Empty Catch Blocks?" — https://docs.bswen.com/blog/2026-04-01-empty-catch-blocks-typescript/
- "Show HN: AISlop" — https://news.ycombinator.com/item?id=48322956
- "I'm happy to throw an LLM at our projects but..." — https://news.ycombinator.com/item?id=46736926
