/**
 * The first real Company 0 Shadow. One chain, three workers, nothing external.
 *
 * Researcher reads the evidence and reports what it states. Manager decides one
 * next action. Auditor reviews that decision at its desk, opening only what it
 * chooses to open. Every raw output is written before the next stage sees it,
 * so a downstream failure cannot destroy the evidence of an upstream one.
 *
 * No reruns, no vote, no second model, no prompt change, no correction. The
 * workers are exactly as they were left: mg-v1 at CT-767e9f1e6f89, the auditor
 * at CT-677749cd2035 and its desk, and the researcher on or-v3 with its method
 * knowledge. The researcher's execution environment is NOT its certified one,
 * and the run says so rather than implying evidence it cannot produce.
 *
 * No outbound action. Nothing is sent, submitted, purchased or committed.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import {
  SHADOW_ID, SHADOW_TODAY, companyPacketText, opportunityPacketText, researcherSourceText,
  DECISION_QUESTION, PROCESS_EXPECTATIONS, packetFingerprint, CASE_TYPE,
  OPPORTUNITY_EVIDENCE, permissiveObjectLevels, inheritedKeyPaths,
} from "../packages/eval/src/company0-shadow.ts";
import {
  RESEARCHER_OBJECTIVE, RESEARCHER_PROHIBITIONS, RESEARCHER_AUTHORITY_BOUNDARY,
  RESEARCHER_OUTPUT_SCHEMA, RESEARCHER_METHOD_KNOWLEDGE,
} from "../packages/eval/src/opportunity-researcher.ts";
import {
  MANAGER_DOCTRINE, MANAGER_VERSION_ID, MANAGER_CONTRACT_BRIEF, MANAGER_NON_RESPONSIBILITIES,
  BOTTLENECKS, ACTION_CLASSES,
} from "../packages/eval/src/manager.ts";
import {
  AUDITOR_DOCTRINE, AUDITOR_VERSION_ID, AUDITOR_CONTRACT_BRIEF, AUDITOR_NON_RESPONSIBILITIES,
  AUDIT_VERDICTS, DEFECT_CLASSES,
} from "../packages/eval/src/auditor.ts";
import {
  AUDIT_DESK_PROTOCOL, deskPrompt, runDeskAudit, turnsWithSlack, AUDIT_DESK_TOOL_SET,
} from "../packages/eval/src/audit-desk.ts";
import { finalAuditorTarget, AUDIT_DESK_ENVIRONMENT } from "../packages/eval/src/auditor-target-truth.ts";
import { managerCandidateTarget, MANAGER_SINGLE_SHOT_ENVIRONMENT } from "../packages/eval/src/manager-target-truth.ts";
import { adaptWorker, adaptedTarget, NO_TOOLING, SANDBOX_TOOLING } from "../packages/eval/src/worker-adapter.ts";
import { targetId } from "../packages/eval/src/academy.ts";
import { executionEnvironmentId } from "../packages/eval/src/execution-environment.ts";
import { budgetGuard } from "../packages/eval/src/call-budget.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const model = "gpt-4.1";
const NL = String.fromCharCode(10);
const CEILING = 8;
const MAX_TRANSPORT_RETRIES = 6;
const OUT = repoPath("var", "state", "company0-shadow-raw.json");

// ------------------------------------------------------------- the workers

const researcher = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
const manager = adaptWorker("manager", { managerKnowledge: MANAGER_DOCTRINE, managerVersionId: MANAGER_VERSION_ID });
const auditor = adaptWorker("auditor", { auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID });
for (const [name, w] of [["researcher", researcher], ["manager", manager], ["auditor", auditor]]) {
  if (!w.midasWorker) { console.error("The " + name + " did not resolve. Refusing to run."); process.exit(9); }
}

/** The researcher reads text supplied inline. That is not its certified sandbox. */
const RESEARCHER_SHADOW_ENVIRONMENT = {
  protocolVersion: "none-single-shot",
  inventoryContractVersion: "none-source-text-supplied-inline",
  actionSchemaVersion: "opportunity-research-v1",
};
const researcherCertifiedTarget = targetId(adaptedTarget(researcher, model, SANDBOX_TOOLING));
const researcherShadowTarget = {
  ...adaptedTarget(researcher, model, { tools: NO_TOOLING.tools, policyVersionId: "researcher-method-v1" }),
  executionEnvironmentId: executionEnvironmentId(RESEARCHER_SHADOW_ENVIRONMENT),
};
const managerTarget = managerCandidateTarget();
const auditorTarget = finalAuditorTarget();

const TARGETS = {
  researcher: {
    certified: researcherCertifiedTarget,
    shadow: targetId(researcherShadowTarget),
    environment: executionEnvironmentId(RESEARCHER_SHADOW_ENVIRONMENT),
    truthful: "or-v3 with its method knowledge, on " + model + ", reading supplied text with no tools. This is NOT the sandbox configuration that holds SANDBOX_COMPETENT, so this run produces no certification evidence for the researcher.",
  },
  manager: {
    certified: targetId(managerTarget),
    shadow: targetId(managerTarget),
    environment: executionEnvironmentId(MANAGER_SINGLE_SHOT_ENVIRONMENT),
    truthful: "mg-v1 in exactly the single-shot dossier environment its fitness campaign used.",
  },
  auditor: {
    certified: targetId(auditorTarget),
    shadow: targetId(auditorTarget),
    environment: executionEnvironmentId(AUDIT_DESK_ENVIRONMENT),
    truthful: "au-v1 at exactly the audit desk its certification campaign used.",
  },
};

// ------------------------------------------------------------- the schemas

const DECISION_SCHEMA = {
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

const AUDIT_ACTION_SCHEMA = {
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

// ------------------------------------------------------------- instructions

const RESEARCHER_INSTRUCTIONS = [
  "Operating knowledge available to you:", researcher.knowledgeBlock, "",
  RESEARCHER_OBJECTIVE, "",
  "Authority boundary: " + RESEARCHER_AUTHORITY_BOUNDARY, "",
  "You must never do any of these: " + RESEARCHER_PROHIBITIONS.join(", ") + ".",
].join(NL);

const MANAGER_INSTRUCTIONS = [
  "Operating knowledge available to you:", manager.knowledgeBlock, "",
  MANAGER_CONTRACT_BRIEF,
  "", "You do not do any of the following:",
  ...MANAGER_NON_RESPONSIBILITIES.map((n) => "- " + n),
].join(NL);

const AUDITOR_INSTRUCTIONS = [
  "Operating knowledge available to you:", auditor.knowledgeBlock, "",
  AUDITOR_CONTRACT_BRIEF,
  "", "You do not do any of the following:",
  ...AUDITOR_NON_RESPONSIBILITIES.map((n) => "- " + n),
  "", AUDIT_DESK_PROTOCOL,
].join(NL);

const hashes = {
  researcher: createHash("sha256").update(RESEARCHER_INSTRUCTIONS).digest("hex").slice(0, 16),
  manager: createHash("sha256").update(MANAGER_INSTRUCTIONS).digest("hex").slice(0, 16),
  auditor: createHash("sha256").update(AUDITOR_INSTRUCTIONS).digest("hex").slice(0, 16),
};

// ---------------------------------------------------------------- preflight

const review = existsSync(repoPath("var", "state", "company0-shadow-review.json"))
  ? JSON.parse(readFileSync(repoPath("var", "state", "company0-shadow-review.json"), "utf8")) : null;

const workerVisible = [companyPacketText(), opportunityPacketText(), researcherSourceText(), DECISION_QUESTION].join(NL);
const leakTerms = ["factsThatMustSurvive", "MUST SURVIVE", "Z-CHANNEL", "Z-FIT", "FAILURE TAXONOMY",
  "UNDER_COMMITMENT", "preregistered", "13 open opportunities", "excluded public procurement"];

const blocking = [];
const warnings = [];

if (TARGETS.manager.certified !== "CT-767e9f1e6f89") blocking.push("the Manager target has moved: " + TARGETS.manager.certified);
if (TARGETS.auditor.certified !== "CT-677749cd2035") blocking.push("the Auditor target has moved: " + TARGETS.auditor.certified);
if (researcherCertifiedTarget !== "CT-44e7595af4a1") blocking.push("the Researcher certified target has moved: " + researcherCertifiedTarget);
if (executionEnvironmentId(MANAGER_SINGLE_SHOT_ENVIRONMENT) !== "EE-6b813ab7dd1a") blocking.push("the Manager environment has moved.");
if (!review) blocking.push("no pre-run review exists.");
if (review && review.packetFingerprint === packetFingerprint()) {
  warnings.push("the reviewed packet is byte-identical to the live packet; the reviewer's material repairs were applied after review, so this should differ.");
}
if (review && (review.materialDefects || []).length && !CASE_TYPE.whatWasChanged) {
  blocking.push("the review found material defects and nothing records what was changed.");
}
for (const t of leakTerms) {
  if (workerVisible.includes(t)) blocking.push("worker-visible material leaks evaluator-only content: " + t);
}
for (const [name, schema] of [["researcher", RESEARCHER_OUTPUT_SCHEMA], ["manager", DECISION_SCHEMA], ["auditor", AUDIT_ACTION_SCHEMA]]) {
  const permissive = permissiveObjectLevels(schema);
  if (permissive.length) blocking.push("AI-09: " + name + " schema has permissive object levels: " + permissive.join(", "));
}
if (PROCESS_EXPECTATIONS.factsThatMustSurvive.length < 5) blocking.push("too few must-survive facts to measure a handoff.");

console.log("COMPANY 0 SHADOW -- ONE CHAIN");
console.log("  shadow      : " + SHADOW_ID + ", today " + SHADOW_TODAY + ", case " + CASE_TYPE.kind);
console.log("  packet      : " + packetFingerprint());
console.log("  researcher  : " + TARGETS.researcher.shadow + " @ " + TARGETS.researcher.environment + "   (certified " + TARGETS.researcher.certified + ", different environment)");
console.log("  manager     : " + TARGETS.manager.shadow + " @ " + TARGETS.manager.environment);
console.log("  auditor     : " + TARGETS.auditor.shadow + " @ " + TARGETS.auditor.environment);
console.log("  instructions: r " + hashes.researcher + "  m " + hashes.manager + "  a " + hashes.auditor);
console.log("  review      : " + (review ? review.model + ", " + (review.materialDefects || []).length + " material defect(s), repaired" : "MISSING"));
console.log("");
for (const w of warnings) console.log("  warning: " + w);
if (blocking.length) {
  for (const b of blocking) console.log("  BLOCKING: " + b);
  writeFileSync(repoPath("var", "state", "company0-shadow-preflight.json"), JSON.stringify({
    at: new Date().toISOString(), cleared: false, blocking, warnings, packetFingerprint: packetFingerprint(),
  }, null, 1));
  console.log("");
  console.log("PREFLIGHT REFUSED. No model call was made.");
  process.exit(9);
}
console.log("  preflight   : cleared, " + warnings.length + " warning(s)");
console.log("");
writeFileSync(repoPath("var", "state", "company0-shadow-preflight.json"), JSON.stringify({
  at: new Date().toISOString(), cleared: true, blocking: [], warnings,
  packetFingerprint: packetFingerprint(), targets: TARGETS, instructionHashes: hashes,
  outboundPathsAvailable: [], schemasStrictAtEveryLevel: true,
}, null, 1));

if (DRY) { console.log("--dry: preflight only, no model calls made."); process.exit(0); }

// ------------------------------------------------------------------- run

const guard = budgetGuard(CEILING, { "gpt-5.5": 0 });
const tokens = { input: 0, output: 0 };
const transport = { attempts: 0, failures: [] };
const provider = new OpenAIResponsesProvider(undefined, model);
const stages = {};

const persist = (note) => writeFileSync(OUT, JSON.stringify({
  at: new Date().toISOString(), shadowId: SHADOW_ID, note, model,
  packetFingerprint: packetFingerprint(), targets: TARGETS, instructionHashes: hashes,
  calls: CEILING - guard.remainingFor(model), tokens, transport, stages,
  outboundActionsTaken: 0,
  inputs: { company: companyPacketText(), opportunity: opportunityPacketText(), question: DECISION_QUESTION },
}, null, 1));

async function call(instructions, input, schemaName, schema) {
  let last = null;
  for (let attempt = 0; attempt <= MAX_TRANSPORT_RETRIES - transport.attempts; attempt++) {
    try {
      const out = await provider.complete({ instructions, input, outputSchema: { name: schemaName, strict: false, schema } });
      guard.charge(model);
      const u = out.usage || {};
      tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
      return out;
    } catch (e) {
      transport.attempts += 1; last = String((e && e.message) || e);
      transport.failures.push({ attempt: transport.attempts, error: last.slice(0, 300) });
      if (transport.attempts >= MAX_TRANSPORT_RETRIES) break;
    }
  }
  throw new Error("transport: exhausted retries -- " + last);
}

function parse(text) {
  const t = String(text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
  try { return { value: a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {}, parseError: null }; }
  catch (e) { return { value: {}, parseError: String(e && e.message) }; }
}

// ---- stage 1: researcher
const rInput = [
  "SUPPLIED TEXT:", researcherSourceText(), "",
  "Report the facts a qualification decision needs from this text.",
].join(NL);
const rOut = await call(RESEARCHER_INSTRUCTIONS, rInput, "opportunity_research", RESEARCHER_OUTPUT_SCHEMA);
const rParsed = parse(rOut.text);
stages.researcher = {
  target: TARGETS.researcher, instructionsHash: hashes.researcher, input: rInput,
  modelResponse: String(rOut.text || ""), parsed: rParsed.value, parseError: rParsed.parseError,
  inheritedKeys: inheritedKeyPaths(rParsed.value), usage: rOut.usage || {},
};
persist("researcher complete, raw written before the manager saw anything");
console.log("  RESEARCHER  facts=" + Object.keys((rParsed.value || {}).facts || {}).join(",")
  + "  not_stated=" + JSON.stringify((rParsed.value || {}).facts_not_stated || [])
  + "  questions=" + ((rParsed.value || {}).unresolved_questions || []).length);

// ---- stage 2: manager
const researchHandoff = [
  "WHAT THE RESEARCHER REPORTED, verbatim:",
  JSON.stringify(rParsed.value, null, 1),
].join(NL);
const mInput = [
  companyPacketText(), "",
  "THE DECISION IN FRONT OF YOU:", DECISION_QUESTION, "",
  opportunityPacketText(), "",
  researchHandoff, "",
  "CONSTRAINTS THAT APPLY NOW:",
  "- No contact with the buyer, no submission, no form, no account, no application. You recommend; you do not execute.",
  "- Any external action requires the owner's approval before it happens.",
  "- No adult with authority to bind the company has been identified and asked.",
].join(NL);
const mOut = await call(MANAGER_INSTRUCTIONS, mInput, "manager_decision", DECISION_SCHEMA);
const mParsed = parse(mOut.text);
stages.manager = {
  target: TARGETS.manager, instructionsHash: hashes.manager, input: mInput,
  modelResponse: String(mOut.text || ""), parsed: mParsed.value, parseError: mParsed.parseError,
  inheritedKeys: inheritedKeyPaths(mParsed.value), usage: mOut.usage || {},
};
persist("manager complete, raw written before the auditor saw anything");
const d = mParsed.value || {};
console.log("  MANAGER     bottleneck=" + d.bindingBottleneck + "  action=" + d.selectedAction
  + "  authority=" + d.authorityRequired + "  options=" + ((d.candidateActions || []).length));

// ---- stage 3: auditor at the desk
const auditCase = {
  id: "C0-SHADOW-01",
  title: "Company 0 next-action decision on " + OPPORTUNITY_EVIDENCE.length + " evidence records",
  evidenceClass: "team_integration",
  competency: "shadow_team_audit",
  task: [
    "A manager was asked: " + DECISION_QUESTION,
    "",
    "It was given the company state, the opportunity evidence packet, and a researcher's report of what that evidence states.",
    "It recommends; it does not execute. No external action is permitted, and any external action would require the owner's approval.",
  ].join(NL),
  output: JSON.stringify(mParsed.value, null, 1),
  packet: {
    records: [
      { id: "company", label: "Company 0 current state, as reported and as verified", body: companyPacketText() },
      { id: "opportunity", label: "The opportunity and every evidence record held about it", body: opportunityPacketText() },
      { id: "research", label: "What the researcher reported from the supplied text", body: JSON.stringify(rParsed.value, null, 1) },
      { id: "question", label: "The exact decision question the manager was asked", body: DECISION_QUESTION },
    ],
  },
  gold: { verdict: "unknown", defectClass: null, acceptableVerdicts: [...AUDIT_VERDICTS], acceptableDefectClasses: [] },
  goldAuthor: "none. This is a real decision with no answer key, and none is asserted.",
  goldRationale: "No business outcome is known, so no verdict is scored as correct. The audit is read, not marked.",
  materialEvidenceIds: ["company", "opportunity", "research"],
  falsifier: "not applicable: nothing here is scored against a reference answer.",
};
const cap = turnsWithSlack();
const auditTrace = [];
const run = await runDeskAudit(auditCase, async ({ log, turn }) => {
  if (guard.remainingFor(model) <= 0) return [];
  const history = log.map((a) => (a.kind === "tool_call"
    ? "YOU called " + a.tool + "(" + JSON.stringify(a.args || {}) + ") and received:" + NL + a.result
    : "YOU finished."));
  const input = [
    deskPrompt(auditCase), "",
    history.length ? "WHAT YOU HAVE DONE SO FAR:" + NL + history.join(NL) : "You have not opened anything yet.",
    turn === cap ? NL + "This is your last turn. You must finish now." : "",
  ].join(NL);
  const out = await call(AUDITOR_INSTRUCTIONS, input, "auditor_actions", AUDIT_ACTION_SCHEMA);
  const p = parse(out.text);
  const actions = (p.value || {}).actions || [];
  auditTrace.push({ turn, turnCap: cap, input, modelResponse: String(out.text || ""), parsedActions: actions, parseError: p.parseError, usage: out.usage || {} });
  return actions;
}, cap);

stages.auditor = {
  target: TARGETS.auditor, instructionsHash: hashes.auditor,
  toolSet: AUDIT_DESK_TOOL_SET, turnCap: cap, turnsUsed: run.turnsUsed,
  transcript: run.log.map((a) => (a.kind === "tool_call"
    ? a.tool + " " + JSON.stringify(a.args || {}) + (a.ok ? " -> opened " + (a.opened || []).join("+") : " REFUSED")
    : "finish " + a.verdict)),
  opened: run.log.filter((a) => a.kind === "tool_call").flatMap((a) => a.opened || []),
  report: run.report, inheritedKeys: inheritedKeyPaths(run.report || {}), trace: auditTrace,
};
persist("chain complete");
console.log("  AUDITOR     verdict=" + (run.report ? run.report.verdict : "none")
  + "  defects=" + ((run.report && run.report.criticalDefects) || []).length
  + "  opened=" + stages.auditor.opened.join("+") + "  turns=" + run.turnsUsed + "/" + cap);
console.log("");
console.log("  calls " + (CEILING - guard.remainingFor(model)) + "/" + CEILING
  + "   tokens " + tokens.input + " in / " + tokens.output + " out"
  + "   transport retries " + transport.attempts);
console.log("  outbound actions taken: 0");
console.log("written: var/state/company0-shadow-raw.json");
