#!/usr/bin/env node
/**
 * Export the private MIDAS FILE_STORE (var/state + var/artifacts) to a single
 * archive with a manifest and per-file SHA-256 integrity checks.
 *
 * This data is deliberately NOT in git. Move it between machines with this tool.
 *
 *   node tools/state/export-state.mjs [outputPath]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = process.cwd();
const SOURCES = ["var/state", "var/artifacts"];
const SECRET_NAME = /(^\.env)|secret|credential|\.pem$|\.key$/i;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const outPath = process.argv[2] || join(ROOT, `midas-state-${stamp}.json`);

const files = [];
const skipped = [];
for (const src of SOURCES) {
  for (const p of walk(join(ROOT, src))) {
    const rel = relative(ROOT, p).split("\\").join("/");
    if (SECRET_NAME.test(rel.split("/").pop())) { skipped.push(rel); continue; }
    const buf = readFileSync(p);
    files.push({ path: rel, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), base64: buf.toString("base64") });
  }
}

const manifest = {
  kind: "midas-private-state",
  version: 1,
  exportedAt: new Date().toISOString(),
  fileCount: files.length,
  totalBytes: files.reduce((s, f) => s + f.bytes, 0),
  skippedSecretLike: skipped,
  contains: "Companies, employees, approvals, knowledge, training, foundry records, spend ledger, generated artifacts.",
  excludes: "No .env, no API keys, no application source code.",
  restoreWith: "node tools/state/import-state.mjs <thisFile>",
  warning: "Private owner data. Do not commit to git and do not share publicly.",
};
writeFileSync(outPath, JSON.stringify({ manifest, files }, null, 2));
console.log(`exported ${files.length} files (${(manifest.totalBytes / 1024 / 1024).toFixed(1)} MB) -> ${outPath}`);
if (skipped.length) console.log(`skipped as secret-like: ${skipped.join(", ")}`);
