#!/usr/bin/env node
// membrane + worldmodel — commit-msg enforcement (the pit-of-success gate).
//
// Two disciplines, two sectioned formats, one hook. The commit body carries
// `## World Model` and/or `## Membrane` markdown sections; each tool parses ONLY
// its own section, so the two formats never collide.
//
//   ## World Model   — UNIVERSAL gate. EVERY commit must declare a faucet signal
//                      or consciously acknowledge none. "Did a belief about Koru
//                      change here?" is always a cheap, honest, answerable
//                      question — `acknowledged-none` is a true, common answer.
//
//   ## Membrane      — OKF-AWARE gate. Fires ONLY when the commit actually stages
//                      concept files (concepts/*.md). Lineage trailers (the five
//                      verbs) are required there. A code commit that touches no
//                      OKF is never forced into a meaningless "null evolution" —
//                      that asymmetry is the whole reconciliation: you can force
//                      the signal QUESTION everywhere, but evolution is TRIGGERED
//                      by an OKF change, never an obligation on every commit.
//
// Reject-by-default with a CONSCIOUS opt-out (`acknowledged-none`, never silence),
// so a discipline can't be skipped by inertia — only by a deliberate, recorded
// act. The failure messages TEACH the correct shape: they are the pit-of-success
// walls. A good wall doesn't just block — it guides into the pit.
//
// Install:  hooks/install.sh   (or: cp hooks/commit-msg .git/hooks/ && chmod +x)

const fs = require("fs");
const { execFileSync } = require("child_process");

const msg = fs.readFileSync(process.argv[2], "utf8");

// Mechanical, git-generated commits are not authored belief-changes — exempt them.
const firstLine = msg.split("\n").find((l) => l.trim()) || "";
if (/^(Merge |Revert "|fixup!|squash!|amend!|Rebase )/.test(firstLine)) process.exit(0);

// --- section split: each key is read only within its own `## Header` region ---
function sections(text) {
  const out = { _preamble: [] };
  let cur = "_preamble";
  for (const line of text.split("\n")) {
    const h = line.match(/^##\s+(.*\S)\s*$/);
    if (h) { cur = h[1].toLowerCase(); out[cur] = out[cur] || []; }
    else out[cur].push(line);
  }
  for (const k of Object.keys(out)) out[k] = out[k].join("\n");
  return out;
}
const secs = sections(msg);
const keyIn = (text, k) =>
  text == null ? undefined : (text.match(new RegExp("^" + k + ":\\s*(.+)$", "m")) || [])[1];

function fail(discipline, reason, help) {
  console.error(`\n✗ ${discipline}: commit rejected — ${reason}\n`);
  console.error(help.trimEnd());
  console.error(`\n(emergency bypass: git commit --no-verify — use sparingly; it skips the discipline)\n`);
  process.exit(1);
}

const WM_HELP = `  Every commit answers one question: did a belief about Koru change here?
    ## World Model
    Signal: contradiction — <what flipped, and against which prior belief>
  If nothing here is belief-worthy, acknowledge it on purpose:
    ## World Model
    Signals: acknowledged-none`;

const MEM_HELP = `  This commit stages OKF concept files, so declare how the belief evolved:
    ## Membrane
    Action: evolve                      # create | evolve | merge | split | correct
    Concept: frag-<id>
    Occludes: <prior-blob-sha>          # evolve
    Parents: frag-<id>, frag-<id>       # merge | split
    Severs: frag-<id>@<blob-sha>        # correct
    Reason: <why the prior belief was wrong>   # correct`;

// ---------------------------------------------------------------------------
// 1. World Model gate — UNIVERSAL. Fires on every authored commit.
// ---------------------------------------------------------------------------
const wm = secs["world model"];
if (wm == null) fail("World Model", "missing the '## World Model' section", WM_HELP);
const wmAckNone = /^Signals:\s*acknowledged-none\b/im.test(wm);
const nSignals = (wm.match(/^Signal:\s*\S+/gim) || []).length;
if (!wmAckNone && nSignals === 0)
  fail("World Model", "declare a 'Signal: <type> ...' line, or 'Signals: acknowledged-none'", WM_HELP);

// ---------------------------------------------------------------------------
// 2. Membrane gate — OKF-AWARE. Fires only when concept files are staged.
// ---------------------------------------------------------------------------
let staged = [];
try {
  staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" })
    .split("\n").filter(Boolean);
} catch { /* not in a repo / no index — skip OKF gate */ }
const touchesOKF = staged.some((f) => /(^|\/)concepts\/[^/]+\.md$/.test(f));

if (touchesOKF) {
  const memFail = (m) => fail("Membrane", m, MEM_HELP);
  const mem = secs["membrane"];
  if (mem == null)
    memFail("this commit stages OKF concept files but has no '## Membrane' section");
  // acknowledged-none is FALSE when you actually changed concept files.
  if (/^Evolution:\s*acknowledged-none\b/im.test(mem))
    memFail("you staged concept files — 'Evolution: acknowledged-none' is false here; declare the lineage");

  const need = { create: [], evolve: ["Occludes"], merge: ["Parents"], split: ["Parents"], correct: ["Severs", "Reason"] };
  const action = keyIn(mem, "Action");
  if (!action) memFail("declare an Action: (create/evolve/merge/split/correct)");
  if (!need[action]) memFail(`unknown Action '${action}' — want: ${Object.keys(need).join("/")}`);
  if (!keyIn(mem, "Concept")) memFail("missing Concept:");
  for (const k of need[action]) if (!keyIn(mem, k)) memFail(`Action ${action} requires ${k}:`);

  // --- resolve the references for real: merge/split must not dangle ---
  const objExists = (sha) => {
    try { execFileSync("git", ["cat-file", "-e", sha], { stdio: "ignore" }); return true; }
    catch { return false; }
  };
  const conceptExists = (id) =>
    fs.existsSync(`concepts/${id}.md`) || objExists(`:concepts/${id}.md`) || objExists(`HEAD:concepts/${id}.md`);

  if (action === "evolve") {
    const blob = keyIn(mem, "Occludes").trim();
    if (!objExists(blob)) memFail(`Occludes: '${blob}' is not a reachable git object — it must be the prior blob sha`);
  }
  if (action === "merge" || action === "split") {
    const parents = keyIn(mem, "Parents").split(",").map((s) => s.trim()).filter(Boolean);
    if (parents.length < 2) memFail(`Action ${action} needs ≥2 Parents: (got ${parents.length})`);
    for (const p of parents) if (!conceptExists(p)) memFail(`Parents: concept '${p}' does not exist in the corpus`);
  }
  if (action === "correct") {
    const sev = keyIn(mem, "Severs").trim();           // frag-<id>@<blob-sha>
    const at = sev.lastIndexOf("@");
    if (at < 0) memFail(`Severs: '${sev}' must be 'frag-<id>@<blob-sha>'`);
    const id = sev.slice(0, at), blob = sev.slice(at + 1);
    if (!conceptExists(id)) memFail(`Severs: concept '${id}' does not exist in the corpus`);
    if (!objExists(blob)) memFail(`Severs: blob '${blob}' is not a reachable git object`);
    if (nSignals === 0)
      fail("World Model", "Action correct is intrinsically attention-worthy — declare a 'Signal:', not acknowledged-none", WM_HELP);
  }
}
