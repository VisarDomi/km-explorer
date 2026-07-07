# LLM Communication Report

## The problem

Written text has no intonation. A human hears "am i too confusing?" and detects self-deprecating humor. An LLM reads it and weighs whether to explain, apologize, or fix something. You can't italicize sarcasm in plain text, and you can't raise your voice to mark a literal value.

## What the research says

**LLMs default to literal interpretation.** When a prompt is ambiguous between literal and hyperbolic, models resolve toward the literal meaning (Pope Catholic paper, ACL 2024). They need explicit framing signals to switch to non-literal interpretation.

**Pragmatic framing is measurable.** Studies show that cues like "this is urgent" or "as your supervisor" shift LLM behavior beyond the literal content of the instruction (Measuring Pragmatic Influence, arXiv 2025). The problem: these shifts are not always the ones the user intended.

**Underspecification leads to guessing.** When prompts don't specify requirements, LLMs infer them ~41% of the time — but those inferences are fragile and regime-shift when models or prompts change (What Prompts Don't Say, 2025).

**Models can detect ambiguity but not act on it.** In interactive settings, LLMs recognize when a speaker is unreliable or ambiguous, but they don't translate that into efficient clarification behavior. They over-clarify or guess instead of asking (When Contextual Inference Fails, 2025).

**Implicature — meaning carried by what you DON'T say — is the hardest case.** LLMs struggle with implied criticism, indirect requests, and hyperbole. Explicit intermediate reasoning steps improve performance, but the gap remains large (ACL 2025 findings).

## How this played out in our session

| You wrote | I interpreted |
|---|---|
| "why are you harping on title" | Criticism requiring defense + explanation |
| "this is bad. why are you making a string out of a json" | Urgent fix needed |
| "name it test v2" | A title I should elaborate into "Clipboard Test v2" |
| "no. store only ids" | A design constraint for the next edit |
| "am i too confusing?" | A question about the quality of my work |

In every case, you meant the literal words. I added subtext. The string example: you stated a fact about IndexedDB (no JSON needed). I heard urgency and pivoted the design. The naming example: you gave me an exact string. I invented a title around it.

## What works

1. **Exact values in quotes or backticks.** `"test v2"` leaves no room for invention.
2. **One command per message.** Mixing a command with a meta-question ("fix this, and also am I confusing?") splits my attention.
3. **Short imperatives.** "Delete that line." beats "maybe we should consider removing it since it seems redundant."
4. **State the fact, don't imply it.** "IndexedDB stores objects natively." Not "this is bad."
5. **Separate meta-conversation from work.** If you want to discuss communication style, say so explicitly in a separate turn — otherwise I treat it as a signal about the current task.

## What doesn't

- Hyperbole as emphasis ("why are you so lazy") — I treat it as a criticism requiring behavioral change
- Rhetorical questions ("am i not clear?") — I answer them literally instead of recognizing them as frustration markers
- Implied criticism through short responses ("nah") — I interpret as rejection rather than redirection

## Bottom line

Assume the LLM is a literal parser with no access to your tone of voice. If you want it to do X, write X. If you want to discuss the meta-level of how you're communicating, do it in a separate turn with explicit framing: "sidequest: I want to discuss communication style."
