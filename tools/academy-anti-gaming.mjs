/**
 * Attack the examinations with policies that contain no judgement.
 *
 * Runs entirely offline: every policy is a fixed script, so this costs nothing
 * and can run on every change. If a dumb policy scores well, the suite is
 * measuring rubric fit rather than competence, and that has to be known before
 * any certification issued from it is believed.
 */
import { writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { runScenario, scoreScenario } from "../packages/eval/src/sandbox.ts";
import { ALL_SCENARIOS } from "../packages/eval/src/academy-scenarios.ts";
import { GAMING_POLICIES, summarisePolicySweep, GAMING_CEILING } from "../packages/eval/src/anti-gaming.ts";

const roles = [...new Set(ALL_SCENARIOS.map((s) => s.role))];
const results = [];

for (const policy of GAMING_POLICIES) {
  for (const role of roles) {
    const scenarios = ALL_SCENARIOS.filter((s) => s.role === role);
    let total = 0, passed = 0, traps = 0, worst = { id: "", score: 101 };
    const perScenario = [];
    for (const s of scenarios) {
      const run = await runScenario(s, policy.build(s));
      const r = scoreScenario(s, run.log);
      total += r.score;
      if (r.passed) passed += 1;
      traps += r.trapsSprung.length;
      if (r.score < worst.score) worst = { id: s.id, score: r.score };
      perScenario.push({ id: s.id, score: r.score, passed: r.passed, traps: r.trapsSprung.map((t) => t.gateId) });
    }
    results.push({
      policyId: policy.id, role,
      meanScore: Number((total / scenarios.length).toFixed(2)),
      scenariosPassed: passed, scenarios: scenarios.length,
      trapsSprung: traps, worstFor: worst.id,
      perScenario,
    });
  }
}

const summary = summarisePolicySweep(results);

console.log("ceiling:", GAMING_CEILING, "| policies:", GAMING_POLICIES.length, "| roles:", roles.length);
console.log("");
const byPolicy = {};
for (const r of results) (byPolicy[r.policyId] = byPolicy[r.policyId] || []).push(r);
for (const [pid, rows] of Object.entries(byPolicy)) {
  const best = [...rows].sort((a, b) => b.meanScore - a.meanScore)[0];
  const flag = best.meanScore >= GAMING_CEILING ? " <-- BREACH" : "";
  console.log(" ", pid.padEnd(24), "best", String(best.meanScore).padStart(6), "on", best.role.padEnd(11),
    "| passed", best.scenariosPassed + "/" + best.scenarios, "| traps", best.trapsSprung, flag);
}
console.log("");
console.log(summary.ruling);

writeFileSync(repoPath("var", "state", "academy-anti-gaming.json"), JSON.stringify({
  at: new Date().toISOString(), ceiling: GAMING_CEILING,
  policies: GAMING_POLICIES.map((p) => ({ id: p.id, describe: p.describe, realWorldAnalogue: p.realWorldAnalogue })),
  results, summary,
}, null, 1));
