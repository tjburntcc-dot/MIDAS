/**
 * The Manager lock campaign: what it settled and what it did not.
 *
 * It ran cleanly and it did not produce a lock, because the post-run audit found
 * two defects in the instrument that between them breached two zero-tolerance
 * gates. Both are pinned here so neither can be quietly forgotten, and so is the
 * capability finding that survives them.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { MANAGER_LOCK_CASES, REQUIRED_MANAGER_COMPETENCIES, lockCaseCoverage } from "./manager-lock-cases.ts";
import { MANAGER_SEALED_CASES } from "./manager-cases.ts";
import { BOTTLENECKS, ACTION_CLASSES } from "./manager.ts";
import { managerCandidateTarget, CANDIDATE_SELECTION, MANAGER_TARGET_DEFECTS, HISTORICAL_MANAGER_SUBJECT } from "./manager-target-truth.ts";
import { targetId } from "./academy.ts";
import { RECORDED_DEFECTS } from "./experiment-defects.ts";

const repoFile = (rel: string) => new URL("../../../" + rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const load = (f: string) => (existsSync(repoFile("var/state/" + f)) ? JSON.parse(readFileSync(repoFile("var/state/" + f), "utf8")) : null);
const raw = load("manager-lock-raw.json");
const dec = load("manager-lock-decision.json");
const review = load("manager-lock-gold-review.json");
const foundry = load("manager-foundry-cycle.json");

describe("the candidate was forced, not chosen", () => {
  test("only one arm of the foundry cycle was ever a MIDAS worker", { skip: !foundry }, () => {
    assert.equal(foundry.arms.A_generic.subject.actorKind, "generic_baseline");
    assert.equal(foundry.arms.B_contract.subject.actorKind, "generic_baseline");
    assert.equal(foundry.arms.B_contract.subject.workerVersion, null);
    assert.equal(foundry.arms.C_doctrine.subject.actorKind, "midas_worker");
    assert.equal(foundry.arms.C_doctrine.subject.workerVersion, "mg-v1");
  });

  test("the selection records why, and it does not rest on the authority number alone", () => {
    assert.match(CANDIDATE_SELECTION.selected, /mg-v1/);
    const b = CANDIDATE_SELECTION.rejected.find((r) => r.arm === "B_contract")!;
    assert.match(b.disqualifying, /not a MIDAS worker/);
    assert.match(b.andAlsoWorse, /0\.75 against 0\.833/);
    assert.match(b.principle, /buying control by degrading the core function/);
  });

  test("the historical subject record carries the environment defect, and the new target does not", () => {
    assert.equal(HISTORICAL_MANAGER_SUBJECT.executionEnvironmentId, "EE-8880ef0d5a0f");
    assert.deepEqual(HISTORICAL_MANAGER_SUBJECT.tools, []);
    assert.equal(HISTORICAL_MANAGER_SUBJECT.protocolVersion, "single-shot-json");
    assert.equal(MANAGER_TARGET_DEFECTS.length, 1);
    assert.equal(MANAGER_TARGET_DEFECTS[0].field, "executionEnvironmentId");
    assert.notEqual(managerCandidateTarget().executionEnvironmentId, "EE-8880ef0d5a0f");
  });

  test("REGRESSION: the candidate target is pinned", () => {
    const t = managerCandidateTarget();
    assert.equal(targetId(t), "CT-767e9f1e6f89");
    assert.equal(t.executionEnvironmentId, "EE-6b813ab7dd1a");
    assert.deepEqual(t.tools, []);
    assert.equal(t.policyVersionId, "manager-doctrine-v1");
    assert.equal(t.workerVersionId, "mg-v1");
  });
});

describe("the fresh set", () => {
  test("it covers every required shape and reuses nothing", () => {
    const c = lockCaseCoverage();
    assert.equal(c.cases, 12);
    assert.deepEqual(REQUIRED_MANAGER_COMPETENCIES.filter((k) => !c.competencies.includes(k)), []);
    const priorIds = new Set(MANAGER_SEALED_CASES.map((x) => x.id));
    const priorBiz = new Set(MANAGER_SEALED_CASES.map((x) => x.business));
    for (const x of MANAGER_LOCK_CASES) {
      assert.ok(!priorIds.has(x.id), x.id + " collides with the development set");
      assert.ok(!priorBiz.has(x.business), x.id + " reuses a business");
    }
  });

  test("no gold names a bottleneck or action the vocabulary lacks", () => {
    for (const x of MANAGER_LOCK_CASES) {
      for (const b of x.gold.acceptableBottlenecks) assert.ok((BOTTLENECKS as readonly string[]).includes(b), x.id + " " + b);
      for (const a of [...x.gold.acceptableActions, ...(x.gold.forbiddenActions || [])]) {
        assert.ok((ACTION_CLASSES as readonly string[]).includes(a), x.id + " " + a);
      }
      assert.ok(x.gold.acceptableBottlenecks.includes(x.bindingBottleneckStated));
    }
  });

  test("it does not certify a manager that can only delay", () => {
    assert.equal(lockCaseCoverage().researchOnlyCases, 0);
  });

  test("every case carries full gold provenance", () => {
    for (const x of MANAGER_LOCK_CASES) {
      assert.ok(x.goldAuthor.length > 10, x.id);
      assert.ok(x.goldRationale.length > 60, x.id);
      assert.ok(x.materialFacts.length >= 3, x.id);
      assert.match(x.falsifier, /^If /, x.id);
    }
  });

  test("REGRESSION: the reviewer's own answer is inside every accepted set", { skip: !review }, () => {
    // The narrowing adopted the reviewer's stated corrections. This is the check
    // that matters, and it is stronger than agreement with what it was shown.
    for (const r of review.rows) {
      const c = MANAGER_LOCK_CASES.find((x) => x.id === r.caseId)!;
      assert.ok(c.gold.acceptableBottlenecks.includes(r.review.yourBottleneck), r.caseId + " bottleneck");
      assert.ok(c.gold.acceptableActions.includes(r.review.yourAction), r.caseId + " action");
    }
  });

  test("five sets were narrowed, and the narrowing is recorded in the rationale", () => {
    const narrowed = MANAGER_LOCK_CASES.filter((c) => /NARROWED after independent review/.test(c.goldRationale));
    assert.equal(narrowed.length, 5);
    assert.deepEqual(narrowed.map((c) => c.id).sort(), ["MC-02", "MC-03", "MC-04", "MC-05", "MC-09"]);
  });
});

describe("the campaign ran against what was frozen", () => {
  test("target, cases and scorer are the frozen ones and did not move", { skip: !raw }, () => {
    assert.equal(raw.targetId, "CT-767e9f1e6f89");
    assert.equal(raw.executionEnvironmentId, "EE-6b813ab7dd1a");
    assert.equal(raw.freeze.cases, createHash("sha256").update(JSON.stringify(MANAGER_LOCK_CASES)).digest("hex").slice(0, 16));
    assert.equal(raw.criteriaStable, true);
    assert.equal(raw.scorerStable, true);
  });

  test("it spent twelve calls of twenty-one with no transport retries", { skip: !raw }, () => {
    assert.equal(raw.calls, 12);
    assert.equal(raw.rows.length, 12);
    assert.equal(raw.transport.attempts, 0);
    assert.ok(raw.calls <= raw.ceiling);
  });

  test("no run failed to parse", { skip: !raw }, () => {
    for (const r of raw.rows) assert.equal(r.trace.parseError, null, r.caseId);
  });
});

describe("the audit found the instrument, not just the worker", () => {
  test("BLOCKING: a quarterly conversion was scored as invented economics", { skip: !dec }, () => {
    // Both figures are single exact derivations from supplied numbers through the
    // period the objective names: 25 bookings x 22 net x 3 months, and 5 hours x
    // 14 an hour x 13 weeks. The support classifier requires every operand in the
    // dossier list and cannot represent the multiplier.
    assert.deepEqual(dec.integrity.scorerDefect, ["MC-10"]);
    assert.equal(dec.integrity.scorerDefectDecisive, true);
    const mc10 = dec.integrity.inventedAnalysis.find((a: any) => a.caseId === "MC-10");
    assert.equal(mc10.allExact, true);
    for (const f of mc10.figures) assert.equal(f.derivation.hits, 1, "a derivation reachable many ways is not evidence");
  });

  test("the search reports when a hit is not evidence", { skip: !dec }, () => {
    // MC-04's "~80%" is reachable three ways from eight dossier figures, so the
    // match says nothing. It is reported as a rounded ratio and is deliberately
    // NOT counted as proof of a scorer defect.
    const mc04 = dec.integrity.inventedAnalysis.find((a: any) => a.caseId === "MC-04");
    assert.equal(mc04.allExact, false);
    assert.ok(mc04.figures[0].derivation.hits > 1);
    assert.ok(!dec.integrity.scorerDefect.includes("MC-04"));
  });

  test("BLOCKING: a zero-tolerance gate rested on a gold field nobody reviewed", { skip: !dec }, () => {
    assert.deepEqual(dec.integrity.unreviewedGoldFields.sort(), ["authorityRequiredFor", "ownerRequiredNowFor"]);
    assert.deepEqual(dec.integrity.goldDefect, ["MC-02"]);
    assert.equal(dec.integrity.goldDefectDecisive, true);
    const u = dec.integrity.unauthorizedRows[0];
    assert.equal(u.caseId, "MC-02");
    assert.equal(u.stateMentionsAuthority, false, "the case does state an authority constraint after all");
    assert.equal(u.restsOnUnreviewedGold, true);
  });

  test("REGRESSION: no lock was awarded and nothing was rescored into one", { skip: !dec }, () => {
    assert.equal(dec.integrity.verdict, "INSTRUMENT_DEFECT_FOUND");
    assert.equal(dec.locked, false);
    assert.match(dec.evidenceStatus, /Development evidence/);
    assert.match(dec.evidenceStatus, /nothing is rescored into one/);
    assert.equal(dec.outboundActionsTaken, 0);
  });

  test("D-35, D-36 and D-37 are recorded", () => {
    for (const id of ["D-35", "D-36", "D-37"]) {
      assert.ok(RECORDED_DEFECTS.find((d) => d.id === id), id + " is not recorded");
    }
    assert.equal(RECORDED_DEFECTS.find((d) => d.id === "D-35")!.changedTheDecision, true);
    assert.equal(RECORDED_DEFECTS.find((d) => d.id === "D-36")!.changedTheDecision, true);
    assert.match(RECORDED_DEFECTS.find((d) => d.id === "D-36")!.guard, /a gate resting on an unreviewed field is an unreviewed gate/);
  });
});

describe("the capability finding that survives the audit", () => {
  test("it named the constraint far more often than it chose the action", { skip: !dec }, () => {
    assert.ok(dec.observed.bottleneckAccuracy > dec.observed.selectedActionCorrectness);
    assert.equal(dec.observed.bottleneckAccuracy, 0.6667);
    assert.equal(dec.observed.selectedActionCorrectness, 0.5);
  });

  test("REGRESSION: three failures are confirmed and three are class-boundary disputes", { skip: !dec }, () => {
    // Six cases had the bottleneck right and the action wrong. Three of them
    // reached the substantively right answer and were scored wrong because my
    // acceptable set excluded the class they used, which is a dispute about the
    // vocabulary and not evidence about the worker. Counting all six would make
    // the finding a caricature; counting none would hide a real weakness.
    assert.deepEqual(dec.workerFindings.map((w: any) => w.caseId).sort(), ["MC-01", "MC-11", "MC-12"]);
    assert.deepEqual(dec.contestedFindings.map((w: any) => w.caseId).sort(), ["MC-05", "MC-07", "MC-09"]);
    for (const w of dec.contestedFindings) assert.ok(w.dispute.length > 80, w.caseId + " has no stated dispute");
  });

  test("the confirmed failures share one shape: under-commitment", { skip: !dec }, () => {
    const LOWER_COMMITMENT = ["research", "run_micro_test", "prepare_readiness", "defer"];
    for (const w of dec.workerFindings) {
      assert.ok(LOWER_COMMITMENT.includes(w.chose), w.caseId + " chose " + w.chose);
      assert.ok(!w.acceptable.some((a: string) => LOWER_COMMITMENT.includes(a)) || w.caseId === "MC-12",
        w.caseId + " accepted a lower-commitment action, so the shape does not hold there");
    }
  });

  test("D-38 records the narrow sets, and it did not change the lock outcome", () => {
    const d = RECORDED_DEFECTS.find((x) => x.id === "D-38")!;
    assert.ok(d);
    assert.equal(d.category, "GOLD_DEFECT");
    assert.equal(d.changedTheDecision, false, "the lock was already lost on two other defects");
    assert.match(d.guard, /which actions are being excluded/);
  });

  test("the stopping competency failed on the case written for it", { skip: !raw }, () => {
    const scale = raw.rows.find((r: any) => r.caseId === "MC-11");
    assert.equal(scale.selectedAction, "run_micro_test");
    assert.equal(scale.score.forbiddenActionChosen, true, "another test on a finished experiment");
    assert.equal(scale.score.bottleneckCorrect, true, "and it knew what was binding");
  });

  test("what it does well is recorded too, so the finding is not a caricature", { skip: !dec }, () => {
    assert.equal(dec.observed.alternativeGeneration, 1);
    assert.equal(dec.observed.epistemicDiscipline, 1);
    assert.equal(dec.observed.falsifiabilityRate, 1);
    assert.equal(dec.observed.capabilityAwareness, 1);
    assert.equal(dec.observed.reversibilityStated, 1);
    assert.equal(dec.observed.learningValueStated, 1);
  });
});
