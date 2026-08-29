/**
 * The Shadow chain, as one runtime.
 *
 * It was a script. A script is fine for one run narrated by hand, and useless
 * as an owner-facing capability: the moment two callers exist, the worker logic
 * has to live in exactly one place or the console and the command line start
 * answering differently. So the contracts, the schemas, the instruction blocks
 * and the three calls live here, and both the tool and the HTTP route are thin
 * callers of the same function.
 *
 * The model caller is injected. This module knows how to build a Researcher
 * prompt and how to run an audit desk; it does not know what a provider is,
 * which is why it can be exercised without spending anything.
 *
 * No outbound path exists here. The workers are given evidence and return text.
 */
import { createHash } from "node:crypto";
import {
  companyPacketText, DECISION_QUESTION, opportunityPacketTextFor, inheritedKeyPaths,
} from "./company0-shadow.ts";
import type { OpportunityPacket } from "./company0-shadow.ts";
import {
  RESEARCHER_OBJECTIVE, RESEARCHER_PROHIBITIONS, RESEARCHER_AUTHORITY_BOUNDARY,
  RESEARCHER_OUTPUT_SCHEMA, RESEARCHER_METHOD_KNOWLEDGE,
} from "./opportunity-researcher.ts";
import {
  MANAGER_DOCTRINE, MANAGER_VERSION_ID, MANAGER_CONTRACT_BRIEF, MANAGER_NON_RESPONSIBILITIES,
  BOTTLENECKS, ACTION_CLASSES,
} from "./manager.ts";
import {
  AUDITOR_DOCTRINE, AUDITOR_VERSION_ID, AUDITOR_CONTRACT_BRIEF, AUDITOR_NON_RESPONSIBILITIES,
  AUDIT_VERDICTS, DEFECT_CLASSES,
} from "./auditor.ts";
import { AUDIT_DESK_PROTOCOL, deskPrompt, runDeskAudit, turnsWithSlack, AUDIT_DESK_TOOL_SET } from "./audit-desk.ts";
import { finalAuditorTarget, AUDIT_DESK_ENVIRONMENT } from "./auditor-target-truth.ts";
import { managerCandidateTarget, MANAGER_SINGLE_SHOT_ENVIRONMENT } from "./manager-target-truth.ts";
import { adaptWorker, adaptedTarget, NO_TOOLING, SANDBOX_TOOLING } from "./worker-adapter.ts";
import { targetId } from "./academy.ts";
import { executionEnvironmentId } from "./execution-environment.ts";

const NL = String.fromCharCode(10);
export const SHADOW_MODEL = "gpt-4.1";
export const SHADOW_CALL_CEILING = 8;

/**
 * What the owner is shown while it runs.
 *
 * Named after what is actually happening, with no percentage: the chain has
 * three stages of unknown length and a progress bar would be a decoration that
 * claims to know something.
 */
export const SHADOW_STAGES = ["PREPARING", "RESEARCHING", "DECIDING", "AUDITING", "COMPLETE", "FAILED"] as const;

export const RESEARCHER_SHADOW_ENVIRONMENT = {
  protocolVersion: "none-single-shot",
  inventoryContractVersion: "none-source-text-supplied-inline",
  actionSchemaVersion: "opportunity-research-v1",
};

export function shadowWorkers() {
  const researcher = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
  const manager = adaptWorker("manager", { managerKnowledge: MANAGER_DOCTRINE, managerVersionId: MANAGER_VERSION_ID });
  const auditor = adaptWorker("auditor", { auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID });
  return { researcher, manager, auditor };
}

/**
 * Who is actually running, said truthfully.
 *
 * The Researcher's certified tier belongs to a sandbox configuration this chain
 * does not use. Reporting the certified id here would claim evidence the run
 * cannot produce, so both ids are carried and the difference is stated.
 */
export function shadowTargets() {
  const { researcher } = shadowWorkers();
  const researcherShadow = {
    ...adaptedTarget(researcher, SHADOW_MODEL, { tools: NO_TOOLING.tools, policyVersionId: "researcher-method-v1" }),
    executionEnvironmentId: executionEnvironmentId(RESEARCHER_SHADOW_ENVIRONMENT),
  };
  return {
    researcher: {
      certified: targetId(adaptedTarget(researcher, SHADOW_MODEL, SANDBOX_TOOLING)),
      shadow: targetId(researcherShadow),
      environment: executionEnvironmentId(RESEARCHER_SHADOW_ENVIRONMENT),
      truthful: "or-v3 with its method knowledge, on " + SHADOW_MODEL + ", reading supplied text with no tools. This is NOT the sandbox configuration that holds SANDBOX_COMPETENT, so this run produces no certification evidence for the researcher.",
    },
    manager: {
      certified: targetId(managerCandidateTarget()),
      shadow: targetId(managerCandidateTarget()),
      environment: executionEnvironmentId(MANAGER_SINGLE_SHOT_ENVIRONMENT),
      truthful: "mg-v1 in exactly the single-shot dossier environment its fitness campaign used.",
    },
    auditor: {
      certified: targetId(finalAuditorTarget()),
      shadow: targetId(finalAuditorTarget()),
      environment: executionEnvironmentId(AUDIT_DESK_ENVIRONMENT),
      truthful: "au-v1 at exactly the audit desk its certification campaign used.",
    },
  };
}

export const DECISION_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["bindingBottleneck", "bottleneckReasoning", "facts", "inferences", "assumptions", "unknowns", "conflicts",
    "candidateActions", "selectedAction", "whyThisWinsNow", "whyNotAlternatives", "capabilityRequired",
    "authorityRequired", "ownerActionRequired", "deferOrIgnore", "successCondition", "failureCondition", "falsifier", "reassessmentTrigger"],
  properties: {
    bindingBottleneck: { type: "string", enum: [...BOTTLENECKS] },
    bottleneckReasoning: { type: "string" },
    facts: { type: "array", items: { type: "string" } },
    inferences: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    conflicts: { type: "array", items: { type: "string" } },
    candidateActions: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["action", "rationale"],
      properties: {
        action: { type: "string", enum: [...ACTION_CLASSES] }, rationale: { type: "string" },
        upside: { type: "string" }, downside: { type: "string" }, capitalRequired: { type: "string" },
        ownerInvolvement: { type: "string" }, timeToFeedback: { type: "string" }, reversibility: { type: "string" },
        capabilityRequired: { type: "string" }, authorityRequired: { type: "boolean" }, reasonToRejectOrSelect: { type: "string" },
      } } },
    selectedAction: { type: "string", enum: [...ACTION_CLASSES] },
    whyThisWinsNow: { type: "string" }, whyNotAlternatives: { type: "string" },
    capabilityRequired: { type: "string" }, authorityRequired: { type: "boolean" },
    ownerActionRequired: { type: "string" }, deferOrIgnore: { type: "array", items: { type: "string" } },
    successCondition: { type: "string" }, failureCondition: { type: "string" },
    falsifier: { type: "string" }, reassessmentTrigger: { type: "string" },
  },
};

export const AUDIT_ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["kind"],
    properties: {
      kind: { type: "string" }, tool: { type: "string" },
      args: { type: "object", additionalProperties: false, properties: { ids: { type: "array", items: { type: "string" } } } },
      verdict: { type: "string", enum: [...AUDIT_VERDICTS] },
      criticalDefects: { type: "array", items: { type: "object", additionalProperties: false, required: ["defectClass", "claim", "why"],
        properties: { defectClass: { type: "string", enum: [...DEFECT_CLASSES] }, claim: { type: "string" }, why: { type: "string" } } } },
      reasoning: { type: "string" },
    } } } },
};

export function shadowInstructions() {
  const { researcher, manager, auditor } = shadowWorkers();
  const r = [
    "Operating knowledge available to you:", researcher.knowledgeBlock, "",
    RESEARCHER_OBJECTIVE, "",
    "Authority boundary: " + RESEARCHER_AUTHORITY_BOUNDARY, "",
    "You must never do any of these: " + RESEARCHER_PROHIBITIONS.join(", ") + ".",
  ].join(NL);
  const m = [
    "Operating knowledge available to you:", manager.knowledgeBlock, "",
    MANAGER_CONTRACT_BRIEF, "", "You do not do any of the following:",
    ...MANAGER_NON_RESPONSIBILITIES.map((n) => "- " + n),
  ].join(NL);
  const a = [
    "Operating knowledge available to you:", auditor.knowledgeBlock, "",
    AUDITOR_CONTRACT_BRIEF, "", "You do not do any of the following:",
    ...AUDITOR_NON_RESPONSIBILITIES.map((n) => "- " + n),
    "", AUDIT_DESK_PROTOCOL,
  ].join(NL);
  const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
  return { researcher: r, manager: m, auditor: a, hashes: { researcher: sha(r), manager: sha(m), auditor: sha(a) } };
}

export const MANAGER_CONSTRAINTS = [
  "CONSTRAINTS THAT APPLY NOW:",
  "- No contact with the buyer, no submission, no form, no account, no application. You recommend; you do not execute.",
  "- Any external action requires the owner's approval before it happens.",
  "- No adult with authority to bind the company has been identified and asked.",
].join(NL);

function parse(text: string) {
  const t = String(text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
  try { return { value: a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {}, parseError: null as string | null }; }
  catch (e: any) { return { value: {} as any, parseError: String(e && e.message) }; }
}

export interface ChainCall {
  (args: { instructions: string; input: string; schemaName: string; schema: any }): Promise<{ text: string; usage?: any }>;
}

/**
 * One chain: researcher, manager, auditor.
 *
 * `onStage` is called before each stage begins and once at the end, so a caller
 * can report where it is without the chain inventing how far along it is.
 * `onRaw` is called with each stage's output the moment it exists, so a caller
 * can persist it before the next stage can destroy the evidence of this one.
 */
export async function runShadowChain(args: {
  opportunity: OpportunityPacket;
  call: ChainCall;
  onStage?: (stage: string) => void;
  onRaw?: (stage: string, record: any) => void;
}) {
  const { opportunity, call } = args;
  const stage = (s: string) => { if (args.onStage) args.onStage(s); };
  const raw = (s: string, r: any) => { if (args.onRaw) args.onRaw(s, r); };

  const targets = shadowTargets();
  const inst = shadowInstructions();
  const company = companyPacketText();
  const oppText = opportunityPacketTextFor(opportunity);
  const stages: Record<string, any> = {};
  const tokens = { input: 0, output: 0 };
  let calls = 0;

  const doCall = async (instructions: string, input: string, schemaName: string, schema: any) => {
    if (calls >= SHADOW_CALL_CEILING) throw new Error("chain exceeded its call ceiling of " + SHADOW_CALL_CEILING);
    const out = await call({ instructions, input, schemaName, schema });
    calls += 1;
    const u = out.usage || {};
    tokens.input += Number(u.inputTokens || 0);
    tokens.output += Number(u.outputTokens || 0);
    return out;
  };

  stage("PREPARING");

  // ---- researcher
  stage("RESEARCHING");
  const rInput = ["SUPPLIED TEXT:", oppText, "", "Report the facts a qualification decision needs from this text."].join(NL);
  const rOut = await doCall(inst.researcher, rInput, "opportunity_research", RESEARCHER_OUTPUT_SCHEMA);
  const rp = parse(rOut.text);
  stages.researcher = {
    target: targets.researcher, instructionsHash: inst.hashes.researcher, input: rInput,
    modelResponse: String(rOut.text || ""), parsed: rp.value, parseError: rp.parseError,
    inheritedKeys: inheritedKeyPaths(rp.value), usage: rOut.usage || {},
  };
  raw("researcher", stages.researcher);

  // ---- manager
  stage("DECIDING");
  const mInput = [
    company, "", "THE DECISION IN FRONT OF YOU:", DECISION_QUESTION, "", oppText, "",
    "WHAT THE RESEARCHER REPORTED, verbatim:", JSON.stringify(rp.value, null, 1), "",
    MANAGER_CONSTRAINTS,
  ].join(NL);
  const mOut = await doCall(inst.manager, mInput, "manager_decision", DECISION_SCHEMA);
  const mp = parse(mOut.text);
  stages.manager = {
    target: targets.manager, instructionsHash: inst.hashes.manager, input: mInput,
    modelResponse: String(mOut.text || ""), parsed: mp.value, parseError: mp.parseError,
    inheritedKeys: inheritedKeyPaths(mp.value), usage: mOut.usage || {},
  };
  raw("manager", stages.manager);

  // ---- auditor, at its desk
  stage("AUDITING");
  const auditCase = {
    id: "C0-CONSOLE-" + opportunity.workItemId,
    title: "Company 0 next-action decision on " + opportunity.evidence.length + " evidence records",
    evidenceClass: "team_integration",
    competency: "shadow_team_audit",
    task: [
      "A manager was asked: " + DECISION_QUESTION, "",
      "It was given the company state, the opportunity evidence packet, and a researcher's report of what that evidence states.",
      "It recommends; it does not execute. No external action is permitted, and any external action would require the owner's approval.",
    ].join(NL),
    output: JSON.stringify(mp.value, null, 1),
    packet: { records: [
      { id: "company", label: "Company 0 current state, as reported and as verified", body: company },
      { id: "opportunity", label: "The opportunity and every evidence record held about it", body: oppText },
      { id: "research", label: "What the researcher reported from the supplied text", body: JSON.stringify(rp.value, null, 1) },
      { id: "question", label: "The exact decision question the manager was asked", body: DECISION_QUESTION },
    ] },
    gold: { verdict: "unknown", defectClass: null, acceptableVerdicts: [...AUDIT_VERDICTS], acceptableDefectClasses: [] },
    goldAuthor: "none. This is a real decision with no answer key, and none is asserted.",
    goldRationale: "No business outcome is known, so no verdict is scored as correct. The audit is read, not marked.",
    materialEvidenceIds: ["company", "opportunity", "research"],
    falsifier: "not applicable: nothing here is scored against a reference answer.",
  };
  const cap = turnsWithSlack();
  const auditTrace: any[] = [];
  const run = await runDeskAudit(auditCase as any, async ({ log, turn }) => {
    if (calls >= SHADOW_CALL_CEILING) return [];
    const history = log.map((a: any) => (a.kind === "tool_call"
      ? "YOU called " + a.tool + "(" + JSON.stringify(a.args || {}) + ") and received:" + NL + a.result
      : "YOU finished."));
    const input = [
      deskPrompt(auditCase as any), "",
      history.length ? "WHAT YOU HAVE DONE SO FAR:" + NL + history.join(NL) : "You have not opened anything yet.",
      turn === cap ? NL + "This is your last turn. You must finish now." : "",
    ].join(NL);
    const out = await doCall(inst.auditor, input, "auditor_actions", AUDIT_ACTION_SCHEMA);
    const p = parse(out.text);
    const actions = (p.value || {}).actions || [];
    auditTrace.push({ turn, turnCap: cap, input, modelResponse: String(out.text || ""), parsedActions: actions, parseError: p.parseError, usage: out.usage || {} });
    return actions;
  }, cap);

  stages.auditor = {
    target: targets.auditor, instructionsHash: inst.hashes.auditor,
    toolSet: AUDIT_DESK_TOOL_SET, turnCap: cap, turnsUsed: run.turnsUsed,
    transcript: run.log.map((a: any) => (a.kind === "tool_call"
      ? a.tool + " " + JSON.stringify(a.args || {}) + (a.ok ? " -> opened " + (a.opened || []).join("+") : " REFUSED")
      : "finish " + a.verdict)),
    opened: run.log.filter((a: any) => a.kind === "tool_call").flatMap((a: any) => a.opened || []),
    report: run.report, inheritedKeys: inheritedKeyPaths(run.report || {}), trace: auditTrace,
  };
  raw("auditor", stages.auditor);

  stage("COMPLETE");
  return {
    stages, targets, instructionHashes: inst.hashes, calls, tokens,
    inputs: { company, opportunity: oppText, question: DECISION_QUESTION },
    outboundActionsTaken: 0,
  };
}
