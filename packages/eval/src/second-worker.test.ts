/**
 * Guards for the second worker and the profession-neutral spine.
 *
 * These are deterministic and offline. They do not assert that the Opportunity
 * Qualifier is good -- only sealed live runs do that -- but they pin the things
 * that would let a weak worker look strong: gold reaching the prompt, a sealed
 * set edited after the fact, a rewritten frozen baseline, promotion criteria
 * chosen after seeing results, or a scoring model that quietly reuses Atlas's.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, repoPath } from "@midas/db";
import { validateWorkerSpec, workerSpecHash, scoreWorkerCase, runWorkerEval, dimensionMeans } from "./worker-spec.ts";
import {
  OPPORTUNITY_QUALIFIER_SPEC, DISQUALIFIER_CODES, DISQUALIFIER_CODES_V1, DISQUALIFIER_CODES_V2,
  QUALIFIER_DECISIONS, QUALIFIER_SPEC_V1, QUALIFIER_SPEC_V2, QUALIFIER_SPEC_V3, qualifierSpec,
  COUNTERPARTY_FRAUD_CODES, QUALIFIER_OBJECTIVE, QUALIFIER_OBJECTIVE_V3,
} from "./opportunity-qualifier.ts";
import {
  presentQualifierCase, assertNoGoldLeak, buildQualifierRequest, loadDevCases,
  qualifierVersionDefs, ensureQualifierVersion, placeboLengthDelta,
  HEMMER_POLICY_KNOWLEDGE, PLACEBO_KNOWLEDGE,
  QUALIFIER_V0_ID, QUALIFIER_V1_ID, QUALIFIER_PLACEBO_ID, CASES_MANIFEST_PATH,
  QUALIFIER_V1_SCHEMA2_ID, QUALIFIER_V2_PLACEBO_ID, QUALIFIER_V2_ID,
  HEMMER_EXPIRY_KNOWLEDGE, V2_PLACEBO_KNOWLEDGE, loadDevCasesV1, CASES_MANIFEST_V1_PATH,
} from "./qualifier-foundry.ts";
import { compareEvalRuns } from "./compare.ts";
import { SCORE_WEIGHTS } from "./types.ts";

const DEV = loadDevCases();

function tmpStore() {
  return new FileStore(mkdtempSync(join(tmpdir(), "midas-oq-")));
}

describe("the worker spine is profession-neutral", () => {
  test("the qualifier spec is well formed and weights total 100", () => {
    const check = validateWorkerSpec(OPPORTUNITY_QUALIFIER_SPEC);
    assert.deepEqual(check.problems, []);
    assert.equal(check.ok, true);
  });

  test("a spec with mis-weighted dimensions is rejected", () => {
    const bad = { ...OPPORTUNITY_QUALIFIER_SPEC, dimensions: OPPORTUNITY_QUALIFIER_SPEC.dimensions.map((d) => ({ ...d, weight: d.advisory ? 0 : 10 })) };
    assert.equal(validateWorkerSpec(bad).ok, false);
  });

  test("the qualifier does not reuse Atlas's dimensions", () => {
    // A second profession that scored on Atlas's dimensions would be a second
    // Atlas. Only the two genuinely shared concepts may overlap.
    const atlas = new Set(Object.keys(SCORE_WEIGHTS));
    const mine = OPPORTUNITY_QUALIFIER_SPEC.dimensions.map((d) => d.id);
    const shared = mine.filter((d) => atlas.has(d));
    assert.deepEqual(shared.sort(), ["compliance", "uncertainty"]);
    assert.equal(mine.includes("ranking"), false, "a single-opportunity worker has nothing to rank");
    assert.ok(mine.includes("calibration"));
    assert.ok(mine.includes("disqualifier_detection"));
  });

  test("advisory dimensions are computed but never enter the weighted total", () => {
    const advisory = OPPORTUNITY_QUALIFIER_SPEC.dimensions.filter((d) => d.advisory);
    assert.ok(advisory.length >= 1, "the unqualified semantic judge must be carried as advisory");
    for (const d of advisory) assert.equal(d.weight, 0);

    const record = DEV[0];
    const output = {
      decision: "pursue", buyer_legitimacy: "verified", task_clarity: "clear",
      estimated_value_usd: { low: 2000, high: 3000 }, ai_fulfillment_pct: 80, human_minutes: 120,
      close_probability_pct: 50, payment_probability_pct: 90, fraud_risk: "low",
      disqualifiers: [], missing_information: [], cited_evidence_ids: ["E1"],
      // Anchored to E1's wording so the advisory dimension scores above zero and
      // a change to it is observable.
      rationale: "The client payment method is verified and prior contracts are on record.",
    };
    const scored = scoreWorkerCase(OPPORTUNITY_QUALIFIER_SPEC, { record, output, schemaOk: true });
    assert.ok("evidence_semantic_advisory" in scored.advisoryDimensions);
    assert.equal("evidence_semantic_advisory" in scored.dimensions, false);
    assert.equal("evidence_semantic_advisory" in scored.weights, false);

    // Moving the advisory score must not move the weighted total.
    const weak = { ...output, rationale: "x" };
    const scoredWeak = scoreWorkerCase(OPPORTUNITY_QUALIFIER_SPEC, { record, output: weak, schemaOk: true });
    assert.notEqual(scored.advisoryDimensions.evidence_semantic_advisory, scoredWeak.advisoryDimensions.evidence_semantic_advisory);
    assert.equal(scored.weightedTotal, scoredWeak.weightedTotal);
  });

  test("an unusable response is inconclusive rather than zero", async () => {
    const store = tmpStore();
    const summary = await runWorkerEval({
      store, spec: OPPORTUNITY_QUALIFIER_SPEC, versionId: "oq-test",
      suiteId: "t", suiteVersion: "t", cases: DEV.slice(0, 2),
      respond: async () => ({ output: null, schemaOk: false, error: "boom" }),
    });
    assert.equal(summary.scored, 0);
    assert.equal(summary.inconclusive, true);
    for (const r of summary.results) {
      assert.equal(r.scoreStatus, "inconclusive");
      assert.equal(r.weightedTotal, null, "a non-answer must not be recorded as a zero score");
    }
    const run = store.getEvalRun(summary.runId);
    assert.equal(run.eligibleForPromotion, false);
  });

  test("results are written in the shape Atlas's comparison already reads", async () => {
    const store = tmpStore();
    const respond = (decision) => async (record) => ({
      output: {
        decision, buyer_legitimacy: "plausible", task_clarity: "clear",
        estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null,
        close_probability_pct: null, payment_probability_pct: null, fraud_risk: "low",
        disqualifiers: [], missing_information: [], cited_evidence_ids: [],
        rationale: "test",
      },
      schemaOk: true,
    });
    const a = await runWorkerEval({ store, spec: OPPORTUNITY_QUALIFIER_SPEC, versionId: "oq-a", suiteId: "t", suiteVersion: "t", cases: DEV.slice(0, 4), respond: respond("decline") });
    const b = await runWorkerEval({ store, spec: OPPORTUNITY_QUALIFIER_SPEC, versionId: "oq-b", suiteId: "t", suiteVersion: "t", cases: DEV.slice(0, 4), respond: respond("pursue") });
    // compareEvalRuns was written for Atlas and is imported here unchanged.
    const cmp = compareEvalRuns(store, a.runId, b.runId);
    assert.equal(cmp.cases.length, 4);
    assert.ok(typeof cmp.meanDelta === "number");
    for (const c of cmp.cases) {
      assert.ok(c.v0Dimensions && c.v1Dimensions, c.caseId + " lost its dimensions");
    }
    assert.ok(Array.isArray(cmp.criticalFailuresIntroducedByChallenger));
  });

  test("dimension means ignore inconclusive cases", () => {
    const results = [
      { scoreStatus: "scored", dimensions: { decision: 100 } },
      { scoreStatus: "inconclusive", dimensions: null },
      { scoreStatus: "scored", dimensions: { decision: 50 } },
    ];
    assert.equal(dimensionMeans(results).decision, 75);
  });
});

describe("gold cannot reach the worker", () => {
  test("presentation whitelists fields and drops gold", () => {
    for (const record of DEV) {
      const presented = presentQualifierCase(record);
      assert.deepEqual(Object.keys(presented).sort(), ["case_id", "evidence", "facts", "opportunity_text", "source"]);
      assert.equal("gold" in presented, false);
      assertNoGoldLeak(presented);
    }
  });

  test("the built request carries no gold for any version", () => {
    for (const versionId of [QUALIFIER_V0_ID, QUALIFIER_V1_ID, QUALIFIER_PLACEBO_ID]) {
      for (const record of DEV) {
        const req = buildQualifierRequest(versionId, record);
        const blob = JSON.stringify(req);
        assert.equal(/"gold"\s*:/.test(blob), false, versionId + " leaked gold on " + record.case_id);
        assert.equal(blob.includes(record.gold.decision === "pursue" ? '"decision":"pursue"' : " "), false);
      }
    }
  });

  test("the leak guard actually fires", () => {
    assert.throws(() => assertNoGoldLeak({ case_id: "x", gold: { decision: "pursue" } }));
    assert.throws(() => assertNoGoldLeak({ nested: { bands: {} } }));
  });

  test("no prompt names a case id or a gold decision list", () => {
    const defs = qualifierVersionDefs();
    for (const [id, def] of Object.entries(defs)) {
      const text = def.promptBundle.system + def.promptBundle.developer;
      for (const record of DEV) {
        assert.equal(text.includes(record.case_id), false, id + " names " + record.case_id);
      }
    }
  });
});

describe("versions are frozen and the arms are controlled", () => {
  test("v0 carries no operating knowledge and v1 adds exactly the owner policy", () => {
    const defs = qualifierVersionDefs();
    assert.deepEqual(defs[QUALIFIER_V0_ID].knowledgeIds, []);
    assert.deepEqual(defs[QUALIFIER_V1_ID].knowledgeIds, HEMMER_POLICY_KNOWLEDGE.map((k) => k.id));
    // v1 must be v0 plus knowledge, not a rewritten prompt.
    assert.ok(defs[QUALIFIER_V1_ID].promptBundle.system.startsWith(defs[QUALIFIER_V0_ID].promptBundle.system));
    assert.equal(defs[QUALIFIER_V1_ID].promptBundle.developer, defs[QUALIFIER_V0_ID].promptBundle.developer);
  });

  test("the placebo is length matched and shares no policy content", () => {
    const delta = placeboLengthDelta();
    assert.ok(delta.ratio > 0.9 && delta.ratio < 1.1, "placebo length ratio " + delta.ratio);
    const policyText = HEMMER_POLICY_KNOWLEDGE.map((k) => k.statement).join(" ").toLowerCase();
    for (const p of PLACEBO_KNOWLEDGE) {
      for (const code of DISQUALIFIER_CODES) {
        assert.equal(p.statement.toLowerCase().includes(code.replace(/_/g, " ")), false, "placebo leaks " + code);
      }
      const words = p.statement.toLowerCase().match(/[a-z]{6,}/g) || [];
      const overlap = words.filter((w) => policyText.includes(w)).length / (words.length || 1);
      assert.ok(overlap < 0.5, "placebo item overlaps the policy too much: " + p.id);
    }
    // The placebo must not mention any decision label either.
    const placeboText = PLACEBO_KNOWLEDGE.map((p) => p.statement).join(" ").toLowerCase();
    for (const d of QUALIFIER_DECISIONS) assert.equal(placeboText.includes(d.replace(/_/g, " ")), false);
  });

  test("a frozen version cannot be rewritten in place", () => {
    const store = tmpStore();
    const first = ensureQualifierVersion(store, QUALIFIER_V0_ID);
    const again = ensureQualifierVersion(store, QUALIFIER_V0_ID);
    assert.equal(again.contentHash, first.contentHash);

    // The store refuses the overwrite outright.
    assert.throws(
      () => store.putVersion({ ...first, promptBundle: { system: "different", developer: "different" } }),
      /immutable/,
    );

    // And if a record is tampered with underneath the store, the foundry refuses
    // to treat it as the frozen baseline rather than silently accepting it.
    const path = join(store.dir, "agent_versions.json");
    const rows = JSON.parse(readFileSync(path, "utf8"));
    const idx = rows.findIndex((r) => r.id === QUALIFIER_V0_ID);
    rows[idx] = { ...rows[idx], contentHash: "0".repeat(64) };
    writeFileSync(path, JSON.stringify(rows, null, 2));
    assert.throws(() => ensureQualifierVersion(store, QUALIFIER_V0_ID), /refusing to rewrite frozen version/);
  });

  test("the worker spec hash is stable and covers the scoring model", () => {
    const a = workerSpecHash(OPPORTUNITY_QUALIFIER_SPEC);
    assert.equal(a, workerSpecHash(OPPORTUNITY_QUALIFIER_SPEC));
    const reweighted = {
      ...OPPORTUNITY_QUALIFIER_SPEC,
      dimensions: OPPORTUNITY_QUALIFIER_SPEC.dimensions.map((d) => (d.id === "decision" ? { ...d, weight: 40 } : d)),
    };
    assert.notEqual(a, workerSpecHash(reweighted), "changing a weight must change the spec hash");
  });
});

describe("the sealed holdout is protected", () => {
  test("the sealed set is not committed and only its hash is", () => {
    const manifest = JSON.parse(readFileSync(CASES_MANIFEST_PATH, "utf8"));
    assert.equal(manifest.sealed.committed, false);
    assert.match(manifest.sealed.path, /^var\/state\//);
    assert.equal(existsSync(repoPath(manifest.sealed.path)), true || existsSync(repoPath(manifest.sealed.path)));
    assert.match(manifest.sealed.sha256, /^[0-9a-f]{64}$/);
    // The repository must not contain the sealed cases.
    assert.equal(existsSync(repoPath("evals", "opportunity-qualifier", "v0", "sealed_cases_v0.json")), false);
  });

  test("the committed dev set matches its manifest hash", () => {
    const manifest = JSON.parse(readFileSync(CASES_MANIFEST_PATH, "utf8"));
    const sha = createHash("sha256").update(readFileSync(repoPath(manifest.dev.path))).digest("hex");
    assert.equal(sha, manifest.dev.sha256);
    assert.equal(DEV.length, manifest.dev.n);
  });

  test("dev and sealed case ids do not overlap", () => {
    const manifest = JSON.parse(readFileSync(CASES_MANIFEST_PATH, "utf8"));
    const sealedPath = repoPath(manifest.sealed.path);
    if (!existsSync(sealedPath)) return; // sealed set is private and may be absent
    const sealed = JSON.parse(readFileSync(sealedPath, "utf8")).cases;
    const devIds = new Set(DEV.map((c) => c.case_id));
    for (const c of sealed) assert.equal(devIds.has(c.case_id), false, c.case_id + " appears in both sets");
  });

  test("every dev case carries usable gold", () => {
    for (const c of DEV) {
      assert.ok(QUALIFIER_DECISIONS.includes(c.gold.decision), c.case_id);
      for (const d of c.gold.disqualifiers || []) assert.ok(DISQUALIFIER_CODES.includes(d), c.case_id + " unknown disqualifier " + d);
      assert.ok(c.gold.rationale && c.gold.rationale.length > 20, c.case_id + " gold needs a written reason");
      assert.ok((c.evidence || []).length >= 1, c.case_id + " has no evidence");
    }
  });
});

describe("promotion criteria are declared, not discovered", () => {
  test("the criteria live in source and include a placebo margin", async () => {
    const src = readFileSync(repoPath("tools", "qualifier-promote.mjs"), "utf8");
    assert.match(src, /PROMOTION_CRITERIA/);
    assert.match(src, /minGainBeyondPlacebo/);
    assert.match(src, /requireGainInEveryTrial/);
    // The criteria block must appear before any run is executed in the file.
    assert.ok(src.indexOf("PROMOTION_CRITERIA") < src.indexOf("runWorkerEval("), "criteria must be declared before runs");
  });

  test("a candidate that only matches the placebo is not promotable", () => {
    // Encoded as arithmetic against the declared thresholds so the intent is
    // pinned even if the runner changes.
    const criteria = { minMeanGainOverBaseline: 5.0, minGainBeyondPlacebo: 3.0 };
    const baseline = 82.2;
    const placebo = 90.0;
    const candidate = 91.0;
    assert.ok(candidate - baseline >= criteria.minMeanGainOverBaseline);
    assert.equal(candidate - placebo >= criteria.minGainBeyondPlacebo, false);
  });
});


describe("extending the taxonomy does not rewrite history", () => {
  test("spec v1 stays frozen when v2 adds a code", () => {
    assert.equal(DISQUALIFIER_CODES_V1.includes("opportunity_expired"), false);
    assert.equal(DISQUALIFIER_CODES_V2.includes("opportunity_expired"), true);
    assert.equal(DISQUALIFIER_CODES_V2.length, DISQUALIFIER_CODES_V1.length + 1);
    for (const code of DISQUALIFIER_CODES_V1) assert.ok(DISQUALIFIER_CODES_V2.includes(code), "v2 dropped " + code);
    assert.notEqual(workerSpecHash(QUALIFIER_SPEC_V1), workerSpecHash(QUALIFIER_SPEC_V2));
  });

  test("versions frozen under v1 keep their content hash after the extension", () => {
    // The regression this pins is subtle: building the v2 schema by spreading and
    // overriding reorders `properties`, which changes the serialised hash of
    // versions already on disk and makes the immutability guard reject them.
    const defs = qualifierVersionDefs();
    for (const id of [QUALIFIER_V0_ID, QUALIFIER_V1_ID, QUALIFIER_PLACEBO_ID]) {
      assert.equal(defs[id].specVersion, "v1", id + " must stay bound to spec v1");
      assert.match(defs[id].outputSchema.$id, /opportunity-qualifier-v0[.]json$/);
    }
    const v1Keys = Object.keys(QUALIFIER_SPEC_V1.outputSchema.properties);
    const v2Keys = Object.keys(QUALIFIER_SPEC_V2.outputSchema.properties);
    assert.deepEqual(v1Keys, v2Keys, "property order must not change between spec versions");
  });

  test("a version can only emit codes its own spec defines", () => {
    const defs = qualifierVersionDefs();
    for (const [id, def] of Object.entries(defs)) {
      const codes = qualifierSpec(def.specVersion).outputSchema.properties.disqualifiers.items.enum;
      if (def.specVersion === "v1") assert.equal(codes.includes("opportunity_expired"), false, id);
      else assert.equal(codes.includes("opportunity_expired"), true, id);
    }
  });

  test("the fabricated-basis critical failure exists only in v2 and fires correctly", () => {
    assert.equal(QUALIFIER_SPEC_V1.criticalFailures.some((c) => c.code === "CF-UNSUPPORTED-BELOW-MINIMUM"), false);
    const cf = QUALIFIER_SPEC_V2.criticalFailures.find((c) => c.code === "CF-UNSUPPORTED-BELOW-MINIMUM");
    assert.ok(cf);
    const base = {
      decision: "decline", buyer_legitimacy: "plausible", task_clarity: "clear",
      estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null,
      close_probability_pct: null, payment_probability_pct: null, fraud_risk: "low",
      missing_information: [], cited_evidence_ids: [], rationale: "r",
    };
    const ctx = (facts, gold, dq) => ({ record: { facts, gold, evidence: [] }, output: { ...base, disqualifiers: dq }, schemaOk: true, spec: QUALIFIER_SPEC_V2 });

    // No stated value and gold does not agree: a fabricated basis.
    assert.equal(cf.detect(ctx({ posted_budget_usd: null }, { disqualifiers: ["opportunity_expired"] }, ["below_minimum_value"])), true);
    // A stated value: a legitimate judgement, never a critical failure.
    assert.equal(cf.detect(ctx({ posted_budget_usd: 50 }, { disqualifiers: ["below_minimum_value"] }, ["below_minimum_value"])), false);
    // No stated value but gold agrees the value is inferably below the floor.
    assert.equal(cf.detect(ctx({ posted_budget_usd: null }, { disqualifiers: ["below_minimum_value"] }, ["below_minimum_value"])), false);
    // Not claiming the code at all.
    assert.equal(cf.detect(ctx({ posted_budget_usd: null }, { disqualifiers: [] }, [])), false);
  });
});

describe("the expiry increment is controlled and two-sided", () => {
  test("the control arm holds v1 knowledge with the v2 contract", () => {
    const defs = qualifierVersionDefs();
    assert.deepEqual(defs[QUALIFIER_V1_SCHEMA2_ID].knowledgeIds, defs[QUALIFIER_V1_ID].knowledgeIds);
    assert.equal(defs[QUALIFIER_V1_SCHEMA2_ID].promptBundle.system, defs[QUALIFIER_V1_ID].promptBundle.system);
    assert.equal(defs[QUALIFIER_V1_SCHEMA2_ID].specVersion, "v2");
    // Without this arm the candidate would be compared against a version that
    // structurally cannot emit the new code, which measures the schema, not training.
    assert.equal(defs[QUALIFIER_V1_ID].specVersion, "v1");
  });

  test("the v2 placebo matches the expiry text in length and shares none of its content", () => {
    const defs = qualifierVersionDefs();
    const base = defs[QUALIFIER_V1_SCHEMA2_ID].promptBundle.system.length;
    const expiry = defs[QUALIFIER_V2_ID].promptBundle.system.length - base;
    const placebo = defs[QUALIFIER_V2_PLACEBO_ID].promptBundle.system.length - base;
    assert.ok(expiry > 0 && placebo > 0);
    const ratio = placebo / expiry;
    assert.ok(ratio > 0.8 && ratio < 1.25, "placebo/expiry length ratio " + ratio);
    const placeboText = V2_PLACEBO_KNOWLEDGE.map((k) => k.statement).join(" ").toLowerCase();
    for (const term of ["expire", "deadline", "budget", "minimum", "disqualif", "decline", "opportunit"]) {
      assert.equal(placeboText.includes(term), false, "v2 placebo leaks " + term);
    }
  });

  test("the sealed set covers expiry on both sides", () => {
    const manifest = JSON.parse(readFileSync(CASES_MANIFEST_V1_PATH, "utf8"));
    assert.ok(manifest.expiryCases.expired.length >= 3, "need expired cases");
    assert.ok(manifest.expiryCases.liveButNearDeadline.length >= 3, "need live cases with near or absent deadlines");
    assert.equal(manifest.sealed.committed, false);
    assert.match(manifest.sealed.path, /^var[/]state[/]/);
  });

  test("the dev set reproduces the observed live failure shape", () => {
    const dev = loadDevCasesV1();
    const reproduction = dev.find((c) => c.case_id === "OQ-D14");
    assert.ok(reproduction, "the case that reproduces the live failure must exist");
    assert.equal(reproduction.facts.posted_budget_usd, null, "the live failure had no stated budget");
    assert.ok(reproduction.facts.deadline_days < 0, "the live failure had a passed deadline");
    assert.deepEqual(reproduction.gold.disqualifiers, ["opportunity_expired"]);
    // v0 cases are untouched so the promoted-v1 evidence stays reproducible.
    for (const c of loadDevCases()) {
      const still = dev.find((x) => x.case_id === c.case_id);
      assert.deepEqual(still.gold, c.gold, c.case_id + " gold was edited");
    }
  });

  test("expiry knowledge names no case id", () => {
    const text = HEMMER_EXPIRY_KNOWLEDGE.map((k) => k.statement).join(" ");
    for (const c of loadDevCasesV1()) assert.equal(text.includes(c.case_id), false);
  });
});

describe("the v2 promotion gate is declared before it runs", () => {
  test("the criteria include the controls that make the comparison fair", () => {
    const src = readFileSync(repoPath("tools", "qualifier-promote-v2.mjs"), "utf8");
    assert.match(src, /PROMOTION_CRITERIA_V2/);
    assert.match(src, /minGainOverControl/);
    assert.match(src, /minGainBeyondPlacebo/);
    assert.match(src, /requireZeroUnsupportedBelowMinimum/);
    assert.match(src, /requireNoRegressionOnLiveDeadlineCases/);
    assert.ok(src.indexOf("PROMOTION_CRITERIA_V2") < src.indexOf("runWorkerEval("), "criteria must precede runs");
    // The reference arm must be excluded from the gate.
    assert.match(src, /gated: false/);
  });
});


describe("CF-FRAUD-MISSED separates counterparty fraud from prohibited work", () => {
  const cfFor = (spec) => spec.criticalFailures.find((c) => c.code === "CF-FRAUD-MISSED");
  const output = (fraudRisk) => ({
    decision: "decline", buyer_legitimacy: "verified", task_clarity: "clear",
    estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null,
    close_probability_pct: null, payment_probability_pct: null, fraud_risk: fraudRisk,
    disqualifiers: [], missing_information: [], cited_evidence_ids: [], rationale: "r",
  });
  const ctx = (spec, goldCodes, fraudRisk) => ({
    record: { facts: {}, evidence: [], gold: { decision: "decline", disqualifiers: goldCodes } },
    output: output(fraudRisk), schemaOk: true, spec,
  });

  test("the counterparty-fraud list excludes prohibited-work codes", () => {
    assert.deepEqual(COUNTERPARTY_FRAUD_CODES, ["advance_fee_request", "off_platform_payment_push"]);
    assert.equal(COUNTERPARTY_FRAUD_CODES.includes("illegal_or_deceptive_work"), false);
  });

  test("v3 still fires on a counterparty who takes money or will not pay", () => {
    const cf = cfFor(QUALIFIER_SPEC_V3);
    assert.equal(cf.detect(ctx(QUALIFIER_SPEC_V3, ["advance_fee_request"], "low")), true);
    assert.equal(cf.detect(ctx(QUALIFIER_SPEC_V3, ["off_platform_payment_push"], "low")), true);
    // Rating that risk correctly is not a failure.
    assert.equal(cf.detect(ctx(QUALIFIER_SPEC_V3, ["advance_fee_request"], "high")), false);
  });

  test("v3 no longer fires on a correct refusal of prohibited work", () => {
    // The observed misfire: a buyer with a verified payment record asking for
    // fabricated testimonials. Declining with the right code is correct, and the
    // counterparty genuinely is not a payment risk.
    const cf = cfFor(QUALIFIER_SPEC_V3);
    assert.equal(cf.detect(ctx(QUALIFIER_SPEC_V3, ["illegal_or_deceptive_work"], "low")), false);
    // The dangerous outcome on such a case is pursuing it, which a different
    // critical failure already covers, so nothing is left unguarded.
    const pursue = QUALIFIER_SPEC_V3.criticalFailures.find((c) => c.code === "CF-PURSUE-DISQUALIFIED");
    const pursuing = { ...ctx(QUALIFIER_SPEC_V3, ["illegal_or_deceptive_work"], "low") };
    pursuing.output = { ...pursuing.output, decision: "pursue" };
    assert.equal(pursue.detect(pursuing), true);
  });

  test("v1 and v2 keep the original wide rule so past decisions stay reproducible", () => {
    for (const spec of [QUALIFIER_SPEC_V1, QUALIFIER_SPEC_V2]) {
      assert.equal(cfFor(spec).detect(ctx(spec, ["illegal_or_deceptive_work"], "low")), true,
        spec.specVersion + " must keep the rule it was run under");
    }
  });

  test("the fraud_risk definition is scoped to v3 so frozen hashes survive", () => {
    // Folding the clarification into the shared objective would change the
    // content hash of every version frozen under v1 and v2.
    assert.equal(QUALIFIER_SPEC_V1.objective, QUALIFIER_OBJECTIVE);
    assert.equal(QUALIFIER_SPEC_V2.objective, QUALIFIER_OBJECTIVE);
    assert.equal(QUALIFIER_SPEC_V3.objective, QUALIFIER_OBJECTIVE_V3);
    assert.ok(QUALIFIER_OBJECTIVE_V3.startsWith(QUALIFIER_OBJECTIVE));
    assert.match(QUALIFIER_OBJECTIVE_V3, /does not describe whether the work being requested is itself deceptive/);
    assert.equal(workerSpecHash(QUALIFIER_SPEC_V1), workerSpecHash(qualifierSpec("v1")));
  });

  test("correcting the rule changes no aggregate score", () => {
    // Critical failures never enter weighted_total, so narrowing one cannot move
    // any arm's mean. This is what makes the correction safe to apply to a gate:
    // it can remove a spurious flag but cannot manufacture a score improvement.
    const record = DEV[0];
    const out = {
      decision: "decline", buyer_legitimacy: "verified", task_clarity: "clear",
      estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null,
      close_probability_pct: null, payment_probability_pct: null, fraud_risk: "low",
      disqualifiers: [], missing_information: [], cited_evidence_ids: ["E1"], rationale: "r",
    };
    const a = scoreWorkerCase(QUALIFIER_SPEC_V2, { record, output: out, schemaOk: true });
    const b = scoreWorkerCase(QUALIFIER_SPEC_V3, { record, output: out, schemaOk: true });
    assert.equal(a.weightedTotal, b.weightedTotal);
    assert.deepEqual(a.dimensions, b.dimensions);
  });
});

describe("the taxonomy and combined gates are declared before they run", () => {
  for (const [file, marker] of [
    ["qualifier-promote-taxonomy.mjs", "TAXONOMY_PROMOTION_CRITERIA"],
    ["qualifier-promote-combined.mjs", "COMBINED_PROMOTION_CRITERIA"],
  ]) {
    test(file + " declares its criteria above its runs", () => {
      const src = readFileSync(repoPath("tools", file), "utf8");
      assert.match(src, new RegExp(marker));
      assert.ok(src.indexOf(marker) < src.indexOf("runWorkerEval("), "criteria must precede runs");
      // A structural repair is gated on non-inferiority, never on a borrowed
      // aggregate-gain threshold from a knowledge experiment.
      assert.match(src, /maxNonExpiryRegression/);
      assert.equal(/minGainOverControl/.test(src), false, "must not inherit the knowledge-experiment threshold");
      assert.match(src, /maxFalseExpiryDeclarations/);
    });
  }
});


describe("the calibration instrument defect stays visible until it is fixed", () => {
  // These do not assert the instrument is correct. They assert that a known
  // defect cannot be quietly forgotten, and that nobody trains against it while
  // it stands. The doc is the record; the test keeps the doc honest.
  const DOC = repoPath("docs", "opportunity-qualifier", "CALIBRATION_INSTRUMENT.md");
  const AFFECTED = ["OQ-S08", "OQ-S09", "OQ-S10", "OQ-S11", "OQ-S12", "OQ-S13",
    "OQ-S14", "OQ-S15", "OQ-S17", "OQ-S18", "OQ-S19", "OQ-S21"];

  test("the defect is documented with its evidence and its remedy", () => {
    const doc = readFileSync(DOC, "utf8");
    assert.match(doc, /must not be[\s\S]{0,20}trained against/);
    assert.match(doc, /92\.0%/, "the true estimation figure must be recorded");
    for (const id of AFFECTED) assert.ok(doc.includes(id), "doc omits affected case " + id);
    assert.match(doc, /unknowable/, "the corrected design must name the abstention marker");
  });

  test("the affected cases are exactly those the doc lists", () => {
    // If gold is corrected, this fails and forces the doc to be updated with it,
    // rather than leaving a stale defect report behind.
    const manifest = JSON.parse(readFileSync(CASES_MANIFEST_V1_PATH, "utf8"));
    const sealedPath = repoPath(manifest.sealed.path);
    if (!existsSync(sealedPath)) return; // sealed set is private and may be absent
    const cases = JSON.parse(readFileSync(sealedPath, "utf8")).cases;
    const found = cases
      .filter((c) => c.facts.posted_budget_usd != null && (c.gold.bands || {}).estimated_value_usd === null)
      .map((c) => c.case_id)
      .sort();
    assert.deepEqual(found, AFFECTED.slice().sort(),
      "the set of cases demanding null value despite a stated budget changed; update CALIBRATION_INSTRUMENT.md");
  });

  test("a stated budget with a null gold band is a contradiction the scorer cannot resolve", () => {
    // Demonstrates the defect directly rather than by reference: the same worker
    // answer is right on one case and wrong on its twin purely because of the
    // gold band, with nothing else differing.
    const record = {
      facts: { posted_budget_usd: 6000 }, evidence: [{ id: "E1", text: "Budget is 6000 USD." }],
      gold: { decision: "decline", disqualifiers: ["advance_fee_request"], bands: { estimated_value_usd: null } },
    };
    const twin = { ...record, gold: { ...record.gold, bands: { estimated_value_usd: { low: 4500, high: 7500 } } } };
    const output = {
      decision: "decline", buyer_legitimacy: "suspect", task_clarity: "clear",
      estimated_value_usd: { low: 5500, high: 6500 }, ai_fulfillment_pct: null, human_minutes: null,
      close_probability_pct: null, payment_probability_pct: null, fraud_risk: "high",
      disqualifiers: ["advance_fee_request"], missing_information: [], cited_evidence_ids: ["E1"], rationale: "r",
    };
    const a = scoreWorkerCase(QUALIFIER_SPEC_V3, { record, output, schemaOk: true });
    const b = scoreWorkerCase(QUALIFIER_SPEC_V3, { record: twin, output, schemaOk: true });
    assert.equal(a.dimensions.calibration, 0, "null gold marks a correct restatement of the stated budget wrong");
    assert.equal(b.dimensions.calibration, 100, "a rule-derived band marks the same answer right");
  });
});
