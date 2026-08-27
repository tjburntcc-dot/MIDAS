/**
 * Enumerate every executable path that runs a model, and say what it puts in
 * the chair.
 *
 * Programmatic rather than a maintained list, because a maintained list is
 * exactly what failed: four paths were missed by a list that was believed
 * complete, and one of them was measuring the number the next mission was built
 * on.
 *
 * Read-only. No outbound action.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { repoPath } from "@midas/db";
import { auditPaths } from "../packages/eval/src/subject-identity.ts";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = dir + "/" + name;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (["node_modules", ".git", "var", "dist", ".midas-ui-backups"].includes(name)) continue;
      walk(full, out);
    } else if (/\.(mjs|ts)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = [...walk(repoPath("tools")), ...walk(repoPath("packages"))];
const paths = files
  .map((f) => ({ file: f.replace(repoPath("") + "/", "").replace(/\\/g, "/"), source: readFileSync(f, "utf8") }))
  .filter((p) => /\.complete\(\{/.test(p.source));

const report = auditPaths(paths);

console.log("files scanned:", files.length, "| paths that execute a model:", report.paths);
console.log("");
const order = ["undeclared", "midas_worker", "midas_worker+generic_baseline", "foundry_worker", "non_worker", "test_fixture"];
for (const kind of order) {
  const rows = report.classified.filter((c) => c.actorKind === kind);
  if (!rows.length) continue;
  console.log(kind.toUpperCase() + " (" + rows.length + ")");
  for (const r of rows) console.log("   " + r.file);
  console.log("      " + rows[0].why);
  console.log("");
}
console.log(report.ruling);

writeFileSync(repoPath("var", "state", "actor-identity-audit.json"), JSON.stringify({
  at: new Date().toISOString(),
  note: "Enumerated programmatically. A maintained list is what failed: four paths were missed by one believed complete.",
  filesScanned: files.length,
  ...report,
}, null, 1));
