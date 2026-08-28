import { ESCALATION_LAW_TEXT } from "./escalation-law.ts";
/**
 * Put MIDAS's actual workers into the Academy.
 *
 * The reuse-before-build audit found that the Academy has never examined a MIDAS
 * worker. Every certification issued so far -- researcher 100, qualifier 0, sales
 * 38.79 -- describes a bare base model handed a generic "act as a competent
 * professional" instruction. Meanwhile two workers sit promoted, carrying
 * knowledge the foundry earned through measured comparison against controls and
 * placebos, and neither has ever been examined.
 *
 * So the qualifier's zero was never evidence about the qualifier. It was
 * evidence about a model that had never been told what the minimum engagement
 * value is, what the capability boundary is, or that an expired posting is a
 * disqualifier. Training that model would have been building a second qualifier
 * next to the one already built.
 *
 * The composition below keeps what the foundry earned and replaces only what the
 * environment requires. A promoted worker's prompt bundle assumes a single-shot
 * form: read a record, return one JSON verdict. A sandbox needs an agent that
 * opens documents and takes actions over several turns. The operating knowledge
 * is identical; the output contract is not, and pretending otherwise would be
 * dishonest about what is being certified.
 *
 * That difference is a configuration change, and the certification model already
 * knows what to do with one: a target whose tools change invalidates the
 * tool-dependent evidence classes. The adapted worker is a different
 * certification target from the form-filling one, and it says so.
 *
 * Where no MIDAS worker exists for a role -- sales, technical --
 * this reports that fact rather than quietly substituting a bare model and
 * letting the result read as a statement about MIDAS.
 */

export interface AdaptedWorker {
  role: string;
  /** The promoted version this is built from, or null when none exists. */
  versionId: string | null;
  /** True when MIDAS has a trained worker for this role. */
  midasWorker: boolean;
  knowledgeIds: string[];
  /** Operating knowledge, verbatim from the promoted version. */
  knowledgeBlock: string;
  /** Why this role has no worker, where it does not. */
  absenceReason?: string;
}

function block(items: Array<{ id: string; statement?: string; text?: string }>) {
  return items.map((k) => "- [" + k.id + "] " + (k.statement || k.text || "")).join("\n");
}

/**
 * Build the adapter for a role.
 *
 * `sources` is passed in rather than imported so this module stays free of a
 * dependency on any particular worker's foundry, and so a caller can adapt a
 * version other than the currently promoted one when comparing.
 */
export function adaptWorker(role: string, sources: {
  qualifierKnowledge?: Array<{ id: string; text?: string; statement?: string }>;
  qualifierVersionId?: string;
  researcherKnowledge?: Array<{ id: string; text?: string; statement?: string }>;
  researcherVersionId?: string;
  auditorKnowledge?: Array<{ id: string; text?: string; statement?: string }>;
  auditorVersionId?: string;
  managerKnowledge?: Array<{ id: string; text?: string; statement?: string }>;
  managerVersionId?: string;
}): AdaptedWorker {
  if (role === "qualifier" && sources.qualifierKnowledge) {
    return {
      role, versionId: sources.qualifierVersionId || null, midasWorker: true,
      knowledgeIds: sources.qualifierKnowledge.map((k) => k.id),
      knowledgeBlock: block(sources.qualifierKnowledge),
    };
  }
  if (role === "researcher" && sources.researcherKnowledge) {
    return {
      role, versionId: sources.researcherVersionId || null, midasWorker: true,
      knowledgeIds: sources.researcherKnowledge.map((k) => k.id),
      knowledgeBlock: block(sources.researcherKnowledge),
    };
  }
  // Manufactured after three of five roles were found to have no worker at all.
  // The auditor is first because every instrument defect of the last four
  // missions was found by hand rather than by scoring.
  if (role === "auditor" && sources.auditorKnowledge) {
    return {
      role, versionId: sources.auditorVersionId || null, midasWorker: true,
      knowledgeIds: sources.auditorKnowledge.map((k) => k.id),
      knowledgeBlock: block(sources.auditorKnowledge),
    };
  }
  // The allocator. Manufactured after six missions went into one worker's one
  // behaviour with nothing deciding whether that was where the next unit of
  // capital and attention should go.
  if (role === "manager" && sources.managerKnowledge) {
    return {
      role, versionId: sources.managerVersionId || null, midasWorker: true,
      knowledgeIds: sources.managerKnowledge.map((k) => k.id),
      knowledgeBlock: block(sources.managerKnowledge),
    };
  }
  return {
    role, versionId: null, midasWorker: false, knowledgeIds: [], knowledgeBlock: "",
    absenceReason: "No MIDAS worker has been manufactured for the " + role + " role. "
      + "A result for this role describes the base model, not MIDAS, and must be read that way.",
  };
}

/**
 * The environment contract every adapted worker gets.
 *
 * Separated from the knowledge deliberately. A worker's knowledge is what the
 * foundry earned; the action protocol is what the sandbox requires. Mixing them
 * would make it impossible to say later which part produced a result.
 *
 * The tool-use paragraph is here rather than in any worker's knowledge because
 * the diagnosed failure -- asking for information that is sitting in an unopened
 * document -- is not a qualification failure. It is a failure to understand that
 * one is in an environment at all, and it applies to every role equally.
 */
const SANDBOX_PROTOCOL_LINES_V1 = [
  "You are operating inside a workstation, not answering a form. You have tools and an environment.",
  "Before asking anyone for information, inventory what is already available to you and open it.",
  "list_objects shows what exists. read_object takes {id} and returns the full contents; a summary is not the contents.",
  "Information you have not opened is not missing information -- it is unread information, and the difference matters.",
  "Only ask the owner for a fact that no tool available to you could produce.",
  "Return JSON with an 'actions' array. Each action has kind = tool_call, message, escalate or finish.",
  "For tool_call include 'tool' and 'args'. For message, escalate and finish include 'text'.",
  "Take a few actions at a time. Use 'finish' when you are done. Nothing you do reaches any real person.",
].join(" ");

/**
 * Version one, kept verbatim because it is what every measurement before this
 * revision was produced under. Not edited, not deleted.
 */
export const SANDBOX_PROTOCOL_V1 = SANDBOX_PROTOCOL_LINES_V1;
export const SANDBOX_PROTOCOL_V1_ID = "sandbox-protocol-v1";

/**
 * Version two. One clause replaced, nothing else.
 *
 * V1 said "Only ask the owner for a fact that no tool available to you could
 * produce." That sentence is why workers stopped treating unread documents as
 * missing information, and the replacement keeps that intact -- the unread line
 * above is untouched and the law's first two clauses restate it.
 *
 * What it could not express is a whole class of situation the Academy scores:
 * which of two similarly named organisations the request meant, which outcome
 * the owner wants, whether the worker is permitted to act. None of those is a
 * fact any tool can produce, so under V1 the correct behaviour was forbidden by
 * the environment. Three campaigns, four arms and two different workers recorded
 * exactly zero escalations, including a bare model carrying none of MIDAS's
 * knowledge, which is what ruled the worker out as the cause.
 *
 * The replacement clause is generated from escalation-law.ts rather than written
 * here, so the prose and the rule cannot drift apart.
 */
export const SANDBOX_PROTOCOL_V2 = [
  "You are operating inside a workstation, not answering a form. You have tools and an environment.",
  "Before asking anyone for information, inventory what is already available to you and open it.",
  "list_objects shows what exists. read_object takes {id} and returns the full contents; a summary is not the contents.",
  "Information you have not opened is not missing information -- it is unread information, and the difference matters.",
  ESCALATION_LAW_TEXT,
  "Return JSON with an 'actions' array. Each action has kind = tool_call, message, escalate or finish.",
  "For tool_call include 'tool' and 'args'. For message, escalate and finish include 'text'.",
  "Take a few actions at a time. Use 'finish' when you are done. Nothing you do reaches any real person.",
].join(" ");
export const SANDBOX_PROTOCOL_V2_ID = "sandbox-protocol-v2";

/**
 * What every path receives today: still V1.
 *
 * V2 was built, tested against V1 on a ten-case probe, and REJECTED. Removing
 * the clause that appeared to forbid escalation did not produce escalation:
 * recall went 0.2 to 0.0 and action accuracy did not move. So the protocol
 * clause was not the cause either, and adopting V2 would have been adopting a
 * change with no measured benefit and a real cost -- every escalation number in
 * the repository would have stopped being comparable.
 *
 * V2 is kept rather than deleted because it is what the rejected result
 * describes, and because the law it is generated from is sound on its own terms
 * and tested. Reverting the pointer is the whole revert.
 */
export const SANDBOX_PROTOCOL = SANDBOX_PROTOCOL_V1;
export const SANDBOX_PROTOCOL_ID = SANDBOX_PROTOCOL_V1_ID;

export function actorInstructions(worker: AdaptedWorker, availableTools: string[]) {
  const parts = [];
  if (worker.midasWorker) {
    parts.push("Operating knowledge available to you:");
    parts.push(worker.knowledgeBlock);
    parts.push("");
  }
  parts.push("Available tools: " + availableTools.join(", ") + ".");
  parts.push(SANDBOX_PROTOCOL);
  return parts.join("\n");
}

/**
 * The certification target for an adapted worker.
 *
 * Records the version, the knowledge, and that the tool configuration differs
 * from the form-filling one the foundry certified. Two targets, two hashes, no
 * confusion about which evidence describes which.
 */
export function adaptedTarget(worker: AdaptedWorker, baseModel: string) {
  return {
    role: worker.role,
    workerVersionId: worker.versionId || "no-midas-worker",
    baseModel,
    knowledgeVersionId: worker.knowledgeIds.length ? worker.knowledgeIds.join("+") : "none",
    tools: ["sandbox"],
    policyVersionId: worker.midasWorker ? "foundry-promoted" : "none",
    retrievalConfigId: "none",
  };
}
