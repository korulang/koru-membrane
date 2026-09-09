# map/ — instrument panel over the corpus snapshot (5-line runbook)

```sh
node map/server.mjs            # → http://localhost:3461/map.html
MAP_PORT=3491 node map/server.mjs   # odd ports for parallel runs
```

- `/api/map?at=<epoch-ms>` — ontology lanes + concept nodes folded at T.
- `/api/trajectory?id=<frag-id>` — belief + full git history (the deref).
- `/api/schema?id=<schema-id>` — parsed fields, members, sibling overlap.
- Read-only upstream (git log + `concepts/` + `schemas/`); stdlib only.

Corpus note: this reads the `koru-membrane/concepts/` snapshot (retired
2026-08-04; live corpus is `koru/concepts`). Re-pointing the reader at the
live corpus is filed, not done — see HUB thread 1.
