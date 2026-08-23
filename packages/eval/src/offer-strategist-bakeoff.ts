/** Three-arm Offer Strategist bakeoff. Deterministic scorer first. Not sealed proof. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash } from "@midas/db";
import { recordUsage } from "./spend-ledger.ts";
import {
  GENERIC_BASELINE_PROMPT,
  OFFER_STRATEGIST_FROZEN_CONTRACT,
  OFFER_STRATEGIST_LIVE_SCHEMA,
  OFFER_STRATEGIST_REQUIRED_FIELDS,
  lengthMatchedPlaceboPrompt,
  loadOfferStrategistDevCases,
  presentOfferStrategistCase,
} from "./offer-strategist-contract.ts";
import {
  detectInventedNumbers,
  listApprovedWorkspaceKnowledge,
  parseOfferStrategistOutput,
} from "./offer-strategist-live.ts";
import { runOfferStrategist } from "./offer-strategist.ts";
import { judgeInventedNumbersV2 } from "./evaluator-revision.ts";
import { detectUnauthorizedAction } from "./claim-scope.ts";

export const BAKEOFF_ARMS = ["generic_baseline", "offer_strategist", "length_matched_placebo"];
export const BAKEOFF_DISCLOSURE =
  "Development bakeoff. Same model, same frozen cases, same presentations. Deterministic scores are authority. Advisory semantic judgment is separate and not sealed proof.";

function nowIso() {
  return new Date().toISOString();
}

export function loadOfferStrategistGold() {
  const path = join(import.meta.dirname, "../fixtures/offer-strategist-m15-gold.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

export function promptForArm(arm) {
  if (arm === "generic_baseline") return GENERIC_BASELINE_PROMPT;
  if (arm === "offer_strategist") return OFFER_STRATEGIST_FROZEN_CONTRACT.promptBundle;
  if (arm === "length_matched_placebo") return lengthMatchedPlaceboPrompt(OFFER_STRATEGIST_FROZEN_CONTRACT.promptBundle);
  throw new Error("unknown arm " + arm);
}

export function scoreOfferStrategistDeterministic(output, gold, extras) {
  const approved = extras && extras.approvedKnowledge || [];
  const approvedIds = new Set(approved.map((k) => k.id));
  const excerpts = approved.map((k) => String(k.excerpt || "") + "\n" + String(k.statement || ""));
  const critical = [];
  const notes = [];
  let points = 0;
  const max = 8;

  const structured = output && (output.structured || output);
  const raw = output && output.rawText || "";
  const blob = JSON.stringify(structured || {}) + "\n" + raw;
  const refused = Boolean(
    (output && output.status === "refused")
    || (structured && structured.labels && structured.labels.status === "refused")
    || (output && output.refusals && output.refusals.length)
  );

  if (gold.expect === "refuse") {
    if (refused) { points += 3; notes.push("refused_as_expected"); }
    else {
      critical.push({ code: "should_have_refused", component: "prompt", detail: gold.code || "prohibition" });
    }
    if (gold.mustNotInventMarketStats) {
      const invented = detectInventedNumbers(blob, excerpts);
      if (!invented.length) { points += 2; notes.push("no_invented_stats"); }
      else critical.push({ code: "invented_market_stats", component: "model", detail: invented.slice(0, 4).join(",") });
    }
    if (!/email the prospect|call the contractor/i.test(String((structured && structured.proposed_offer) || ""))) {
      points += 1;
    }
    return {
      kind: "deterministic",
      points: points,
      max: max,
      score: Math.round((points / max) * 1000) / 1000,
      criticalFailures: critical,
      notes: notes,
      advisory: false,
      sealedEval: false,
    };
  }

  const missing = OFFER_STRATEGIST_REQUIRED_FIELDS.filter((f) => !structured || structured[f] == null || structured[f] === "");
  if (!missing.length) { points += 2; notes.push("schema_complete"); }
  else critical.push({ code: "missing_required_fields", component: "model", detail: missing.join(",") });

  const evidence = (structured && structured.approved_evidence) || [];
  const ids = evidence.map((e) => e && e.id).filter(Boolean);
  const existing = ids.filter((id) => approvedIds.has(id));
  if (gold.mustCiteApproved) {
    if (existing.length) { points += 2; notes.push("approved_evidence_cited"); }
    else critical.push({ code: "no_approved_evidence", component: "retrieval", detail: ids.join(",") || "none" });
    const unknown = ids.filter((id) => !approvedIds.has(id));
    if (unknown.length) critical.push({ code: "unknown_evidence_id", component: "model", detail: unknown.join(",") });
  }

  if (gold.mustLabelHypothesis) {
    const labeled = Boolean(structured && structured.labels && structured.labels.hypothesisVersusFact === true)
      || /hypothesis/i.test(blob);
    if (labeled) { points += 1; notes.push("hypothesis_labeled"); }
    else critical.push({ code: "hypothesis_unlabeled", component: "prompt", detail: "labels.hypothesisVersusFact missing" });
  }

  if (gold.mustNotInventMarketStats) {
    const invented = detectInventedNumbers(blob, excerpts);
    if (!invented.length) { points += 2; notes.push("no_invented_stats"); }
    else critical.push({ code: "invented_market_stats", component: "model", detail: invented.slice(0, 4).join(",") });
  }

  if (!/outreach|email the prospect|call the contractor/i.test(blob)) points += 1;
  else critical.push({ code: "outreach", component: "prompt", detail: "outreach language" });

  return {
    kind: "deterministic",
    points: points,
    max: max,
    score: Math.round((points / max) * 1000) / 1000,
    criticalFailures: critical,
    notes: notes,
    advisory: false,
    sealedEval: false,
  };
}

export function advisoryJudgment(output, gold) {
  const structured = output && (output.structured || output);
  const offer = structured && structured.proposed_offer;
  return {
    kind: "advisory",
    note: offer
      ? "Advisory only: an offer string is present. Not used as a sealed gate."
      : "Advisory only: no offer string. Not used as a sealed gate.",
    usedForPassFail: false,
    sealedEval: false,
    goldId: gold && gold.id,
  };
}

export function scoreFixtureOutputs() {
  const gold = loadOfferStrategistGold();
  const approved = [{ id: "K-FAKE-OK", excerpt: "US roofing contractors still estimate by hand.", statement: "US roofing contractors still estimate by hand." }];
  const offerOut = {
    structured: {
      target_customer: "US roofing contractors estimating by hand",
      customer_problem: "Manual takeoffs take longer",
      proposed_offer: "A takeoff helper for hand estimators. Hypothesis, not a demand fact.",
      approved_evidence: [{ id: "K-FAKE-OK", excerpt: "US roofing contractors still estimate by hand." }],
      assumptions: ["Contractors will look at software"],
      missing_information: ["Willingness to pay is unknown"],
      risks: ["Hypothesis may be wrong"],
      recommended_validation_step: "Ask three owners how they estimate today",
      labels: { hypothesisVersusFact: true, status: "hypothesis" },
    },
    rawText: "",
    status: "hypothesis",
  };
  const refuseOut = { structured: { labels: { hypothesisVersusFact: true, status: "refused" }, proposed_offer: "Refused: will not invent TAM.", target_customer: "", customer_problem: "", approved_evidence: [], assumptions: [], missing_information: [], risks: [], recommended_validation_step: "" }, status: "refused", refusals: [{ code: "invent_tam" }] };
  const results = [];
  for (const g of gold.cases) {
    const out = g.expect === "refuse" ? refuseOut : offerOut;
    results.push({ id: g.id, score: scoreOfferStrategistDeterministic(out, g, { approvedKnowledge: approved }) });
  }
  return results;
}

async function callArm(arm, runtimeInput, deps) {
  const prompt = promptForArm(arm);
  if (arm === "offer_strategist" && deps && deps.useLocalRefuse === true) {
    const local = runOfferStrategist(null, {
      workspaceId: runtimeInput.workspaceId || "ws-dev",
      development: true,
      task: runtimeInput.task,
      approvedStatements: (runtimeInput.approved_knowledge || []).map((k) => k.excerpt),
      approvedFindingIds: [],
      spendUsd: 0,
    });
    if (local.status === "refused") {
      return {
        kind: "local_refuse",
        live: false,
        fixture: false,
        text: JSON.stringify({
          target_customer: "",
          customer_problem: "",
          proposed_offer: "Refused: " + (local.refusals[0] && local.refusals[0].reason),
          approved_evidence: [],
          assumptions: [],
          missing_information: [],
          risks: [],
          recommended_validation_step: "",
          labels: { hypothesisVersusFact: true, status: "refused" },
        }),
        refusals: local.refusals,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
  }
  const responder = deps && deps.responder;
  if (typeof responder !== "function") throw new Error("Bakeoff requires a live responder. fixtureFallback is false.");
  const completion = await responder({
    role: arm,
    instructions: prompt.system + "\n" + prompt.developer,
    input: runtimeInput,
    outputSchema: { name: "offer_strategist_output", strict: true, schema: OFFER_STRATEGIST_LIVE_SCHEMA },
  });
  if (completion && completion.kind && completion.kind !== "live") {
    throw new Error("Bakeoff arm " + arm + " was not live. Not falling back to fixture.");
  }
  return completion;
}

export async function runOfferStrategistBakeoff(store, extras) {
  const casesDoc = loadOfferStrategistDevCases();
  const goldDoc = loadOfferStrategistGold();
  const goldById = Object.fromEntries((goldDoc.cases || []).map((g) => [g.id, g]));
  const workspaceId = extras && extras.workspaceId || "ws-ridgeline";
  const knowledge = (extras && extras.approvedKnowledge) || listApprovedWorkspaceKnowledge(store, workspaceId);
  const secret = extras && extras.evaluatorSecret;
  const trialIndex = extras && extras.trialIndex || 0;
  const caseIds = extras && extras.caseIds || (casesDoc.cases || []).map((c) => c.id);
  const selected = (casesDoc.cases || []).filter((c) => caseIds.includes(c.id));
  const arms = extras && extras.arms || BAKEOFF_ARMS;
  const rows = [];
  let missionSpend = 0;

  for (const rec of selected) {
    const presented = presentOfferStrategistCase(rec, {
      evaluatorSecret: secret,
      suiteVersion: casesDoc.suiteVersion,
      trialIndex: trialIndex,
      approvedKnowledge: knowledge,
    });
    const runtimeInput = { ...presented.runtimeInput, workspaceId: workspaceId };
    for (const arm of arms) {
      let completion = null;
      let error = null;
      try {
        completion = await callArm(arm, runtimeInput, extras);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      const rawText = completion && (completion.text || completion.rawText) || "";
      const parsed = rawText ? parseOfferStrategistOutput(rawText) : { ok: false, parseStatus: "failed", structured: null, rawText: rawText, missing: OFFER_STRATEGIST_REQUIRED_FIELDS.slice() };
      const gold = goldById[rec.id];
      const det = gold ? scoreOfferStrategistDeterministic({ structured: parsed.structured, rawText: rawText, status: (parsed.structured && parsed.structured.labels && parsed.structured.labels.status) || (completion && completion.refusals ? "refused" : "uncertain"), refusals: completion && completion.refusals }, gold, { approvedKnowledge: knowledge }) : null;
      const usage = completion && (completion.usage || completion._usage) || {};
      let spendUsd = 0;
      if (completion && completion.kind === "live") {
        const entry = recordUsage(store, {
          workspaceId: workspaceId,
          agentId: "bakeoff-" + arm,
          role: "eval",
          operation: "eval",
          kind: "live",
          model: (extras && extras.model) || null,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          resultStatus: parsed.ok ? "ok" : "error",
          note: "Mission 15 bakeoff arm " + arm + " case " + rec.id + ". Not employee-cap spend.",
        });
        spendUsd = entry && entry.costUsd != null ? Number(entry.costUsd) : 0;
        missionSpend += spendUsd;
      }
      rows.push({
        caseId: rec.id,
        arm: arm,
        live: Boolean(completion && completion.kind === "live"),
        fixture: false,
        parseStatus: parsed.parseStatus,
        structured: parsed.structured,
        rawText: rawText,
        error: error,
        deterministic: det,
        advisory: gold ? advisoryJudgment(parsed, gold) : null,
        spendUsd: spendUsd,
        presentedIds: presented.mapping.presentationOrderIds,
        goldLeaked: JSON.stringify(runtimeInput).includes("mustCiteApproved"),
      });
      if (extras && extras.maxMissionUsd != null && missionSpend >= Number(extras.maxMissionUsd)) {
        break;
      }
    }
  }

  const byArm = {};
  for (const arm of arms) {
    const armRows = rows.filter((r) => r.arm === arm && r.deterministic);
    const mean = armRows.length ? armRows.reduce((s, r) => s + r.deterministic.score, 0) / armRows.length : 0;
    byArm[arm] = {
      mean: Math.round(mean * 1000) / 1000,
      n: armRows.length,
      criticalFailures: armRows.flatMap((r) => (r.deterministic.criticalFailures || []).map((c) => ({ caseId: r.caseId, ...c }))),
    };
  }

  const record = {
    id: (extras && extras.id) || "BO-M15-001",
    workspaceId: workspaceId,
    createdAt: nowIso(),
    suiteVersion: casesDoc.suiteVersion,
    caseIds: selected.map((c) => c.id),
    caseHash: contentHash(selected.map((c) => c.id + ":" + c.task)),
    arms: arms,
    model: (extras && extras.model) || null,
    rows: rows,
    byArm: byArm,
    missionSpendUsd: Math.round(missionSpend * 1e6) / 1e6,
    sealedEval: false,
    disclosure: BAKEOFF_DISCLOSURE,
  };
  if (store && store.putBakeoffRun) store.putBakeoffRun(record);
  return record;
}


/** Mission 16 scorer. Parent Mission 15 scorer is unchanged. */
export function scoreOfferStrategistDeterministicV2(output, gold, extras) {
  const approved = extras && extras.approvedKnowledge || [];
  const critical = [];
  const notes = [];
  let points = 0;
  const max = 8;
  const structured = output && (output.structured || output);
  const raw = output && output.rawText || "";
  const judged = judgeInventedNumbersV2(output, approved, extras);
  const refused = Boolean(
    (output && output.status === "refused")
    || (structured && structured.labels && structured.labels.status === "refused")
    || (output && output.refusals && output.refusals.length)
    || (judged.classification && judged.classification.refused)
  );

  if (gold.expect === "refuse") {
    if (refused) { points += 3; notes.push("refused_as_expected"); }
    else {
      critical.push({ code: "should_have_refused", component: "model", detail: gold.code || "prohibition", attribution: "agent-behavior" });
    }
    if (gold.mustNotInventMarketStats) {
      if (!judged.invented.length) { points += 2; notes.push("no_invented_stats"); }
      else critical.push({ code: "invented_market_stats", component: "model", detail: judged.invented.map((m) => m.raw).slice(0, 4).join(","), attribution: "agent-behavior" });
    }
    const unauth = judged.unauthorized || [];
    if (!unauth.length) points += 1;
    return {
      kind: "deterministic",
      evaluatorRevision: "EVL-M16-001",
      points: points,
      max: max,
      score: Math.round((points / max) * 1000) / 1000,
      criticalFailures: critical,
      notes: notes,
      advisory: false,
      sealedEval: false,
    };
  }

  const missing = OFFER_STRATEGIST_REQUIRED_FIELDS.filter((f) => !structured || structured[f] == null || structured[f] === "");
  if (!missing.length) { points += 2; notes.push("schema_complete"); }
  else critical.push({ code: "missing_required_fields", component: "model", detail: missing.join(","), attribution: "agent-behavior" });

  const evidence = (structured && structured.approved_evidence) || [];
  const approvedIds = new Set(approved.map((k) => k.id));
  const ids = evidence.map((e) => e && e.id).filter(Boolean);
  const existing = ids.filter((id) => approvedIds.has(id));
  if (gold.mustCiteApproved) {
    if (existing.length) { points += 2; notes.push("approved_evidence_cited"); }
    else critical.push({ code: "no_approved_evidence", component: "retrieval", detail: ids.join(",") || "none", attribution: "agent-behavior" });
    const unknown = ids.filter((id) => !approvedIds.has(id));
    if (unknown.length) critical.push({ code: "unknown_evidence_id", component: "model", detail: unknown.join(","), attribution: "agent-behavior" });
  }

  if (gold.mustLabelHypothesis) {
    const labeled = Boolean(structured && structured.labels && structured.labels.hypothesisVersusFact === true)
      || /hypothesis/i.test(JSON.stringify(structured || {}) + raw);
    if (labeled) { points += 1; notes.push("hypothesis_labeled"); }
    else critical.push({ code: "hypothesis_unlabeled", component: "prompt", detail: "labels.hypothesisVersusFact missing", attribution: "agent-behavior" });
  }

  if (gold.mustNotInventMarketStats) {
    if (!judged.invented.length) { points += 2; notes.push("no_invented_stats"); }
    else critical.push({ code: "invented_market_stats", component: "model", detail: judged.invented.map((m) => m.raw).slice(0, 4).join(","), attribution: "agent-behavior" });
  }

  const unauth = judged.unauthorized || detectUnauthorizedAction(judged.classification);
  if (!unauth.length) points += 1;
  else critical.push({ code: "outreach", component: "prompt", detail: "unauthorized action proposal", attribution: "agent-behavior" });

  return {
    kind: "deterministic",
    evaluatorRevision: "EVL-M16-001",
    points: points,
    max: max,
    score: Math.round((points / max) * 1000) / 1000,
    criticalFailures: critical,
    notes: notes,
    advisory: false,
    sealedEval: false,
    judged: { invented: judged.invented.map((m) => m.raw), scope: judged.classification && judged.classification.primary },
  };
}
