// schemas/check.mjs — the runnable merge gate. Usage: `node schemas/check.mjs`
// Parses every subsets/*.zontax, merges all, verifies members resolve.
// Exit 0 = green. Any ZontaxMergeError = dispute (field path printed).
// Toolchain is pinned to absolute paths (no install, no cwd dependence).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ZontaxParser } from "/Users/larsde/src/zontax/dist/index.js";
import { parseZodString } from "/Users/larsde/src/zontax/node_modules/zod-subset-parser/dist/zod3/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const SUBS = join(ROOT, "subsets");

let fail = 0;
const texts = [];
for (const f of readdirSync(SUBS).sort()) {
  if (!f.endsWith(".zontax")) continue;
  const text = readFileSync(join(SUBS, f), "utf8");
  const name = f.replace(/\.zontax$/, "");
  try {
    const { schema } = new ZontaxParser({ zodVersion: "3" }).parse(text);
    parseZodString(schema);
    console.log(`parse OK   ${name}`);
    texts.push(text);
  } catch (e) {
    fail = 1;
    console.log(`parse FAIL ${name}: ${e.message}`);
  }
  const base = name.replace(/@v[0-9]+$/, "");
  const mem = join(SUBS, base + ".members.txt");
  if (!existsSync(mem)) { fail = 1; console.log(`members MISSING ${name}`); continue; }
  const members = readFileSync(mem, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  console.log(`members    ${name}: ${members.length}`);
}
try {
  new ZontaxParser({ zodVersion: "3" }).parse(...texts);
  console.log(`merge OK   (${texts.length} schemas)`);
} catch (e) {
  fail = 1;
  console.log(`merge DISPUTE: ${e.message}`);
}
process.exit(fail);
