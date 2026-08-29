/**
 * Does the auditor batch its reads?
 *
 * The whole campaign budget turns on this one behaviour. At the previous desk
 * the model emitted one tool call per turn, so a case needing two records needed
 * two turns to gather. The new desk lets one call carry many ids, which makes
 * gathering one turn -- if the model uses it that way. If it does, eighteen
 * cases cost about thirty-six calls. If it does not, they cost fifty-four.
 *
 * That is the difference between a campaign that fits a budget and one that does
 * not, and it is not something to assume in either direction.
 *
 * Two throwaway cases, deliberately NOT from the sealed set, so nothing here can
 * contaminate certification evidence. This measures the instrument, not the
 * worker: no verdict is scored and no gold is defined.
 *
 * No outbound action.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import {
  runDeskAudit, deskPrompt, readingDiscipline, turnsWithSlack,
  AUDIT_DESK_PROTOCOL, AUDIT_DESK_TOOL_SET,
} from "../packages/eval/src/audit-desk.ts";
import { AUDIT_DESK_CASES } from "../packages/eval/src/audit-desk-cases.ts";
import {
  AUDITOR_DOCTRINE, AUDITOR_VERSION_ID, AUDITOR_CONTRACT_BRIEF, AUDITOR_NON_RESPONSIBILITIES,
  DEFECT_CLASSES, AUDIT_VERDICTS,
} from "../packages/eval/src/auditor.ts";
import { adaptWorker } from "../packages/eval/src/worker-adapter.ts";
import { budgetGuard } from "../packages/eval/src/call-budget.ts";

loadWorkspaceEnv("ws-hemmer");
const model = "gpt-4.1";
const MAX_TURNS = turnsWithSlack();
const CEILING = 6;
const NL = String.fromCharCode(10);
const provider = new OpenAIResponsesProvider(undefined, model);

/** Throwaway. Nothing about these is a reference answer and nothing is scored. */
const PROBE_CASES = [
  {
    id: "PROBE-2", title: "Two records", evidenceClass: "probe", competency: "instrument",
    task: "Say whether the delivery date quoted to the customer is achievable.",
    output: "The 12th is achievable. Stock is in and the fitter is free that week.",
    packet: { records: [
      { id: "stock", label: "Stock position", body: "The panel material required is in stock, four sheets, sufficient for this job." },
      { id: "diary", label: "Fitting diary", body: "The fitter is committed to another site for the whole of the week containing the 12th." },
    ] },
    gold: { verdict: "fail", defectClass: null, acceptableVerdicts: [], acceptableDefectClasses: [] },
    goldAuthor: "probe, not scored", goldRationale: "not scored", materialEvidenceIds: ["stock", "diary"],
    falsifier: "If this were a certification case it would have one.",
  },
  {
    id: "PROBE-4", title: "Four records", evidenceClass: "probe", competency: "instrument",
    task: "Say whether the discount applied to this order was permitted.",
    output: "Permitted. A 15 per cent discount is within the standard band for an order of this size.",
    packet: { records: [
      { id: "order", label: "The order", body: "Order value before discount $8,400. Discount applied 15 per cent." },
      { id: "discount-policy", label: "Discount policy", body: "Discounts up to 10 per cent may be applied by anyone. Above 10 per cent requires the owner in writing." },
      { id: "approvals", label: "Approvals on file", body: "No written approval is recorded against this order." },
      { id: "customer", label: "Customer record", body: "Third order this year. Pays to terms. No disputes." },
    ] },
    gold: { verdict: "fail", defectClass: null, acceptableVerdicts: [], acceptableDefectClasses: [] },
    goldAuthor: "probe, not scored", goldRationale: "not scored", materialEvidenceIds: ["discount-policy", "approvals"],
    falsifier: "If this were a certification case it would have one.",
  },
];

const sealedIds = new Set(AUDIT_DESK_CASES.map((c) => c.id));
for (const c of PROBE_CASES) {
  if (sealedIds.has(c.id)) { console.error("A probe case collides with the sealed set: " + c.id); process.exit(1); }
}

const ACTION_SCHEMA = {
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

const adapted = adaptWorker("auditor", { auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID });
const BOUNDARIES = NL + NL + "You do not do any of the following:" + NL + AUDITOR_NON_RESPONSIBILITIES.map((n) => "- " + n).join(NL);
const INSTRUCTIONS = [
  "Operating knowledge available to you:", adapted.knowledgeBlock, "",
  AUDITOR_CONTRACT_BRIEF + BOUNDARIES, "", AUDIT_DESK_PROTOCOL,
].join(NL);
const instructionsHash = createHash("sha256").update(INSTRUCTIONS).digest("hex").slice(0, 16);

console.log("INSTRUMENT PROBE: does the auditor batch its reads?");
console.log("  two throwaway cases, " + MAX_TURNS + " turns each, ceiling " + CEILING + ". Nothing is scored and nothing is certified.");
console.log("  instructions sha " + instructionsHash + " -- identical to the campaign's");
console.log("");

const guard = budgetGuard(CEILING, {});
const tokens = { input: 0, output: 0 };
const rows = [];
for (const c of PROBE_CASES) {
  const trace = [];
  const run = await runDeskAudit(c, async ({ log, turn }) => {
    if (guard.remainingFor(model) <= 0) return [];
    const history = log.map((a) => (a.kind === "tool_call"
      ? "YOU called " + a.tool + "(" + JSON.stringify(a.args || {}) + ") and received:" + NL + a.result
      : "YOU finished."));
    const input = [
      deskPrompt(c), "",
      history.length ? "WHAT YOU HAVE DONE SO FAR:" + NL + history.join(NL) : "You have not opened anything yet.",
      turn === MAX_TURNS ? NL + "This is your last turn. You must finish now." : "",
    ].join(NL);
    guard.charge(model);
    const out = await provider.complete({ instructions: INSTRUCTIONS, input, outputSchema: { name: "auditor_actions", strict: false, schema: ACTION_SCHEMA } });
    const u = out.usage || {};
    tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
    const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
    let actions = []; let parseError = null;
    try { actions = a >= 0 ? (JSON.parse(t.slice(a, b + 1)).actions || []) : []; } catch (e) { parseError = String(e && e.message); }
    trace.push({ turn, input, modelResponse: t, parsedActions: actions, parseError });
    return actions;
  }, MAX_TURNS);

  const disc = readingDiscipline(c, run.log);
  const readCalls = run.log.filter((a) => a.kind === "tool_call" && a.tool === "read_evidence");
  const maxIdsInOneCall = readCalls.reduce((n, a) => Math.max(n, Array.isArray(a.args?.ids) ? a.args.ids.length : 0), 0);
  rows.push({
    caseId: c.id, records: c.packet.records.length,
    turnsUsed: run.turnsUsed, finished: Boolean(run.report),
    readCalls: readCalls.length, maxIdsInOneCall,
    recordsOpened: disc.recordsOpened, materialComplete: disc.materialComplete,
    transcript: run.log.map((a) => (a.kind === "tool_call" ? a.tool + " " + JSON.stringify(a.args || {}) : "finish " + a.verdict)),
    trace,
  });
  console.log("  " + c.id.padEnd(9) + c.packet.records.length + " records  turns " + run.turnsUsed
    + "  read calls " + readCalls.length + "  most ids in one call " + maxIdsInOneCall
    + "  opened " + disc.recordsOpened + "/" + c.packet.records.length
    + (run.report ? "  finished" : "  NO VERDICT"));
  console.log("     " + JSON.stringify(rows[rows.length - 1].transcript));
}

const batches = rows.every((r) => r.maxIdsInOneCall > 1);
const turnsPerCase = Math.max(...rows.map((r) => r.turnsUsed));
const allFinished = rows.every((r) => r.finished);
console.log("");
console.log("  batches ids in one call : " + (batches ? "YES" : "NO"));
console.log("  worst turns observed    : " + turnsPerCase + " of " + MAX_TURNS);
console.log("  every case reached a verdict: " + allFinished);
console.log("");
const projectedWorst = 18 * MAX_TURNS;
const projectedObserved = 18 * turnsPerCase;
console.log("  PROJECTION FOR THE 18-CASE CAMPAIGN");
console.log("    at the observed turn count : " + projectedObserved + " worker calls");
console.log("    at the budgeted cap        : " + projectedWorst + " worker calls");

writeFileSync(repoPath("var", "state", "audit-desk-instrument-probe.json"), JSON.stringify({
  at: new Date().toISOString(), model, calls: guard.total(), ceiling: CEILING, tokens,
  instructionsHash, maxTurns: MAX_TURNS,
  batchesIds: batches, worstTurnsObserved: turnsPerCase, allFinished,
  projection: { cases: 18, atObservedTurns: projectedObserved, atBudgetedCap: projectedWorst },
  rows,
  evidenceStatus: "Instrument measurement on throwaway cases. Not certification evidence, not scored against gold, bound to no target.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("calls " + guard.total() + "/" + CEILING + " | tokens " + tokens.input + " in / " + tokens.output + " out");
console.log("written: var/state/audit-desk-instrument-probe.json");
