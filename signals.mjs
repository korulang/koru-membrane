#!/usr/bin/env node
// signals — the signal-catalog tool: consistency-check and list a repo's signal
// interface. This is the static checker that makes the catalog a real interface
// (a `tsc --noEmit` for signals) and the lister an agent reads to see what's
// declarable and recently active.
//
//   node signals.mjs check [dir]   validate every .signal against the schema
//   node signals.mjs ls    [dir]   list the interface + recent log activity
//
// (Home note: this should graduate into a `wm signals` verb — wm is the
// world-model surface and signals are first-class world-model concepts. Built
// standalone first to prove the capability; promote like mz did.)

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// --- THE CANONICAL SHAPE. One source of truth for what a signal IS. ---
const SCHEMA = {
  name:     { enum: null,                    desc: "stable id; must equal the filename" },
  kind:     { enum: ["measured", "inferred"], desc: "algorithmic faucet vs an agent's judgment" },
  shape:    { enum: ["scalar", "categorical"], desc: "a number vs a category" },
  face:     { enum: ["in", "out"],            desc: "collected (input) vs produced by a model (output)" },
  membrane: { enum: ["true", "false"],        desc: "occurrences become OKF belief concepts" },
  note:     { enum: null,                     desc: "one human line: what this signal means" },
};
const FIELDS = Object.keys(SCHEMA);

const [cmd, dirArg] = process.argv.slice(2);
const dir = dirArg || "signals";

function parse(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([a-z]+):\s*(.+?)\s*$/i);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

function load() {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".signal"))
    .map((f) => ({ file: path.join(dir, f), base: f.replace(/\.signal$/, ""), fields: parse(path.join(dir, f)) }));
}

function check() {
  const sigs = load();
  const issues = [];
  const seen = new Map();
  for (const s of sigs) {
    for (const k of FIELDS) {
      const v = s.fields[k];
      if (v == null) { issues.push(`${s.file}: missing required field '${k}'`); continue; }
      if (SCHEMA[k].enum && !SCHEMA[k].enum.includes(v))
        issues.push(`${s.file}: ${k}='${v}' not in {${SCHEMA[k].enum.join("|")}}`);
    }
    if (s.fields.name && s.fields.name !== s.base)
      issues.push(`${s.file}: name='${s.fields.name}' must equal filename '${s.base}'`);
    if (s.fields.name) {
      if (seen.has(s.fields.name)) issues.push(`${s.file}: duplicate signal name '${s.fields.name}' (also ${seen.get(s.fields.name)})`);
      else seen.set(s.fields.name, s.file);
    }
  }
  if (!sigs.length) { console.log(`signals: no '${dir}/' interface here`); process.exit(0); }
  if (issues.length) {
    console.error(`✗ ${sigs.length} signals, ${issues.length} consistency issue(s):`);
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log(`✓ ${sigs.length} signals — interface is consistent (${dir}/)`);
}

function ls() {
  const sigs = load();
  if (!sigs.length) { console.log(`signals: no '${dir}/' interface here`); return; }
  let log = "";
  try { log = execFileSync("git", ["log", "--pretty=%b"], { encoding: "utf8" }); } catch {}
  // The signal BUS: an append-only log of runtime firings. The inferred voice fires
  // BETWEEN commits (a watcher wakes, a judgment lands), so it can't ride the git log.
  // FIRED unions both planes — commit-sealed signals from the log + runtime firings
  // from the bus — into ONE catalog view. This is the local bus before the Convex plane.
  const busTally = {};
  const busFile = path.join(dir, "bus.jsonl");
  if (fs.existsSync(busFile)) {
    for (const line of fs.readFileSync(busFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); if (e.name) busTally[e.name] = (busTally[e.name] || 0) + 1; } catch {}
    }
  }
  const count = (name) =>
    (log.match(new RegExp("^Signal:\\s*" + name + "\\b", "gim")) || []).length + (busTally[name] || 0);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad("SIGNAL", 18)} ${pad("KIND", 9)} ${pad("SHAPE", 12)} ${pad("FACE", 5)} ${pad("MEMBRANE", 9)} FIRED`);
  for (const s of sigs.sort((a, b) => a.base.localeCompare(b.base))) {
    const f = s.fields;
    console.log(`${pad(s.base, 18)} ${pad(f.kind || "?", 9)} ${pad(f.shape || "?", 12)} ${pad(f.face || "?", 5)} ${pad(f.membrane || "?", 9)} ${count(s.base)}`);
  }
}

// emit — append a firing to the signal bus. BOTH voices use this: the measured hook
// and the inferred runtime watchers. One JSON object per line; ls() unions it with the
// git log. This is the write side of the local bus (the Convex plane slots in later).
function emit(args) {
  const name = args[0], kind = args[1] || "inferred";
  if (!name) { console.error("usage: signals.mjs emit <name> <kind> [--value N] [--note ...] [--source S] [--dir signals]"); process.exit(2); }
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const d = opt("--dir", "signals");
  fs.mkdirSync(d, { recursive: true });
  const rawVal = opt("--value", null);
  const rec = {
    ts: new Date().toISOString(),
    name, kind,
    value: rawVal != null ? Number(rawVal) : null,
    note: opt("--note", null),
    source: opt("--source", "unknown"),
  };
  fs.appendFileSync(path.join(d, "bus.jsonl"), JSON.stringify(rec) + "\n");
  console.log(`emit ${name} (${kind})${rec.value != null ? " value=" + rec.value : ""} → ${path.join(d, "bus.jsonl")}`);
}

if (cmd === "check") check();
else if (cmd === "ls") ls();
else if (cmd === "emit") emit(process.argv.slice(3));
else { console.error("usage: signals.mjs check [dir] | ls [dir] | emit <name> <kind> [--value N] [--note ...] [--source S] [--dir signals]"); process.exit(2); }
