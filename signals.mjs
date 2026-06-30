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
  const count = (name) => (log.match(new RegExp("^Signal:\\s*" + name + "\\b", "gim")) || []).length;
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad("SIGNAL", 18)} ${pad("KIND", 9)} ${pad("SHAPE", 12)} ${pad("FACE", 5)} ${pad("MEMBRANE", 9)} FIRED`);
  for (const s of sigs.sort((a, b) => a.base.localeCompare(b.base))) {
    const f = s.fields;
    console.log(`${pad(s.base, 18)} ${pad(f.kind || "?", 9)} ${pad(f.shape || "?", 12)} ${pad(f.face || "?", 5)} ${pad(f.membrane || "?", 9)} ${count(s.base)}`);
  }
}

if (cmd === "check") check();
else if (cmd === "ls") ls();
else { console.error("usage: signals.mjs check [dir] | ls [dir]"); process.exit(2); }
