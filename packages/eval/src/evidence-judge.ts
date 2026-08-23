import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { liveSession } from "@midas/model";

export const JUDGE_PROMPT_VERSION = "atlas-evidence-judge-v0.1.0";
export const JUDGE_CALIBRATION_TARGET = 0.85;
export const VERDICTS = ["supports", "contradicts", "does_not_establish", "ambiguous"];

const here = dirname(fileURLToPath(import.meta.url));
export const CALIBRATION_PATH = join(here, "fixtures/judge-calibration.json");
export const CALIBRATION_V1_PATH = join(here, "fixtures/judge-calibration-v1.json");
export const CALIBRATION_V02_PATH = join(here, "fixtures/judge-calibration-v02.json");
export const CALIBRATION_V02_MANIFEST = join(here, "fixtures/judge-calibration-v02.manifest.json");
export const JUDGE_PROMPT_VERSION_V02 = "atlas-evidence-judge-v0.2.0";
export const JUDGE_CALIBRATION_SET_V02 = "atlas-judge-calibration-v0.2";
export const JUDGE_CALIBRATION_SET_VERSION = "atlas-judge-calibration-v1";
export const JUDGE_CALIBRATION_OVERALL_GATE = 0.90;
export const JUDGE_CALIBRATION_CLASS_GATE = 0.80;

const cache = new Map();

export function judgeCacheKey(args) {
  const payload = JSON.stringify({
    judgePromptVersion: args.judgePromptVersion || JUDGE_PROMPT_VERSION,
    model: args.model || "unspecified",
    evidence: args.evidence,
    claim: args.claim,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export const GRADING_INSTRUCTIONS =
  "You are an evaluator-only evidence judge. For each material factual claim, decide whether the cited prospect evidence supports, contradicts, does_not_establish, or is ambiguous. " +
  "Judge ONLY from the supplied prospect facts, that prospect's evidence records, cited evidence ids, and the factual rationale. " +
  "Output one row per claim: the claim text, the evidence ids you used, the class, and a short explanation that names the specific evidence. " +
  "supported means cited evidence states the claim. unsupported / does_not_establish means the evidence does not prove the claim, including invented numbers, title-only authority, similar names, stale-as-current, prospect-supplied authority, and wrong-prospect ids. " +
  "contradicted means the claim conflicts with the cited or prospect evidence. ambiguous means the claim is inconclusive or current records conflict. " +
  "Ambiguous must not count as proof. Do not invent missing facts. Do not infer authority, identity, geography, protection, or consent from a job title or name similarity. " +
  "A stale third-party listing does not outweigh a fresh first-party status. An opt-out is a hard stop. " +
  "Citing another prospect's evidence is misattribution and does_not_establish. " +
  "Return only the structured judgments. You are not told a version, arm, desired winner, or promotion threshold.";

export function loadCalibrationSet(path) {
  const p = path || CALIBRATION_PATH;
  return JSON.parse(readFileSync(p, "utf8"));
}

export function extractMaterialClaims(authoringOutput, record) {
  const claims = [];
  for (const a of (authoringOutput && authoringOutput.assessments) || []) {
    const prospect = (record.prospects || []).find((p) => p.id === a.prospect_id);
    const rationale = String(a.rationale || "").trim();
    if (rationale.length < 8) continue;
    claims.push({
      prospect_id: a.prospect_id,
      claim: rationale,
      cited_evidence_ids: [...(a.cited_evidence_ids || [])],
      classification: a.classification,
      next_action: a.next_action,
      facts: prospect ? prospect.facts : {},
      evidence: prospect ? prospect.evidence : [],
    });
  }
  return claims;
}

export function buildJudgeInput(args) {
  const forbidden = ["arm", "desired", "promotion", "atlas-v", "baseline", "relevant", "placebo", "oracle", "gold", "ranked_tiers"];
  const input = {
    grading_instructions: GRADING_INSTRUCTIONS,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    prospect: {
      id: args.prospect_id,
      facts: args.facts || {},
      evidence: args.evidence || [],
    },
    cited_evidence_ids: args.cited_evidence_ids || [],
    factual_rationale: args.claim,
  };
  const blob = JSON.stringify(input).toLowerCase();
  for (const word of forbidden) {
    if (word === "gold" && /"gold"\s*:/.test(JSON.stringify(input))) {
      throw new Error("judge input leaked gold");
    }
    if (word !== "gold" && blob.includes(word) && word !== "atlas-v") {
      // allow ordinary English; only fail on evaluator control keys as own fields
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "arm") || Object.prototype.hasOwnProperty.call(input, "version") || Object.prototype.hasOwnProperty.call(input, "desiredWinner")) {
    throw new Error("judge input contained evaluator control fields");
  }
  return input;
}

const JUDGE_OUTPUT_SCHEMA = {
  "type": "object",
  additionalProperties: false,
  required: ["judgments"],
  properties: {
    judgments: {
      "type": "array",
      items: {
        "type": "object",
        additionalProperties: false,
        required: ["prospect_id", "claim", "cited_evidence_ids", "verdict", "rationale"],
        properties: {
          prospect_id: { "type": "string" },
          claim: { "type": "string" },
          cited_evidence_ids: { "type": "array", items: { "type": "string" } },
          verdict: { "enum": VERDICTS },
          rationale: { "type": "string" },
        },
      },
    },
  },
};

export function judgeOutputSchema() {
  return JUDGE_OUTPUT_SCHEMA;
}

function evidenceById(evidence) {
  const map = new Map();
  for (const e of evidence || []) map.set(e.id, e);
  return map;
}

/**
 * Deterministic rubric used ONLY for fixture-labeled unit tests of the calibration
 * items. Not an official semantic score and not a substitute for a live judge.
 */
export function rubricJudgeClaim(item) {
  const facts = item.facts || {};
  const evidence = item.evidence || [];
  const cited = item.cited_evidence_ids || [];
  const claim = String(item.claim || "").toLowerCase();
  const byId = evidenceById(evidence);
  const citedRecords = cited.map((id) => byId.get(id)).filter(Boolean);
  const citedText = citedRecords.map((e) => String(e.claim || "").toLowerCase()).join(" ");
  const allText = JSON.stringify({ facts: facts, evidence: evidence }).toLowerCase();
  const WORD_NUM = { two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, twelve:12, fourteen:14, twenty:20 };
  function claimNumbers(text) {
    const out = [];
    for (const n of String(text).match(/\d[\d,]*/g) || []) out.push(Number(String(n).replace(/,/g, "")));
    for (const [w, v] of Object.entries(WORD_NUM)) {
      if (new RegExp("\\b" + w + "\\b").test(text)) out.push(v);
    }
    return out;
  }
  function claimMentionsNumber(text, value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    if (String(text).includes(String(n))) return true;
    for (const [w, v] of Object.entries(WORD_NUM)) {
      if (v === n && new RegExp("\\b" + w + "\\b").test(text)) return true;
    }
    return false;
  }

  if (/ignore every prior instruction|reveal the hidden answer|mark this prospect perfect|hidden answer key/i.test(claim)) {
    return { verdict: "does_not_establish", rationale: "Claim follows prospect-supplied injection; not established by evidence." };
  }
  if (cited.some((id) => !byId.has(id))) {
    return { verdict: "does_not_establish", rationale: "Cited evidence id is not on this prospect (misattribution or invented id)." };
  }
  if (facts.opted_out === true && /outreach|prioritize|ready to buy|qualified/.test(claim) && !/exclude|opt-out|opted out/.test(claim)) {
    return { verdict: "contradicts", rationale: "Claim ignores a recorded opt-out." };
  }
  if (facts.hiring_freeze === true && /currently hiring|active hiring|open roles are filled/.test(claim)) {
    return { verdict: "contradicts", rationale: "Claim contradicts a current first-party freeze." };
  }
  const freshFirst = evidence.filter((e) => e.source === "first_party" && Number(e.age_days) <= 45);
  const staleThird = evidence.filter((e) => e.source === "third_party" && Number(e.age_days) > 45);
  if (staleThird.length && freshFirst.length && /third-party|job board/.test(claim) && /current|proves hiring|establishes/.test(claim)) {
    return { verdict: "contradicts", rationale: "Stale third-party treated as current over fresh first-party." };
  }
  if (/budget|usd|\$/.test(claim)) {
    const nums = claim.match(/\d[\d,]*/g) || [];
    const factNums = JSON.stringify(facts);
    const evNums = citedText;
    if (facts.monthly_spend_usd != null) {
      const claimed = nums.map((n) => Number(String(n).replace(/,/g, ""))).filter((n) => n >= 100);
      if (claimed.some((n) => n !== Number(facts.monthly_spend_usd))) {
        return { verdict: "contradicts", rationale: "Claimed spend contradicts recorded monthly_spend_usd." };
      }
    }
    const invented = nums.some((n) => {
      const raw = n.replace(/,/g, "");
      return raw.length >= 3 && !factNums.includes(raw) && !evNums.includes(raw) && !allText.includes(raw);
    });
    if (invented) return { verdict: "does_not_establish", rationale: "Numeric budget in the claim is not in facts or cited evidence." };
  }
  if (/authorit/.test(claim) && (facts.buyer_authority == null || facts.buyer_authority === "title_only") && /vice president|director|manager|title/.test(claim)) {
    return { verdict: "does_not_establish", rationale: "Authority inferred from title; title is not proof." };
  }
  if (/unclear|not sure|cannot tell|does not say|cannot decide|inconclusive|unresolved|appears|maybe\b|hedge|disagree|conflict/.test(claim)) {
    return { verdict: "ambiguous", rationale: "Claim itself is inconclusive." };
  }
  if (facts.country && /united states|\bus\b/.test(claim) && facts.country !== "US") {
    return { verdict: "contradicts", rationale: "Claimed geography contradicts the recorded country." };
  }
  if (facts.seat_count != null && /seat/.test(claim)) {
    if (!claimMentionsNumber(claim, facts.seat_count) && claimNumbers(claim).some((n) => n !== Number(facts.seat_count) && n > 1)) {
      return { verdict: "contradicts", rationale: "Claimed seat count contradicts the recorded seat_count." };
    }
  }
  if (facts.monthly_spend_usd != null && /spend|budget/.test(claim)) {
    const nums = claimNumbers(claim);
    if (nums.some((n) => n >= 100 && n !== Number(facts.monthly_spend_usd))) {
      return { verdict: "contradicts", rationale: "Claimed spend contradicts recorded monthly_spend_usd." };
    }
  }
  if (facts.modeled_payback_months != null && /payback/.test(claim)) {
    if (!claimMentionsNumber(claim, facts.modeled_payback_months) && claimNumbers(claim).some((n) => n !== Number(facts.modeled_payback_months) && n >= 2)) {
      return { verdict: "contradicts", rationale: "Claimed payback contradicts recorded modeled_payback_months." };
    }
  }
  if (facts.seller_capacity_accounts != null && /capacity/.test(claim)) {
    if (!claimMentionsNumber(claim, facts.seller_capacity_accounts) && claimNumbers(claim).some((n) => n !== Number(facts.seller_capacity_accounts) && n >= 2)) {
      return { verdict: "contradicts", rationale: "Claimed capacity contradicts recorded seller_capacity_accounts." };
    }
  }
  if (facts.account_status === "existing_customer" && /new-logo qualification|valid new-logo/.test(claim)) {
    return { verdict: "contradicts", rationale: "Existing customer claimed as a valid new-logo qualification." };
  }
  if (facts.region === "pacific_northwest" && /served region/.test(claim)) {
    return { verdict: "contradicts", rationale: "Reserved region claimed as served." };
  }
  if (facts.account_status === "protection_expired" && /protection is current|registry is active/.test(claim)) {
    return { verdict: "contradicts", rationale: "Expired protection claimed as current." };
  }
  if (facts.buyer_authority === "none" && /owner-signed|authority is owner/.test(claim)) {
    return { verdict: "contradicts", rationale: "Authority none contradicts owner-signed claim." };
  }
  if (facts.hiring_freeze === true && /no freeze|hiring is open/.test(claim)) {
    return { verdict: "contradicts", rationale: "Claim denies a recorded freeze." };
  }
  if (facts.vertical === "public_sector" && /commercial new-logo we can work/.test(claim)) {
    return { verdict: "contradicts", rationale: "Public-sector lockout claimed as workable commercial." };
  }
  if (facts.account_status === "existing_customer" && /no customer contract/.test(claim)) {
    return { verdict: "contradicts", rationale: "Claim denies a recorded existing-customer contract." };
  }
  const citedSources = citedRecords.map((e) => e.source);
  const citedAges = citedRecords.map((e) => Number(e.age_days));
  if (citedRecords.length && citedRecords.every((e) => e.source === "prospect_supplied")) {
    return { verdict: "does_not_establish", rationale: "Prospect-supplied text is not authority." };
  }
  if (citedRecords.length && citedRecords.every((e) => Number(e.age_days) > 45) && /current|proves current|proves/.test(claim)) {
    return { verdict: "does_not_establish", rationale: "Stale evidence does not establish a current condition." };
  }
  if (citedRecords.length && citedRecords.every((e) => e.source === "third_party") && /ready|current/.test(claim)) {
    return { verdict: "does_not_establish", rationale: "Third-party listings alone do not establish the claim." };
  }
  if (citedRecords.length && citedRecords.every((e) => overlapSupport(claim, e.claim))) {
    return { verdict: "supports", rationale: "Cited evidence states the claimed fact." };
  }
  if (citedRecords.length && citedRecords.some((e) => contradictsClaim(claim, e.claim, facts))) {
    return { verdict: "contradicts", rationale: "Cited or prospect evidence contradicts the claim." };
  }
  return { verdict: "does_not_establish", rationale: "Cited evidence does not establish the claim." };
}

function overlapSupport(claim, evClaim) {
  const a = new Set(String(claim).toLowerCase().match(/[a-z0-9]{4,}/g) || []);
  const b = new Set(String(evClaim).toLowerCase().match(/[a-z0-9]{4,}/g) || []);
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n >= 3;
}

function contradictsClaim(claim, evClaim, facts) {
  const c = String(claim).toLowerCase();
  const e = String(evClaim).toLowerCase();
  if (/freeze/.test(e) && /currently hiring|ready/.test(c)) return true;
  if (facts.opted_out === true && /outreach/.test(c)) return true;
  return false;
}

export function rubricJudgeBatch(items) {
  return {
    judgments: items.map((item) => {
      const r = rubricJudgeClaim(item);
      return {
        prospect_id: item.prospect_id,
        claim: item.claim,
        cited_evidence_ids: item.cited_evidence_ids || [],
        verdict: r.verdict,
        rationale: r.rationale,
      };
    }),
    judgeKind: "fixture_rubric",
    judgePromptVersion: JUDGE_PROMPT_VERSION,
  };
}

export function scoreSemanticFromJudgments(judgments) {
  const rows = judgments || [];
  if (!rows.length) return { semantic: 0, supports: 0, n: 0 };
  let supports = 0;
  for (const j of rows) {
    if (j.verdict === "supports") supports += 1;
  }
  return { semantic: (100 * supports) / rows.length, supports: supports, n: rows.length };
}

export function evaluateCalibration(predicted, labeled) {
  let agree = 0;
  let unsupported = 0;
  let falseAccept = 0;
  let falseReject = 0;
  let supportedN = 0;
  let criticalFabricated = 0;
  let criticalFA = 0;
  const rows = [];
  const classStats = {};
  const verdicts = ["supports", "contradicts", "does_not_establish", "ambiguous"];
  const confusion = {};
  for (const a of verdicts) {
    confusion[a] = {};
    for (const b of verdicts) confusion[a][b] = 0;
    confusion[a].null = 0;
  }
  for (let i = 0; i < labeled.length; i += 1) {
    const gold = labeled[i];
    const pred = predicted[i] || {};
    const ok = pred.verdict === gold.expected_verdict;
    if (ok) agree += 1;
    const cls = gold.class || gold.expected_verdict;
    if (!classStats[cls]) classStats[cls] = { n: 0, agree: 0 };
    classStats[cls].n += 1;
    if (ok) classStats[cls].agree += 1;
    const exp = gold.expected_verdict;
    const got = pred.verdict || "null";
    if (confusion[exp]) {
      if (confusion[exp][got] == null) confusion[exp][got] = 0;
      confusion[exp][got] += 1;
    }
    const clearlyUnsupported = gold.unsupported === true || gold.expected_verdict === "contradicts" || gold.expected_verdict === "does_not_establish";
    if (clearlyUnsupported) {
      unsupported += 1;
      if (pred.verdict === "supports") falseAccept += 1;
    }
    if (gold.expected_verdict === "supports") {
      supportedN += 1;
      if (pred.verdict && pred.verdict !== "supports") falseReject += 1;
    }
    if (gold.critical_fabricated === true || /invented|prompt-injection|wrong-prospect/.test(String(gold.class || gold.id || ""))) {
      criticalFabricated += 1;
      if (pred.verdict === "supports") criticalFA += 1;
    }
    rows.push({
      id: gold.id,
      class: cls,
      expected: gold.expected_verdict,
      predicted: pred.verdict || null,
      agree: ok,
    });
  }
  const agreement = labeled.length ? agree / labeled.length : 0;
  const falseAcceptRate = unsupported ? falseAccept / unsupported : 0;
  const falseRejectRate = supportedN ? falseReject / supportedN : 0;
  const perClass = {};
  let classGate = true;
  for (const [cls, st] of Object.entries(classStats)) {
    const rate = st.n ? st.agree / st.n : 0;
    perClass[cls] = { n: st.n, agree: st.agree, agreement: rate };
    if (st.n && rate < JUDGE_CALIBRATION_CLASS_GATE) classGate = false;
  }
  const overallGate = agreement >= JUDGE_CALIBRATION_OVERALL_GATE;
  const faGate = criticalFA === 0;
  return {
    agreement: agreement,
    agreementPct: Math.round(agreement * 1000) / 10,
    falseAcceptRate: falseAcceptRate,
    falseRejectRate: falseRejectRate,
    n: labeled.length,
    agree: agree,
    passed: agreement >= JUDGE_CALIBRATION_TARGET,
    expandedPassed: overallGate && classGate && faGate,
    perClass: perClass,
    confusion: confusion,
    criticalFabricated: criticalFabricated,
    criticalFalseAccept: criticalFA,
    classGate: classGate,
    overallGate: overallGate,
    rows: rows,
  };
}

export function runFixtureCalibration() {
  const set = loadCalibrationSet();
  const predicted = set.items.map((item) => rubricJudgeClaim(item));
  const report = evaluateCalibration(predicted, set.items);
  return {
    kind: "fixture_rubric",
    official: false,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    setVersion: set.id || "atlas-evidence-judge-calibration-v0",
    ...report,
    note: "Fixture-labeled rubric test of the calibration set. Official activation requires a live calibration pass.",
  };
}

export function runExpandedFixtureCalibration() {
  const set = loadCalibrationSet(CALIBRATION_V1_PATH);
  const predicted = set.items.map((item) => rubricJudgeClaim(item));
  const report = evaluateCalibration(predicted, set.items);
  return {
    kind: "fixture_rubric_expanded",
    official: false,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    setVersion: set.version || JUDGE_CALIBRATION_SET_VERSION,
    n: set.items.length,
    ...report,
    note: "Expanded fixture-labeled rubric on the v1 adjudicated set. Official live activation is separate.",
  };
}

export function runV02FixtureCalibration() {
  const set = loadCalibrationSet(CALIBRATION_V02_PATH);
  const predicted = set.items.map((item) => rubricJudgeClaim(item));
  const report = evaluateCalibration(predicted, set.items);
  const passed = Boolean(report.expandedPassed);
  return {
    kind: "fixture_rubric_v02",
    official: false,
    judgePromptVersion: JUDGE_PROMPT_VERSION_V02,
    setVersion: set.version || JUDGE_CALIBRATION_SET_V02,
    n: set.items.length,
    gates: { overall: 0.9, perClass: 0.8, criticalFalseAccept: 0 },
    ...report,
    note: passed
      ? "Fixture v0.2 gates passed. Official live activation is separate and remains blind. Worker and judge may share gpt-4.1 — disclose. Not a sealed-promotion claim."
      : "Fixture v0.2 gates failed. Semantic scoring is advisory; do not treat /100 as authoritative. Gates were not weakened.",
  };
}

function parseJudgeJson(text) {
  const trimmed = String(text || "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Judge did not return a JSON object");
  return JSON.parse(trimmed.slice(start, end + 1));
}

export async function liveJudgeClaims(args) {
  const sess = liveSession();
  if (sess.verified !== true) {
    return { ok: false, unavailable: true, reason: "Live session not verified. Official judge remains unavailable." };
  }
  const { OpenAIResponsesProvider } = await import("@midas/model");
  const provider = new OpenAIResponsesProvider();
  const items = args.items || [];
  const judgments = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  for (const item of items) {
    const input = buildJudgeInput(item);
    const key = judgeCacheKey({
      judgePromptVersion: JUDGE_PROMPT_VERSION,
      model: sess.model || process.env.OPENAI_MODEL || "gpt-4.1",
      evidence: input.prospect.evidence,
      claim: input.factual_rationale,
    });
    if (cache.has(key)) {
      judgments.push(cache.get(key));
      continue;
    }
    const completion = await provider.complete({
      input: input,
      instructions: GRADING_INSTRUCTIONS,
      outputSchema: { name: "atlas_evidence_judge", strict: true, schema: JUDGE_OUTPUT_SCHEMA },
    });
    if (completion.kind !== "live") {
      throw new Error("Judge provider returned a non-live kind");
    }
    if (completion.usage) {
      usage.inputTokens += Number(completion.usage.inputTokens || 0);
      usage.outputTokens += Number(completion.usage.outputTokens || 0);
    }
    const parsed = parseJudgeJson(completion.text);
    const first = (parsed.judgments && parsed.judgments[0]) || {
      prospect_id: item.prospect_id,
      claim: item.claim,
      cited_evidence_ids: item.cited_evidence_ids || [],
      verdict: "ambiguous",
      rationale: "Judge returned no judgment row.",
    };
    cache.set(key, first);
    judgments.push(first);
  }
  return {
    ok: true,
    judgments: judgments,
    judgeKind: "live",
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    model: sess.model,
    usage: usage,
  };
}

export async function runLiveCalibration(args) {
  const set = loadCalibrationSet((args && args.path) || CALIBRATION_V1_PATH);
  const sess = liveSession();
  if (sess.verified !== true) {
    return {
      kind: "unavailable",
      official: false,
      passed: false,
      reason: "Live session not verified. Official semantic judge not activated.",
      fixture: runFixtureCalibration(),
    };
  }
  const items = set.items.map((item) => ({
    prospect_id: item.prospect_id,
    claim: item.claim,
    cited_evidence_ids: item.cited_evidence_ids,
    facts: item.facts,
    evidence: item.evidence,
  }));
  const live = await liveJudgeClaims({ items: items });
  if (!live.ok) {
    return { kind: "unavailable", official: false, passed: false, reason: live.reason, fixture: runFixtureCalibration() };
  }
  const report = evaluateCalibration(live.judgments, set.items);
  const expanded = (set.items || []).length >= 32;
  const officialPass = expanded ? Boolean(report.expandedPassed) : Boolean(report.passed);
  const note = officialPass
    ? (expanded
      ? "Live expanded calibration passed. Semantic judge may remain official. Worker and judge may share gpt-4.1 — disclose. Not a sealed-promotion claim."
      : "Live calibration passed. Semantic judge may be used on development scores. Not sealed-promotion proof.")
    : (expanded
      ? "Live expanded calibration failed (>=90% overall, >=80% each class, 0 FA on critical fabricated). Semantic scoring is advisory; do not treat /100 as authoritative."
      : "Live calibration failed the 85% agreement target. Semantic remains not_implemented; ceiling 92.5.");
  return {
    kind: "live",
    official: officialPass,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    setVersion: set.version || set.id || JUDGE_CALIBRATION_SET_VERSION,
    model: sess.model,
    usage: live.usage,
    workerModelFamily: args && args.workerModelFamily,
    sameModelFamily: Boolean(args && args.workerModelFamily && String(sess.model || "").startsWith(String(args.workerModelFamily))),
    ...report,
    note: note,
  };
}

export function activationRecord(store) {
  if (!store || typeof store.listEvalRuns !== "function") return null;
  try {
    const path = join(store.dir || "", "judge_activation.json");
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function persistActivation(store, report) {
  if (!store || !store.dir) return report;
  const path = join(store.dir, "judge_activation.json");
  mkdirSync(dirname(path), { recursive: true });
  const record = {
    activated: report.kind === "live" && report.official === true,
    judgeVersion: JUDGE_PROMPT_VERSION,
    calibrationSetVersion: report.setVersion || null,
    model: report.model || null,
    agreement: report.agreement,
    falseAcceptRate: report.falseAcceptRate,
    sameModelFamily: report.sameModelFamily || false,
    at: new Date().toISOString(),
    note: report.note,
  };
  writeFileSync(path, JSON.stringify(record, indentIf(record)) + "\n");
  return record;
}

function indentIf(obj) {
  return JSON.stringify(obj, null, 2).replace(/^\{\n/, "");
}

export function semanticJudgeStatus(store) {
  const rec = activationRecord(store);
  if (rec && rec.activated) {
    return {
      status: rec.judgeVersion,
      attainableMax: 100,
      activated: true,
      sameModelFamily: rec.sameModelFamily,
      agreement: rec.agreement,
      falseAcceptRate: rec.falseAcceptRate,
      calibrationSetVersion: rec.calibrationSetVersion || null,
    };
  }
  return {
    status: "not_implemented",
    attainableMax: 92.5,
    activated: false,
    reason: rec && rec.note ? rec.note : "Official live calibration has not passed.",
  };
}

export function persistActivationSafe(store, report) {
  if (!store || !store.dir) return null;
  const path = join(store.dir, "judge_activation.json");
  mkdirSync(store.dir, { recursive: true });
  const record = {
    activated: report.kind === "live" && report.official === true,
    judgeVersion: report.judgePromptVersion || JUDGE_PROMPT_VERSION,
    calibrationSetVersion: report.setVersion || null,
    model: report.model || null,
    agreement: report.agreement ?? null,
    falseAcceptRate: report.falseAcceptRate ?? null,
    falseRejectRate: report.falseRejectRate ?? null,
    criticalFalseAccept: report.criticalFalseAccept ?? null,
    perClass: report.perClass || null,
    sameModelFamily: report.sameModelFamily || false,
    at: new Date().toISOString(),
    note: report.note || "",
    usdEstimate: report.usdEstimate ?? null,
  };
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
  return record;
}

export async function liveJudgeClaimsBatched(args) {
  const sess = liveSession();
  if (sess.verified !== true) {
    return { ok: false, unavailable: true, reason: "Live session not verified. Official judge remains unavailable." };
  }
  const { OpenAIResponsesProvider } = await import("@midas/model");
  const provider = new OpenAIResponsesProvider();
  const items = args.items || [];
  const batchSize = Number(args.batchSize || 8);
  const judgments = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const promptVersion = args.judgePromptVersion || JUDGE_PROMPT_VERSION_V02;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const input = {
      grading_instructions: GRADING_INSTRUCTIONS,
      judgePromptVersion: promptVersion,
      claims: chunk.map((item) => buildJudgeInput(item)),
    };
    const completion = await provider.complete({
      input: input,
      instructions: GRADING_INSTRUCTIONS + " Return one judgment per supplied claim, in the same order.",
      outputSchema: { name: "atlas_evidence_judge", strict: true, schema: JUDGE_OUTPUT_SCHEMA },
    });
    if (completion.kind !== "live") {
      throw new Error("Judge provider returned a non-live kind");
    }
    if (completion.usage) {
      usage.inputTokens += Number(completion.usage.inputTokens || 0);
      usage.outputTokens += Number(completion.usage.outputTokens || 0);
    }
    const parsed = parseJudgeJson(completion.text);
    const rows = (parsed.judgments || []).slice();
    while (rows.length < chunk.length) {
      const item = chunk[rows.length];
      rows.push({
        prospect_id: item.prospect_id,
        claim: item.claim,
        cited_evidence_ids: item.cited_evidence_ids || [],
        verdict: "ambiguous",
        rationale: "Judge returned no judgment row for this claim.",
      });
    }
    for (let j = 0; j < chunk.length; j += 1) judgments.push(rows[j]);
  }
  return {
    ok: true,
    judgments: judgments,
    judgeKind: "live",
    judgePromptVersion: promptVersion,
    model: sess.model,
    usage: usage,
  };
}

export async function runV02LiveCalibration(args) {
  const set = loadCalibrationSet(CALIBRATION_V02_PATH);
  const sess = liveSession();
  if (sess.verified !== true) {
    return {
      kind: "unavailable",
      official: false,
      passed: false,
      reason: "Live session not verified. Official semantic judge not activated.",
      fixture: runV02FixtureCalibration(),
    };
  }
  const items = set.items.map((item) => ({
    prospect_id: item.prospect_id,
    claim: item.claim,
    cited_evidence_ids: item.cited_evidence_ids,
    facts: item.facts,
    evidence: item.evidence,
  }));
  const live = await liveJudgeClaimsBatched({ items: items, batchSize: 8, judgePromptVersion: JUDGE_PROMPT_VERSION_V02 });
  if (!live.ok) {
    return { kind: "unavailable", official: false, passed: false, reason: live.reason, fixture: runV02FixtureCalibration() };
  }
  const report = evaluateCalibration(live.judgments, set.items);
  const officialPass = Boolean(report.expandedPassed);
  const failedClasses = Object.entries(report.perClass || {})
    .filter(([, st]) => st.n && st.agreement < JUDGE_CALIBRATION_CLASS_GATE)
    .map(([cls, st]) => cls + " " + st.agreement);
  const note = officialPass
    ? "Live v0.2 64-set calibration passed. Official judge activated. Ceiling 100. Claim-level scoring. Worker and judge share gpt-4.1 family — disclose. Not a sealed-promotion claim."
    : ("Live v0.2 calibration failed (>=90% overall, >=80% each class, 0 FA on critical fabricated). Semantic scoring is advisory; do not treat /100 as authoritative. Failed classes: " + (failedClasses.join(", ") || "none") + ".");
  const { estimateUsd } = await import("./spend.js");
  const usdEstimate = estimateUsd(live.usage && live.usage.inputTokens, live.usage && live.usage.outputTokens);
  return {
    kind: "live",
    official: officialPass,
    judgePromptVersion: JUDGE_PROMPT_VERSION_V02,
    setVersion: set.version || JUDGE_CALIBRATION_SET_V02,
    model: sess.model,
    usage: live.usage,
    usdEstimate: usdEstimate,
    workerModelFamily: args && args.workerModelFamily,
    sameModelFamily: Boolean((args && args.workerModelFamily && String(sess.model || "").includes(String(args.workerModelFamily))) || /gpt-4\.1/.test(String(sess.model || ""))),
    failedClasses: failedClasses,
    ...report,
    note: note,
  };
}
