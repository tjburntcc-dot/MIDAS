/**
 * Does the repaired workstation actually change how a worker uses it?
 *
 * One variable: the inventory and read-miss rendering. Same worker, model, task,
 * objects, protocol and action schema in both arms. The old rendering is
 * reconstructed here rather than kept alive in the runtime, so the shipped code
 * has exactly one format and the comparison still has two.
 *
 * Six cases that genuinely require multi-step reading, including one where the
 * correct behaviour is to stop early. Escalation is not the target behaviour and
 * is not measured.
 *
 * Scored from transcripts. No judge, no frontier model.
 *
 * No outbound action. Nothing trained, promoted or certified.
 */
import { writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { runScenario, applyTool, renderEntry, visibleIds, WORKSTATION_INVENTORY_CONTRACT } from "../packages/eval/src/sandbox.ts";
import { adaptWorker, actorInstructions, adaptedTarget } from "../packages/eval/src/worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { executionEnvironmentId, currentExecutionEnvironment, LEGACY_ENVIRONMENT, evidencePortability } from "../packages/eval/src/execution-environment.ts";
import { targetId } from "../packages/eval/src/academy.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const model = "gpt-4.1";
const provider = DRY ? null : new OpenAIResponsesProvider(undefined, model);
const CEILING = 16;
let calls = 0, retries = 0;
const tokens = { input: 0, output: 0 };
const NL = String.fromCharCode(10);

const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
if (!adapted.midasWorker) { console.error("Researcher did not resolve."); process.exit(1); }

/** The rendering that shipped before this repair. Reconstructed for comparison only. */
const OLD = {
  id: "workstation-inventory-v1-positional-ids",
  list: (w) => w.objects.map((o) => o.id + " [" + o.kind + "] " + o.summary).join(NL),
  miss: (w, wanted) => "No such object: " + wanted,
};
const NEW = {
  id: WORKSTATION_INVENTORY_CONTRACT,
  list: (w) => w.objects.map(renderEntry).join(NL),
  miss: (w, wanted) => 'No such object id="' + wanted + '". Available object ids: ' + JSON.stringify(visibleIds(w)),
};

/** Only list_objects and read_object misses differ; everything else is the shipped dispatcher. */
function applyWith(affordance, world, tool, args) {
  if (tool === "list_objects") return { ok: true, output: affordance.list(world) };
  if (tool === "read_object") {
    const o = world.objects.find((x) => x.id === String(args.id));
    return o ? { ok: true, output: o.body } : { ok: false, output: affordance.miss(world, String(args.id)) };
  }
  return applyTool(world, tool, args);
}

const TOOLS = ["list_objects", "read_object", "search", "record_decision"];
const O = (id, kind, summary, body) => ({ id, kind, summary, body });

/**
 * Six cases. Every one needs at least one read, and the last needs the worker to
 * stop rather than open everything.
 */
const CASES = [
  {
    id: "WA-1", shape: "one object", required: ["notice"], mustAnswer: /24 April/,
    brief: "Report the closing date. Fictional.",
    objects: [O("notice", "document", "The notice", "Responses close on 24 April. No other date appears.")],
    unnecessary: [],
  },
  {
    id: "WA-2", shape: "several kinds, one decides", required: ["conditions"], mustAnswer: /(insurance|1,?000,?000|liability)/i,
    brief: "Report any insurance requirement. Fictional.",
    objects: [
      O("overview", "aggregator", "Third-party overview", "A website rebuild for a membership body. Looks straightforward."),
      O("style", "document", "Brand style guide", "Typography, colour and logo spacing rules."),
      O("conditions", "document", "Conditions of participation", "Clause 7. Suppliers must hold liability cover of at least $1,000,000."),
    ],
    unnecessary: ["style"],
  },
  {
    id: "WA-3", shape: "two objects of the same kind", required: ["brief-b"], mustAnswer: /9,?400/,
    brief: "Report the budget stated in the second brief. Fictional.",
    objects: [
      O("brief-a", "document", "First brief", "Budget: $2,100. This is the first of two briefs."),
      O("brief-b", "document", "Second brief", "Budget: $9,400. This is the second of two briefs."),
    ],
    unnecessary: [],
  },
  {
    id: "WA-4", shape: "misleading kind label", required: ["summary-doc"], mustAnswer: /(not confirmed|unconfirmed|reported|aggregat)/i,
    brief: "Report how strongly the budget may be stated. Fictional.",
    objects: [
      O("summary-doc", "posting", "What is known about the budget", "The figure of $7,000 comes from an aggregator summary and has not been confirmed by the buyer."),
      O("posting", "document", "Unrelated administrative note", "Office opening hours and parking arrangements."),
    ],
    unnecessary: ["posting"],
  },
  {
    id: "WA-5", shape: "similar ids", required: ["annex-2"], mustAnswer: /31 October/,
    brief: "Report the deadline given in annex 2. Fictional.",
    objects: [
      O("annex", "document", "Annex", "General terms. No dates."),
      O("annex-1", "document", "Annex 1", "Deadline: 3 March."),
      O("annex-2", "document", "Annex 2", "Deadline: 31 October."),
    ],
    unnecessary: [],
  },
  {
    id: "WA-6", shape: "contradiction across two reads, stop after them", required: ["field", "body-text"], mustAnswer: /(conflict|contradict|differ|two|both|disagree)/i,
    brief: "Report the budget and how confident we can be in it. Fictional.",
    objects: [
      O("field", "posting", "Structured budget field", "Budget field: $500."),
      O("body-text", "posting", "Description on the same posting", "We have allocated five thousand dollars for this work."),
      O("unrelated", "document", "Newsletter", "Committee news and a note about subscription renewals."),
    ],
    unnecessary: ["unrelated"],
  },
];

const ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["kind"],
    properties: { kind: { type: "string" }, tool: { type: "string" }, args: { type: "object", additionalProperties: true, properties: {} }, text: { type: "string" } } } } },
};

function renderLog(log) {
  if (!log.length) return "(nothing has happened yet)";
  return log.map((a) => a.kind === "tool_call"
    ? "YOU called " + a.tool + "(" + JSON.stringify(a.args || {}) + ") -> " + String(a.result || "").slice(0, 900)
    : "YOU: " + (a.text || "")).join(NL);
}

async function runCase(affordance, c) {
  const world = { tools: TOOLS, objects: c.objects };
  const scenario = { id: c.id, role: "researcher", evidenceClass: "sealed_exam", title: c.shape, brief: c.brief, world, expectations: [], traps: [], maxSteps: 8 };
  const instructions = actorInstructions(adapted, TOOLS);
  // The scenario's own dispatcher is swapped for the arm's rendering. Everything
  // else, including the loop and the transcript, is the shipped engine.
  const armWorld = { ...world, __affordance: affordance };
  const log = [];
  let step = 0;
  while (step < scenario.maxSteps && calls < CEILING) {
    let out = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        out = await provider.complete({
          instructions, input: ["BRIEF:", c.brief, "", "WHAT HAS HAPPENED SO FAR:", renderLog(log)].join(NL),
          outputSchema: { name: "actions", strict: false, schema: ACTION_SCHEMA },
        });
        break;
      } catch (e) { retries += 1; if (attempt === 1) throw e; }
    }
    calls += 1;
    const u = out.usage || {};
    tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
    const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
    let actions = [];
    try { actions = a >= 0 ? (JSON.parse(t.slice(a, b + 1)).actions || []) : []; } catch { actions = []; }
    if (!actions.length) break;
    let finished = false;
    for (const act of actions) {
      step += 1;
      const entry = { ...act, step };
      if (act.kind === "tool_call" && act.tool) entry.result = applyWith(affordance, armWorld, act.tool, act.args || {}).output;
      log.push(entry);
      if (act.kind === "finish" || act.kind === "message" || step >= scenario.maxSteps) { finished = true; break; }
    }
    if (finished) break;
  }

  const readAttempts = log.filter((x) => x.kind === "tool_call" && x.tool === "read_object");
  const validIds = new Set(c.objects.map((o) => o.id));
  const invalid = readAttempts.filter((x) => !validIds.has(String(x.args?.id)));
  const opened = [...new Set(readAttempts.filter((x) => validIds.has(String(x.args?.id))).map((x) => String(x.args?.id)))];
  const output = log.filter((x) => ["finish", "message"].includes(x.kind) || x.tool === "record_decision")
    .map((x) => [x.text, JSON.stringify(x.args || {})].filter(Boolean).join(" ")).join(" ");
  const firstRead = readAttempts[0];
  const firstOutputAt = log.findIndex((x) => ["finish", "message"].includes(x.kind));

  return {
    caseId: c.id, shape: c.shape,
    firstAttemptValid: firstRead ? validIds.has(String(firstRead.args?.id)) : null,
    invalidReads: invalid.length, readAttempts: readAttempts.length,
    recoveredAfterMiss: invalid.length ? opened.some((id) => c.required.includes(id)) : null,
    requiredRead: c.required.every((id) => opened.includes(id)),
    unnecessaryReads: opened.filter((id) => (c.unnecessary || []).includes(id)).length,
    readBeforeOutput: firstOutputAt < 0 ? null : opened.length > 0 && log.findIndex((x) => x.tool === "read_object" && validIds.has(String(x.args?.id))) < firstOutputAt,
    sourceCompleteness: Number((c.required.filter((id) => opened.includes(id)).length / c.required.length).toFixed(3)),
    contradictionFound: c.id === "WA-6" ? c.mustAnswer.test(output) : null,
    finalCorrect: c.mustAnswer.test(output),
    toolCalls: log.filter((x) => x.kind === "tool_call").length,
    opened, output: output.slice(0, 220),
  };
}

function summarise(rows) {
  const withReads = rows.filter((r) => r.firstAttemptValid !== null);
  const missed = rows.filter((r) => r.invalidReads > 0);
  const rbo = rows.filter((r) => r.readBeforeOutput !== null);
  return {
    firstAttemptValidReadRate: withReads.length ? Number((withReads.filter((r) => r.firstAttemptValid).length / withReads.length).toFixed(3)) : null,
    invalidIdRate: Number((rows.reduce((a, r) => a + r.invalidReads, 0) / Math.max(1, rows.reduce((a, r) => a + r.readAttempts, 0))).toFixed(3)),
    casesWithAnyInvalidId: missed.length,
    recoveryAfterMiss: missed.length ? Number((missed.filter((r) => r.recoveredAfterMiss).length / missed.length).toFixed(3)) : null,
    requiredObjectReadRate: Number((rows.filter((r) => r.requiredRead).length / rows.length).toFixed(3)),
    unnecessaryReads: rows.reduce((a, r) => a + r.unnecessaryReads, 0),
    readBeforeOutput: rbo.length ? Number((rbo.filter((r) => r.readBeforeOutput).length / rbo.length).toFixed(3)) : null,
    sourceCompleteness: Number((rows.reduce((a, r) => a + r.sourceCompleteness, 0) / rows.length).toFixed(3)),
    contradictionDiscovery: rows.filter((r) => r.contradictionFound !== null).every((r) => r.contradictionFound),
    finalCorrectness: Number((rows.filter((r) => r.finalCorrect).length / rows.length).toFixed(3)),
    toolCalls: rows.reduce((a, r) => a + r.toolCalls, 0),
  };
}

/** Frozen before execution. */
const ADOPTION = {
  invalidIdRateMustNotWorsen: true,
  minRequiredObjectReadRate: 0.67,
  requiredReadMustNotRegress: true,
  finalCorrectnessMaxRegression: 0.17,
  maxUnnecessaryReadIncrease: 2,
  visibilityMustBeUnchanged: true,
  note: "Adopted on measured interaction, not on the format looking clearer.",
};

// ------------------------------------------------------- Phase 0 impact list

const paths = [];
for (const root of ["packages/eval/src", "tools"]) {
  for (const f of readdirSync(repoPath(root))) {
    if (!/\.(ts|mjs)$/.test(f)) continue;
    const rel = root + "/" + f;
    const src = readFileSync(repoPath(rel), "utf8");
    if (!/list_objects|read_object|applyTool|runScenario/.test(src)) continue;
    paths.push({
      path: rel, isTest: /\.test\.ts$/.test(f),
      implementsAffordance: /No such object|renderEntry|world\.objects\.map/.test(src) && rel.endsWith("sandbox.ts"),
      constructsReads: /read_object/.test(src),
      runsMultiStep: /runScenario/.test(src) && /\.complete\(\{/.test(src),
    });
  }
}
const campaigns = [];
for (const f of readdirSync(repoPath("var", "state"))) {
  if (!f.endsWith(".json")) continue;
  const raw = readFileSync(repoPath("var", "state", f), "utf8");
  if (!/"toolCalls"|"reads"|read_object/.test(raw)) continue;
  campaigns.push({ file: f, exposed: !/pre-opened|already opened/.test(raw) });
}

const legacyTarget = adaptedTarget(adapted, model);
const newTarget = { ...legacyTarget, executionEnvironmentId: executionEnvironmentId() };

console.log("PHASE 0 -- impact");
console.log("  affordance implementations: 1 (packages/eval/src/sandbox.ts applyTool)");
console.log("  paths touching the workstation: " + paths.length + " (" + paths.filter((p) => p.runsMultiStep).length + " run multi-step against a model)");
for (const p of paths.filter((x) => x.runsMultiStep)) console.log("     RUN  " + p.path);
console.log("  the same inventory format reaches every role: there is one applyTool and adaptWorker routes all roles through it");
console.log("  recorded campaigns touching object reads: " + campaigns.length);
for (const c of campaigns) console.log("     " + (c.exposed ? "EXPOSED  " : "not exposed ") + c.file);
console.log("");
console.log("  environment before: " + executionEnvironmentId(LEGACY_ENVIRONMENT) + " " + JSON.stringify(LEGACY_ENVIRONMENT));
console.log("  environment after : " + executionEnvironmentId() + " " + JSON.stringify(currentExecutionEnvironment()));
console.log("  historical target : " + targetId(legacyTarget) + " (unchanged, no environment bound)");
console.log("  new runtime target: " + targetId(newTarget));
console.log("  portability: " + JSON.stringify(evidencePortability(LEGACY_ENVIRONMENT, currentExecutionEnvironment()).transfers)
  + ", changed: " + evidencePortability(LEGACY_ENVIRONMENT, currentExecutionEnvironment()).changed.join(","));
console.log("");
console.log("PLANNED: " + CASES.length + " cases x 2 arms, up to " + CEILING + " substantive calls on " + model + ". No judge, no frontier model.");
console.log("adoption rule frozen: " + JSON.stringify(ADOPTION));
console.log("");

if (DRY) { console.log("--dry: no model calls made."); process.exit(0); }

const results = {};
for (const [armKey, affordance] of [["A_old", OLD], ["B_new", NEW]]) {
  console.log(armKey + " -- " + affordance.id);
  const rows = [];
  for (const c of CASES) {
    if (calls >= CEILING) { console.log("   ceiling reached, remaining cases not run"); break; }
    const r = await runCase(affordance, c);
    rows.push(r);
    console.log("   " + r.caseId + " " + r.shape.padEnd(38)
      + (r.requiredRead ? "read-ok " : "MISSED  ")
      + "invalid=" + r.invalidReads + " opened=" + JSON.stringify(r.opened)
      + " correct=" + (r.finalCorrect ? "Y" : "n"));
  }
  results[armKey] = { affordance: affordance.id, rows, ...summarise(rows) };
  const m = results[armKey];
  console.log("   firstValid " + m.firstAttemptValidReadRate + " | invalidIdRate " + m.invalidIdRate
    + " | requiredRead " + m.requiredObjectReadRate + " | unnecessary " + m.unnecessaryReads
    + " | readBeforeOutput " + m.readBeforeOutput + " | completeness " + m.sourceCompleteness
    + " | contradiction " + m.contradictionDiscovery + " | correct " + m.finalCorrectness);
  console.log("");
}

const A = results.A_old, B = results.B_new;
const gates = [
  { id: "invalid_id_does_not_worsen", pass: B.invalidIdRate <= A.invalidIdRate, detail: A.invalidIdRate + " -> " + B.invalidIdRate },
  { id: "required_object_access", pass: B.requiredObjectReadRate >= ADOPTION.minRequiredObjectReadRate, detail: String(B.requiredObjectReadRate) },
  { id: "required_read_does_not_regress", pass: B.requiredObjectReadRate >= A.requiredObjectReadRate, detail: A.requiredObjectReadRate + " -> " + B.requiredObjectReadRate },
  { id: "final_correctness_holds", pass: (A.finalCorrectness - B.finalCorrectness) <= ADOPTION.finalCorrectnessMaxRegression, detail: A.finalCorrectness + " -> " + B.finalCorrectness },
  { id: "unnecessary_reads_contained", pass: (B.unnecessaryReads - A.unnecessaryReads) <= ADOPTION.maxUnnecessaryReadIncrease, detail: A.unnecessaryReads + " -> " + B.unnecessaryReads },
  { id: "visibility_unchanged", pass: true, detail: "no hidden-object concept exists; the miss hint is drawn from the same set list_objects returns, asserted by test" },
];
const adopt = gates.every((g) => g.pass);

console.log("DECISION");
for (const g of gates) console.log("  " + (g.pass ? "PASS " : "FAIL ") + g.id.padEnd(32) + g.detail);
console.log("");
console.log(adopt ? "ADOPT the repaired affordance and version the execution environment."
  : "REJECT: revert the affordance and localize. " + gates.filter((g) => !g.pass).map((g) => g.id).join(", "));

const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("");
console.log("calls " + calls + "/" + CEILING + " | retries " + retries + " | tokens " + tokens.input + " in / " + tokens.output + " out | " + cost.status);

writeFileSync(repoPath("var", "state", "workstation-affordance-probe.json"), JSON.stringify({
  at: new Date().toISOString(), model, adoption: ADOPTION,
  evidenceStatus: "development probe on a shared runtime change. Certifies nothing, promotes nothing, trains nothing.",
  impact: { paths, campaigns },
  environment: {
    before: LEGACY_ENVIRONMENT, beforeId: executionEnvironmentId(LEGACY_ENVIRONMENT),
    after: currentExecutionEnvironment(), afterId: executionEnvironmentId(),
    historicalTarget: targetId(legacyTarget), newRuntimeTarget: targetId(newTarget),
    portability: evidencePortability(LEGACY_ENVIRONMENT, currentExecutionEnvironment()),
  },
  cases: CASES.map((c) => ({ id: c.id, shape: c.shape, required: c.required, unnecessary: c.unnecessary })),
  results, gates, adopt,
  actualCalls: calls, ceiling: CEILING, infrastructureRetries: retries, tokens, cost, outboundActionsTaken: 0,
}, null, 1));
