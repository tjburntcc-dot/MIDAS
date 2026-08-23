#!/usr/bin/env node
/**
 * Restore a private MIDAS state export produced by export-state.mjs.
 * Verifies every file's SHA-256 before writing. Refuses to clobber unless --force.
 *
 *   node tools/state/import-state.mjs <exportFile> [--force] [--dry-run]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = process.cwd();
const file = process.argv[2];
const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");

if (!file) { console.error("usage: node tools/state/import-state.mjs <exportFile> [--force] [--dry-run]"); process.exit(1); }

const payload = JSON.parse(readFileSync(file, "utf8"));
if (!payload.manifest || payload.manifest.kind !== "midas-private-state") {
  console.error("That file is not a MIDAS private state export."); process.exit(1);
}
console.log(`export from ${payload.manifest.exportedAt}: ${payload.manifest.fileCount} files`);

let corrupt = 0, wouldOverwrite = 0;
for (const f of payload.files) {
  const buf = Buffer.from(f.base64, "base64");
  if (createHash("sha256").update(buf).digest("hex") !== f.sha256) { console.error(`  CORRUPT: ${f.path}`); corrupt++; }
  if (existsSync(join(ROOT, f.path))) wouldOverwrite++;
}
if (corrupt) { console.error(`${corrupt} file(s) failed integrity check. Nothing was written.`); process.exit(1); }
console.log(`integrity: all ${payload.files.length} files verified`);

if (wouldOverwrite && !force && !dryRun) {
  console.error(`${wouldOverwrite} existing file(s) would be overwritten. Re-run with --force if that is what you want.`);
  process.exit(1);
}
if (dryRun) { console.log(`dry run: would write ${payload.files.length} files (${wouldOverwrite} overwrites)`); process.exit(0); }

for (const f of payload.files) {
  const dest = join(ROOT, f.path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(f.base64, "base64"));
}
console.log(`restored ${payload.files.length} files into ${ROOT}`);
