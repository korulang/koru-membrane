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

Every corpus commit carries a trailer block. The verb is the judgment:

```
<verb>(<id>): <one-line summary>

Action:     create | evolve | merge | split | correct
Concept:    frag-<id>
Occludes:   <blob-sha>                # evolve only
Parents:    frag-<id>[, frag-<id>...] # merge/split only
Severs:     frag-<id>@<blob-sha>      # correct only
Reason:     <why the prior line was wrong>   # correct only
Provenance: <session / source>
Signal:     <type> [value=<n>] [<note>]      # zero or more — the WMFX faucet
Signals:    none                             # required if no Signal: lines
```

The `commit-msg` hook enforces this — see below.

## Enforcement hook

```bash
hooks/install.sh                 # install into this corpus repo
hooks/install.sh /path/to/repo   # install into a consumer repo
```

The hook rejects malformed lineage trailers (missing `Action:`/`Concept:`, missing
`Occludes:`/`Parents:`/`Severs:`+`Reason:` for the verb, or a missing faucet-signal
declaration). Non-membrane commits (no `Action:` line) pass untouched.

## Status

Greenfield. The store is empty (`concepts/` holds only `.gitkeep`); wiring each
consumer repo's `<store>` pointer is the next step.
