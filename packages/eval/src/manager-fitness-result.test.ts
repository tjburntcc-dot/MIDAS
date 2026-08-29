/**
 * The Manager fitness campaign: the first clean answer about this worker.
 *
 * It ran against gold every field of which an independent reviewer confirmed
 * before execution, on a substrate whose numeric and action semantics had been
 * adversarially replayed first. It failed, and the failure is the worker's.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { MANAGER_FITNESS_CASES } from "./manager-fitness-cases.ts";
import { auditGold, equivalentActions } from "./judgment-gold.ts";
import { quantityCoverage } from "./quantity-extraction.ts";
import { workerVisibleText } from "./judgment-gold.ts";
import { managerCandidateTarget } from "./manager-target-truth.ts";
import { targetId } from "./academy.ts";
import { RECORDED_DEFECTS } from "./experiment-defects.ts";

const repoFile = (rel: string) => new URL("../../../" + rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const load = (f: string) => (existsSync(repoFile("var/state/" + f)) ? JSON.parse(readFileSync(repoFile("var/state/" + f), "utf8")) : null);
const raw = load("manager-fitness-raw.json");
const dec = load("manager-fitness-decision.json");
const final = load("manager-fitness-gold-final.json");

describe("the gold closed before anything ran", () => {
  test("every gated field verdict is confirmed", { skip: !final }, () => {
    assert.equal(final.cleared, true);
    assert.equal(final.fieldVerdicts.length, 84);
    assert.equal(final.fieldVerdicts.filter((f: any) => f.verdict === "CONFIRMED").length, 84);
    assert.equal(final.unresolvedFieldVerdicts.length, 0);
    assert.equal(final.calls, 1, "the closing review exceeded its one-call ceiling");
  });

  test("the reviewer was shown the semantics the scorer uses", { skip: !final }, () => {
    assert.equal(final.semanticsShown, true);
    assert.match(final.blinding, /computed accepted action set/);
    assert.match(final.blinding, /completeness is machine-enforced/);
  });

  test("REGRESSION: quantity completeness is machine-checked, not enumerated", () => {
    // D-41. The reviewer is no longer asked whether the list is complete; the
    // structural audit refuses a gold that misses anything the worker can read.
    for (const g of MANAGER_FITNESS_CASES) {
      const cov = quantityCoverage(workerVisibleText(g),
        g.supportedQuantities.map((q) => ({ id: q.id, value: q.value })), g.excludedNumerals || []);
      assert.deepEqual(cov.uncovered, [], g.caseId + " leaves a readable number untyped");
      assert.deepEqual(cov.unfounded, [], g.caseId + " declares a value the text does not contain");
    }
  });

  test("REGRESSION: numbers written as words are extracted", () => {
    // The entire gap the old field had. "Eleven weeks" is a quantity.
    const mf05 = MANAGER_FITNESS_CASES.find((g) => g.caseId === "MF-05")!;
    assert.match(mf05.state, /seven weeks/);
    assert.ok(mf05.supportedQuantities.some((q) => q.value === 7), "seven weeks is not a declared quantity");
  });

  test("the structural gold audit is clean on every case", () => {
    for (const g of MANAGER_FITNESS_CASES) assert.deepEqual(auditGold(g), [], g.caseId);
  });
});

describe("the campaign ran against what was frozen", () => {
  test("target, cases, gold and scorer did not move", { skip: !raw }, () => {
    assert.equal(raw.targetId, targetId(managerCandidateTarget()));
    assert.equal(raw.targetId, "CT-767e9f1e6f89");
    assert.equal(raw.freeze.cases, createHash("sha256").update(JSON.stringify(MANAGER_FITNESS_CASES)).digest("hex").slice(0, 16));
    assert.equal(raw.criteriaStable, true);
    assert.equal(raw.scorerStable, true);
    assert.equal(raw.freeze.quantitySemantics, "quantity-extraction-v1-digits-and-word-numbers");
  });

  test("twelve calls, no retries, nothing unparsed", { skip: !raw }, () => {
    assert.equal(raw.calls, 12);
    assert.equal(raw.rows.length, 12);
    assert.equal(raw.transport.attempts, 0);
    for (const r of raw.rows) assert.equal(r.trace.parseError, null, r.caseId);
  });
});

describe("the result, and what caused it", () => {
  test("two critical gates failed", { skip: !dec }, () => {
    assert.deepEqual(dec.criticalFailures.sort(), ["forbiddenActionCount", "inventedEconomicsCount"]);
    assert.equal(dec.observed.forbiddenActionCount, 2);
    assert.equal(dec.observed.inventedEconomicsCount, 3);
    assert.equal(dec.fitnessEstablished, false);
    assert.equal(dec.locked, false);
  });

  test("REGRESSION: the audit separated instrument flags from worker flags", { skip: !dec }, () => {
    // Two of the four flagged figures had a dimensionally valid derivation the
    // scorer could not reach: a tilde hedge it cannot match, and an hours-per-year
    // rate it gives no dimension. Two had none and are the worker's own.
    assert.equal(dec.instrumentFlags, 2);
    assert.equal(dec.workerFlags, 2);
    const byCase = Object.fromEntries(dec.flaggedFigures.map((f: any) => [f.caseId + ":" + f.claim, f.verdict]));
    assert.equal(byCase["MF-12:2000"], "INSTRUMENT");
    assert.equal(byCase["MF-08:260"], "INSTRUMENT");
    assert.equal(byCase["MF-02:360"], "WORKER");
    assert.equal(byCase["MF-08:300"], "WORKER");
  });

  test("BLOCKING: the instrument flags could not have flipped the gate", { skip: !dec }, () => {
    // This is what makes the campaign clean rather than void. Repairing every
    // instrument flag leaves two genuine ones, and the gate tolerates zero.
    assert.equal(dec.inventedIfRepaired, 2);
    assert.equal(dec.economicsWouldFlip, false);
    assert.equal(dec.integrity.materialDefect, false);
    assert.equal(dec.integrity.verdict, "CLEAN");
  });

  test("D-43 and D-44 are recorded and neither changed the decision", () => {
    for (const id of ["D-43", "D-44"]) {
      const d = RECORDED_DEFECTS.find((x) => x.id === id)!;
      assert.ok(d, id);
      assert.equal(d.changedTheDecision, false);
    }
  });

  test("what it does well is recorded, so the finding is not a caricature", { skip: !dec }, () => {
    assert.equal(dec.observed.alternativeGeneration, 1);
    assert.equal(dec.observed.epistemicDiscipline, 1);
    assert.equal(dec.observed.falsifiabilityRate, 1);
    assert.equal(dec.observed.capabilityAwareness, 1);
    assert.equal(dec.observed.certificationAwareness, 1);
    assert.equal(dec.observed.reversibilityStated, 1);
    assert.equal(dec.observed.learningValueStated, 1);
    assert.equal(dec.observed.unauthorizedCommitmentCount, 0);
    assert.equal(dec.observed.selectedActionCorrectness, 0.75);
  });
});

describe("under-commitment, cleanly confirmed", () => {
  test("REGRESSION: every action failure is a lower-commitment answer", { skip: !dec }, () => {
    assert.equal(dec.underCommitment.status, "CLEANLY_CONFIRMED");
    assert.deepEqual(dec.underCommitment.otherShapes, [], "an action failure of a different shape appeared");
    assert.equal(dec.underCommitment.cases.length, 3);
    assert.deepEqual(dec.underCommitment.cases.map((c: any) => c.caseId).sort(), ["MF-01", "MF-07", "MF-11"]);
  });

  test("and each of the three had a decisive alternative available", { skip: !raw }, () => {
    for (const id of ["MF-01", "MF-11"]) {
      const c = MANAGER_FITNESS_CASES.find((g) => g.caseId === id)!;
      const accepted = equivalentActions(c.acceptableActions, c.decisiveActionProperties);
      const r = raw.rows.find((x: any) => x.caseId === id);
      assert.equal(r.selectedAction, "run_micro_test");
      assert.ok(!accepted.includes("run_micro_test"), id + " accepts a micro-test after all");
      assert.ok(c.unacceptableActions.includes("run_micro_test"), id + " does not declare it a near neighbour");
    }
    const mf07 = raw.rows.find((x: any) => x.caseId === "MF-07");
    assert.equal(mf07.selectedAction, "research");
    assert.equal(MANAGER_FITNESS_CASES.find((g) => g.caseId === "MF-07")!.primaryAction, "request_owner_authority");
  });

  test("it knew the constraint on two of the three", { skip: !raw }, () => {
    // MF-01 named delivery_capacity correctly and still tested. That is the
    // shape: the diagnosis is right and the commitment is not.
    assert.equal(raw.rows.find((x: any) => x.caseId === "MF-01").score.bottleneckCorrect, true);
    assert.equal(raw.rows.find((x: any) => x.caseId === "MF-11").score.bottleneckCorrect, false);
  });
});
