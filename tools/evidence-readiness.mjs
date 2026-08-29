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
import { MANAGER_SINGLE_SHOT_ENVIRONMENT } from "../packages/eval/src/manager-target-truth.ts";
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
      blocked: true,
      detail: "The desk campaign ran clean and failed clean. Two critical gates breached, both by one case: it condemned correct work as an authority violation, so correctOutputPassRate is 0.75 against 1.0 and falseAccusationCount is 1 against 0. Detection 0.833, verdict accuracy 0.833, material reads 0.833 all cleared. The blocker is false-positive control, not detection.",
    },
    configurationStable: {
      stable: true,
      detail: "Settled. CT-677749cd2035 at EE-ab6da07f1924: au-v1, gpt-4.1, auditor-doctrine-v1, one tool, frozen before any case ran. The three earlier targets are recorded as what they were and none is live.",
    },
    examinationsTrustworthy: {
      trustworthy: true,
      detail: "Eighteen fresh cases, every reference answer independently reviewed blind before execution and returned 18/18 REFERENCE_CORRECT. The campaign ran with zero gold drift, zero scorer drift, zero tool failures and zero truncated runs, and is now spent: it cannot be re-run as certification evidence for the same target.",
    },
  },
  {
    role: "manager",
    // Single-shot decision cases, and its own action schema, so its environment
    // is named rather than borrowed from the Auditor's.
    actual: { tools: NO_TOOLING.tools, policyVersionId: "manager-doctrine-v1" }, environment: MANAGER_SINGLE_SHOT_ENVIRONMENT,
    currentTier: "TRAINING",
    capabilityBlocker: {
      blocked: true,
      /**
       * ABSOLUTE FITNESS: NOT_ESTABLISHED.
       * CLEAN CAPABILITY BLOCKER: none.
       * DEVELOPMENT CONCERN: diminishing returns / under-commitment.
       *
       * The campaign that produced the numbers was voided by its own post-run
       * audit, so nothing from it is a certified blocker. Re-scored under the
       * repaired substrate, action correctness moves 0.50 to 0.75 and one of the
       * two invented-economics flags disappears. What survives is three cases
       * where it named the constraint and chose a lower-commitment answer, which
       * is the same shape as the H-4 leverage observation and is carried at the
       * same weight: a development concern, not evidence.
       */
      detail: "CLEAN CAPABILITY BLOCKER, established. On a clean campaign against fully confirmed gold it breached two zero-tolerance gates: it chose a declared wrong near-neighbour on two cases and used two figures the evidence does not support. Every action failure was the same shape -- a lower-commitment answer where the case called for acting: MF-01 ran a test with 29 of 36 bookings refused, MF-11 ran a test after fourteen profitable jobs, MF-07 researched an offer that needed the owner in ten days. Under-commitment is no longer a development concern; it reproduced cleanly.",
    },
    configurationStable: {
      stable: false,
      detail: "Settled as a question and answered: CT-767e9f1e6f89 is the only MIDAS Manager that exists and it is not absolutely fit as configured. No lock. Repairing it is a worker change and would create a new configuration.",
    },
    examinationsTrustworthy: {
      trustworthy: true,
      detail: "The 12-case fitness set is sound: 84/84 gated gold field verdicts confirmed by a blinded reviewer that was shown the scorer semantics, quantity completeness machine-enforced, structural audit clean. It is now spent as fitness evidence for this target.",
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
