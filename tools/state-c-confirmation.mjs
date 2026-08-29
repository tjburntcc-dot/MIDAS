/**
 * Arm C only, repaired, against the stored and still-valid A and B.
 *
 * Rerunning A and B would spend calls reproducing evidence that already exists
 * and was never in doubt. Only C was invalid, and only C runs here.
 *
 * Two repairs are under test. An unknown kind filter now names the kinds that
 * exist instead of returning silence, and the turn budget is four rather than
 * three, so one wasted opening guess no longer consumes the decision. Both are
 * proved deterministically before any call, and a single development smoke case
 * proves the loop completes before twenty-eight calls are committed.
 *
 * Per-case reserves, so one greedy case cannot starve the rest.
 *
 * This certifies nothing and promotes nothing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { listState, readState, suppliedNumbers, STATE_INTERFACE_BRIEF, parityAudit } from "../packages/eval/src/company-state.ts";
import { STATE_CASES, SMOKE_CASE } from "../packages/eval/src/state-advantage-cases.ts";
import {
  MANAGER_CONTRACT_BRIEF, MANAGER_NON_RESPONSIBILITIES, ACTION_CLASSES, BOTTLENECKS,
  scoreManagerDecision, summariseManagerRun,
} from "../packages/eval/src/manager.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const model = "gpt-4.1";
const provider = DRY ? null : new OpenAIResponsesProvider(undefined, model);
const NL = String.fromCharCode(10);

const TURNS_PER_CASE = 4;
const SMOKE_MAX = 4;
const CEILING = 32;
const PLANNED_MAX = STATE_CASES.length * TURNS_PER_CASE + SMOKE_MAX;

const prior = JSON.parse(readFileSync(repoPath("var", "state", "state-advantage-cycle.json"), "utf8"));
const STORED_A = prior.results.A_raw, STORED_B = prior.results.B_structured;
const fingerprint = createHash("sha256").update(JSON.stringify(STATE_CASES)).digest("hex").slice(0, 16);
if (fingerprint !== prior.fingerprint) {
  console.error("The sealed cases have changed: " + fingerprint + " vs " + prior.fingerprint + ". The comparison would not be like for like. Stopping.");
  process.exit(3);
}

let smokeCalls = 0;
const perCase = {};
const tokens = { input: 0, output: 0 };
const totalCalls = () => smokeCalls + Object.values(perCase).reduce((a, b) => a + b, 0);

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
    candidateActions: { type: "array", items: { type: "object", additionalProperties: false, required: ["action", "rationale"],
      properties: { action: { type: "string", enum: [...ACTION_CLASSES] }, rationale: { type: "string" },
        upside: { type: "string" }, downside: { type: "string" }, capitalRequired: { type: "string" },
        ownerInvolvement: { type: "string" }, timeToFeedback: { type: "string" }, reversibility: { type: "string" },
        capabilityRequired: { type: "string" }, authorityRequired: { type: "boolean" }, reasonToRejectOrSelect: { type: "string" } } } },
    selectedAction: { type: "string", enum: [...ACTION_CLASSES] },
    whyThisWinsNow: { type: "string" }, whyNotAlternatives: { type: "string" },
    capabilityRequired: { type: "string" }, authorityRequired: { type: "boolean" },
    ownerActionRequired: { type: "string" }, deferOrIgnore: { type: "array", items: { type: "string" } },
    successCondition: { type: "string" }, failureCondition: { type: "string" },
    falsifier: { type: "string" }, reassessmentTrigger: { type: "string" },
  },
};

const STATEFUL_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["kind"],
    properties: { kind: { type: "string" }, tool: { type: "string" },
      args: { type: "object", additionalProperties: true, properties: {} }, decision: DECISION_SCHEMA } } } },
};

const INSTRUCTIONS = MANAGER_CONTRACT_BRIEF
  + NL + NL + "You do not do any of the following:" + NL + MANAGER_NON_RESPONSIBILITIES.map((n) => "- " + n).join(NL)
  + NL + NL + STATE_INTERFACE_BRIEF
  + NL + NL + "Return JSON with an 'actions' array. Each action has kind = tool_call or decide."
  + " For tool_call include 'tool' (list_state or read_state) and 'args'. You may issue several tool calls in one response."
  + " For decide include 'decision'. Decide once you have enough.";

async function runCase(c, budgetKey, maxTurns) {
  perCase[budgetKey] = perCase[budgetKey] || 0;
  const log = [];
  const opened = [];
  const invalid = [];
  let decision = null, turns = 0, recoveredAfterError = false;

  for (let t = 0; t < maxTurns; t++) {
    if (perCase[budgetKey] >= maxTurns || totalCalls() >= CEILING) break;
    perCase[budgetKey] += 1; turns += 1;
    const out = await provider.complete({
      instructions: INSTRUCTIONS,
      input: ["COMPANY: " + c.state.company, "OBJECTIVE: " + c.state.objective, "",
        "WHAT YOU HAVE DONE SO FAR:", log.length ? log.join(NL) : "(nothing opened yet)"].join(NL),
      outputSchema: { name: "manager_decision", strict: false, schema: STATEFUL_SCHEMA },
    });
    const u = out.usage || {};
    tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
    const txt = String(out.text || ""); const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
    let actions = [];
    try { actions = a >= 0 ? (JSON.parse(txt.slice(a, b + 1)).actions || []) : []; } catch { actions = []; }
    if (!actions.length) break;

    const hadErrorBefore = invalid.length > 0;
    let done = false;
    for (const act of actions) {
      if (act.kind === "decide" && act.decision) { decision = act.decision; done = true; break; }
      if (act.kind === "tool_call" && act.tool === "list_state") {
        const kind = act.args && act.args.kind;
        const res = listState(c.state, kind);
        if (/^No items of kind/.test(res)) invalid.push("list_state:" + kind);
        log.push("list_state(" + JSON.stringify(act.args || {}) + ") -> " + NL + res);
      } else if (act.kind === "tool_call" && act.tool === "read_state") {
        const id = String((act.args || {}).id);
        const res = readState(c.state, id);
        if (res.ok) { opened.push(id); if (hadErrorBefore) recoveredAfterError = true; }
        else invalid.push("read_state:" + id);
        log.push("read_state(" + JSON.stringify(act.args || {}) + ") -> " + res.output);
      } else {
        invalid.push("unknown:" + String(act.kind) + "/" + String(act.tool));
      }
    }
    if (done) break;
  }
  return { decision: decision || {}, opened: [...new Set(opened)], invalid, turns, recoveredAfterError, reachedDecision: Boolean(decision) };
}

function stateMetrics(c, d, opened) {
  const prose = [d.bottleneckReasoning, d.whyThisWinsNow, d.whyNotAlternatives,
    ...(d.facts || []), ...(d.candidateActions || []).map((x) => x.rationale)].filter(Boolean).join(" ").toLowerCase();
  const hit = (toks) => toks.some((t) => prose.includes(String(t).toLowerCase()));
  const rel = c.gold.relevantItemIds, irr = c.gold.irrelevantItemIds;
  return {
    usedStaleState: c.gold.staleTokens.length ? hit(c.gold.staleTokens) : null,
    usedCurrentState: c.gold.currentTokens.length ? hit(c.gold.currentTokens) : null,
    usedMemory: hit(c.gold.memoryTokens),
    memoryKind: c.gold.memoryKind,
    relevantOpened: rel.filter((i) => opened.includes(i)).length,
    relevantTotal: rel.length,
    relevantMissed: rel.filter((i) => !opened.includes(i)),
    irrelevantOpened: irr.filter((i) => opened.includes(i)).length,
    staleOpened: c.state.items.filter((i) => i.status !== "current" && opened.includes(i.id)).map((i) => i.id),
  };
}

console.log("PHASE 0 -- harness and plan");
console.log("   sealed fingerprint " + fingerprint + " matches the stored run: yes");
console.log("   parity still holds: " + STATE_CASES.every((c) => parityAudit(c.state).parity));
console.log("   stored comparators: A action " + STORED_A.decision.selectedActionCorrectness
  + " bottleneck " + STORED_A.decision.bottleneckAccuracy
  + " | B action " + STORED_B.decision.selectedActionCorrectness + " bottleneck " + STORED_B.decision.bottleneckAccuracy);
console.log("   A and B are NOT rerun. Their stored outputs are the frozen comparators.");
console.log("   turns per case " + TURNS_PER_CASE + " | planned max " + PLANNED_MAX + " of " + CEILING
  + " (smoke up to " + SMOKE_MAX + ", then " + STATE_CASES.length * TURNS_PER_CASE + ")");
console.log("");
if (DRY) { console.log("--dry: no model calls made."); process.exit(0); }

// ------------------------------------------------------------- smoke test

const SKIP_SMOKE = process.argv.includes("--skip-smoke");
let smoke, smokeState, smokeOk;
if (SKIP_SMOKE) {
  const storedSmoke = JSON.parse(readFileSync(repoPath("var", "state", "state-c-confirmation.json"), "utf8")).smoke;
  smoke = storedSmoke; smokeState = storedSmoke.state; smokeCalls = 0;
  console.log("SMOKE (reusing the stored run; it is not paid for twice)");
  console.log("   opened " + JSON.stringify(smoke.opened) + " | invalid " + JSON.stringify(smoke.invalid)
    + " | decision " + (smoke.decision.selectedAction || "NONE") + " | turns " + smoke.turns);
} else {
console.log("SMOKE (development only, never scored in the comparison)");
smoke = await runCase(SMOKE_CASE, "smoke", SMOKE_MAX);
smokeCalls = perCase.smoke || 0; delete perCase.smoke;
smokeState = stateMetrics(SMOKE_CASE, smoke.decision, smoke.opened);
/**
 * What the smoke test is for: proving the runtime completes a case.
 *
 * The first version of this gate also required the worker to skip at least one
 * distractor, and failed a run in which the listing worked, four of four
 * relevant items were read, no call was invalid and a decision was emitted in
 * three turns. Opening everything in an eight-item store is thoroughness, not a
 * broken runtime, and selectivity is a measured metric in the real run rather
 * than a precondition for it. The criterion was testing the wrong thing and is
 * corrected here -- stated plainly, because it was changed after seeing a result.
 */
const smokeOk = smoke.reachedDecision
  && smokeState.relevantOpened >= 2
  && smoke.invalid.length === 0
  && smoke.turns <= SMOKE_MAX;
console.log("   listing succeeded: " + (smoke.opened.length > 0 || smoke.invalid.length > 0));
console.log("   opened " + JSON.stringify(smoke.opened) + " (" + smokeState.relevantOpened + "/" + smokeState.relevantTotal
  + " relevant, " + smokeState.irrelevantOpened + " irrelevant)");
console.log("   invalid calls " + JSON.stringify(smoke.invalid) + " | recovered after error: " + smoke.recoveredAfterError);
console.log("   reached a decision: " + smoke.reachedDecision + " -> " + (smoke.decision.selectedAction || "NONE"));
console.log("   turns " + smoke.turns + " | calls " + smokeCalls);
}
smokeOk = smoke.reachedDecision && smokeState.relevantOpened >= 2 && smoke.invalid.length === 0 && smoke.turns <= SMOKE_MAX;
console.log("   SMOKE " + (smokeOk ? "PASSED" : "FAILED"));
if (!smokeOk) {
  console.error("");
  console.error("The repaired runtime still does not complete a case. Stopping before the seven-case run.");
  writeFileSync(repoPath("var", "state", "state-c-confirmation.json"), JSON.stringify({
    at: new Date().toISOString(), model, status: "SMOKE_FAILED, no confirmation run attempted",
    smoke: { ...smoke, state: smokeState }, smokeCalls, tokens,
  }, null, 1));
  process.exit(4);
}
console.log("");

// -------------------------------------------------------- the seven cases

console.log("C_stateful (repaired)");
const rows = [];
for (const c of STATE_CASES) {
  const supplied = suppliedNumbers(c.state);
  const r = await runCase(c, c.id, TURNS_PER_CASE);
  const score = scoreManagerDecision(r.decision, { ...c.gold, dossierNumbers: supplied });
  const st = stateMetrics(c, r.decision, r.opened);
  rows.push({ caseId: c.id, shape: c.shape, action: r.decision.selectedAction, bottleneck: r.decision.bindingBottleneck, score, state: st, ...r });
  console.log("   " + c.id + " " + c.shape.slice(0, 30).padEnd(32)
    + (score.bottleneckCorrect ? "bn+" : "bn-") + " " + (score.actionCorrect ? "act+" : "act-")
    + " " + String(r.decision.selectedAction || "NONE").padEnd(23)
    + "turns " + r.turns + " read " + st.relevantOpened + "/" + st.relevantTotal + "+" + st.irrelevantOpened
    + (r.invalid.length ? " invalid " + r.invalid.length : "")
    + (st.usedStaleState === true ? " STALE" : "") + (st.usedMemory ? " mem" : " no-mem"));
}

const decision = summariseManagerRun(rows.map((r) => r.score));
const rate = (k, want) => {
  const s = rows.filter((x) => x.state[k] !== null && x.state[k] !== undefined);
  return s.length ? Number((s.filter((x) => x.state[k] === want).length / s.length).toFixed(3)) : null;
};
const C = {
  decision,
  state: {
    staleUseRate: rate("usedStaleState", true),
    currentStateUse: rate("usedCurrentState", true),
    memoryUse: rate("usedMemory", true),
    relevantRetrieval: Number((rows.reduce((a, r) => a + r.state.relevantOpened / r.state.relevantTotal, 0) / rows.length).toFixed(3)),
    relevantMissed: rows.reduce((a, r) => a + r.state.relevantMissed.length, 0),
    irrelevantOpened: rows.reduce((a, r) => a + r.state.irrelevantOpened, 0),
  },
  tool: {
    reachedDecision: rows.filter((r) => r.reachedDecision).length,
    invalidCalls: rows.reduce((a, r) => a + r.invalid.length, 0),
    recoveredAfterError: rows.filter((r) => r.recoveredAfterError).length,
    casesWithAnyInvalid: rows.filter((r) => r.invalid.length > 0).length,
    averageTurns: Number((rows.reduce((a, r) => a + r.turns, 0) / rows.length).toFixed(2)),
  },
};

console.log("");
console.log("   action " + decision.selectedActionCorrectness + " | bottleneck " + decision.bottleneckAccuracy
  + " | defer " + decision.deferKillAccuracy + " | authority " + decision.authorityCorrectness
  + " | invented " + decision.inventedEconomicsCount + " | unauthorised " + decision.unauthorizedCommitmentCount);
console.log("   stale " + C.state.staleUseRate + " | current " + C.state.currentStateUse + " | memory " + C.state.memoryUse
  + " | retrieval " + C.state.relevantRetrieval + " | missed " + C.state.relevantMissed + " | irrelevant " + C.state.irrelevantOpened);
console.log("   decisions " + C.tool.reachedDecision + "/" + rows.length + " | invalid calls " + C.tool.invalidCalls
  + " | recovered " + C.tool.recoveredAfterError + " | avg turns " + C.tool.averageTurns);

// ------------------------------------------------------------ comparison

const MARGIN = 0.20;
const actA = STORED_A.decision.selectedActionCorrectness, actB = STORED_B.decision.selectedActionCorrectness;
const actC = decision.selectedActionCorrectness ?? 0;
const best = Math.max(actA, actB);

let classification, interpretation;
if (actC - actA >= MARGIN && actC - actB >= MARGIN) {
  classification = "STATEFUL_ACCESS_VALUE_PROVEN";
  interpretation = "Retrieving state beat both being told it and being shown it organised, by more than the frozen margin.";
} else if (best - actC >= MARGIN) {
  classification = "STATEFUL_REGRESSION";
  interpretation = "Tool-mediated access is materially worse than being handed the same facts, on a runtime now proved to work.";
} else if (actC - actB >= MARGIN && actC - actA < MARGIN) {
  classification = "RECOVERS_STRUCTURE_ONLY";
  interpretation = "State tooling beats organised context and not raw context. No moat.";
} else {
  classification = "NOT_DEMONSTRATED";
  interpretation = "No arm separates materially. At this complexity raw context is sufficient and the tooling earns nothing.";
}

const overheadTurns = C.tool.averageTurns;
console.log("");
console.log("COMPARISON (A and B from the stored valid run)");
console.log("   action  A " + actA + " | B " + actB + " | C " + actC);
console.log("   C - A " + (actC - actA).toFixed(3) + " | C - B " + (actC - actB).toFixed(3) + " | frozen margin " + MARGIN);
console.log("   execution overhead: C averaged " + overheadTurns + " model calls per decision against 1 for A and B");
console.log("   " + classification);
console.log("   " + interpretation);

const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("");
console.log("calls " + totalCalls() + "/" + CEILING + " (smoke " + smokeCalls + ", run " + (totalCalls() - smokeCalls) + ")"
  + " | tokens " + tokens.input + " in / " + tokens.output + " out | " + cost.status);

writeFileSync(repoPath("var", "state", "state-c-confirmation.json"), JSON.stringify({
  at: new Date().toISOString(), model, fingerprint,
  status: "architecture experiment. Certifies nothing, promotes nothing. A and B reused from the stored valid run.",
  repairsUnderTest: ["unknown kind filter now names the kinds that exist", "turn budget raised from three to four"],
  smoke: { passed: smokeOk, ...smoke, state: smokeState, calls: smokeCalls },
  storedComparators: { A: STORED_A.decision, B: STORED_B.decision },
  C, rows, classification, interpretation, margin: MARGIN,
  overhead: { averageCallsPerDecision: overheadTurns, comparatorCallsPerDecision: 1 },
  calls: totalCalls(), callsByCase: perCase, smokeCalls, ceiling: CEILING, tokens, cost, outboundActionsTaken: 0,
}, null, 1));
