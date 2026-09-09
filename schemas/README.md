# schemas/ — the floated-ontology catalog

Two tiers (see `../challenges/FLOAT_CHALLENGE.md`):

- `subsets/` — divergent, many. One granular Zontax schema per hunted corpus
  subset. Named `<subset>@v<n>.zontax`. Grows forever; variance is the metric.
- `full@<n>.zontax` (repo root of this dir, when it exists) — convergent, one.
  The merged artifact. Versioned on every green merge; merge failures version
  nothing and mint disputes instead.

## Rules

1. Every entry must pass the gate: `node schemas/check.mjs` (exit 0).
   It parses each schema (`ZontaxParser` + `parseZodString`), verifies
   every `.members.txt` resolves, and merges all — a `ZontaxMergeError`
   is a dispute, not a failure (field path printed, exit nonzero).
2. Every field carries `.describe()`. No `misc`, no `content: Z.string()` blobs.
3. Merge gate before any `full@` version: all subset schemas must
   `parser.parse(...)` clean together. A `ZontaxMergeError` is a **dispute**,
   not a failure — record it (field path + the two subsets) and route it to
   the walk.
4. A subset schema should validate the subset it was floated from. Coverage
   gaps are misfit — also recorded, also work.

## Entries

| Schema | Subset | Status |
|---|---|---|
| `subsets/untagged-49@v1.zontax` | the 49 untagged concepts (2026-09-09) | seed — floated by hand (Lars + Muse), 14 fields, 6 themes |
| `subsets/vaxis-7@v1.zontax` | the 7 vaxis-tagged concepts (2026-09-09) | replay #1, serial — 14 fields, surface perspective; shares ruling/pins/diagnostics/status/related/open_items byte-identically so the merge unions clean |
| `subsets/obligation-9@v1.zontax` | 9 must-discharge-debt concepts across all tags (2026-09-09) | experiment: content-clustered, tags ignored — 11 fields; `debt_phase` places all 9 (naming→repudiation); 3-way merge green |
