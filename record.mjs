#!/usr/bin/env node
// membrane — recorder. An AGENT runs this to CLOSE THE LOOP: turn a queued belief
// into an OKF concept committed THROUGH the gate (the sectioned format), then drain
// the pending entry. A human never runs this; a working or scheduled agent does.
//
//   node record.mjs <store> <key> <create|evolve> "<signal line>" [occludesBlob] [--sha <shortsha>]
//   ...with the belief text (the new concept body) on stdin.
//
// The JUDGMENT — which concept, create vs evolve, what the belief now says — is the
// agent's (membrane doctrine: YOU are the evolver). This only writes the file and
// commits it in the gate-passing shape, so the corpus's own commit-msg hook
// validates lineage exactly as it would for any hand-authored evolution.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
let drainSha = null;
const shaIdx = argv.indexOf("--sha");
if (shaIdx >= 0) { drainSha = argv[shaIdx + 1]; argv.splice(shaIdx, 2); }
const [store, key, action, signal, occludes] = argv;
if (!store || !key || !action || !signal) {
  console.error('usage: record.mjs <store> <key> <create|evolve> "<signal>" [occludesBlob] [--sha <sha>]  (body on stdin)');
  process.exit(1);
}
const body = fs.readFileSync(0, "utf8").trim();
if (!body) { console.error("record: empty belief body on stdin"); process.exit(1); }

const git = (a) => execFileSync("git", ["-C", store, ...a], { encoding: "utf8" }).trim();
const rel = `concepts/${key}.md`;
const ts = new Date().toISOString();
fs.writeFileSync(path.join(store, rel),
  `---\ntype: belief\nkey: ${key}\nprovenance: faucet\nts: ${ts}\n---\n\n${body}\n`);
git(["add", rel]);

const lines = [`${action}(${key}): ${signal}`, "", "## Membrane", `Action: ${action}`, `Concept: ${key}`];
if (action === "evolve") {
  if (!occludes) { console.error("record: evolve needs the prior blob sha (occludesBlob arg)"); process.exit(1); }
  lines.push(`Occludes: ${occludes}`);
}
lines.push("", "## World Model", `Signal: ${signal}`);
const msgFile = path.join(store, ".git", `RECORD_MSG_${process.pid}`);
fs.writeFileSync(msgFile, lines.join("\n") + "\n");
try {
  git(["commit", "-q", "-F", msgFile]);   // goes THROUGH the corpus's commit-msg gate
} finally {
  fs.rmSync(msgFile, { force: true });
}
const short = git(["rev-parse", "--short", "HEAD"]);
console.error(`recorded ${action} ${key} → corpus ${short}  (passed the gate)`);

// drain the pending entry for this source commit
if (drainSha) {
  const pf = path.join(store, "inbox", "pending.jsonl");
  if (fs.existsSync(pf)) {
    const kept = fs.readFileSync(pf, "utf8").split("\n").filter(Boolean)
      .filter((l) => { try { return JSON.parse(l).sha !== drainSha; } catch { return true; } });
    fs.writeFileSync(pf, kept.length ? kept.join("\n") + "\n" : "");
    console.error(`drained pending ${drainSha}  (${kept.length} left)`);
  }
}
