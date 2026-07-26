#!/usr/bin/env node
// membrane — snap. A BOUNDED, PURE read of the corpus.
//
//   node snap.mjs [--bytes N] [--concept <id>] [--store <path>] [--json]
//
// The corpus never deletes, so "read the membrane on startup" is an instruction
// whose cost grows forever. snap answers the same question at a FIXED price:
// detail decays with heat, so hot beliefs arrive whole and cold ones arrive as
// the one-line commit subject we already hand-wrote for them.
//
// Everything here is DERIVED from git + the working tree. No index, no cache
// file, no new state. Dropping it loses nothing; there is nothing to drop.
// That is deliberate: a summary tier that persists is a second source of truth,
// and the corpus already has one.
//
// snap is PURE-READ. It never writes, never commits, never asks for work in
// return. Call it as often as you like.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------- options

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    die(`${name} needs a value`);
  }
  return v;
};
const has = (name) => argv.includes(name);

function die(msg) {
  console.error(`snap: ${msg}`);
  process.exit(1);
}

// The reading budget, in bytes of rendered output. A budget, not a storage
// limit: change it in either direction, nothing is recomputed.
const BUDGET = Number(flag("--bytes", 6000));
// One belief must not be able to eat the whole budget. The corpus's largest
// concept is ~27 KB; without this cap a single fragment starves every other.
const FRAG_CAP = Number(flag("--frag-bytes", 2000));
const WANT_JSON = has("--json");
const ONE = flag("--concept", null);

if (!Number.isFinite(BUDGET) || BUDGET < 1) die("--bytes must be a positive number");
if (!Number.isFinite(FRAG_CAP) || FRAG_CAP < 1) die("--frag-bytes must be a positive number");

// ---------------------------------------------------------------- store

// The store is wherever the concepts are: an explicit --store, the machine-local
// `.membrane` pointer a consumer repo drops in its root, or the cwd itself.
function resolveStore() {
  const explicit = flag("--store", null);
  if (explicit) return path.resolve(explicit);
  const pointer = path.join(process.cwd(), ".membrane");
  if (fs.existsSync(pointer)) {
    const p = fs.readFileSync(pointer, "utf8").trim();
    if (p) return path.resolve(p);
  }
  return process.cwd();
}

const STORE = resolveStore();
const CONCEPTS = path.join(STORE, "concepts");
if (!fs.existsSync(CONCEPTS)) {
  die(`no concepts/ at ${STORE}\n` +
      `  point at a corpus with --store <path>, or drop a .membrane file naming one.`);
}

const git = (args) =>
  execFileSync("git", ["-C", STORE, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });

// ---------------------------------------------------------------- corpus read

const bytes = (s) => Buffer.byteLength(s, "utf8");

function parseFragment(file) {
  const raw = fs.readFileSync(path.join(CONCEPTS, file), "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  let body = raw;
  if (m) {
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (kv) meta[kv[1].toLowerCase()] = kv[2].trim();
    }
    body = raw.slice(m[0].length);
  }
  const h1 = (body.match(/^#\s+(.+)$/m) || [])[1] || "";
  return {
    id: meta.id || file.replace(/\.md$/, ""),
    file,
    meta,
    h1: h1.trim(),
    body: body.trim(),
    bodyBytes: bytes(body.trim()),
  };
}

const files = fs.readdirSync(CONCEPTS).filter((f) => f.endsWith(".md")).sort();
if (files.length === 0) die(`${CONCEPTS} holds no concepts`);
const fragments = files.map(parseFragment);

// ---------------------------------------------------------------- heat, from git

// ONE git pass builds the whole heat map: for every concept file, when it was
// last touched, how many commits touched it, and the subject of the most recent
// one. That subject is the summary tier — we already hand-write it in
// `verb(id): what changed` form on every corpus commit, and until now we threw
// it away at read time.
// Control characters as separators: a commit subject can contain anything
// printable, so a printable delimiter would eventually be split on.
const RS = "\x01";
const FS_ = "\x1f";

function heatMap() {
  let out = "";
  try {
    out = git(["log", `--format=${RS}%H${FS_}%ct${FS_}%s`, "--name-only", "--", "concepts/"]);
  } catch {
    // Not a git repo, or no history yet. Every concept is then equally cold and
    // ranking falls back to mtime — snap still works, it just can't decay.
    return new Map();
  }
  const map = new Map();
  let cur = null;
  for (const line of out.split("\n")) {
    if (line.startsWith(RS)) {
      const [sha, ct, ...rest] = line.slice(1).split(FS_);
      cur = { sha, ts: Number(ct) * 1000, subject: rest.join(FS_) };
      continue;
    }
    const p = line.trim();
    if (!cur || !p.startsWith("concepts/")) continue;
    const file = p.slice("concepts/".length);
    let e = map.get(file);
    if (!e) {
      // git log is newest-first, so the FIRST commit we see for a file is its
      // latest: that's the one whose subject becomes the cold-tier line.
      e = { lastTs: cur.ts, lastSubject: cur.subject, lastSha: cur.sha, commits: 0 };
      map.set(file, e);
    }
    e.commits += 1;
  }
  return map;
}

const heat = heatMap();
const NOW = Date.now();

for (const f of fragments) {
  const h = heat.get(f.file);
  if (h) {
    f.lastTs = h.lastTs;
    f.lastSubject = h.lastSubject;
    f.lastSha = h.lastSha;
    f.commits = h.commits;
  } else {
    // Uncommitted or untracked: it is the newest thing in the corpus by
    // definition. Rank it hottest and say so rather than inventing a date.
    let mtime = NOW;
    try { mtime = fs.statSync(path.join(CONCEPTS, f.file)).mtimeMs; } catch {}
    f.lastTs = mtime;
    f.lastSubject = "(uncommitted)";
    f.lastSha = null;
    f.commits = 0;
  }
  f.ageMs = NOW - f.lastTs;
}

// Heat is recency first, weight second. A belief touched today outranks one
// touched last month no matter how often the old one was revised; among
// same-day neighbours, the more-revised concept is the more contested one.
const ranked = [...fragments].sort(
  (a, b) => b.lastTs - a.lastTs || b.commits - a.commits || a.id.localeCompare(b.id)
);

// ---------------------------------------------------------------- rendering

function formatAge(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function clipBody(f) {
  if (f.bodyBytes <= FRAG_CAP) return f.body;
  const buf = Buffer.from(f.body, "utf8");
  const head = buf.subarray(0, FRAG_CAP).toString("utf8");
  return `${head}\n… [${buf.length - FRAG_CAP} bytes elided — full belief in concepts/${f.file}]`;
}

const verbOf = (subject) => (subject.match(/^(\w+)\(/) || [])[1] || "";

function renderHot(f) {
  const v = verbOf(f.lastSubject);
  const tag = [v && `${v}`, formatAge(f.ageMs), `${f.commits} commit${f.commits === 1 ? "" : "s"}`]
    .filter(Boolean).join(" · ");
  return `── ${f.id}  (${tag})\n${clipBody(f)}\n`;
}

function renderWarm(f) {
  const title = f.h1 || f.id;
  return `${f.id} — ${title}\n  ↳ ${f.lastSubject}  (${formatAge(f.ageMs)})\n`;
}

function renderCold(f) {
  return `${f.lastSubject}  (${formatAge(f.ageMs)})\n`;
}

// ---------------------------------------------------------------- drill-down

// The companion to a bounded read: once snap names a concept, this reads the
// whole of it plus its lineage, unbounded and unclipped. `prose session <id>`
// is the same move — a snapshot exists to be drilled out of.
if (ONE) {
  const f = fragments.find((x) => x.id === ONE || x.file === ONE || x.id === `frag-${ONE}`);
  if (!f) {
    const near = fragments.filter((x) => x.id.includes(ONE)).map((x) => x.id);
    die(`no concept '${ONE}'` + (near.length ? `\n  did you mean: ${near.join(", ")}` : ""));
  }
  let lineage = "";
  try {
    lineage = git([
      "log", `--format=${RS}%h${FS_}%ad${FS_}%s${FS_}%b`, "--date=short",
      "--", `concepts/${f.file}`,
    ]);
  } catch {}
  const entries = lineage.split(RS).filter(Boolean).map((chunk) => {
    const [sha, date, subject, ...rest] = chunk.split(FS_);
    const b = rest.join(FS_);
    const pick = (k) => (b.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1] || null;
    return {
      sha, date, subject,
      action: pick("Action"),
      occludes: pick("Occludes"),
      parents: pick("Parents"),
      severs: pick("Severs"),
      reason: pick("Reason"),
      // Signals wrap across lines in real commits. Rejoin continuations, or a
      // clipped signal renders as if it were the whole of what was declared.
      signals: (() => {
        const out = [];
        let open = false;
        for (const line of (b || "").split("\n")) {
          const m = line.match(/^Signal:\s*(.+)$/);
          if (m) { out.push(m[1].trim()); open = true; continue; }
          if (open && line.trim() && !/^[A-Z][\w -]*:/.test(line) && !line.startsWith("##")) {
            out[out.length - 1] += " " + line.trim();
            continue;
          }
          open = false;
        }
        return out;
      })(),
    };
  });

  if (WANT_JSON) {
    console.log(JSON.stringify({ store: STORE, concept: f.id, meta: f.meta, body: f.body, lineage: entries }, null, 2));
    process.exit(0);
  }

  const out = [`=== ${f.id} ===`, ""];
  for (const [k, v] of Object.entries(f.meta)) out.push(`${k}: ${v}`);
  out.push("", f.body, "", `=== lineage (${entries.length} commit${entries.length === 1 ? "" : "s"}) ===`);
  for (const e of entries) {
    out.push(`${e.sha}  ${e.date}  ${e.subject}`);
    if (e.action) out.push(`          Action: ${e.action}`);
    if (e.occludes) out.push(`          Occludes: ${e.occludes}`);
    if (e.parents) out.push(`          Parents: ${e.parents}`);
    if (e.severs) out.push(`          Severs: ${e.severs}   ← REPUDIATED`);
    if (e.reason) out.push(`          Reason: ${e.reason}`);
    for (const s of e.signals) out.push(`          Signal: ${s}`);
  }
  console.log(out.join("\n"));
  process.exit(0);
}

// ---------------------------------------------------------------- budget

// The budget is spent TOP-DOWN, hottest first, each concept taking the richest
// tier that still fits. Spending bottom-up instead — floor everything at cold,
// then promote — inverts the priority: one cold line per concept grows linearly
// with the corpus, so at 59 concepts the floor alone consumes the whole budget
// and nothing is ever shown whole. Detail has to decay with heat, which means
// the hot end must be served FIRST and the tail must be allowed to fall off.
//
// HOT_SHARE caps how much of the budget full bodies may take, so a handful of
// hot beliefs cannot starve the corpus-shape view the cold tier provides. It is
// the one tuning knob with real judgment in it: too high and snap is a
// three-fragment read, too low and nothing arrives whole.
// Each tier gets its own slice, so a rich tier cannot starve a poorer one. With
// one shared pool the warm tier eats everything the hot tier leaves and the cold
// tail never renders — the corpus then looks 16 concepts wide when it is 59.
// The remainder after hot+warm belongs to cold, minus a reserve for the frozen
// id list, which is what keeps the promise that nothing vanishes unseen.
const HOT_SHARE = Number(flag("--hot-share", 0.55));
const WARM_SHARE = Number(flag("--warm-share", 0.25));
const FROZEN_SHARE = Number(flag("--frozen-share", 0.12));
for (const [n, v] of [["--hot-share", HOT_SHARE], ["--warm-share", WARM_SHARE], ["--frozen-share", FROZEN_SHARE]]) {
  if (!(v > 0 && v < 1)) die(`${n} must be in (0, 1)`);
}
if (HOT_SHARE + WARM_SHARE + FROZEN_SHARE >= 1) die("shares must leave room for the cold tier");

const HOT_ALLOWANCE = BUDGET * HOT_SHARE;
const WARM_ALLOWANCE = BUDGET * WARM_SHARE;
const FROZEN_ALLOWANCE = BUDGET * FROZEN_SHARE;
const TIERED_BUDGET = BUDGET - FROZEN_ALLOWANCE;

const tier = new Map();
let spent = 0;
let hotSpent = 0;
let warmSpent = 0;

for (const f of ranked) {
  const hotC = bytes(renderHot(f));
  const warmC = bytes(renderWarm(f));
  const coldC = bytes(renderCold(f));

  // The hottest concept always arrives in full, even if it alone exceeds its
  // allowance: a snap that shows nothing whole is not orientation. Any overspend
  // is reported in the footer rather than hidden.
  const isFirst = tier.size === 0;

  if (isFirst || (hotSpent + hotC <= HOT_ALLOWANCE && spent + hotC <= TIERED_BUDGET)) {
    tier.set(f.id, "hot");
    spent += hotC;
    hotSpent += hotC;
    continue;
  }
  // Shrink-to-fit, never `break`: a cheap warm or cold entry further down the
  // ranking still lands after an expensive one was refused. Abandoning the scan
  // at the first miss would waste whatever budget remains.
  if (warmSpent + warmC <= WARM_ALLOWANCE && spent + warmC <= TIERED_BUDGET) {
    tier.set(f.id, "warm");
    spent += warmC;
    warmSpent += warmC;
    continue;
  }
  if (spent + coldC <= TIERED_BUDGET) {
    tier.set(f.id, "cold");
    spent += coldC;
    continue;
  }
  // Everything past here is frozen: named, but not described.
}

const visible = ranked.filter((f) => tier.has(f.id));

// The frozen tail — every remaining concept collapsed to a wrapped list of bare
// ids. Many entries becoming one block is the same move OptMem makes when it
// merges an old range into a single summary line: detail goes, existence stays.
// A reader can still see the true width of the corpus and drill into any of it.
const frozenAll = ranked.filter((f) => !tier.has(f.id)).map((f) => f.id);
const frozen = [];
let frozenSpent = 0;
for (const id of frozenAll) {
  const c = bytes(id) + 2; // the ", " that joins it
  if (frozenSpent + c > FROZEN_ALLOWANCE) break;
  frozen.push(id);
  frozenSpent += c;
}
const unnamed = frozenAll.length - frozen.length;
spent += frozenSpent;

// ---------------------------------------------------------------- output

// "You are here", carried FREE — off-budget, like prose's baton header. This is
// derived from the log rather than stored: the last few corpus commits already
// say where the belief-work stopped, so there is no second surface to keep in
// sync and nothing to write.
function recentHeader() {
  let out = "";
  try {
    out = git(["log", "-3", `--format=%h${FS_}%ct${FS_}%s`, "--", "concepts/"]);
  } catch { return ""; }
  const lines = out.split("\n").filter(Boolean).map((l) => {
    const [sha, ct, ...rest] = l.split(FS_);
    return `↪ ${rest.join(FS_)}   (${formatAge(NOW - Number(ct) * 1000)}, ${sha})`;
  });
  if (!lines.length) return "";
  return ["=== ↪ latest belief-work (you are here) ===", ...lines].join("\n") + "\n\n";
}

const hot = visible.filter((f) => tier.get(f.id) === "hot");
const warm = visible.filter((f) => tier.get(f.id) === "warm");
const cold = visible.filter((f) => tier.get(f.id) === "cold");

if (WANT_JSON) {
  console.log(JSON.stringify({
    store: STORE,
    budgetBytes: BUDGET,
    spentBytes: spent,
    concepts: fragments.length,
    unnamed,
    tiers: {
      hot: hot.map((f) => ({ id: f.id, h1: f.h1, ageMs: f.ageMs, commits: f.commits, body: clipBody(f), clipped: f.bodyBytes > FRAG_CAP })),
      warm: warm.map((f) => ({ id: f.id, h1: f.h1, ageMs: f.ageMs, commits: f.commits, subject: f.lastSubject })),
      cold: cold.map((f) => ({ id: f.id, ageMs: f.ageMs, commits: f.commits, subject: f.lastSubject })),
      frozen,
    },
  }, null, 2));
  process.exit(0);
}

const out = [recentHeader().trimEnd(), ""];

if (hot.length) {
  out.push(`=== hot — ${hot.length} belief${hot.length === 1 ? "" : "s"}, in full ===`, "");
  for (const f of hot) out.push(renderHot(f));
}
if (warm.length) {
  out.push(`=== warm — ${warm.length}, title + last change ===`, "");
  for (const f of warm) out.push(renderWarm(f));
}
if (cold.length) {
  out.push(`=== cold — ${cold.length}, last change only ===`, "");
  for (const f of cold) out.push(renderCold(f).trimEnd());
  out.push("");
}
if (frozen.length) {
  out.push(`=== frozen — ${frozen.length}, named only ===`, "");
  // Wrapped, so the tail reads as one block rather than a page of stubs.
  let line = "";
  for (const id of frozen) {
    const next = line ? `${line}, ${id}` : id;
    if (next.length > 92) { out.push(line + ","); line = id; }
    else line = next;
  }
  if (line) out.push(line);
  out.push("");
}
if (unnamed) {
  out.push(`… and ${unnamed} more not even named — raise --bytes to reach them.`, "");
}
out.push(
  `${fragments.length} concepts · ${spent}/${BUDGET} bytes · ` +
  `drill in with: node snap.mjs --concept <id>`
);

console.log(out.join("\n"));
