/**
 * Run the capability-needs analysis for Company 0 and for two unrelated
 * companies.
 *
 * The two fixtures are not businesses we are building. They exist to falsify the
 * analysis: if a scheduling SaaS and a mobile bicycle repair outfit come back
 * needing the same capabilities as a digital services agency, the abstraction is
 * a Hemmer template wearing a general name.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/company-assess.mjs
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { assessCompany } from "../packages/eval/src/capability-needs.ts";
import { listWorkItems, expectedValueScore } from "../packages/eval/src/work-item.ts";

const store = new FileStore(stateDir());

/**
 * Which workers exist, and what they actually cover.
 *
 * Honest registry: only promoted workers count as covering a capability.
 * Atlas belongs to a different company and qualifies prospects, not inbound
 * opportunities. The Offer Strategist reached development_verified and never a
 * sealed promotion, so it is recorded as partial coverage rather than coverage.
 */
const WORKERS = {
  "ws-hemmer": [
    { roleId: "opportunity_qualifier", versionId: "oq-v2", capabilities: ["cap.qualification"], productionStatus: "production_eligible" },
    { roleId: "offer_strategist", versionId: "offer_strategist-ws-ridgeline-v0", capabilities: ["cap.commercial"], productionStatus: "development_verified" },
  ],
  "ws-fixture-saas": [],
  "ws-fixture-local": [],
};

const COMPANIES = [
  { id: "ws-hemmer", businessModel: "services" },
  { id: "ws-fixture-saas", businessModel: "saas" },
  { id: "ws-fixture-local", businessModel: "local_physical_service" },
];

const reports = [];
for (const c of COMPANIES) {
  const ws = store.getWorkspace(c.id);
  if (!ws) { console.error("missing workspace " + c.id); continue; }
  const items = listWorkItems(store, c.id);
  const report = assessCompany({
    workspace: ws, businessModel: c.businessModel, objective: ws.goal,
    workItems: items, workers: WORKERS[c.id] || [], evScore: expectedValueScore,
  });
  reports.push(report);
}

// ------------------------------------------------------- generality check
const sets = reports.map((r) => new Set(r.capabilities.map((x) => x.capabilityId)));
function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}
const overlaps = [];
for (let i = 0; i < sets.length; i += 1) {
  for (let j = i + 1; j < sets.length; j += 1) {
    overlaps.push({ a: reports[i].company, b: reports[j].company, jaccard: Number(jaccard(sets[i], sets[j]).toFixed(3)) });
  }
}
const maxOverlap = Math.max(...overlaps.map((o) => o.jaccard));

const out = {
  at: new Date().toISOString(),
  reports,
  generality: {
    overlaps, maxJaccard: maxOverlap,
    passes: maxOverlap < 0.34,
    note: "Required capability sets across three unrelated business models. High overlap would mean the analysis emits one template regardless of company.",
  },
};
writeFileSync(join(stateDir(), "company-assessment.json"), JSON.stringify(out, null, 2) + "\n", "utf8");

for (const r of reports) {
  console.log("\n=== " + r.company + "  [" + r.businessModel + "] ===");
  console.log("  objective:", r.objective);
  console.log("  value chain:", r.valueChain.join(" -> "));
  console.log("  work items:", r.workItemsConsidered);
  console.log("  covered :", r.covered.join(", ") || "none");
  console.log("  partial :", r.partial.join(", ") || "none");
  console.log("  missing :", r.missing.join(", ") || "none");
  if (r.bottleneck) {
    console.log("  BOTTLENECK: " + r.bottleneck.capabilityId + " -- " + r.bottleneck.title);
    console.log("    blocking " + r.bottleneck.blockedItems + " items, expected cash blocked $" + r.bottleneck.blockedExpectedCashUsd);
    console.log("    if absent: " + r.bottleneck.ifAbsent);
    console.log("    cheaper alternatives to rule out first: " + JSON.stringify(r.bottleneck.alternatives));
  } else {
    console.log("  BOTTLENECK: none active -- no work is currently blocked on a missing capability");
  }
  const latent = r.latentGaps.length ? r.latentGaps.join(", ") : "none";
  console.log("  latent gaps (real, not blocking today):", latent);
}
console.log("\n=== GENERALITY ===");
for (const o of overlaps) console.log("  " + o.a + "  vs  " + o.b + "   jaccard " + o.jaccard);
console.log("  max overlap " + maxOverlap + " -> " + (out.generality.passes ? "PASS, the analysis is company-shaped" : "FAIL, it emits a template"));
