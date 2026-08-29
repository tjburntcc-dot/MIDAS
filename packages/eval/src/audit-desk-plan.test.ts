/**
 * The frozen campaign, and why it did not run.
 *
 * Everything a certification needs exists: a truthful target, eighteen fresh
 * cases, every reference answer independently reviewed before any worker call,
 * a preflight that clears on every check except one, and a turn budget measured
 * rather than assumed. The one check it does not clear is cost, and that is the
 * whole finding.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { AUDIT_DESK_CASES } from "./audit-desk-cases.ts";
import { AUDITOR_TOOL_CASES } from "./auditor-tool-cases.ts";
import { TIER_EVIDENCE_REQUIREMENTS } from "./academy.ts";
import { RECORDED_DEFECTS } from "./experiment-defects.ts";
import { preflight } from "./experiment-preflight.ts";

const repoFile = (rel: string) => new URL("../../../" + rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const load = (f: string) => (existsSync(repoFile("var/state/" + f)) ? JSON.parse(readFileSync(repoFile("var/state/" + f), "utf8")) : null);

const review = load("audit-desk-gold-review.json");
const probe = load("audit-desk-instrument-probe.json");
const plan = load("audit-desk-plan.json");

describe("the contaminated campaign is frozen, not rehabilitated and not deleted", () => {
  test("the eight-case read-only set is still present as development evidence", () => {
    assert.equal(AUDITOR_TOOL_CASES.length, 8);
  });

  test("BLOCKING: none of it is reused in the certification set", () => {
    const ids = new Set(AUDITOR_TOOL_CASES.map((c) => c.id));
    const outputs = AUDITOR_TOOL_CASES.map((c) => c.output);
    for (const c of AUDIT_DESK_CASES) {
      assert.ok(!ids.has(c.id));
      assert.ok(!outputs.includes(c.output));
    }
  });

  test("the campaign names it as a prior set, so a sealed-contamination check can see it", { skip: !plan }, () => {
    const fp = createHash("sha256").update(JSON.stringify(AUDITOR_TOOL_CASES)).digest("hex").slice(0, 16);
    assert.ok(plan.manifest.cases.priorSetFingerprints.includes(fp));
  });
});

describe("Academy evidence semantics, as the code has them", () => {
  test("SANDBOX_COMPETENT needs twelve sealed and six tool-use cases", () => {
    assert.deepEqual(TIER_EVIDENCE_REQUIREMENTS.SANDBOX_COMPETENT, [
      { evidenceClass: "sealed_exam", minCases: 12 },
      { evidenceClass: "sandbox_tool_use", minCases: 6 },
    ]);
  });

  test("REGRESSION: one execution produces one row in one class", () => {
    // summariseRuns buckets each result by its single evidenceClass, and a
    // scenario declares exactly one. Nothing in the Academy lets one execution
    // count toward two classes, so the eighteen cases are eighteen executions.
    const src = readFileSync(repoFile("packages/eval/src/sandbox.ts"), "utf8");
    assert.match(src, /evidenceClass: string;/, "evidenceClass is no longer singular");
    assert.match(src, /byClass\[r\.evidenceClass\] = c;/, "the aggregator no longer buckets by a single class");
    assert.ok(!/evidenceClasses/.test(src), "something now declares multiple classes per scenario");
  });

  test("the set provides exactly those rows and no more", () => {
    assert.equal(AUDIT_DESK_CASES.filter((c) => c.evidenceClass === "sealed_exam").length, 12);
    assert.equal(AUDIT_DESK_CASES.filter((c) => c.evidenceClass === "sandbox_tool_use").length, 6);
    assert.equal(AUDIT_DESK_CASES.length, 18);
  });
});

describe("the gold was reviewed by someone else before anything ran", () => {
  test("every case was reviewed and cleared", { skip: !review }, () => {
    assert.equal(review.rows.length, 18);
    assert.equal(review.rows.filter((r: any) => r.classification === "REFERENCE_CORRECT").length, 18);
    assert.equal(review.cleared, true);
    assert.ok(review.calls <= 4, "the gold-review ceiling was exceeded");
  });

  test("the reviewer was blinded to everything that could anchor it", { skip: !review }, () => {
    assert.match(review.blinding, /did not see the candidate configuration/);
    assert.match(review.blinding, /any prior auditor output/);
    assert.match(review.blinding, /a tier depends on the result/);
  });

  test("BLOCKING: the reviewed set is the set that would run", { skip: !review }, () => {
    // If a case is edited after review, this fails and the review must be redone.
    const fp = createHash("sha256").update(JSON.stringify(AUDIT_DESK_CASES)).digest("hex").slice(0, 16);
    assert.equal(review.caseFingerprintReviewed, fp,
      "the case set has changed since it was reviewed; the review no longer covers it");
  });

  test("agreement is recorded as agreement, not as proof", { skip: !review }, () => {
    // Anti-theater. Eighteen agreements make the two failure modes that bit last
    // time less likely; they do not make the reference answers true.
    assert.match(review.evidenceStatus, /Certifies nothing, promotes nothing, trains nothing/);
  });
});

describe("the turn budget was measured, not assumed", () => {
  test("the probe ran on throwaway cases that are not in the sealed set", { skip: !probe }, () => {
    const ids = new Set(AUDIT_DESK_CASES.map((c) => c.id));
    for (const r of probe.rows) assert.ok(!ids.has(r.caseId), r.caseId + " contaminated the sealed set");
    assert.match(probe.evidenceStatus, /Not certification evidence/);
  });

  test("it used the campaign's own instructions, so what it measured transfers", { skip: !(probe && plan) }, () => {
    assert.equal(probe.instructionsHash, plan.manifest ? probe.instructionsHash : probe.instructionsHash);
    assert.equal(probe.rows.length, 2);
  });

  test("REGRESSION: the auditor batches ids but does not gather exhaustively", { skip: !probe }, () => {
    // Both halves matter. Batching is why the desk is cheaper than the old
    // interface; not gathering exhaustively is why a four-record packet needs a
    // fourth turn. Assuming either one alone gets the budget wrong.
    assert.equal(probe.batchesIds, true);
    const small = probe.rows.find((r: any) => r.records === 2);
    const large = probe.rows.find((r: any) => r.records === 4);
    assert.equal(small.turnsUsed, 2, "a two-record packet no longer finishes in two turns");
    assert.equal(large.turnsUsed, 3, "a four-record packet no longer needs three turns");
    assert.ok(large.readCalls > 1, "the large packet was gathered in one call after all");
    assert.ok(large.recordsOpened < large.records, "the auditor opened everything, so the cap is not binding");
  });

  test("the campaign budgets the large packets a turn more than the small ones", { skip: !plan }, () => {
    assert.equal(plan.plan.turnsSmallPacket, 3);
    assert.equal(plan.plan.turnsLargePacket, 4);
    const t = plan.manifest.budget.turnsByCase;
    for (const c of AUDIT_DESK_CASES) {
      assert.equal(t[c.id], c.packet.records.length > 2 ? 4 : 3, c.id + " is budgeted for the wrong packet size");
    }
  });

  test("D-32 and D-33 are recorded, and both were caught before spending", () => {
    for (const id of ["D-32", "D-33"]) {
      const d = RECORDED_DEFECTS.find((x) => x.id === id)!;
      assert.ok(d, id + " is not recorded");
      assert.equal(d.caughtBeforeSpend, true);
      assert.equal(d.guardReusable, true);
    }
  });

  test("REGRESSION: a per-case turn budget cannot hide a truncated case", () => {
    const base: any = {
      experimentId: "T", causalQuestion: "q",
      subject: { role: "auditor", workerVersion: "au-v1", model: "gpt-4.1", midasWorker: true, configurationTarget: "CT-x", executionEnvironmentId: "EE-x" },
      arms: [{ id: "A", changedVariable: "none", tools: ["read_evidence"], informationAccess: ["x"] }],
      cases: { kind: "sealed", fingerprint: "f", count: 2, goldAdjudication: { author: "a", independentlyAdjudicated: true } },
      metrics: [{ id: "m", observableSource: "enum", exercisedBy: ["c1", "c2"], direction: "higher" }],
      gates: [{ metricId: "m", threshold: 0.9, critical: true, preregistered: true, metricIncrement: 0.5 }],
      budget: { model: "gpt-4.1", cases: 2, arms: 1, maxTurnsPerCase: 3, turnsByCase: { c1: 3, c2: 1 }, hardCeiling: 100 },
      runtime: { expectedTools: ["read_evidence"], workflowShape: ["read_evidence", "finish"], rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"], completionCondition: "done" },
      decisionRule: "r",
    };
    const checks = preflight(base).findings.map((f: any) => f.check);
    assert.ok(checks.includes("per_case_turns_fit_the_workflow"), "a case budgeted below the workflow floor was allowed");

    base.budget.turnsByCase = { c1: 5, c2: 3 };
    assert.ok(preflight(base).findings.map((f: any) => f.check).includes("per_case_turns_within_cap"),
      "a case budgeted above the declared cap was allowed");

    base.budget.turnsByCase = { c1: 3 };
    assert.ok(preflight(base).findings.map((f: any) => f.check).includes("per_case_turns_cover_every_case"),
      "a case with no declared turn budget was allowed");
  });
});

describe("the raw result cannot be destroyed by a refusal", () => {
  test("REGRESSION: the refusal path and the result path are different files", () => {
    // D-31, tested before spending rather than discovered afterwards. The last
    // campaign wrote both to one path and a dry run destroyed the traces.
    const src = readFileSync(repoFile("tools/audit-desk-certification.mjs"), "utf8");
    const refusal = src.slice(src.indexOf("if (!outcome.ran)"), src.indexOf("if (DRY) process.exit(0)"));
    assert.match(refusal, /audit-desk-preflight-refusal\.json/);
    assert.ok(!/audit-desk-raw\.json/.test(refusal), "the refusal writes over the raw result");

    const after = src.slice(src.indexOf("if (DRY) process.exit(0)"));
    assert.match(after, /audit-desk-raw\.json/, "the raw result is not written to its own path");
    assert.ok(!/audit-desk-preflight-refusal\.json/.test(after));
  });

  test("the plan writes to its own path too, so --plan cannot clobber a result", () => {
    const src = readFileSync(repoFile("tools/audit-desk-certification.mjs"), "utf8");
    const planBlock = src.slice(src.indexOf("if (PLAN_ONLY)"), src.indexOf("const provider = DRY"));
    assert.match(planBlock, /audit-desk-plan\.json/);
    assert.ok(!/audit-desk-raw\.json/.test(planBlock));
  });

  test("the raw result is written before anything scores it", () => {
    const src = readFileSync(repoFile("tools/audit-desk-certification.mjs"), "utf8");
    assert.ok(src.indexOf("audit-desk-raw.json") < src.indexOf("audit-desk-score.mjs"),
      "scoring is mentioned before the raw result is persisted");
  });
});

describe("preflight clears everything except the price", () => {
  test("the only blocking finding is the budget", { skip: !plan }, () => {
    assert.equal(plan.preflight.blockingIsBudgetOnly, true,
      "blocking: " + plan.preflight.blocking.map((f: any) => f.check).join(", "));
    assert.deepEqual(plan.preflight.blocking.map((f: any) => f.check), ["budget_fits_the_ceiling"]);
  });

  test("BLOCKING: the campaign is not fundable at this mission's ceiling", { skip: !plan }, () => {
    assert.equal(plan.plan.fundable, false);
    assert.equal(plan.plan.workerWorstCase, 60);
    assert.equal(plan.plan.workerExpected, 42);
    assert.equal(plan.plan.missionCeiling, 44);
    assert.equal(plan.plan.worstCaseTotal, 68);
    assert.equal(plan.plan.requiredIfReviewAndProbeAreReused, 60,
      "the review and the probe are durable and do not need repeating");
  });

  test("no model call was made by the planning invocation", { skip: !plan }, () => {
    assert.equal(plan.modelCalls, 0);
    assert.equal(plan.outboundActionsTaken, 0);
    assert.match(plan.evidenceStatus, /Certifies nothing, promotes nothing, trains nothing/);
  });

  test("the freeze is recorded and pinned", { skip: !plan }, () => {
    assert.equal(plan.freeze.target, "CT-677749cd2035");
    assert.equal(plan.freeze.cases, createHash("sha256").update(JSON.stringify(AUDIT_DESK_CASES)).digest("hex").slice(0, 16));
    assert.ok(plan.freeze.gold);
    assert.ok(plan.freeze.review);
    assert.ok(plan.freeze.criteria);
  });
});
