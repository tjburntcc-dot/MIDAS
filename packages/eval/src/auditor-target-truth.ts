/**
 * What the Auditor lock experiment actually tested, and what it recorded.
 *
 * The certification target is the sentence "this award describes THIS system".
 * For CT-60ca32fb0995 that sentence was false in two places at once:
 *
 *   tools: ["sandbox"]                 -- the candidate had no tools at all
 *   executionEnvironmentId: EE-8880... -- the workstation environment, which
 *                                         the candidate never entered
 *
 * Neither was a lie anyone told. adaptedTarget hardcoded the tool list, and the
 * runner stamped the current environment without asking whether the run had used
 * it. Both defaults were true of the Researcher, which is the worker they were
 * written for, and neither was checked when the Auditor reused them.
 *
 * The historical record is not rewritten. CT-60ca32fb0995 stays exactly as it
 * was written, and is recorded here as malformed. The corrected target is a new
 * id describing the configuration that genuinely produced the evidence.
 */
import { createHash } from "node:crypto";
import { targetId, recertificationScope } from "./academy.ts";
import type { CertificationTarget } from "./academy.ts";
import { adaptWorker, adaptedTarget, NO_TOOLING } from "./worker-adapter.ts";
import { executionEnvironmentId, evidencePortability, ACTION_SCHEMA_CONTRACT } from "./execution-environment.ts";
import type { ExecutionEnvironment } from "./execution-environment.ts";
import { AUDITOR_DOCTRINE, AUDITOR_VERSION_ID } from "./auditor.ts";

const SOURCES = { auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID };
const MODEL = "gpt-4.1";

/**
 * A worker handed a dossier and asked for one answer.
 *
 * There is no protocol, because nothing tells it how to act over turns. There is
 * no inventory contract, because there is nothing to inventory. Naming these
 * "none" rather than borrowing the workstation values is the whole repair: an
 * environment a worker was never in must not appear in its fingerprint.
 */
export const SINGLE_SHOT_ENVIRONMENT: ExecutionEnvironment = {
  protocolVersion: "none-single-shot",
  inventoryContractVersion: "none-dossier-supplied-inline",
  actionSchemaVersion: "none-structured-verdict",
};

/** The read-only evidence store the Auditor needs, and nothing beyond it. */
export const AUDITOR_READONLY_ENVIRONMENT: ExecutionEnvironment = {
  protocolVersion: "auditor-readonly-v1",
  inventoryContractVersion: "evidence-store-v1-labelled-ids",
  actionSchemaVersion: ACTION_SCHEMA_CONTRACT,
};

export const AUDITOR_READONLY_TOOLS = ["list_evidence", "read_evidence"];

/** Exactly as recorded, byte for byte. Not reconstructed and not repaired. */
export const HISTORICAL_MALFORMED_TARGET = {
  role: "auditor",
  workerVersionId: "au-v1",
  baseModel: MODEL,
  knowledgeVersionId: AUDITOR_DOCTRINE.map((d) => d.id).join("+"),
  tools: ["sandbox"],
  policyVersionId: "foundry-promoted",
  retrievalConfigId: "none",
  executionEnvironmentId: "EE-8880ef0d5a0f",
} as CertificationTarget;

/** The configuration that genuinely produced the twelve sealed cases. */
export function correctedNoToolTarget() {
  return {
    ...adaptedTarget(adaptWorker("auditor", SOURCES), MODEL, NO_TOOLING),
    executionEnvironmentId: executionEnvironmentId(SINGLE_SHOT_ENVIRONMENT),
  } as CertificationTarget;
}

/** The forward target: same worker, given the ability to open what it audits. */
export function readOnlyToolTarget() {
  return {
    ...adaptedTarget(adaptWorker("auditor", SOURCES), MODEL, { tools: AUDITOR_READONLY_TOOLS }),
    executionEnvironmentId: executionEnvironmentId(AUDITOR_READONLY_ENVIRONMENT),
  } as CertificationTarget;
}

/**
 * The two misdescriptions, stated as checkable claims rather than prose.
 */
export const TARGET_DEFECTS = [
  {
    id: "TD-01",
    field: "tools",
    recorded: "sandbox",
    actual: "none",
    evidence: "auditor-configuration-lock manifest: runtime.expectedTools is empty and both arms declare an empty tool list. No tool call appears in any transcript because no tool was offered.",
    cause: "adaptedTarget hardcoded a sandbox tool list for every role.",
    consequence: "The award named a toolset the worker never had, so the sandbox_tool_use cap that blocked it was measuring an absence the target claimed was present.",
  },
  {
    id: "TD-02",
    field: "executionEnvironmentId",
    recorded: "EE-8880ef0d5a0f, the workstation environment",
    actual: "a single-shot dossier exchange with no protocol, no inventory and no action schema",
    evidence: "The lock runner stamps executionEnvironmentId() unconditionally. The run sent one prompt and parsed one structured verdict.",
    cause: "The environment was stamped from the current process rather than from the run.",
    consequence: "A future workstation change would have appeared to invalidate this evidence, and a future single-shot run would have appeared to match it. Both readings are wrong.",
  },
];

/**
 * Portability, computed rather than argued.
 *
 * Both live rules are run and both answers are reported. Where they disagree the
 * stricter one governs, because the Academy has one representation for partial
 * portability and it operates below the environment, not across it.
 */
export function portabilityAudit() {
  const A = HISTORICAL_MALFORMED_TARGET;
  const B = correctedNoToolTarget();
  const C = readOnlyToolTarget();

  const leg = (before: CertificationTarget, after: CertificationTarget, beforeEnv: ExecutionEnvironment, afterEnv: ExecutionEnvironment) => {
    const targetRule = recertificationScope(before, after);
    const envRule = evidencePortability(beforeEnv, afterEnv);
    const sealedSurvivesTargetRule = targetRule.scope === "none" || !targetRule.invalidates.includes("sealed_exam");
    const sealedSurvivesEnvRule = envRule.transfers === "all";
    return {
      fromTargetId: targetId(before),
      toTargetId: targetId(after),
      targetRule,
      environmentRule: envRule,
      sealedExamSurvives: sealedSurvivesTargetRule && sealedSurvivesEnvRule,
      governedBy: sealedSurvivesTargetRule && !sealedSurvivesEnvRule ? "execution-environment" : "certification-target",
    };
  };

  return {
    /**
     * Not a transfer at all. A and B name the same executed configuration; one
     * names it wrongly. Correcting a label does not move evidence between
     * systems, so no portability rule is invoked and none is needed.
     */
    A_to_B: {
      relation: "relabelling",
      fromTargetId: targetId(A),
      toTargetId: targetId(B),
      sealedExamSurvives: true,
      authority: "Not recertificationScope. The twelve sealed cases were produced by a no-tool, single-shot auditor. B states that. A misstated it. The evidence never described the configuration A declared, so nothing is being carried across.",
      caveat: "Legitimate only because B is strictly a correction: worker version, model, knowledge and policy are unchanged, and the fields that move are exactly the two that were false.",
    },
    B_to_C: leg(B, C, SINGLE_SHOT_ENVIRONMENT, AUDITOR_READONLY_ENVIRONMENT),
    A_to_C: leg(A, C, SINGLE_SHOT_ENVIRONMENT, AUDITOR_READONLY_ENVIRONMENT),
  };
}

/** A stable hash of the forensic claim, so a later run cannot quietly restate it. */
export function forensicsFingerprint() {
  return "TF-" + createHash("sha256").update(JSON.stringify({
    defects: TARGET_DEFECTS.map((d) => [d.id, d.field, d.recorded, d.actual]),
    A: targetId(HISTORICAL_MALFORMED_TARGET),
    B: targetId(correctedNoToolTarget()),
    C: targetId(readOnlyToolTarget()),
  })).digest("hex").slice(0, 12);
}
