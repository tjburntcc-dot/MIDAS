/**
 * Which experiment tools would refuse to spend, and which still would not?
 *
 * Nothing is mass-refactored here. The point is to know the surface, so the next
 * high-stakes experiment migrates and the rest are migrated when they are next
 * touched rather than in a sweep nobody asked for.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { defectSummary } from "../packages/eval/src/experiment-defects.ts";

const rows = [];
for (const f of readdirSync(repoPath("tools"))) {
  if (!f.endsWith(".mjs")) continue;
  const src = readFileSync(repoPath("tools", f), "utf8");
  const spends = /\.complete\(\{/.test(src);
  if (!spends) continue;
  rows.push({
    tool: "tools/" + f,
    usesPreflight: /withPreflight|preflight\(/.test(src),
    usesBudgetGuard: /planCalls|budgetGuard|perArmReserve|RESERVE/.test(src),
    capturesRawTrace: /raw|transcript|log\.push/.test(src),
    declaresCriteriaBeforeRun: /frozen before|declared before|preregist|CRITERIA|INTERPRETATION/i.test(src),
  });
}

const migrated = rows.filter((r) => r.usesPreflight);
const guarded = rows.filter((r) => r.usesBudgetGuard);
console.log("EXPERIMENT TOOLS THAT SPEND MODEL CALLS: " + rows.length);
for (const r of rows) {
  console.log("   " + (r.usesPreflight ? "preflight " : "legacy    ")
    + (r.usesBudgetGuard ? "budget " : "       ")
    + (r.capturesRawTrace ? "trace " : "      ")
    + (r.declaresCriteriaBeforeRun ? "criteria " : "         ")
    + r.tool);
}
console.log("");
console.log("   on preflight: " + migrated.length + " | with a budget guard: " + guarded.length
  + " | declaring criteria before running: " + rows.filter((r) => r.declaresCriteriaBeforeRun).length);
console.log("   legacy paths remaining: " + (rows.length - migrated.length));
console.log("   Not mass-refactored on purpose. The next high-stakes experiment migrates; the rest follow when touched.");
console.log("");
console.log("   defect inventory: " + JSON.stringify(defectSummary().byCategory));

writeFileSync(repoPath("var", "state", "preflight-coverage.json"), JSON.stringify({
  at: new Date().toISOString(), modelCalls: 0, tools: rows,
  onPreflight: migrated.length, withBudgetGuard: guarded.length, legacyRemaining: rows.length - migrated.length,
}, null, 1));
