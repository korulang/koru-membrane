# koru-membrane

The **shared Membrane memory corpus for the Koru family** — a durable, agent-tended
knowledge store whose fragment evolution lives in the git log as lineage trailers.

This is one store, shared across the sibling repos (`koru`, `koru-libs`,
`korulang_org`, …): they all point their membrane `<store>` here. Beliefs about the
Koru language and ecosystem inherently span those repos, so the corpus is central,
not per-repo. (Decision: 2026-06-29.)

## What it is

- **OKF concept store** — one concept = one markdown file, `concepts/frag-<id>.md`,
  keyed by a stable opaque id. The body is the current belief; the **working tree**
  is the live corpus, **git history** is everything occluded or repudiated
  (reachable, never deleted).
- **git is the temporal ledger.** A commit's SHA *is* the content-addressed
  value-ticket; the commit trailers record how a belief evolved.
- **No engine, no LLM sidecar, no required embeddings.** The agent is the evolver,
  recording the evolve/merge/split/correct judgment at write time. Embeddings are a
  deferred, back-fillable cache.

The full method lives in the `membrane` skill (`.claude/skills/membrane/SKILL.md`
in any koru-family repo). This repo is the *data*; the skill is the *discipline*.

## The lineage discipline (commit trailers)

Every commit carries two sectioned declarations. Each discipline parses only its
own section, so the two grammars never collide. The verb is the judgment:

```
<verb>(<id>): <one-line summary>

## World Model
Signal: <type> [value=<n>] [<note>]      # one or more — the WMFX faucet
Signals: acknowledged-none               # or consciously declare none

## Membrane
Action:   create | evolve | merge | split | correct
Concept:  frag-<id>
Occludes: <blob-sha>                     # evolve only (auto-derived if omitted)
Parents:  frag-<id>[, frag-<id>...]      # merge/split only
Severs:   frag-<id>@<blob-sha>           # correct only
Reason:   <why the prior line was wrong> # correct only
Evolution: acknowledged-none             # when the commit stages no concept file
```

Both questions are asked of **every** commit, and silence is rejected — but a
code commit that changed no belief discharges by saying so, not by inventing a
null evolution. `Evolution: acknowledged-none` is false if you staged a concept
file, and a `correct` may never declare `Signals: acknowledged-none`.

The `commit-msg` hook enforces this — see below.

## Reading it — `snap`

The corpus never deletes, so reading all of it is an instruction whose cost grows
forever. `snap.mjs` is the **bounded** read, and the default way to arrive here:

```bash
node snap.mjs                      # bounded snapshot, ~6 KB
node snap.mjs --bytes 16000        # wider — covers every concept
node snap.mjs --concept frag-<id>  # drill: full belief + its whole lineage
node snap.mjs --json               # structured, for a renderer
```

Detail decays with **heat** — git recency first, revision count second. Hot
beliefs arrive whole, then title + last change, then the one-line commit subject
alone, then named-only. Every concept lands in exactly one tier, so the corpus's
true width shows even when its contents don't, and every truncation is announced.

Pure-read and fully derived from git + the working tree: no index, no cache, no
state, nothing to invalidate. Run it from any repo carrying a `.membrane` pointer
and it resolves the store itself; otherwise pass `--store <path>`. It works
against any OKF corpus, not just this one.

## Enforcement hook

```bash
hooks/install.sh                 # install into this corpus repo
hooks/install.sh /path/to/repo   # install into a consumer repo
```

The hook rejects malformed lineage trailers (missing `Action:`/`Concept:`, missing
`Occludes:`/`Parents:`/`Severs:`+`Reason:` for the verb, or a missing faucet-signal
declaration). Non-membrane commits (no `Action:` line) pass untouched.

## Status

Live. `concepts/` holds the corpus; `koru` and `koru-parser-dogfood` point their
`<store>` here via a `.membrane` file.
