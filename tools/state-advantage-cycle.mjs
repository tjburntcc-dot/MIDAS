/**
 * Does knowing a company's history create decision value over being told it?
 *
 *   A  raw         everything, in the order it happened, as prose
 *   B  structured  the same items, sorted and labelled current or superseded
 *   C  stateful    the same items behind list_state and read_state
 *
 * One list of facts, three renderings, generated from that list. A parity test
 * asserts no arm can hold a fact another lacks, and the listing in arm C never
 * shows content, so what it opens is part of what is measured.
 *
 * Budgets are reserved per arm and computed from turns. Arms A and B cannot
 * consume arm C's multi-turn capacity, which is the failure that ruined an
 * earlier comparison.
 *
 * This experiment certifies nothing and promotes nothing.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import {
  renderChronologicalDossier, renderStructuredState, listState, readState,
  parityAudit, suppliedNumbers, STATE_INTERFACE_BRIEF,
} from "../packages/eval/src/company-state.ts";
import { STATE_CASES, caseCoverage } from "../packages/eval/src/state-advantage-cases.ts";
import {
  MANAGER_CONTRACT_BRIEF, MANAGER_NON_RESPONSIBILITIES, ACTION_CLASSES, BOTTLENECKS,
  scoreManagerDecision, summariseManagerRun,
} from "../packages/eval/src/manager.ts";
import { adaptWorker } from "../packages/eval/src/worker-adapter.ts";
import { executionEnvironmentId, currentExecutionEnvironment } from "../packages/eval/src/execution-environment.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const model = "gpt-4.1";
const provider = DRY ? null : new OpenAIResponsesProvider(undefined, model);
const NL = String.fromCharCode(10);

const CASES = STATE_CASES;
const RESERVE = { A_raw: CASES.length * 1, B_structured: CASES.length * 1, C_stateful: CASES.length * 3 };
const PLANNED_MAX = RESERVE.A_raw + RESERVE.B_structured + RESERVE.C_stateful;
const PLANNED_MIN = CASES.length * 3;
const CEILING = 45;

/**
 * Per-arm reserves, so a greedy arm cannot starve another. Last time a control
 * arm consumed an entire ceiling and the treatment never ran.
 */
const spent = { A_raw: 0, B_structured: 0, C_stateful: 0 };
function charge(arm) {
  if (spent[arm] >= RESERVE[arm]) throw new Error("reserve exhausted for " + arm);
  const total = Object.values(spent).reduce((a, b) => a + b, 0);
  if (total >= CEILING) throw new Error("mission ceiling reached");
  spent[arm] += 1;
}
const totalCalls = () => Object.values(spent).reduce((a, b) => a + b, 0);
const tokens = { input: 0, output: 0 };

/** Frozen before execution. */
const INTERPRETATION = {
  materialMargin: 0.20,
  note: "A margin of 0.20 on seven cases is between one and two cases. Reported with that resolution stated rather than hidden, and no outcome is claimed on a single case.",
  outcomes: {
    O1: "A about B about C -> no state architecture advantage; do not build state infrastructure",
    O2: "B > A and C about B -> structured state adds value; tool-mediated access does not yet",
    O3: "C > A and C > B -> stateful access advantage; test which property matters before building",
    O4: "C worse -> friction or retrieval failure; diagnose, do not scale",
    O5: "all arms near perfect -> benchmark not discriminative; inconclusive",
  },
};

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

/** Arm C acts, then decides. Same action vocabulary as the sandbox. */
const STATEFUL_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["kind"],
    properties: {
      kind: { type: "string" }, tool: { type: "string" },
      args: { type: "object", additionalProperties: true, properties: {} },
      decision: DECISION_SCHEMA,
    } } } },
};

const adapted = adaptWorker("manager", {});
const BOUNDARIES = NL + NL + "You do not do any of the following:" + NL + MANAGER_NON_RESPONSIBILITIES.map((n) => "- " + n).join(NL);

const RAW_INSTRUCTION = "Given this company history and current objective, choose the single highest-value legitimate next action and explain why. Return JSON matching the schema.";

async function call(arm, instructions, input, schema) {
  charge(arm);
  const out = await provider.complete({ instructions, input, outputSchema: { name: "manager_decision", strict: false, schema } });
  const u = out.usage || {};
  tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
  const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
  try { return a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {}; } catch { return {}; }
}

async function runStateful(c) {
  const instructions = MANAGER_CONTRACT_BRIEF + BOUNDARIES + NL + NL + STATE_INTERFACE_BRIEF
    + NL + NL + "Return JSON with an 'actions' array. Each action has kind = tool_call or decide."
    + " For tool_call include 'tool' (list_state or read_state) and 'args'."
    + " For decide include 'decision' matching the decision schema. Decide when you have enough.";
  const log = [];
  const opened = [];
  let decision = null;
  for (let turn = 0; turn < 3 && spent.C_stateful < RESERVE.C_stateful; turn++) {
    const transcript = log.length ? log.join(NL) : "(nothing opened yet)";
    const r = await call("C_stateful", instructions,
      ["COMPANY: " + c.state.company, "OBJECTIVE: " + c.state.objective, "", "WHAT YOU HAVE DONE SO FAR:", transcript].join(NL),
      STATEFUL_SCHEMA);
    const actions = r.actions || [];
    if (!actions.length) break;
    let done = false;
    for (const a of actions) {
      if (a.kind === "decide" && a.decision) { decision = a.decision; done = true; break; }
      if (a.kind === "tool_call" && a.tool === "list_state") {
        log.push("list_state(" + JSON.stringify(a.args || {}) + ") -> " + NL + listState(c.state, a.args && a.args.kind));
      } else if (a.kind === "tool_call" && a.tool === "read_state") {
        const id = String((a.args || {}).id);
        const res = readState(c.state, id);
        if (res.ok) opened.push(id);
        log.push("read_state(" + JSON.stringify(a.args || {}) + ") -> " + res.output);
      }
    }
    if (done) break;
  }
  return { decision: decision || {}, opened: [...new Set(opened)], turns: log.length };
}

// --------------------------------------------------------------- scoring

function stateMetrics(c, d, opened) {
  const prose = [d.bottleneckReasoning, d.whyThisWinsNow, d.whyNotAlternatives,
    ...(d.facts || []), ...(d.candidateActions || []).map((x) => x.rationale)].filter(Boolean).join(" ").toLowerCase();
  const hit = (toks) => toks.some((t) => prose.includes(String(t).toLowerCase()));
  const relevant = c.gold.relevantItemIds, irrelevant = c.gold.irrelevantItemIds;
  return {
    usedStaleState: c.gold.staleTokens.length ? hit(c.gold.staleTokens) : null,
    usedCurrentState: c.gold.currentTokens.length ? hit(c.gold.currentTokens) : null,
    usedMemory: hit(c.gold.memoryTokens),
    memoryKind: c.gold.memoryKind,
    relevantOpened: opened ? relevant.filter((i) => opened.includes(i)).length : null,
    relevantTotal: relevant.length,
    relevantMissed: opened ? relevant.filter((i) => !opened.includes(i)) : null,
    irrelevantOpened: opened ? irrelevant.filter((i) => opened.includes(i)).length : null,
    staleOpened: opened ? c.state.items.filter((i) => i.status !== "current" && opened.includes(i.id)).map((i) => i.id) : null,
  };
}

function summariseState(rows) {
  const r = (k, want) => {
    const s = rows.filter((x) => x.state[k] !== null && x.state[k] !== undefined);
    return s.length ? Number((s.filter((x) => x.state[k] === want).length / s.length).toFixed(3)) : null;
  };
  const withOpen = rows.filter((x) => x.state.relevantOpened !== null);
  return {
    staleUseRate: r("usedStaleState", true),
    currentStateUse: r("usedCurrentState", true),
    memoryUse: r("usedMemory", true),
    relevantRetrieval: withOpen.length
      ? Number((withOpen.reduce((a, x) => a + x.state.relevantOpened / x.state.relevantTotal, 0) / withOpen.length).toFixed(3)) : null,
    irrelevantOpened: withOpen.length ? withOpen.reduce((a, x) => a + x.state.irrelevantOpened, 0) : null,
  };
}

// ----------------------------------------------------------------- run

const parity = CASES.map((c) => ({ id: c.id, ...parityAudit(c.state) }));
const parityOk = parity.every((p) => p.parity);
const fingerprint = createHash("sha256").update(JSON.stringify(CASES)).digest("hex").slice(0, 16);

console.log("PHASE 0 -- parity and plan");
console.log("   cases " + CASES.length + " | fingerprint " + fingerprint + " | " + JSON.stringify(caseCoverage()));
console.log("   information parity across all three renderings: " + (parityOk ? "PROVEN" : "FAILED"));
if (!parityOk) { console.error("Parity failed; the variable would be information rather than representation. Stopping."); process.exit(2); }
console.log("   listing leaks content: none (asserted by test)");
console.log("   execution environment: " + executionEnvironmentId() + " " + JSON.stringify(currentExecutionEnvironment()));
console.log("   manager path: this experiment uses the contract only, no doctrine; adaptWorker('manager') resolves=" + adapted.midasWorker);
console.log("");
console.log("   planned minimum calls: " + PLANNED_MIN + " (one per case per arm, arm C deciding on its first turn)");
console.log("   planned maximum calls: " + PLANNED_MAX + " of a " + CEILING + " ceiling");
console.log("   reserves: " + JSON.stringify(RESERVE) + " -- A and B cannot consume C's capacity");
console.log("   interpretation frozen: margin " + INTERPRETATION.materialMargin + ". " + INTERPRETATION.note);
console.log("");

if (DRY) { console.log("--dry: no model calls made."); process.exit(0); }

const results = {};
for (const arm of ["A_raw", "B_structured", "C_stateful"]) {
  console.log(arm);
  const rows = [];
  for (const c of CASES) {
    const supplied = suppliedNumbers(c.state);
    const gold = { ...c.gold, dossierNumbers: supplied };
    let d, opened = null, turns = null;
    if (arm === "A_raw") {
      d = await call(arm, RAW_INSTRUCTION, renderChronologicalDossier(c.state), DECISION_SCHEMA);
    } else if (arm === "B_structured") {
      d = await call(arm, MANAGER_CONTRACT_BRIEF + BOUNDARIES, renderStructuredState(c.state), DECISION_SCHEMA);
    } else {
      const r = await runStateful(c);
      d = r.decision; opened = r.opened; turns = r.turns;
    }
    const score = scoreManagerDecision(d, gold);
    const st = stateMetrics(c, d, opened);
    rows.push({ caseId: c.id, shape: c.shape, action: d.selectedAction, bottleneck: d.bindingBottleneck, score, state: st, opened, turns });
    console.log("   " + c.id + " " + c.shape.slice(0, 30).padEnd(32)
      + (score.bottleneckCorrect ? "bn+" : "bn-") + " " + (score.actionCorrect ? "act+" : "act-")
      + " " + String(d.selectedAction || "?").padEnd(23)
      + (st.usedStaleState === true ? " STALE" : "") + (st.usedMemory ? " mem" : " no-mem")
      + (opened ? " opened " + st.relevantOpened + "/" + st.relevantTotal + "+" + st.irrelevantOpened : ""));
  }
  results[arm] = { rows, decision: summariseManagerRun(rows.map((r) => r.score)), state: summariseState(rows), calls: spent[arm] };
  const m = results[arm].decision, s = results[arm].state;
  console.log("   bottleneck " + m.bottleneckAccuracy + " | action " + m.selectedActionCorrectness
    + " | defer " + m.deferKillAccuracy + " | authority " + m.authorityCorrectness
    + " | invented " + m.inventedEconomicsCount + " | unauthorised " + m.unauthorizedCommitmentCount);
  console.log("   stale " + s.staleUseRate + " | current " + s.currentStateUse + " | memory " + s.memoryUse
    + (s.relevantRetrieval !== null ? " | retrieval " + s.relevantRetrieval + " | irrelevant opened " + s.irrelevantOpened : ""));
  console.log("");
}

const A = results.A_raw, B = results.B_structured, C = results.C_stateful;
const act = (x) => x.decision.selectedActionCorrectness ?? 0;
const M = INTERPRETATION.materialMargin;
const near = (a, b) => Math.abs(a - b) < M;

let classification, interpretation;
if (act(A) >= 0.95 && act(B) >= 0.95 && act(C) >= 0.95) {
  classification = "INCONCLUSIVE";
  interpretation = "Every arm is near perfect, so the benchmark cannot discriminate. No parity claim is made.";
} else if (act(C) - act(A) >= M && act(C) - act(B) >= M) {
  classification = "STATEFUL_ACCESS_VALUE";
  interpretation = "Retrieving state beat both being told it and being shown it organised.";
} else if (act(C) + M <= Math.max(act(A), act(B))) {
  classification = "STATEFUL_REGRESSION";
  interpretation = "Tool-mediated access is worse than being handed the same facts. Diagnose retrieval before scaling anything.";
} else if (act(B) - act(A) >= M && near(act(C), act(B))) {
  classification = "STRUCTURED_STATE_VALUE";
  interpretation = "Organising the same facts helped; mediating access to them added nothing further.";
} else {
  classification = "RAW_CONTEXT_SUFFICIENT";
  interpretation = "No arm separates materially on decisions. At this complexity the model synthesises supplied history well enough.";
}

console.log("VERDICT");
console.log("   action correctness  A " + act(A) + " | B " + act(B) + " | C " + act(C));
console.log("   stale-state use     A " + A.state.staleUseRate + " | B " + B.state.staleUseRate + " | C " + C.state.staleUseRate);
console.log("   memory use          A " + A.state.memoryUse + " | B " + B.state.memoryUse + " | C " + C.state.memoryUse);
console.log("   " + classification);
console.log("   " + interpretation);

const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("");
console.log("calls " + totalCalls() + "/" + CEILING + " " + JSON.stringify(spent) + " | tokens " + tokens.input + " in / " + tokens.output + " out | " + cost.status);

writeFileSync(repoPath("var", "state", "state-advantage-cycle.json"), JSON.stringify({
  at: new Date().toISOString(), model, fingerprint, coverage: caseCoverage(),
  status: "development experiment on an architecture hypothesis. Certifies nothing, promotes nothing.",
  executionEnvironment: currentExecutionEnvironment(), executionEnvironmentId: executionEnvironmentId(),
  parity, parityProven: parityOk, interpretation: INTERPRETATION,
  plannedMin: PLANNED_MIN, plannedMax: PLANNED_MAX, ceiling: CEILING, reserves: RESERVE,
  results, classification, verdict: interpretation,
  calls: totalCalls(), callsByArm: spent, tokens, cost, outboundActionsTaken: 0,
}, null, 1));
