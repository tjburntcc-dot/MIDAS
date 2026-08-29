/**
 * Which workers should actually receive an evidence campaign?
 *
 * "Limited by evidence" has been read four times as "run more evidence", and it
 * does not mean that. Evidence binds to a configuration. If the configuration is
 * about to change, or the examinations that would produce the evidence have known
 * defects, the campaign buys rows that will be discarded.
 *
 * So this asks four questions per worker and refuses to recommend a campaign
 * unless all four clear. It runs no model.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { adaptWorker, adaptedTarget, SANDBOX_TOOLING, NO_TOOLING } from "../packages/eval/src/worker-adapter.ts";
import { SINGLE_SHOT_ENVIRONMENT, AUDIT_DESK_ENVIRONMENT } from "../packages/eval/src/auditor-target-truth.ts";
import { AUDIT_DESK_TOOL_SET } from "../packages/eval/src/audit-desk.ts";
import { targetId, TIER_EVIDENCE_REQUIREMENTS, TIER_SCORE_REQUIREMENTS, TIER_FLOOR_REQUIREMENTS } from "../packages/eval/src/academy.ts";
import { scenariosForRole } from "../packages/eval/src/academy-scenarios.ts";
import { ALL_RESEARCHER_SCENARIOS } from "../packages/eval/src/researcher-scenarios.ts";
import { executionEnvironmentId, currentExecutionEnvironment } from "../packages/eval/src/execution-environment.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { AUDITOR_DOCTRINE, AUDITOR_VERSION_ID } from "../packages/eval/src/auditor.ts";
import { MANAGER_DOCTRINE, MANAGER_VERSION_ID } from "../packages/eval/src/manager.ts";

const SOURCES = {
  qualifierKnowledge: HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE), qualifierVersionId: QUALIFIER_V2_ID,
  researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3",
  auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID,
  managerKnowledge: MANAGER_DOCTRINE, managerVersionId: MANAGER_VERSION_ID,
};

const load = (f) => {
  const p = repoPath("var", "state", f);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};

const examinationsFor = (role) => [...scenariosForRole(role), ...(role === "researcher" ? ALL_RESEARCHER_SCENARIOS : [])];

/**
 * Four questions. A campaign is worth running only if all four clear.
 *
 * The third is the one that has been skipped: evidence earned against a
 * configuration that is about to be repaired is evidence that will be thrown
 * away, and the repair is usually the higher-value work anyway.
 */
const WORKERS = [
  {
    role: "researcher",
    /** What it actually had. Not a default: adaptedTarget no longer supplies one. */
    actual: SANDBOX_TOOLING, environment: currentExecutionEnvironment(),
    currentTier: "SANDBOX_COMPETENT",
    capabilityBlocker: {
      blocked: true,
      detail: "Overall 68.98 against 70 and worst case 20 against 50 for the next tier. Both fail, so evidence cannot move it.",
    },
    configurationStable: { stable: true, detail: "or-v3 is promoted and nothing about it is under repair." },
    examinationsTrustworthy: { trustworthy: true, detail: "18 examinations, suite audit clean, defects repaired before use." },
  },
  {
    role: "qualifier",
    actual: SANDBOX_TOOLING, environment: currentExecutionEnvironment(),
    currentTier: "TRAINING",
    capabilityBlocker: {
      blocked: true,
      detail: "An unresolved routing defect is frozen: the worker resolves record identity well and still routes toward a party that is not the economically relevant counterparty. 0.867 is an experimental number, not capability.",
    },
    configurationStable: {
      stable: false,
      detail: "The promoted contract is disposition-only and the identity contract that fixes it is unpromoted. Repairing the frozen defect will change the configuration, and evidence bound to today's target would be discarded.",
    },
    examinationsTrustworthy: { trustworthy: true, detail: "Two sealed examinations exist and pass audit; ten more would need writing." },
  },
  {
    role: "auditor",
    // The desk is now the Auditor's configuration: one tool, one protocol,
    // named before anything ran.
    actual: { tools: AUDIT_DESK_TOOL_SET, policyVersionId: "auditor-doctrine-v1" }, environment: AUDIT_DESK_ENVIRONMENT,
    currentTier: "TRAINING",
    capabilityBlocker: {
      blocked: false,
      detail: "No capability gate is known to block SANDBOX_COMPETENT. The one clean worker finding on the desk so far is a confounded miss on a half-delivered two-part task, from a campaign whose turn budget could not reach it.",
    },
    configurationStable: {
      stable: true,
      detail: "Settled. CT-677749cd2035 at EE-ab6da07f1924: au-v1, gpt-4.1, auditor-doctrine-v1, one tool, frozen before any case ran. The three earlier targets are recorded as what they were and none is live.",
    },
    examinationsTrustworthy: {
      trustworthy: true,
      detail: "Eighteen fresh cases, every reference answer independently reviewed blind before execution and returned 18/18 REFERENCE_CORRECT. The earlier sets are retained as development evidence and none is reused.",
    },
  },
  {
    role: "manager",
    // Single-shot decision cases. It has never used a tool either.
    actual: NO_TOOLING, environment: SINGLE_SHOT_ENVIRONMENT,
    currentTier: "TRAINING",
    capabilityBlocker: {
      blocked: false,
      detail: "Bottleneck 0.833, action 0.833, zero invented economics under the repaired scorer. No capability gate is known to block SANDBOX_COMPETENT.",
    },
    configurationStable: {
      stable: false,
      detail: "Both candidates were rejected under a scorer since found to have three defects. The rejection stands, and the configuration that would be certified has not been decided.",
    },
    examinationsTrustworthy: {
      trustworthy: true,
      detail: "The 12-case set passed a pre-spend audit and its two defects were repaired before use. But it is a single-shot decision set with no sandbox tool-use examinations, which is the evidence class actually missing.",
    },
  },
];

const rows = [];
console.log("EVIDENCE READINESS (zero model calls)");
console.log("");
for (const w of WORKERS) {
  const adapted = adaptWorker(w.role, SOURCES);
  const target = { ...adaptedTarget(adapted, "gpt-4.1", w.actual), executionEnvironmentId: executionEnvironmentId(w.environment) };
  const held = {};
  for (const s of examinationsFor(w.role)) held[s.evidenceClass] = (held[s.evidenceClass] || 0) + 1;
  const need = TIER_EVIDENCE_REQUIREMENTS.SANDBOX_COMPETENT
    .map((r) => ({ evidenceClass: r.evidenceClass, need: r.minCases, have: held[r.evidenceClass] || 0 }))
    .filter((r) => r.have < r.need);

  const evidenceBlocked = need.length > 0;
  const ready = !w.capabilityBlocker.blocked && w.configurationStable.stable && w.examinationsTrustworthy.trustworthy && evidenceBlocked;
  const verdict = ready ? "EVIDENCE_READY" : "DO_NOT_ACCUMULATE_EVIDENCE_YET";

  const reasons = [];
  if (w.capabilityBlocker.blocked) reasons.push("capability: " + w.capabilityBlocker.detail);
  if (!w.configurationStable.stable) reasons.push("configuration: " + w.configurationStable.detail);
  if (!w.examinationsTrustworthy.trustworthy) reasons.push("examinations: " + w.examinationsTrustworthy.detail);
  if (!evidenceBlocked) reasons.push("evidence: already sufficient for the next tier, so a campaign buys nothing.");

  rows.push({
    role: w.role, tier: w.currentTier, worker: adapted.versionId, target: targetId(target),
    evidenceShortfall: need, capabilityBlocked: w.capabilityBlocker.blocked,
    configurationStable: w.configurationStable.stable, examinationsTrustworthy: w.examinationsTrustworthy.trustworthy,
    verdict, reasons,
  });

  console.log("== " + w.role.toUpperCase() + "  " + adapted.versionId + "  " + w.currentTier + "  " + targetId(target));
  console.log("   evidence shortfall : " + (need.length ? need.map((r) => r.evidenceClass + " +" + (r.need - r.have)).join(", ") : "none"));
  console.log("   capability blocker : " + (w.capabilityBlocker.blocked ? "YES" : "no"));
  console.log("   configuration stable: " + (w.configurationStable.stable ? "yes" : "NO"));
  console.log("   examinations trusted: " + (w.examinationsTrustworthy.trustworthy ? "yes" : "NO"));
  console.log("   " + verdict);
  for (const r of reasons) console.log("      - " + r);
  console.log("");
}

const ready = rows.filter((r) => r.verdict === "EVIDENCE_READY");
console.log(ready.length
  ? "EVIDENCE_READY: " + ready.map((r) => r.role).join(", ")
  : "NO WORKER IS EVIDENCE READY. A campaign now would buy rows bound to a configuration that is about to change, or produced by examinations with known defects.");

writeFileSync(repoPath("var", "state", "evidence-readiness.json"), JSON.stringify({
  at: new Date().toISOString(), modelCalls: 0,
  environment: executionEnvironmentId(),
  scoreRequirements: { SANDBOX_COMPETENT: TIER_SCORE_REQUIREMENTS.SANDBOX_COMPETENT, SIMULATION_CERTIFIED: TIER_SCORE_REQUIREMENTS.SIMULATION_CERTIFIED },
  floorRequirements: { SIMULATION_CERTIFIED: TIER_FLOOR_REQUIREMENTS.SIMULATION_CERTIFIED },
  rows, evidenceReady: ready.map((r) => r.role),
}, null, 1));
console.log("");
console.log("written: var/state/evidence-readiness.json");
