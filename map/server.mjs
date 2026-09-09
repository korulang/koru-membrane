// Map server — the instrument panel for the float/compose loop.
// Reads the living corpus (git log trailers + concepts/ frontmatter + schemas/
// membership lists) and serves the map IR + surface. Read-only upstream: it
// never writes the corpus; corrections enter through the membrane path, and the
// map re-reads. `node map/server.mjs` → http://localhost:3461/map.html

import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.MAP_PORT ?? 3461);
const FIELD_SEP = "\u001f";
const RECORD_SEP = "\u001e";
const ACTIONS = new Set(["create", "evolve", "merge", "split", "correct"]);

// --- corpus read -----------------------------------------------------------

function gitLog() {
  const out = execFileSync("git", ["-C", ROOT, "log", "--reverse", "--date-order",
    `--format=%H${FIELD_SEP}%ct${FIELD_SEP}%s${FIELD_SEP}%B${RECORD_SEP}`],
    { maxBuffer: 64 * 1024 * 1024 }).toString();
  const events = [];
  for (const record of out.split(RECORD_SEP)) {
    const t = record.replace(/^\n+/, "");
    if (!t) continue;
    const [sha, ct, summary, body] = t.split(FIELD_SEP);
    if (!sha || !body) continue;
    const ev = parseTrailers(sha, Number(ct) * 1000, summary ?? "", body);
    if (ev) events.push(ev);
  }
  return events;
}

function parseTrailers(sha, ts, summary, body) {
  let action = null, concept = null, reason = null;
  const parents = [];
  for (const line of body.split("\n")) {
    const m = /^([A-Za-z]+):\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), rest = m[2];
    if (key === "action" && ACTIONS.has(rest)) action = rest;
    else if (key === "concept") concept = rest;
    else if (key === "parents") for (const p of rest.split(",")) if (p.trim()) parents.push(p.trim());
    else if (key === "reason") reason = rest;
  }
  if (!action || !concept) return null;
  return { sha, ts, summary, action, concept, parents, reason };
}

function readConcepts() {
  const dir = join(ROOT, "concepts");
  const out = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const text = readFileSync(join(dir, file), "utf8");
    const id = file.replace(/\.md$/, "");
    const fm = /^---\n([\s\S]*?)\n---/.exec(text);
    const meta = {};
    if (fm) for (const line of fm[1].split("\n")) {
      const m = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
      if (m) meta[m[1]] = m[2].trim();
    }
    const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
    const firstLine = body.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? body.split("\n").find((l) => l.trim()) ?? "";
    out.set(id, {
      id,
      belief: firstLine.replace(/^#+\s*/, "").trim().slice(0, 220),
      tags: meta.tags ? meta.tags.replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean) : [],
      provenance: meta.provenance ?? null,
      ts: meta.ts ?? null,
    });
  }
  return out;
}

function readSchemas() {
  const out = [];
  const subs = join(ROOT, "schemas", "subsets");
  if (!existsSync(subs)) return out;
  for (const file of readdirSync(subs)) {
    if (!file.endsWith(".zontax")) continue;
    const name = file.replace(/\.zontax$/, "");
    const base = name.replace(/@v[0-9]+$/, "");
    const memFile = join(subs, base + ".members.txt");
    const members = existsSync(memFile)
      ? readFileSync(memFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean)
      : [];
    out.push({ id: name, members });
  }
  return out;
}

// --- fold ------------------------------------------------------------------

function fold(at) {
  const cut = at ?? Number.POSITIVE_INFINITY;
  const events = gitLog().filter((e) => e.ts <= cut);
  const concepts = readConcepts();
  const schemas = readSchemas();

  const memberOf = new Map(); // concept -> [schemaIds]
  for (const s of schemas) for (const m of s.members) {
    if (!memberOf.has(m)) memberOf.set(m, []);
    memberOf.get(m).push(s.id);
  }

  const nodes = [];
  const counts = { scarred: 0, blank: 0 };
  for (const [id, c] of concepts) {
    const evs = events.filter((e) => e.concept === id);
    const scars = evs.filter((e) => e.action === "correct").length;
    const evolves = evs.filter((e) => e.action === "evolve").length;
    const lanes = memberOf.get(id) ?? [];
    if (lanes.length === 0) counts.blank++;
    if (scars > 0) counts.scarred++;
    nodes.push({
      id, belief: c.belief, tags: c.tags, provenance: c.provenance,
      lanes, eventCount: evs.length, evolves, scars,
      status: scars > 0 ? "scarred" : lanes.length === 0 ? "blank" : evolves > 0 ? "evolved" : "seeded",
      lastEventAt: evs.length ? evs[evs.length - 1].ts : null,
    });
  }

  const range = events.length
    ? { min: events[0].ts, max: events[events.length - 1].ts }
    : { min: null, max: null };
  return {
    generatedAt: Date.now(), at: at ?? null, range,
    ontology: schemas.map((s) => ({ id: s.id, memberCount: s.members.length, provisional: false })),
    counts: { concepts: nodes.length, ...counts, events: events.length },
    nodes,
    events: events.map((e) => ({ sha: e.sha.slice(0, 10), ts: e.ts, action: e.action, concept: e.concept, summary: e.summary })),
  };
}

function trajectory(id) {
  const events = gitLog().filter((e) => e.concept === id);
  const concepts = readConcepts();
  const c = concepts.get(id);
  if (!c && events.length === 0) return null;
  return {
    id,
    belief: c?.belief ?? null,
    tags: c?.tags ?? [],
    provenance: c?.provenance ?? null,
    history: events.map((e) => ({ sha: e.sha.slice(0, 10), ts: e.ts, action: e.action, summary: e.summary, reason: e.reason })),
  };
}

// --- http ------------------------------------------------------------------

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    if (url.pathname === "/api/map") {
      const atRaw = url.searchParams.get("at");
      const at = atRaw === null || atRaw === "" ? null : Number(atRaw);
      const snap = fold(Number.isFinite(at) ? at : null);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(snap));
      return;
    }
    if (url.pathname === "/api/trajectory") {
      const id = url.searchParams.get("id") ?? "";
      const t = trajectory(basename(id));
      if (!t) { res.writeHead(404).end("unknown concept"); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(t));
      return;
    }
    const path = url.pathname === "/" ? "/map.html" : url.pathname;
    if (path.includes("..")) { res.writeHead(400).end("bad path"); return; }
    const ext = path.slice(path.lastIndexOf("."));
    const body = readFileSync(join(ROOT, "map", "surface", path));
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch (err) {
    if (err?.code === "ENOENT") { res.writeHead(404).end("not found"); return; }
    console.error("[map] request failed:", err);
    res.writeHead(500).end("internal error");
  }
});

server.listen(PORT, () => console.log(`[map] ontology × concepts → http://localhost:${PORT}/map.html`));
