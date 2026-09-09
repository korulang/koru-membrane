---
challenge: float
kind: generator
status: standing
yields: one granular Zontax schema over a named corpus subset, in schemas/subsets/
catalog: ../schemas/subsets
family: ontology
created: 2026-09-09
---

*Walker context: recurrence earned this generator the day we noticed ontology
work keeps arriving as bespoke commissions — hunt a subset, float a schema,
merge it. First seed (untagged-49@v1, 14 fields over the 49 untagged concepts)
was floated by hand on the walk; every replay must diverge from the catalog,
not re-derive it.*

---

## The brief (sealed — you are the contestant)

You ARE the contestant. Do not ask which subset or which direction — pick one,
name it, ship.

1. **Hunt a subset.** Find a slice of `concepts/` with no schema covering it:
   blank map territory (untagged, unlinked, unclustered). Name it
   (`<subset-name>`, count, why it's a natural unit). Prefer 20–80 concepts;
   smaller is trivia, larger is a thesis.
2. **Float a granular schema.** Write Zontax (`Z.object` envelope, `.describe()`
   on every field, no `misc`, no content-blobs) that captures what a belief
   record *for this subset* needs. Granular beats grand: 10–18 fields grounded
   in what you actually read beats 6 fields that fit everything.
3. **Self-ground.** Read `schemas/` first. Your schema must diverge — a new
   perspective, a finer granularity, a disputed field — not a re-derivation.
   If it merges identically with an existing entry, you brought nothing; hunt
   elsewhere.
4. **Merge-gate.** Your schema must `parser.parse()` clean against every schema
   in the catalog. Green → append as `schemas/subsets/<name>@v1.zontax` and
   update the catalog table. Red (`ZontaxMergeError`) → you found a **dispute**:
   record the field path + the two subsets, do NOT force the merge, hand the
   dispute to the walk. Disputes are yield too.

**Done-gates (self-check before shipping):** it parses (ZontaxParser +
parseZodString, no throw) · every field has `.describe()` · it validates a
spot-sample of its subset (≥5 concepts by hand) · merge against the catalog is
green, or a dispute is recorded with field path.

**Variance is the metric.** Three contestants floating three keepable schemas
over the same subset is success. Convergence on one schema means the subset
wanted a task, not a challenge — say so and hunt elsewhere.
