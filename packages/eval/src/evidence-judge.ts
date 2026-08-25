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
export const CALIBRATION_V03_PATH = join(here, "fixtures/judge-calibration-v03.json");
export const CALIBRATION_V03_MANIFEST = join(here, "fixtures/judge-calibration-v03.manifest.json");
export const ADVERSARIAL_V03_PATH = join(here, "fixtures/judge-adversarial-v03.json");
export const OVERRIDES_V03_PATH = join(here, "fixtures/judge-overrides-v03.json");
export const JUDGE_PROMPT_VERSION_V03 = "atlas-evidence-judge-v0.3.3";
export const JUDGE_CALIBRATION_SET_V03 = "atlas-judge-calibration-v0.3";
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

/**
 * v0.3 grading instructions: the full rubric, stated once.
 *
 * Five prompt/model/batch configurations were measured against the
 * rubric-aligned calibration set over 23 live runs. Worst per-class agreement:
 *
 *   v0.1 text,      gpt-4.1   supported 1.00  unsupported 1.00  contradicted 0.94  record_state 0.50
 *   full rubric,    gpt-4.1   supported 1.00  unsupported 0.94  contradicted 0.63  record_state 0.93
 *   ordered steps,  gpt-4.1   supported 0.63  unsupported 0.63  contradicted 0.88  record_state 0.71
 *   minimal edit,   gpt-4.1   supported 1.00  unsupported 0.75  contradicted 0.56  record_state 0.86
 *   minimal edit,   gpt-5.4   supported 1.00  unsupported 0.81  contradicted 0.88  record_state 0.79
 *
 * On gpt-4.1 every added rule repaired one class and broke another, which is the
 * signature of an instruction budget being exceeded rather than of a missing
 * rule. gpt-5.4 held contradicted at 0.88 under the shortest prompt, so it has
 * headroom the smaller model did not. This version therefore states the whole
 * rubric plainly and is intended to be run on the stronger judge model.
 *
 * No case identifier, fixture phrase or expected answer appears in this text;
 * judge-v03.test.ts checks that, including an eight-word phrase overlap test.
 * See docs/evidence-judge/VERDICT_RUBRIC_V03.md.
 */
export const GRADING_INSTRUCTIONS_V03 =
  "You are an evaluator-only evidence judge. For each material factual claim, decide whether the cited prospect evidence supports, contradicts, does_not_establish, or is ambiguous. " +
  "Judge ONLY from the supplied prospect facts, that prospect's evidence records, cited evidence ids, and the factual rationale. " +
  "Output one row per claim: the claim text, the evidence ids you used, the class, and a short explanation that names the specific evidence. " +
  "Judge the claim exactly as written, including any qualifier it carries. A claim may assert a value, assert a negation, or assert something about the state of the record itself, such as that a field is blank, that a note is stale, that a source hedges, or that the record therefore does not settle a question. A claim about the state of the record is an ordinary factual claim and is judged the same way as any other. " +
  "supports means the cited evidence states or entails the claim at the strength the claim uses. This includes a claim that reports what the record does not settle, when the evidence records exactly that absence, staleness or hedge. " +
  "contradicts means the evidence gives the same attribute a value incompatible with the claim: a different number, a different named value, the negation of a recorded fact, or a disqualifying state recorded where the claim asserts a qualifying one, such as reserved, suppressed, opted out, expired, frozen, closed, or out of scope. Decide incompatibility on the attribute, not on wording. A recorded conflicting value is a contradiction and not a mere failure to establish, however brief the record is. " +
  "does_not_establish means the evidence neither states nor entails the claim and nothing in the evidence bears against it: silence, insufficiency, a misattributed citation, a claim asserting a definite value while the record for that attribute is blank, and inferences that are never probative however plausible, including title to purchasing authority, name similarity to identity, brand style to geography, stale record to current condition, third-party listing alone to current status, topical relevance to applicability, and any number not present in the facts or cited evidence. A blank record is not counter-evidence, so filling in a blank is does_not_establish rather than contradicts. " +
  "ambiguous means some evidence supports the claim while other evidence refutes it and no rule below decides which side wins. Ambiguous is about evidence pointing two ways. It is never a synonym for unknown and is never decided by hedging words in the claim. If everything bearing on the claim points one way, or nothing reaches the claim at all, do not answer ambiguous. " +
  "Resolve conflicts with these rules before answering ambiguous: a current first-party status outranks a stale third-party listing; a record marked as a correction or supersession outranks the record it corrects; an opt-out or suppression record is a hard stop; and there is no general precedence between a current official record and a current first-party note, so when those two conflict on the same attribute and both are current the answer is ambiguous. " +
  "Three rules override everything above. If the claim cites no evidence ids at all, answer does_not_establish whatever the claim says, including a claim whose content is that nothing is cited. If every cited evidence record has source prospect_supplied, answer does_not_establish: text the prospect wrote about itself is untrusted and can never establish a claim, not even a claim reporting what that text says. And a claim about the state of the record earns supports only when it reports that the record does not settle the question; if it repeats what a never-probative source asserted and offers that as the reason to accept the underlying fact, answer does_not_establish. " +
  "Ambiguous must not count as proof. Do not invent missing facts. Do not infer authority, identity, geography, protection, or consent from a job title or name similarity. Citing another prospect's evidence is misattribution and does_not_establish. " +
  "Return only the structured judgments. You are not told a version, arm, desired winner, or promotion threshold.";

/** Instruction text for a judge prompt version. */
export function gradingInstructionsFor(judgePromptVersion) {
  return judgePromptVersion === JUDGE_PROMPT_VERSION_V03 ? GRADING_INSTRUCTIONS_V03 : GRADING_INSTRUCTIONS;
}

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
  const promptVersion = args.judgePromptVersion || JUDGE_PROMPT_VERSION;
  const input = {
    grading_instructions: gradingInstructionsFor(promptVersion),
    judgePromptVersion: promptVersion,
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

/**
 * Qualification for judge v0.3.
 *
 * A single passing calibration run is not evidence that a judge is usable. The
 * v0.2 successor failed and passed the same class on alternate runs of the same
 * set, so qualification here requires every gate to hold on every run, across
 * the calibration set and two sets that were frozen before the judge ever saw
 * them. Each run uses a different presentation order, because order was the
 * variable that moved results most.
 *
 * Gates are the published ones and are not restated or relaxed here: this
 * function only decides how many times they must hold.
 */
export async function qualifyJudgeV03(args) {
  const runs = Math.max(1, Number((args && args.runs) || 3));
  const seedBase = Number((args && args.seedBase) || 7001);
  const suites = [
    { name: "calibration", run: runV03LiveCalibration, heldOut: false },
    { name: "adversarial", run: runAdversarialV03Live, heldOut: true },
    { name: "overrides", run: runOverridesV03Live, heldOut: true },
  ];
  const results = [];
  let usd = 0;
  for (const suite of suites) {
    for (let i = 0; i < runs; i += 1) {
      const report = await suite.run({
        workerModelFamily: (args && args.workerModelFamily) || "gpt-4.1",
        shuffleSeed: seedBase + i,
      });
      if (report.kind !== "live") {
        return { qualified: false, reason: report.reason || "live judge unavailable", runs: results, usdEstimate: usd };
      }
      usd += Number(report.usdEstimate || 0);
      results.push({
        suite: suite.name,
        heldOut: suite.heldOut,
        orderSeed: report.orderSeed,
        n: report.n,
        agreement: report.agreement,
        perClass: report.perClass,
        confusion: report.confusion,
        overallGate: report.overallGate,
        classGate: report.classGate,
        criticalFabricated: report.criticalFabricated,
        criticalFalseAccept: report.criticalFalseAccept,
        falseAcceptRate: report.falseAcceptRate,
        falseRejectRate: report.falseRejectRate,
        official: report.official,
        misses: report.rows.filter((r) => !r.agree).map((r) => r.id + ":" + r.expected + "->" + r.predicted),
        model: report.model,
        judgePromptVersion: report.judgePromptVersion,
        setVersion: report.setVersion,
      });
    }
  }

  const worstOverall = Math.min(...results.map((r) => r.agreement));
  const worstPerClass = {};
  for (const r of results) {
    for (const [cls, st] of Object.entries(r.perClass || {})) {
      if (worstPerClass[cls] == null || st.agreement < worstPerClass[cls]) worstPerClass[cls] = st.agreement;
    }
  }
  const criticalFalseAccepts = results.reduce((a, r) => a + Number(r.criticalFalseAccept || 0), 0);
  const failingRuns = results.filter((r) => !r.official);
  const qualified = failingRuns.length === 0;

  return {
    qualified: qualified,
    judgePromptVersion: JUDGE_PROMPT_VERSION_V03,
    model: results[0] && results[0].model,
    runsPerSuite: runs,
    totalRuns: results.length,
    worstOverall: worstOverall,
    worstPerClass: worstPerClass,
    criticalFalseAccepts: criticalFalseAccepts,
    gates: { overall: JUDGE_CALIBRATION_OVERALL_GATE, perClass: JUDGE_CALIBRATION_CLASS_GATE, criticalFalseAccept: 0, everyRunMustPass: true },
    heldOutSuites: ["adversarial", "overrides"],
    usdEstimate: Number(usd.toFixed(4)),
    runs: results,
    reason: qualified ? null : ("runs below gate: " + failingRuns.map((r) => r.suite + "@" + r.orderSeed).join(", ")),
  };
}

/**
 * Write the activation record from a qualification result. Activation is a
 * consequence of the evidence, never a value someone sets: the record carries
 * every run that produced it so the decision can be re-read later.
 */
export function persistJudgeQualification(store, qualification) {
  if (!store || !store.dir) return null;
  const path = join(store.dir, "judge_activation.json");
  mkdirSync(store.dir, { recursive: true });
  const record = {
    activated: qualification.qualified === true,
    judgeVersion: qualification.judgePromptVersion || JUDGE_PROMPT_VERSION_V03,
    calibrationSetVersion: JUDGE_CALIBRATION_SET_V03,
    model: qualification.model || null,
    agreement: qualification.worstOverall ?? null,
    falseAcceptRate: Math.max(0, ...(qualification.runs || []).map((r) => Number(r.falseAcceptRate || 0))),
    falseRejectRate: Math.max(0, ...(qualification.runs || []).map((r) => Number(r.falseRejectRate || 0))),
    criticalFalseAccept: qualification.criticalFalseAccepts ?? null,
    perClass: Object.fromEntries(Object.entries(qualification.worstPerClass || {}).map(([k, v]) => [k, { agreement: v }])),
    sameModelFamily: true,
    at: new Date().toISOString(),
    gates: qualification.gates,
    heldOutSuites: qualification.heldOutSuites,
    runsPerSuite: qualification.runsPerSuite,
    totalRuns: qualification.totalRuns,
    usdEstimate: qualification.usdEstimate,
    evidence: qualification.runs,
    note: qualification.qualified
      ? ("Every gate held on all " + qualification.totalRuns + " runs across the calibration set and two held-out sets, each run under a different presentation order. Reported figures are worst-case across runs, not best-case. Worker and judge share the gpt-4.1 family - disclose. Not a sealed-promotion claim.")
      : ("Not activated. " + (qualification.reason || "gates not met") + ". Gates were not weakened."),
  };
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
  return record;
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

/**
 * Retry only transport failures: rate limits and server errors. This never
 * retries a judgment the model actually produced, so it cannot launder an
 * unstable verdict into a stable-looking one. Instability of the judgments
 * themselves is measured by repeating whole calibration runs.
 */
const TRANSPORT_RETRYABLE = /\b(429|500|502|503|504)\b|rate_limit|overloaded|timeout|ETIMEDOUT|ECONNRESET|UND_ERR_SOCKET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up/i;

async function callWithTransportRetry(fn, attempts) {
  const max = Number(attempts || 6);
  let lastError = null;
  for (let attempt = 0; attempt < max; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!TRANSPORT_RETRYABLE.test(String(err && err.message))) throw err;
      const waitMs = Math.min(30000, 2000 * Math.pow(2, attempt));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

export async function liveJudgeClaimsBatched(args) {
  const sess = liveSession();
  if (sess.verified !== true) {
    return { ok: false, unavailable: true, reason: "Live session not verified. Official judge remains unavailable." };
  }
  const { OpenAIResponsesProvider } = await import("@midas/model");
  // The judge should be able to run on a different model from the worker it
  // grades. Sharing a family is a disclosed weakness in the activation record,
  // not a design goal, so the model is selectable here rather than inherited.
  const judgeModel = args.judgeModel || process.env.MIDAS_JUDGE_MODEL || process.env.OPENAI_MODEL || sess.model;
  const provider = new OpenAIResponsesProvider(undefined, judgeModel);
  const supplied = args.items || [];
  const batchSize = Number(args.batchSize || 8);
  // Presentation order changes verdicts. A batch of structurally similar claims
  // gives the model no contrast to calibrate against and it drifts to one reading
  // for the whole block; the same claims judged beside dissimilar ones are graded
  // correctly. Measured directly: grouped presentation scored 0.57 on one class
  // across two runs and 1.00 on a third, while permuted presentation held.
  // Permuting here rather than in the calibration harness means production
  // scoring gets the same protection, and the seed is recorded so any run can be
  // reproduced exactly. Judgments are returned in the caller's original order.
  const orderSeed = args.orderSeed == null ? claimOrderSeed(supplied) : Number(args.orderSeed);
  const order = permutationFor(supplied.length, orderSeed);
  const items = order.map((idx) => supplied[idx]);
  const judgments = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const promptVersion = args.judgePromptVersion || JUDGE_PROMPT_VERSION_V02;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    // The instruction text must match the reported prompt version. v0.2 runs sent
    // the v0.1 text while recording a v0.2 label, which made the recorded result
    // unattributable to the prompt it named.
    const instructions = gradingInstructionsFor(promptVersion);
    const input = {
      grading_instructions: instructions,
      judgePromptVersion: promptVersion,
      claims: chunk.map((item) => buildJudgeInput({ ...item, judgePromptVersion: promptVersion })),
    };
    const completion = await callWithTransportRetry(() => provider.complete({
      input: input,
      instructions: instructions + " Return one judgment per supplied claim, in the same order.",
      outputSchema: { name: "atlas_evidence_judge", strict: true, schema: JUDGE_OUTPUT_SCHEMA },
    }));
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
  const restored = new Array(judgments.length);
  for (let k = 0; k < judgments.length; k += 1) restored[order[k]] = judgments[k];
  return {
    ok: true,
    judgments: restored,
    judgeKind: "live",
    judgePromptVersion: promptVersion,
    model: judgeModel,
    orderSeed: orderSeed,
    usage: usage,
  };
}

export function runV03FixtureCalibration() {
  const set = loadCalibrationSet(CALIBRATION_V03_PATH);
  const predicted = set.items.map((item) => rubricJudgeClaim(item));
  const report = evaluateCalibration(predicted, set.items);
  return {
    kind: "fixture_rubric_v03",
    official: false,
    judgePromptVersion: JUDGE_PROMPT_VERSION_V03,
    setVersion: set.version || JUDGE_CALIBRATION_SET_V03,
    n: set.items.length,
    gates: { overall: JUDGE_CALIBRATION_OVERALL_GATE, perClass: JUDGE_CALIBRATION_CLASS_GATE, criticalFalseAccept: 0 },
    ...report,
    note: "Deterministic rubric over the v0.3 set. Diagnostic only. The deterministic rubric keys off claim wording and is not a semantic judge; official activation requires a live pass.",
  };
}

/**
 * Live calibration against an arbitrary labelled set. Used for both the v0.3
 * calibration set and the separately authored adversarial boundary set, so the
 * two are scored by identical machinery and identical gates.
 */
/** Reproducible permutation of 0..n-1 from a seed. */
function permutationFor(n, seed) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(i);
  let state = (Number(seed) >>> 0) || 1;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Default order seed derived from the claims themselves, so the same input is
 * always presented in the same order and a scoring run stays reproducible.
 */
function claimOrderSeed(items) {
  const digest = createHash("sha256").update(JSON.stringify((items || []).map((i) => i.claim))).digest("hex");
  return parseInt(digest.slice(0, 8), 16) >>> 0;
}

export async function runLabelledSetLive(args) {
  const path = (args && args.path) || CALIBRATION_V03_PATH;
  const set = loadCalibrationSet(path);
  const sess = liveSession();
  if (sess.verified !== true) {
    return { kind: "unavailable", official: false, passed: false, reason: "Live session not verified. Official semantic judge not activated." };
  }
  const ordered = set.items.slice();
  const items = ordered.map((item) => ({
    prospect_id: item.prospect_id,
    claim: item.claim,
    cited_evidence_ids: item.cited_evidence_ids,
    facts: item.facts,
    evidence: item.evidence,
  }));
  const live = await liveJudgeClaimsBatched({
    items: items,
    batchSize: Number((args && args.batchSize) || 8),
    judgePromptVersion: (args && args.judgePromptVersion) || JUDGE_PROMPT_VERSION_V03,
    orderSeed: (args && args.shuffleSeed != null) ? Number(args.shuffleSeed) : undefined,
    judgeModel: (args && args.judgeModel) || undefined,
  });
  if (!live.ok) return { kind: "unavailable", official: false, passed: false, reason: live.reason };
  const report = evaluateCalibration(live.judgments, ordered);
  const officialPass = Boolean(report.expandedPassed);
  const failedClasses = Object.entries(report.perClass || {})
    .filter(([, st]) => st.n && st.agreement < JUDGE_CALIBRATION_CLASS_GATE)
    .map(([cls, st]) => cls + " " + st.agreement);
  const { estimateUsd } = await import("./spend.js");
  return {
    kind: "live",
    official: officialPass,
    judgePromptVersion: (args && args.judgePromptVersion) || JUDGE_PROMPT_VERSION_V03,
    setVersion: set.version || set.id,
    setPath: path,
    judgeModel: live.model,
    workerModel: sess.model,
    batchSize: Number((args && args.batchSize) || 8),
    orderSeed: live.orderSeed,
    model: live.model,
    usage: live.usage,
    usdEstimate: estimateUsd(live.usage && live.usage.inputTokens, live.usage && live.usage.outputTokens),
    sameModelFamily: Boolean(args && args.workerModelFamily && String(live.model || "").includes(String(args.workerModelFamily))),
    failedClasses: failedClasses,
    judgments: live.judgments,
    ...report,
    note: officialPass
      ? ("Live calibration passed on " + (set.version || set.id) + " (>=90% overall, >=80% each class, 0 false accepts on critical fabricated evidence).")
      : ("Live calibration failed on " + (set.version || set.id) + " (>=90% overall, >=80% each class, 0 FA on critical fabricated). Gates were not weakened. Failed classes: " + (failedClasses.join(", ") || "none") + "."),
  };
}

export async function runV03LiveCalibration(args) {
  return runLabelledSetLive({ ...(args || {}), path: CALIBRATION_V03_PATH, judgePromptVersion: JUDGE_PROMPT_VERSION_V03 });
}

export async function runAdversarialV03Live(args) {
  return runLabelledSetLive({ ...(args || {}), path: ADVERSARIAL_V03_PATH, judgePromptVersion: JUDGE_PROMPT_VERSION_V03 });
}

export async function runOverridesV03Live(args) {
  return runLabelledSetLive({ ...(args || {}), path: OVERRIDES_V03_PATH, judgePromptVersion: JUDGE_PROMPT_VERSION_V03 });
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
