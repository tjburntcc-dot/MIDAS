/**
 * What exactly is missing, before anything is spent.
 *
 * Four missions have now ended with a worker "limited by evidence" and nobody
 * has ever printed which evidence, how much of it, or whether a score problem is
 * hiding underneath. This answers that mechanically from the live registry and
 * the live tier table. It runs no model.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/evidence-deficit.mjs [role...]
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { ALL_SCENARIOS, scenariosForRole } from "../packages/eval/src/academy-scenarios.ts";
import { TIERS, TIER_EVIDENCE_REQUIREMENTS, dimensionsFor, gatesFor, tierRank, targetId } from "../packages/eval/src/academy.ts";
import { adaptWorker, adaptedTarget } from "../packages/eval/src/worker-adapter.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { AUDITOR_DOCTRINE, AUDITOR_VERSION_ID } from "../packages/eval/src/auditor.ts";
import { certificationEligible } from "../packages/eval/src/subject-identity.ts";

const SOURCES = {
  qualifierKnowledge: HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE),
  qualifierVersionId: QUALIFIER_V2_ID,
  researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE,
  researcherVersionId: "or-v3",
  auditorKnowledge: AUDITOR_DOCTRINE,
  auditorVersionId: AUDITOR_VERSION_ID,
};

const model = process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const roles = process.argv.length > 2 ? process.argv.slice(2) : ["researcher", "qualifier", "auditor", "sales", "manager", "technical"];

/** Evidence that exists as executable examinations, counted from the registry rather than from a report. */
function availableEvidence(role) {
  const held = {};
  for (const s of scenariosForRole(role)) held[s.evidenceClass] = (held[s.evidenceClass] || 0) + 1;
  return held;
}

function deficitFor(role, held) {
  const out = {};
  for (const tier of TIERS) {
    const reqs = TIER_EVIDENCE_REQUIREMENTS[tier] || [];
    if (!reqs.length) continue;
    const missing = reqs
      .map((r) => ({ evidenceClass: r.evidenceClass, need: r.minCases, have: held[r.evidenceClass] || 0 }))
      .filter((r) => r.have < r.need)
      .map((r) => ({ ...r, short: r.need - r.have }));
    out[tier] = missing;
  }
  return out;
}

const report = { at: new Date().toISOString(), model, roles: [] };

for (const role of roles) {
  const adapted = adaptWorker(role, SOURCES);
  const held = availableEvidence(role);
  const deficit = deficitFor(role, held);
  const firstReachable = Object.entries(deficit).find(([, missing]) => missing.length === 0);
  const target = adapted.midasWorker ? adaptedTarget(adapted, model) : null;

  const subject = {
    actorKind: adapted.midasWorker ? "midas_worker" : "generic_baseline",
    workerId: adapted.midasWorker ? role : null,
    workerVersion: adapted.versionId, model,
    knowledgeVersion: adapted.midasWorker ? adapted.knowledgeIds.join(",") + "#" + createHash("sha256").update(adapted.knowledgeBlock).digest("hex").slice(0, 12) : null,
    policyVersion: adapted.midasWorker ? role + "-sandbox-v1" : null,
    tools: [...new Set(scenariosForRole(role).flatMap((s) => s.world?.tools || []))],
    retrievalConfig: "sandbox objects", protocolVersion: "sandbox-protocol-v1",
    evaluationVersion: "academy-scenarios-v1",
  };

  const row = {
    role, midasWorker: adapted.midasWorker, versionId: adapted.versionId,
    absenceReason: adapted.absenceReason || null,
    certificationEligible: certificationEligible(subject),
    targetId: target ? targetId(target) : null,
    dimensions: dimensionsFor(role).length,
    criticalGates: gatesFor(role).length,
    evidenceHeld: held,
    totalExaminations: scenariosForRole(role).length,
    deficit,
    highestTierWithEvidence: firstReachable ? firstReachable[0] : "TRAINING",
  };
  report.roles.push(row);

  console.log("== " + role.toUpperCase() + (adapted.midasWorker ? "  (MIDAS worker " + adapted.versionId + ")" : "  (NO MIDAS WORKER)"));
  if (!adapted.midasWorker) { console.log("   " + adapted.absenceReason); continue; }
  console.log("   target: " + row.targetId + " | dimensions " + row.dimensions + " | critical gates " + row.criticalGates);
  console.log("   examinations that exist: " + row.totalExaminations + " " + JSON.stringify(held));
  for (const [tier, missing] of Object.entries(deficit)) {
    if (tierRank(tier) > tierRank("SHADOW_ELIGIBLE")) continue;
    console.log("   " + tier.padEnd(22) + (missing.length
      ? "SHORT " + missing.map((m) => m.evidenceClass + " +" + m.short + " (" + m.have + "/" + m.need + ")").join(", ")
      : "evidence sufficient"));
  }
  console.log("   evidence ceiling: " + row.highestTierWithEvidence);
}

const path = repoPath("var", "state", "evidence-deficit.json");
console.log("");
console.log("Note: this counts examinations that EXIST and could produce evidence.");
console.log("A tier is not earned until those examinations are actually run and passed.");
writeFileSync(path, JSON.stringify(report, null, 1));
console.log("written: " + path);
