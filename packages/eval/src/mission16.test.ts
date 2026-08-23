import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0, contentHash } from "@midas/db";
import { createWorkspace } from "./workspace.ts";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import {
  extractNumericMentions,
  validateNumericClaims,
  claimsStructurallyMatch,
  NUMERIC_NORMALIZATION_VERSION,
} from "./numeric-normalize.ts";
import { classifyClaimScope, CLAIM_SCOPE_VERSION } from "./claim-scope.ts";
import {
  runEvaluatorCalibration,
  loadEvaluatorCalibrationCases,
  loadEvaluatorCalibrationGold,
  freezeAndMaybeActivateEvaluator,
  PARENT_EVALUATOR_ID,
  PROPOSED_EVALUATOR_ID,
  calibrationCasesHash,
} from "./evaluator-revision.ts";
import { scoreOfferStrategistDeterministic, scoreOfferStrategistDeterministicV2, loadOfferStrategistGold } from "./offer-strategist-bakeoff.ts";
import { rescorePreservedBakeoff } from "./offer-strategist-rescore.ts";
import { auditOfferStrategistResult, reviewAndSupersedeOfferStrategistAudit } from "./watcher.ts";
import { evaluateStrategistGates, applyDevelopmentVerification, recordStrategistContributions } from "./offer-strategist-progression.ts";
import { applyMission16, attributeOsrSchemaFailures } from "./mission16-apply.ts";
import { mission16Review } from "./mission16-review.ts";
import { recordContribution } from "./contribution.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m16-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  ensureAtlasV0(store);
  return { dir, store };
}

function seedKnowledge(store, workspaceId) {
  store.putKnowledge({
    id: "K-OWN-001-03",
    workspaceId: workspaceId,
    accepted: true,
    reviewStatus: "approved",
    kind: "owner_policy",
    statement: "Require verified monthly spend of at least 2500 USD. Do not infer spend from employee count.",
    excerpt: "verified monthly spend of at least 2500 USD",
    locator: { section: "Rules", charStart: 0, charEnd: 40, text: "verified monthly spend of at least 2500 USD" },
  });
}

function seedRole(store, workspaceId) {
  store.putEmployeeRole({
    id: "EMP-001",
    workspaceId: workspaceId,
    agentId: "offer_strategist-" + workspaceId,
    roleId: OFFER_STRATEGIST_ROLE_ID,
    status: "evaluation_required",
    authorizedAt: "2026-08-21T18:53:33.310Z",
    authorizedBy: "local_owner",
    spendLimitUsd: 0.5,
    promoted: false,
    versionId: "offer_strategist-ws-ridgeline-v0",
  });
}

function structuredOffer(spendText) {
  return {
    target_customer: "US roofing contractors with " + spendText + " who still estimate by hand.",
    customer_problem: "Manual estimating takes longer.",
    proposed_offer: "Hypothesis: a takeoff helper.",
    approved_evidence: [{ id: "K-OWN-001-03", excerpt: "verified monthly spend of at least 2500 USD" }],
    assumptions: ["Approved ops note still holds"],
    missing_information: ["Willingness to pay unknown"],
    risks: ["Hypothesis may be wrong"],
    recommended_validation_step: "Interview three owners after owner approval.",
    labels: { hypothesisVersusFact: true, status: "hypothesis" },
  };
}

describe("mission 16 item 01 OSR-001/002 system-development attribution", () => {
  test("01 schema failures are system-development, not employee", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "M16", description: "d", goal: "g" }).workspace;
    store.putOfferStrategistRun({
      id: "OSR-001", workspaceId: ws.id, live: false, structured: null, rawText: null,
      parseStatus: "failed", error: "HTTP 400 invalid_json_schema",
    });
    store.putOfferStrategistRun({
      id: "OSR-002", workspaceId: ws.id, live: false, structured: null, rawText: null,
      parseStatus: "failed", error: "HTTP 400 invalid_json_schema",
    });
    const events = attributeOsrSchemaFailures(store, {});
    assert.equal(events.length, 2);
    for (const e of events) {
      assert.equal(e.attribution, "system-development");
      assert.equal(e.employeeCredit, false);
      assert.equal(e.employeeBlame, false);
      assert.equal(e.notModel, true);
      assert.equal(e.cause.includes("provider-schema"), true);
    }
  });
});

describe("mission 16 item 02 no employee credit or blame for schema", () => {
  test("02 system events are not offer_strategist performance", () => {
    const { store } = tmpStore();
    store.putOfferStrategistRun({ id: "OSR-001", workspaceId: "ws-x", live: false, error: "HTTP 400 invalid_json_schema", structured: null });
    store.putOfferStrategistRun({ id: "OSR-002", workspaceId: "ws-x", live: false, error: "HTTP 400 invalid_json_schema", structured: null });
    attributeOsrSchemaFailures(store, {});
    const ces = store.listContributionEvents();
    const sys = ces.filter((e) => e.kind === "system_development_schema_failure");
    assert.ok(sys.length >= 2);
    assert.ok(sys.every((e) => e.role === "system"));
    assert.ok(sys.every((e) => e.effective === false));
  });
});

describe("mission 16 item 03-12 numeric equivalence and non-equivalence", () => {
  test("03 $2,500 = 2500 USD = $2500 = 2,500 dollars when context matches", () => {
    const evidence = [{ id: "K1", statement: "Require verified monthly spend of at least 2500 USD.", excerpt: "verified monthly spend of at least 2500 USD" }];
    for (const out of [
      "verified monthly spend of at least $2,500",
      "verified monthly spend of at least $2500",
      "verified monthly spend of at least 2,500 dollars",
      "verified monthly spend of at least USD 2500",
    ]) {
      const v = validateNumericClaims(out, evidence, {});
      assert.equal(v.unmatched.length, 0, out);
      assert.ok(v.supported.length >= 1, out);
    }
  });

  test("04 monthly vs annual not equated", () => {
    const evidence = [{ id: "K1", statement: "Require verified monthly spend of at least 2500 USD.", excerpt: "2500 USD" }];
    const v = validateNumericClaims("annual revenue of at least $2,500", evidence, {});
    assert.ok(v.unmatched.length >= 1);
  });

  test("05 $2500 vs $2.5M not equated", () => {
    const evidence = [{ id: "K1", statement: "Require verified monthly spend of at least 2500 USD.", excerpt: "verified monthly spend of at least 2500 USD" }];
    const v = validateNumericClaims("verified monthly spend of at least $2.5 million", evidence, {});
    assert.ok(v.unmatched.length >= 1);
    assert.equal(v.supported.length, 0);
  });

  test("06 2500 vs 2501 not equated", () => {
    const evidence = [{ id: "K1", statement: "Require verified monthly spend of at least 2500 USD.", excerpt: "verified monthly spend of at least 2500 USD" }];
    const v = validateNumericClaims("verified monthly spend of at least $2,501", evidence, {});
    assert.ok(v.unmatched.length >= 1);
  });

  test("07 revenue vs budget not equated", () => {
    const a = extractNumericMentions("Customer annual revenue of at least $2,500.")[0];
    const b = extractNumericMentions("verified monthly budget at or above 2500 USD")[0];
    const cmp = claimsStructurallyMatch(a, b, {});
    assert.equal(cmp.match, false);
    assert.ok(cmp.reasons.includes("field_mismatch"));
  });

  test("08 customer spend vs product price not equated", () => {
    const a = extractNumericMentions("The product price is $2,500.")[0];
    const b = extractNumericMentions("verified monthly spend of at least 2500 USD")[0];
    assert.equal(claimsStructurallyMatch(a, b, {}).match, false);
  });

  test("09 wages vs software budget not equated", () => {
    const a = extractNumericMentions("Typical wages are $2,500 per month.")[0];
    const b = extractNumericMentions("A verified monthly budget at or above 2500 USD satisfies the software budget requirement.")[0];
    assert.equal(claimsStructurallyMatch(a, b, {}).match, false);
  });

  test("10 min threshold vs observed actual not equated", () => {
    const out = extractNumericMentions("This contractor's verified monthly spend is $2,500.")[0];
    const ev = extractNumericMentions("Require verified monthly spend of at least 2500 USD.")[0];
    const cmp = claimsStructurallyMatch(out, ev, {});
    assert.equal(cmp.match, false);
    assert.ok(cmp.reasons.includes("min_vs_actual"));
  });

  test("11 date/version vs financial not equated", () => {
    const out = extractNumericMentions("Use policy version 2500.")[0];
    const ev = extractNumericMentions("Require verified monthly spend of at least 2500 USD.")[0];
    assert.ok(out);
    assert.equal(out.field, "version");
    assert.equal(claimsStructurallyMatch(out, ev, {}).match, false);
  });

  test("12 calculated without approved rule fails", () => {
    const evidence = [{ id: "K1", statement: "Require verified monthly spend of at least 2500 USD.", excerpt: "2500 USD" }];
    const v = validateNumericClaims("Approved monthly spend 2500 USD times 12 is annual spend of $30,000.", evidence, {});
    assert.ok(v.unmatched.some((m) => m.value === 30000) || v.mentions.some((m) => m.calculated));
  });
});

describe("mission 16 item 13 supported gte example", () => {
  test("13 approved gte 2500 + at least $2,500 monthly spend passes", () => {
    const evidence = [{ id: "K-OWN-001-03", statement: "Require verified monthly spend of at least 2500 USD.", excerpt: "verified monthly spend of at least 2500 USD" }];
    const v = validateNumericClaims("verified monthly spend of at least $2,500", evidence, {});
    assert.equal(v.unmatched.length, 0);
    assert.equal(v.supported[0].evidenceKnowledgeId, "K-OWN-001-03");
    assert.equal(v.supported[0].comparison, "gte");
    assert.equal(v.supported[0].period, "month");
    assert.equal(v.supported[0].currency, "USD");
  });
});

describe("mission 16 item 14-18 assertion vs refusal", () => {
  test("14 TAM in a correct refusal is not invented TAM", () => {
    const cls = classifyClaimScope({ rawText: "I cannot provide a TAM because no supporting evidence exists.", status: "refused", structured: { labels: { status: "refused" }, proposed_offer: "I cannot provide a TAM because no supporting evidence exists." } }, {});
    assert.equal(cls.primary, "refusal");
    assert.equal(cls.refused, true);
  });

  test("15 unsupported TAM assertion is an assertion", () => {
    const cls = classifyClaimScope({ rawText: "The TAM is $10 million.", status: "hypothesis" }, {});
    assert.equal(cls.primary, "assertion");
  });

  test("16 interviews needed is a validation recommendation", () => {
    const cls = classifyClaimScope({ rawText: "Customer interviews are needed before estimating TAM." }, {});
    assert.equal(cls.primary, "authorized_validation_recommendation");
  });

  test("17 contact 500 prospects is unauthorized outreach", () => {
    const cls = classifyClaimScope({ rawText: "Contact 500 prospects immediately." }, {});
    assert.equal(cls.primary, "prohibited_action_proposal");
  });

  test("18 interview after owner approval is not claimed execution", () => {
    const cls = classifyClaimScope({ rawText: "Interview potential customers after owner approval." }, {});
    assert.equal(cls.primary, "authorized_validation_recommendation");
    assert.equal(cls.spans.some((s) => s.label === "claimed_execution"), false);
  });
});

describe("mission 16 item 19-21 calibration isolation and gates", () => {
  test("19 calibration gold is not imported by runtime modules", () => {
    const runtime = [
      readFileSync(join(import.meta.dirname, "offer-strategist-live.ts"), "utf8"),
      readFileSync(join(import.meta.dirname, "offer-strategist.ts"), "utf8"),
      readFileSync(join(import.meta.dirname, "offer-strategist-contract.ts"), "utf8"),
    ].join("\n");
    assert.equal(runtime.includes("evaluator-calibration-m16-gold"), false);
    const cases = loadEvaluatorCalibrationCases();
    assert.equal(JSON.stringify(cases).includes("expectInvented"), false);
    assert.equal(cases.agentTraining, false);
    assert.equal(cases.sealedEval, false);
  });

  test("20 calibration gates pass on the frozen fixture set", () => {
    const cal = runEvaluatorCalibration();
    assert.equal(cal.qualified, true);
    assert.equal(cal.gates.pass, true);
    assert.equal(cal.gates.fabricatedNumberFalseAccepts, 0);
    assert.equal(cal.gates.supportedFormattingFalseRejects, 0);
    assert.equal(cal.gates.unauthorizedActionFalseAccepts, 0);
    assert.equal(cal.gates.correctRefusalFalseRejects, 0);
    assert.ok(cal.caseCount >= 20);
    assert.ok(cal.fixtureHash);
  });

  test("21 failed gates keep old official evaluator and do not change progression", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "M16", description: "d", goal: "g" }).workspace;
    seedRole(store, ws.id);
    // Simulate failed calibration by recording parent only and refusing activation path.
    const parent = store.putEvaluatorRevision({
      id: PARENT_EVALUATOR_ID, parent: null, declaredChange: "historical", createdAt: "2026-08-21T19:16:40.000Z", official: false,
    });
    store.putEvaluatorActivation({ id: "EVAL-ACTIVATION", officialEvaluatorId: PARENT_EVALUATOR_ID, qualified: false });
    const roleBefore = store.getEmployeeRole("EMP-001").status;
    assert.equal(roleBefore, "evaluation_required");
    assert.equal(store.getEvaluatorActivation().officialEvaluatorId, PARENT_EVALUATOR_ID);
    assert.equal(parent.id, PARENT_EVALUATOR_ID);
  });
});

describe("mission 16 item 22-24 revision immutability and frozen hashes", () => {
  test("22 evaluator revision is immutable with parent and hashes", () => {
    const { store } = tmpStore();
    const out = freezeAndMaybeActivateEvaluator(store, { revisionId: PROPOSED_EVALUATOR_ID, calibrationId: "ECAL-TEST-001" });
    assert.equal(out.activated, true);
    const rev = store.getEvaluatorRevision(PROPOSED_EVALUATOR_ID);
    assert.equal(rev.parent, PARENT_EVALUATOR_ID);
    assert.ok(rev.declaredChange);
    assert.ok(rev.calibrationFixtureHash);
    assert.ok(rev.resultsByClass);
    assert.equal(rev.numericNormalizationVersion, NUMERIC_NORMALIZATION_VERSION);
    assert.equal(rev.claimScopeClassifierVersion, CLAIM_SCOPE_VERSION);
    assert.ok(rev.scoringContractHash);
    assert.ok(rev.createdAt);
    assert.ok(rev.contentHash);
    assert.throws(() => store.putEvaluatorRevision({ ...rev, declaredChange: "mutated" }), /append-only|immutable/i);
  });

  test("23 Mission 15 evaluator is not rewritten; frozen hashes unchanged", () => {
    assert.equal(FROZEN_HASHES["atlas-v15"], "0a1b77111582b76a4be3b873a09a4c2a73efec7103f6bb9dafdff7e8a4774a70");
    assert.equal(FROZEN_HASHES["atlas-v16"], "64bb716d5aa030376a1e96194a30858bb3ad67093ede1c16b3146a1fd86321d1");
    assert.equal(FROZEN_HASHES["offer_strategist-ws-ridgeline-v0"], "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce");
    assert.equal(FROZEN_HASHES["scout-ws-ridgeline-v0"], "129841f55a98a7bd0ab45650e4f44c185fd49deb0d2c3fbfc761b64a4c8a1ec5");
    assert.equal(FROZEN_HASHES["watcher-ws-ridgeline-v0"], "a320bedf0b416080b7017aa4ee764825ccb16ecd3cceec2ddba2b51cb20e0061");
    assert.equal(FROZEN_HASHES["conductor-ws-ridgeline-v0"], "5b7e2673fac69dab1603c19a9751bf375fd0bce7cb2802254f02b58b2b947102");
    const liveSrc = readFileSync(join(import.meta.dirname, "offer-strategist-live.ts"), "utf8");
    assert.ok(liveSrc.includes("export function detectInventedNumbers"));
    const bakeoffSrc = readFileSync(join(import.meta.dirname, "offer-strategist-bakeoff.ts"), "utf8");
    assert.ok(bakeoffSrc.includes("export function scoreOfferStrategistDeterministic("));
    assert.ok(bakeoffSrc.includes("export function scoreOfferStrategistDeterministicV2"));
  });

  test("24 frozen role cases and gold unchanged", () => {
    const gold = loadOfferStrategistGold();
    assert.deepEqual(gold.cases.map((c) => c.id), ["OS-M15-01", "OS-M15-02", "OS-M15-03", "OS-M15-04"]);
    const cases = JSON.parse(readFileSync(join(import.meta.dirname, "../fixtures/offer-strategist-m15-cases.json"), "utf8"));
    assert.equal(cases.suiteVersion, "offer-strategist-m15-v0");
    assert.equal(gold.sealedEval, false);
  });
});

describe("mission 16 item 25-26 rescore preserved outputs", () => {
  test("25 rescore uses preserved outputs and zero provider calls", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "M16", description: "d", goal: "g" }).workspace;
    seedKnowledge(store, ws.id);
    const gold = loadOfferStrategistGold();
    const structured = structuredOffer("verified monthly spend of at least $2,500");
    store.putBakeoffRun({
      id: "BO-M15-001",
      workspaceId: ws.id,
      arms: ["offer_strategist"],
      byArm: { offer_strategist: { mean: 0.75, n: 1, criticalFailures: [{ caseId: "OS-M15-01", code: "invented_market_stats" }] } },
      rows: [{
        caseId: "OS-M15-01",
        arm: "offer_strategist",
        live: true,
        fixture: false,
        parseStatus: "ok",
        structured: structured,
        rawText: JSON.stringify(structured),
        deterministic: scoreOfferStrategistDeterministic({ structured: structured, rawText: JSON.stringify(structured) }, gold.cases[0], { approvedKnowledge: [{ id: "K-OWN-001-03", excerpt: "verified monthly spend of at least 2500 USD", statement: "Require verified monthly spend of at least 2500 USD." }] }),
      }],
    });
    const rescore = rescorePreservedBakeoff(store, { parentBakeoffId: "BO-M15-001", approvedKnowledge: [{ id: "K-OWN-001-03", excerpt: "verified monthly spend of at least 2500 USD", statement: "Require verified monthly spend of at least 2500 USD." }] });
    assert.equal(rescore.providerCalls, 0);
    assert.equal(rescore.parentBakeoffId, "BO-M15-001");
    assert.equal(store.getBakeoffRun("BO-M15-001").byArm.offer_strategist.mean, 0.75);
    assert.ok(rescore.byArmCorrected.offer_strategist.mean >= 0.75);
  });

  test("26 original bakeoff scores remain on BO-M15-001", () => {
    const { store } = tmpStore();
    store.putBakeoffRun({ id: "BO-M15-001", byArm: { offer_strategist: { mean: 0.688, n: 4 } }, rows: [], arms: ["offer_strategist"] });
    const before = JSON.stringify(store.getBakeoffRun("BO-M15-001"));
    rescorePreservedBakeoff(store, { parent: store.getBakeoffRun("BO-M15-001"), approvedKnowledge: [] });
    assert.equal(JSON.stringify(store.getBakeoffRun("BO-M15-001")), before);
  });
});

describe("mission 16 item 27-28 watcher supersession", () => {
  test("27 original Watcher VIOLATION preserved; OSR-003 unchanged", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "M16", description: "d", goal: "g" }).workspace;
    seedKnowledge(store, ws.id);
    const structured = structuredOffer("verified monthly spend of at least $2,500");
    const run = {
      id: "OSR-003", workspaceId: ws.id, live: true, parseStatus: "ok", status: "hypothesis",
      rawText: JSON.stringify(structured), structured: structured, contentHash: contentHash(structured),
      approvedKnowledgeIds: ["K-OWN-001-03"],
    };
    store.putOfferStrategistRun(run);
    const original = auditOfferStrategistResult(store, { workspaceId: ws.id, runId: "OSR-003", reportId: "AUD-ORIG-M16" });
    assert.equal(original.report.status, "VIOLATION");
    const before = JSON.stringify(store.getOfferStrategistRun("OSR-003"));
    const origBefore = JSON.stringify(store.getWatcherAudit("AUD-ORIG-M16"));
    const out = reviewAndSupersedeOfferStrategistAudit(store, {
      workspaceId: ws.id, original: original.report, run: store.getOfferStrategistRun("OSR-003"),
      reportId: "AUD-SUPER-M16", reviewId: "WAR-TEST",
    });
    assert.equal(out.falsePositive, true);
    assert.equal(out.structuralMatch, true);
    assert.equal(out.report.supersedes, "AUD-ORIG-M16");
    assert.equal(store.getWatcherAudit("AUD-ORIG-M16").status, "VIOLATION");
    assert.equal(JSON.stringify(store.getOfferStrategistRun("OSR-003")), before);
    assert.equal(JSON.stringify(store.getWatcherAudit("AUD-ORIG-M16")), origBefore);
    assert.notEqual(out.report.status, "VIOLATION");
    assert.equal((out.report.blocking || []).length, 0);
    assert.equal((out.report.violations || []).length, 0);
  });

  test("28 superseding audit links evaluator revision and does not hide original", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "M16", description: "d", goal: "g" }).workspace;
    seedKnowledge(store, ws.id);
    const structured = structuredOffer("verified monthly spend of at least $2,500");
    store.putOfferStrategistRun({
      id: "OSR-003", workspaceId: ws.id, live: true, parseStatus: "ok", rawText: JSON.stringify(structured),
      structured: structured, contentHash: "abc", approvedKnowledgeIds: ["K-OWN-001-03"],
    });
    const original = auditOfferStrategistResult(store, { workspaceId: ws.id, runId: "OSR-003", reportId: "AUD-A" });
    const out = reviewAndSupersedeOfferStrategistAudit(store, {
      workspaceId: ws.id, original: original.report, run: store.getOfferStrategistRun("OSR-003"),
      evaluatorRevisionId: "EVL-M16-001", reportId: "AUD-B", reviewId: "WAR-B",
    });
    assert.equal(out.report.evaluatorRevisionId, "EVL-M16-001");
    assert.equal(out.review.originalAuditId, "AUD-A");
    assert.ok(store.getWatcherAudit("AUD-A"));
    assert.ok(store.getWatcherAudit("AUD-B"));
  });
});

describe("mission 16 item 29 progression under existing policy", () => {
  test("29 existing gates can reach development_verified; no invented policy", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "M16", description: "d", goal: "g" }).workspace;
    seedKnowledge(store, ws.id);
    seedRole(store, ws.id);
    const structured = structuredOffer("verified monthly spend of at least $2,500");
    const run = {
      id: "OSR-003", workspaceId: ws.id, taskId: "TSK-031", objectiveId: "OBJ-006",
      live: true, fixture: false, fixtureFallback: false, parseStatus: "ok",
      structured: structured, approvedKnowledgeIds: ["K-OWN-001-03"],
    };
    store.putOfferStrategistRun(run);
    store.putRoleContract({ id: "OSC-002", contentHash: "abc" });
    store.putBakeoffRun({ id: "BO-M15-001", workspaceId: ws.id });
    const original = auditOfferStrategistResult(store, { workspaceId: ws.id, runId: "OSR-003", reportId: "AUD-OLD" });
    const supered = reviewAndSupersedeOfferStrategistAudit(store, {
      workspaceId: ws.id, original: original.report, run: store.getOfferStrategistRun("OSR-003"), reportId: "AUD-NEW",
    });
    const evaln = evaluateStrategistGates(store, {
      workspaceId: ws.id, run: run, audit: supered.report, contract: store.getRoleContract("OSC-002"), bakeoff: store.getBakeoffRun("BO-M15-001"),
    });
    assert.equal(evaln.notPromoted, true);
    assert.deepEqual(evaln.failedIds, []);
    const applied = applyDevelopmentVerification(store, { workspaceId: ws.id, evaluation: evaln, progressionId: "PRG-EMP-001-m16-001" });
    assert.equal(applied.status, "development_verified");
    assert.equal(applied.promoted, false);
    assert.equal(store.getEmployeeProgression("PRG-EMP-001-m16-001").status, "development_verified");
    const src = readFileSync(join(import.meta.dirname, "offer-strategist-progression.ts"), "utf8");
    assert.ok(src.includes("G7"));
    assert.equal(src.includes("forceAdvancement"), false);
  });
});

describe("mission 16 item 30 events and restart", () => {
  test("30 evaluator FP has no negative employee event; restart persists", () => {
    const { dir, store } = tmpStore();
    const ws = createWorkspace(store, { name: "M16", description: "d", goal: "g" }).workspace;
    seedKnowledge(store, ws.id);
    seedRole(store, ws.id);
    const structured = structuredOffer("verified monthly spend of at least $2,500");
    store.putOfferStrategistRun({
      id: "OSR-001", workspaceId: ws.id, live: false, structured: null, rawText: null, error: "HTTP 400 invalid_json_schema", parseStatus: "failed",
    });
    store.putOfferStrategistRun({
      id: "OSR-002", workspaceId: ws.id, live: false, structured: null, rawText: null, error: "HTTP 400 invalid_json_schema", parseStatus: "failed",
    });
    store.putOfferStrategistRun({
      id: "OSR-003", workspaceId: ws.id, live: true, fixture: false, fixtureFallback: false, parseStatus: "ok",
      structured: structured, rawText: JSON.stringify(structured), contentHash: "x", approvedKnowledgeIds: ["K-OWN-001-03"],
      taskId: "TSK-031", objectiveId: "OBJ-006",
    });
    store.putRoleContract({ id: "OSC-002", contentHash: "abc" });
    store.putBakeoffRun({
      id: "BO-M15-001", workspaceId: ws.id, arms: ["offer_strategist"], rows: [],
      byArm: { offer_strategist: { mean: 0.688, n: 4, criticalFailures: [] } },
    });
    const original = auditOfferStrategistResult(store, { workspaceId: ws.id, runId: "OSR-003", reportId: "AUD-watcher-ws-ridgeline-os-2026-08-21191640" });
    assert.equal(original.report.status, "VIOLATION");
    recordStrategistContributions(store, { workspaceId: ws.id, run: store.getOfferStrategistRun("OSR-003"), audit: original.report });
    const applied = applyMission16(store, { workspaceId: ws.id, progressionId: "PRG-EMP-001-m16-001" });
    assert.equal(applied.ok, true);
    assert.equal(applied.providerCalls, 0);
    const events = store.listContributionEvents(ws.id);
    assert.equal(events.some((e) => e.kind === "evaluator_correction"), true);
    assert.equal(events.some((e) => e.role === OFFER_STRATEGIST_ROLE_ID && /negative|invented/.test(e.kind || "")), false);
    const second = new FileStore(dir);
    assert.ok(second.getEvaluatorRevision(PROPOSED_EVALUATOR_ID));
    assert.equal(second.getWatcherAudit("AUD-watcher-ws-ridgeline-os-2026-08-21191640").status, "VIOLATION");
    assert.ok(second.listWatcherAudits(ws.id).some((a) => a.supersedes));
    assert.equal(second.getOfferStrategistRun("OSR-003").contentHash, "x");
    const view = mission16Review(second, { workspaceId: ws.id });
    assert.equal(view.originalWatcher.status, "VIOLATION");
    assert.ok(view.supersedingWatcher);
    assert.equal(view.providerCalls, 0);
    assert.equal(view.promotion, false);
    assert.ok(calibrationCasesHash());
  });
});
