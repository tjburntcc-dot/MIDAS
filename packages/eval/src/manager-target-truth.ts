/**
 * The exact Manager, named truthfully.
 *
 * The foundry cycle recorded three arms and only one of them was a MIDAS worker.
 * A_generic and B_contract both carry actorKind "generic_baseline" with a null
 * workerVersion: they are a bare model with, respectively, no contract and a
 * contract-shaped prompt. Neither is a configuration this repository can certify,
 * because there is no worker there to certify.
 *
 * So the candidate is not chosen from three. There is one, and the question is
 * only whether it is fit.
 *
 * The environment is stated rather than inherited. The foundry cycle stamped
 * EE-8880ef0d5a0f -- the workstation -- onto a run whose own subject record says
 * tools [] and protocolVersion single-shot-json. That is the same defect that
 * made the Auditor's first certification target describe a system that never
 * existed, and it is not repeated here.
 */
import { createHash } from "node:crypto";
import { targetId } from "./academy.ts";
import type { CertificationTarget } from "./academy.ts";
import { adaptWorker, adaptedTarget, NO_TOOLING } from "./worker-adapter.ts";
import { executionEnvironmentId } from "./execution-environment.ts";
import type { ExecutionEnvironment } from "./execution-environment.ts";
import { MANAGER_DOCTRINE, MANAGER_VERSION_ID } from "./manager.ts";

const SOURCES = { managerKnowledge: MANAGER_DOCTRINE, managerVersionId: MANAGER_VERSION_ID };
const MODEL = "gpt-4.1";

/**
 * A dossier in, one structured decision out.
 *
 * No protocol, because nothing tells it how to act over turns. No inventory,
 * because there is nothing to inventory. The action schema is the manager
 * decision object, which is a different shape from any other role's, so it is
 * named rather than borrowed.
 */
export const MANAGER_SINGLE_SHOT_ENVIRONMENT: ExecutionEnvironment = {
  protocolVersion: "none-single-shot",
  inventoryContractVersion: "none-dossier-supplied-inline",
  actionSchemaVersion: "manager-decision-v1",
};

/** Exactly as the foundry cycle recorded it. Not repaired in place. */
export const HISTORICAL_MANAGER_SUBJECT = {
  actorKind: "midas_worker",
  workerId: "manager",
  workerVersion: "mg-v1",
  model: MODEL,
  knowledgeVersion: "MD-001,MD-002,MD-003,MD-004,MD-005,MD-006,MD-007,MD-008,MD-009,MD-010#bb217288c9c7e717",
  policyVersion: "manager-doctrine-v1",
  tools: [] as string[],
  retrievalConfig: "none: the state is supplied in full",
  protocolVersion: "single-shot-json",
  executionEnvironmentId: "EE-8880ef0d5a0f",
};

/**
 * The one misdescription in that record, stated as a checkable claim.
 */
export const MANAGER_TARGET_DEFECTS = [
  {
    id: "MD-TD-01",
    field: "executionEnvironmentId",
    recorded: "EE-8880ef0d5a0f, the workstation environment",
    actual: "a single-shot dossier exchange: no protocol, no inventory, one structured decision returned",
    evidence: "The same subject record declares tools [] and protocolVersion single-shot-json. Nothing in the run entered a workstation.",
    cause: "The runner stamped executionEnvironmentId() from the current process rather than from the run, exactly as the Auditor lock did.",
    consequence: "A workstation change would have appeared to invalidate this configuration, and a future single-shot run would have appeared to match it. Both readings are wrong.",
  },
];

/** The candidate. mg-v1 with its contract and its ten doctrine rules. */
export function managerCandidateTarget() {
  return {
    ...adaptedTarget(adaptWorker("manager", SOURCES), MODEL, {
      tools: NO_TOOLING.tools,
      policyVersionId: "manager-doctrine-v1",
    }),
    executionEnvironmentId: executionEnvironmentId(MANAGER_SINGLE_SHOT_ENVIRONMENT),
  } as CertificationTarget;
}

/**
 * Why this configuration and not the other one that was run.
 *
 * Recorded as data so the selection can be checked rather than believed. The
 * first reason is disqualifying on its own; the second is why the choice would
 * still be the same if it were not.
 */
export const CANDIDATE_SELECTION = {
  selected: "C_doctrine: mg-v1, the manager contract, and MD-001 to MD-010",
  rejected: [
    {
      arm: "B_contract",
      disqualifying: "It is not a MIDAS worker. Its own subject record says actorKind generic_baseline, workerId null, workerVersion null. It is a bare model given a contract-shaped prompt, so there is no configuration to lock.",
      andAlsoWorse: "Under the corrected scorer it is worse on every metric that measures the job: binding bottleneck 0.75 against 0.833, selected action 0.75 against 0.833, defer/kill 0.667 against 0.833. It is better only on authority, 0.917 against 0.833, with zero unauthorised commitments against one.",
      principle: "Choosing it for the authority number would be buying control by degrading the core function, which the selection principle forbids.",
    },
    {
      arm: "A_generic",
      disqualifying: "The declared generic baseline. Certification-ineligible by construction.",
      andAlsoWorse: "Its corrected authority correctness is 0.667 with two unauthorised commitments, the worst of the three.",
      principle: "A baseline is a measuring stick, not a candidate.",
    },
  ],
  note: "No mg-v2 is created and no doctrine is added. The mission is to settle what exists, and what exists is one worker.",
};

export function managerForensicsFingerprint() {
  return "MF-" + createHash("sha256").update(JSON.stringify({
    defects: MANAGER_TARGET_DEFECTS.map((d) => [d.id, d.field, d.recorded, d.actual]),
    selected: CANDIDATE_SELECTION.selected,
    target: targetId(managerCandidateTarget()),
  })).digest("hex").slice(0, 12);
}
