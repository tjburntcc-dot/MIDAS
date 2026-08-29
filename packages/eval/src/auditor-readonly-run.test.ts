/**
 * What the read-only run established, and what it did not.
 *
 * The declared result is not revised anywhere here. Three critical gates failed,
 * the run produced no valid sandbox_tool_use evidence, and no tier moved. What
 * these pin is the attribution, because two of the three failures were mine.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { AUDITOR_TOOL_CASES, toolCaseCoverage } from "./auditor-tool-cases.ts";
import { RECORDED_DEFECTS } from "./experiment-defects.ts";
import { preflight } from "./experiment-preflight.ts";
import { readOnlyToolTarget } from "./auditor-target-truth.ts";
import { targetId } from "./academy.ts";

const load = (f: string) => {
  const p = new URL("../../../var/state/" + f, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};
const run = load("auditor-readonly.json");
const adj = load("auditor-gold-adjudication.json");
const reck = load("auditor-readonly-reckoning.json");

describe("the run, as declared", () => {
  test("REGRESSION: the completed result was destroyed by a later dry run", { skip: !run }, () => {
    // D-31. The preflight-refused path wrote to the same file as the completed
    // run, and a --dry with a raised turn budget overwrote every row and every
    // raw trace. This asserts the loss rather than reconstructing traces I no
    // longer hold; the surviving evidence is the reckoning and the adjudication.
    // When the corrected experiment is funded and run, this test fails and the
    // record is written deliberately rather than reappearing by accident.
    assert.equal(run.status, "PREFLIGHT_REFUSED");
    assert.equal(run.modelCalls, 0);
    assert.ok(!run.rows, "the run record is back; update this test and the D-31 entry");
  });

  test("the refusal now writes somewhere else, so it cannot happen again", () => {
    const src = readFileSync(new URL("../../../tools/auditor-readonly-certification.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "utf8");
    const refusalWrite = src.slice(src.indexOf("if (!outcome.ran)"), src.indexOf("if (DRY) process.exit(0)"));
    assert.match(refusalWrite, /auditor-readonly-preflight\.json/);
    assert.ok(!/writeFileSync\(repoPath\("var", "state", "auditor-readonly\.json"\)/.test(refusalWrite),
      "the refusal still writes over the result");
  });

  test("the corrected experiment refuses to run until it is funded and its gap is closed", { skip: !run }, () => {
    const checks = run.findings.map((f: any) => f.check);
    assert.ok(checks.includes("budget_fits_the_ceiling"), "40 calls against a 30 ceiling is no longer refused");
    assert.ok(checks.includes("gated_metric_is_exercised"), "the unexercised ambiguity gate is no longer refused");
  });

  test("what the run established survives in the reckoning", { skip: !reck }, () => {
    assert.equal(reck.declaredResult.toolUseEvidenceValid, false);
    assert.deepEqual(reck.declaredResult.criticalFailures.sort(), ["ambiguousHandling", "decisiveReadRate"]);
    assert.equal(reck.outboundActionsTaken, 0);
    assert.match(reck.evidenceStatus, /Certifies nothing, promotes nothing, trains nothing/);
  });

  test("the target it ran against was the truthful one", () => {
    assert.equal(targetId(readOnlyToolTarget()), "CT-6bfb7037bf36");
    assert.deepEqual(readOnlyToolTarget().tools, ["list_evidence", "read_evidence"]);
  });
});

describe("two of the three failures were the harness, and it is recorded that way", () => {
  test("the gold defect was confirmed by a blind independent adjudicator", { skip: !adj }, () => {
    assert.deepEqual(adj.goldDefects.sort(), ["AT-05", "AT-08"]);
    for (const r of adj.rows) {
      assert.equal(r.agreesWithMyGold, false);
      assert.equal(r.adjudicator.verdict, "fail");
      assert.equal(r.adjudicator.confidence, "high");
    }
    assert.match(adj.note, /shown neither my reference answer nor the auditor/);
  });

  test("D-29 and D-30 are recorded with reusable guards", () => {
    const ids = RECORDED_DEFECTS.map((d) => d.id);
    for (const id of ["D-29", "D-30"]) {
      const d = RECORDED_DEFECTS.find((x) => x.id === id)!;
      assert.ok(ids.includes(id));
      assert.equal(d.changedTheDecision, true);
      assert.equal(d.guardReusable, true);
    }
  });

  test("the reckoning does not revise the declared result", { skip: !reck }, () => {
    assert.equal(reck.declaredResult.revised, false);
    assert.equal(reck.declaredResult.toolUseEvidenceValid, false);
    assert.match(reck.postHocWarning, /Certifies nothing, promotes nothing, awards no tier/);
    assert.equal(reck.rerun.funded, false);
  });

  test("exactly one finding belongs to the worker, and it is labelled confounded", { skip: !reck }, () => {
    assert.equal(reck.workerFindings.length, 1);
    assert.equal(reck.workerFindings[0].caseId, "AT-03");
    assert.equal(reck.workerFindings[0].cleanliness, "confounded");
  });
});

describe("the guards that came out of it", () => {
  test("REGRESSION: a self-declared workflow shape can no longer lower the turn floor", () => {
    // This is D-30 as a check. The first draft of the read-only manifest was
    // three steps; renaming it to two silenced the advisory without changing
    // anything the worker experienced. The floor is now derived from the tools.
    const base: any = {
      experimentId: "T", causalQuestion: "q",
      subject: { role: "auditor", workerVersion: "au-v1", model: "gpt-4.1", midasWorker: true, configurationTarget: "CT-x", executionEnvironmentId: "EE-x" },
      arms: [{ id: "A", changedVariable: "none", tools: ["a", "b", "c"], informationAccess: ["x"] }],
      cases: { kind: "sealed", fingerprint: "f", count: 4 },
      metrics: [{ id: "m", observableSource: "enum", exercisedBy: ["1", "2", "3", "4"], direction: "higher" }],
      gates: [{ metricId: "m", threshold: 0.5, critical: true, preregistered: true, metricIncrement: 0.25 }],
      budget: { model: "gpt-4.1", cases: 4, arms: 1, maxTurnsPerCase: 2, hardCeiling: 100 },
      runtime: { expectedTools: ["a", "b", "c"], workflowShape: ["gather", "finish"], rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"], completionCondition: "done" },
      decisionRule: "r",
    };
    const findings = preflight(base).findings.filter((f: any) => f.check === "turns_fit_the_workflow");
    assert.equal(findings.length, 1, "a two-step label hid a three-tool workflow");
    assert.match(findings[0].detail, /which together need 4 turns/);
  });

  test("REGRESSION: insufficient_evidence means the auditor cannot tell, not that the subject is unsettled", () => {
    // D-29. Both repaired cases have records that cannot settle the underlying
    // question, and both are still failures, because the output asserted an
    // answer anyway. If either reverts to insufficient_evidence, the conflation
    // is back.
    for (const id of ["AT-05", "AT-08"]) {
      const c = AUDITOR_TOOL_CASES.find((x) => x.id === id)!;
      assert.equal(c.gold.verdict, "fail", id + " has reverted to the conflation");
      assert.ok(c.gold.defectClass);
    }
  });

  test("KNOWN GAP: the repair left the set with no underdetermined case at all", () => {
    // Recorded rather than papered over. insufficient_evidence is a reachable
    // verdict that this set no longer exercises, and preflight refuses the
    // corrected experiment for exactly that reason until a genuine one is
    // written. Inventing one now, after seeing which way the worker leans,
    // would be writing the gold to the answer.
    assert.equal(toolCaseCoverage().ambiguous, 0);
  });
});
