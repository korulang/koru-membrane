#!/usr/bin/env node
// membrane + worldmodel — post-commit faucet (the cross-repo link).
//
// After a commit lands in a CONSUMER repo (koru, koru-libs, …), if its
// `## World Model` section declared a BELIEF-CLASS signal — contradiction,
// regime-change, or correction — then a belief about Koru just changed and it
// must reach the shared corpus. This faucet does NOT silently write the corpus
// (no magic daemon mutating another repo behind your back). It QUEUES the
// obligation durably into the corpus inbox and surfaces it, so an AGENT closes
// the loop by recording the belief. A human is never in this loop.
//
// Routine commits (mechanical signals, or `Signals: acknowledged-none`) produce
// nothing here — the link only fires when YOU declared a belief changed.

// A Signal: entry runs until the NEXT Signal: line — not until the next newline.
// FIXED 2026-08-08: both readers below used /^Signal:\s*(.+)$/gim, and `.` does not
// match a newline, so every note was cut wherever the author's editor happened to
// wrap. Measured at ~3/4 of authored signal text destroyed before reaching the bus.
// Worse than data loss: a correction is written setup-first (what was believed, THEN
// what is true instead), so a cut at the first wrap systematically PRESERVES THE
// ERROR AND DELETES ITS CORRECTION. Found by the first autonomous gardening run of
// the `claude` seat (6digit-claude/concepts/frag-the-bus-keeps-the-error-and-drops-the-correction.md).
const signalEntries = (body) =>
  body.split(/^Signal:[ \t]*/im).slice(1)
    .map((chunk) => chunk.split(/^#/m)[0].replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const git = (a) => execFileSync("git", a, { encoding: "utf8" }).trim();

// Routing is registry-driven, NOT a hardcoded list: a signal reaches the corpus
// iff its interface file declares `membrane: true`. The interface decides what is
// a belief worth recording — never a value-judgment baked into this hook.
function isMembrane(name) {
  try { return /^membrane:\s*true\b/im.test(fs.readFileSync(`signals/${name}.signal`, "utf8")); }
  catch { return false; }
}

function sectionBody(text, name) {
  let cur = null, buf = [];
  for (const line of text.split("\n")) {
    const h = line.match(/^##\s+(.*\S)\s*$/);
    if (h) { if (cur === name) break; cur = h[1].toLowerCase(); continue; }
    if (cur === name) buf.push(line);
  }
  return cur === null && !buf.length ? "" : buf.join("\n");
}

const msg = git(["log", "-1", "--format=%B"]);
const sha = git(["rev-parse", "--short", "HEAD"]);

// --- Surface pass: every Signal: line the gate sealed into this commit — measured
// AND inferred — slides onto the Cordial signals surface (:6285) as a live card. This
// is the git-log → live-bus bridge: what the commit body carries becomes something you
// WATCH arrive. Best-effort and non-blocking — the surface may be down; a commit never
// waits on it. Mesh-wide by construction: any repo posts to the one central surface.
function surfaceSignals() {
  const url = `http://localhost:${process.env.CORDIAL_SIGNALS_PORT || 6285}/signal`;
  const repo = path.basename(git(["rev-parse", "--show-toplevel"]));
  const sigMeta = (name) => {
    try {
      const f = fs.readFileSync(`signals/${name}.signal`, "utf8");
      const g = (k) => (f.match(new RegExp("^" + k + ":\\s*(\\S+)", "im")) || [])[1];
      return { kind: g("kind"), face: g("face") };
    } catch { return {}; }
  };
  const lines = signalEntries(sectionBody(msg, "world model"));
  for (const line of lines) {
    const name = (line.match(/^(\S+)/) || [])[1];
    if (!name) continue;
    const meta = sigMeta(name);
    const vm = line.match(/value=(\S+)/);
    const value = vm ? (Number.isFinite(Number(vm[1])) ? Number(vm[1]) : vm[1]) : undefined;
    const note = line.replace(/^\S+\s*/, "").replace(/value=\S+/, "").replace(/\b(measured|stall)\b/g, "").replace(/^[—\-\s]+/, "").trim();
    const body = { name, kind: meta.kind || (/\bmeasured\b/.test(line) ? "measured" : "inferred"), value, face: meta.face, note: note || undefined, source: repo };
    try {
      execFileSync("curl", ["-s", "-m", "2", "-X", "POST", "-H", "content-type: application/json", "-d", JSON.stringify(body), url], { stdio: "ignore" });
    } catch { /* surface down — never block a commit */ }
  }
}
surfaceSignals();

// A recording (a commit that writes concept files) is a belief LANDING in the
// corpus, not a source belief needing routing. Skip it — this is what lets the
// faucet be installed uniformly everywhere (even on a self-contained repo that is
// its own corpus) without the recording re-queuing itself into an endless loop.
const touched = git(["show", "--name-only", "--format=", "HEAD"]).split("\n").filter(Boolean);
if (touched.some((f) => /(^|\/)concepts\/[^/]+\.md$/.test(f))) process.exit(0);

const wm = sectionBody(msg, "world model");
const signals = signalEntries(wm)
  .map((entry) => ({ type: ((entry.match(/^(\S+)/) || [])[1] || "").toLowerCase(), line: entry }))
  .filter((s) => isMembrane(s.type));
if (!signals.length) process.exit(0); // routine commit — nothing to route

const top = git(["rev-parse", "--show-toplevel"]);
const ptr = path.join(top, ".membrane");
if (!fs.existsSync(ptr)) {
  console.error("\n● belief signal fired, but this repo has no .membrane store pointer.");
  console.error("  wire it once:  koru-membrane/hooks/install.sh " + top + " /path/to/koru-membrane\n");
  process.exit(0);
}
const store = fs.readFileSync(ptr, "utf8").trim();
const repo = path.basename(top);
const inbox = path.join(store, "inbox");
fs.mkdirSync(inbox, { recursive: true });
const pendingFile = path.join(inbox, "pending.jsonl");

for (const s of signals) {
  const rec = { ts: new Date().toISOString(), repo, sha, subject: msg.split("\n")[0], type: s.type, signal: s.line };
  fs.appendFileSync(pendingFile, JSON.stringify(rec) + "\n");
}
const n = fs.readFileSync(pendingFile, "utf8").trim().split("\n").filter(Boolean).length;

console.error(`\n● belief signal fired — a Koru belief changed and must reach the corpus.`);
console.error(`    repo:   ${repo} @ ${sha}`);
for (const s of signals) console.error(`    signal: ${s.line}`);
console.error(`    queued → ${pendingFile}  (${n} pending)`);
console.error(`  An agent drains the inbox into the corpus. You never run anything.\n`);
