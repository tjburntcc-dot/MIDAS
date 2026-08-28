/**
 * Would the Manager have allocated this repository's own last six missions better?
 *
 * Five checkpoints from committed history where the highest-value next action is
 * now known, because we found out the expensive way. The Manager is given the
 * state as it stood at the time and nothing about what happened next.
 *
 * This is development evidence and leverage evidence. It certifies nothing, and
 * the caveat is real: I both chose these checkpoints and know their answers, and
 * they are legible precisely because the outcome is already understood.
 *
 * Five calls. No judge, no frontier model.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import {
  MANAGER_DOCTRINE, MANAGER_VERSION_ID, MANAGER_CONTRACT_BRIEF, MANAGER_NON_RESPONSIBILITIES,
  ACTION_CLASSES, BOTTLENECKS, scoreManagerDecision,
} from "../packages/eval/src/manager.ts";
import { adaptWorker } from "../packages/eval/src/worker-adapter.ts";
import { budgetGuard } from "../packages/eval/src/call-budget.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const model = "gpt-4.1";
const provider = new OpenAIResponsesProvider(undefined, model);
const REMAINING = Number(process.env.MIDAS_MANAGER_REMAINING || 24);
const guard = budgetGuard(REMAINING, {});
const tokens = { input: 0, output: 0 };

const adapted = adaptWorker("manager", { managerKnowledge: MANAGER_DOCTRINE, managerVersionId: MANAGER_VERSION_ID });
if (!adapted.midasWorker) { console.error("Manager did not resolve."); process.exit(1); }

const HISTORY = [
  {
    id: "H-1", source: "before the generic-actor discovery",
    business: "an AI company building a workforce of specialised agents for its own first client",
    objective: "Produce a worker competent enough to be trusted with real work.",
    state: "Three rounds of certification have been run against the qualifier and all three returned low scores. The certification harness loads a base model and gives it a generic instruction to act as a competent professional. A promoted qualifier version exists, carrying operating knowledge earned through measured comparison, and the harness does not load it. Nobody has checked which actor the harness resolves. The plan is a fourth round of training.",
    known: { actions: ["run_micro_test", "research", "stop_spend"], bottlenecks: ["information", "capability"], what: "Establish which actor is being examined before training anything. The scores described a bare model, not the worker." },
  },
  {
    id: "H-2", source: "the qualification instability finding",
    business: "the same company",
    objective: "Make the qualification stage reliable enough to act on.",
    state: "One stage of a five-stage chain produces different consequential decisions on identical inputs. Broad retraining of that stage is proposed, at several days of work. Nobody has yet decomposed where the variance comes from: the same run produces identical material behaviour with a wide spread of scores, and the scorer has not been separated from the worker.",
    known: { actions: ["run_micro_test", "research"], bottlenecks: ["information"], what: "Decompose the variance before training. Most of it turned out to be the instrument, not the worker." },
  },
  {
    id: "H-3", source: "after a knowledge candidate was beaten by its own control",
    business: "the same company",
    objective: "Improve one worker's judgement.",
    state: "A knowledge pack was measured against a structure-only control and lost by a clear margin on a sealed set. The control arm scored well and was never declared as a candidate, and has no repeat-run evidence. There is pressure to promote the control on the strength of those numbers. Separately, three of five organisational roles have no worker at all.",
    known: { actions: ["decline", "defer", "manufacture_capability"], bottlenecks: ["capability"], what: "Refuse the post-hoc promotion, and spend the next unit of effort on a role that does not exist rather than on a fourth cycle of the same worker." },
  },
  {
    id: "H-4", source: "the escalation investigation, four hypotheses in",
    business: "the same company",
    objective: "Make one worker raise material ambiguities instead of guessing.",
    state: "Four explanations for the missing behaviour have each been tested and rejected: the worker's knowledge, a written procedure, a clause in the shared environment protocol, and the shape of the action schema. Each test cost a mission. A fifth explanation is proposed, of the same kind as the previous four. The behaviour appears once in roughly forty recorded runs. Meanwhile no worker in the organisation holds a tier above the second of eight, and no revenue-producing role exists.",
    known: { actions: ["stop_spend", "defer", "manufacture_capability"], bottlenecks: ["capability", "none_binding"], what: "Stop. Four rejections of the same class of explanation is the finding, and the constraint on the business is elsewhere." },
  },
  {
    id: "H-5", source: "the workstation repair that was built but not measured",
    business: "the same company",
    objective: "Decide whether to adopt a repair to shared infrastructure.",
    state: "A defect in how objects are listed was observed once. A repair exists and passes twenty-one deterministic contract tests. The comparison that would show whether it changes behaviour was mis-planned and consumed its entire budget on the control arm, so the treatment arm never ran. Adopting the repair would change an environment identifier, which by the stated rule costs every piece of the organisation's certification evidence its applicability. The control arm produced no defective behaviour at all across six cases.",
    known: { actions: ["defer", "run_micro_test", "decline"], bottlenecks: ["information"], what: "Do not adopt on an unmeasured benefit when adoption has a known, immediate, large cost. Defer until the comparison is actually run." },
  },
];

const SCHEMA = {
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

const instructions = "Operating knowledge available to you:\n" + adapted.knowledgeBlock + "\n\n"
  + MANAGER_CONTRACT_BRIEF + "\n\nYou do not do any of the following:\n" + MANAGER_NON_RESPONSIBILITIES.map((n) => "- " + n).join("\n");

console.log("leverage: " + HISTORY.length + " historical checkpoints on " + model + ", budget remaining " + REMAINING);
console.log("development evidence. Certifies nothing. The checkpoints were chosen by someone who knows their outcomes.");
console.log("");

const rows = [];
for (const h of HISTORY) {
  guard.charge(model);
  const out = await provider.complete({
    instructions, input: ["BUSINESS:", h.business, "", "OBJECTIVE:", h.objective, "", "STATE:", h.state].join("\n"),
    outputSchema: { name: "manager_decision", strict: false, schema: SCHEMA },
  });
  const u = out.usage || {};
  tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
  const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
  let d = {}; try { d = a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {}; } catch { d = {}; }
  const s = scoreManagerDecision(d, { acceptableBottlenecks: h.known.bottlenecks, acceptableActions: h.known.actions, dossierNumbers: [] });
  rows.push({
    id: h.id, source: h.source, knownBest: h.known.what,
    bottleneck: d.bindingBottleneck, action: d.selectedAction,
    actionMatched: s.actionCorrect, bottleneckMatched: s.bottleneckCorrect,
    deferred: (d.deferOrIgnore || []).slice(0, 3),
    why: String(d.whyThisWinsNow || "").slice(0, 220),
  });
  console.log("   " + h.id + " " + String(d.bindingBottleneck || "?").padEnd(18) + String(d.selectedAction || "?").padEnd(24)
    + (s.actionCorrect ? "MATCHES what proved right" : "differs from what proved right"));
}

const matched = rows.filter((r) => r.actionMatched).length;
const bnMatched = rows.filter((r) => r.bottleneckMatched).length;
console.log("");
console.log("action recovered: " + matched + "/" + rows.length + " | bottleneck recovered: " + bnMatched + "/" + rows.length);

const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("calls " + guard.total() + " | tokens " + tokens.input + " in / " + tokens.output + " out | " + cost.status);

writeFileSync(repoPath("var", "state", "manager-leverage.json"), JSON.stringify({
  at: new Date().toISOString(), model,
  status: "development and leverage evidence. Certifies nothing, promotes nothing.",
  caveat: "The checkpoints were selected by someone who knows their outcomes, and they are legible because the outcome is already understood. Evidence of leverage, not proof.",
  historyFingerprint: createHash("sha256").update(JSON.stringify(HISTORY)).digest("hex").slice(0, 16),
  rows, actionRecovered: matched, bottleneckRecovered: bnMatched, of: rows.length,
  calls: guard.total(), tokens, cost, outboundActionsTaken: 0,
}, null, 1));
