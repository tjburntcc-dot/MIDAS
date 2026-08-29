/**
 * The preflight, tested against the experiments that actually went wrong.
 *
 * Each blocking case below is a defect this repository paid for. Each passing
 * case is a legitimate experiment that must not be obstructed, because a
 * preflight that refuses everything gets bypassed and then guards nothing.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { preflight, informationValueStop, criteriaFingerprint } from "./experiment-preflight.ts";
import { RECORDED_DEFECTS, DEFECT_CATEGORIES, defectSummary } from "./experiment-defects.ts";

/** A manifest that clears preflight. Each test breaks exactly one thing. */
function valid(over: any = {}): any {
  const base = {
    experimentId: "EX-1",
    causalQuestion: "Does the doctrine improve action selection over the contract alone?",
    subject: {
      role: "manager", workerVersion: "mg-v1", model: "gpt-4.1", midasWorker: true,
      configurationTarget: "CT-0e5a5558c3f1", executionEnvironmentId: "EE-8880ef0d5a0f",
    },
    arms: [
      { id: "A_baseline_generic", changedVariable: "none, control", tools: [], promptId: "p0", contractId: "c0", policyId: "pol0", genericBaseline: true, informationAccess: ["f1", "f2"] },
      { id: "B_contract", changedVariable: "the output contract", tools: [], promptId: "p0", contractId: "c1", policyId: "pol0", informationAccess: ["f1", "f2"] },
    ],
    cases: { kind: "sealed", fingerprint: "abc123", count: 12, priorSetFingerprints: ["old999"], answerPhrases: {}, caseTexts: {} },
    metrics: [
      { id: "selectedActionCorrectness", observableSource: "enum field selectedAction against gold set", exercisedBy: Array.from({ length: 12 }, (_, i) => "c" + i), direction: "higher" },
    ],
    gates: [{ metricId: "selectedActionCorrectness", threshold: 0.75, critical: true, preregistered: true }],
    budget: { model: "gpt-4.1", cases: 12, arms: 2, maxTurnsPerCase: 1, hardCeiling: 30 },
    runtime: { expectedTools: [], workflowShape: ["decide"], rawTraceCaptured: [], completionCondition: "a decision is emitted" },
    decisionRule: "Promote only if every preregistered gate passes.",
  };
  return { ...base, ...over };
}

const blocks = (m: any, check: string) => {
  const r = preflight(m);
  assert.equal(r.ok, false, "preflight cleared an experiment it should have refused: " + check);
  assert.ok(r.blocking.some((x) => x.check === check),
    "expected a blocking finding " + check + ", got " + JSON.stringify(r.blocking.map((x) => x.check)));
};

describe("legitimate experiments are not obstructed", () => {
  test("a well-formed single-shot comparison clears", () => {
    const r = preflight(valid());
    assert.equal(r.ok, true, JSON.stringify(r.blocking));
  });

  test("a well-formed multi-turn tool experiment clears", () => {
    const r = preflight(valid({
      arms: [
        { id: "A_raw", changedVariable: "none, control", tools: ["list_state", "read_state"], promptId: "p0", contractId: "c0", policyId: "pol0" },
        { id: "C_stateful", changedVariable: "state is retrieved rather than supplied", tools: ["list_state", "read_state"], promptId: "p0", contractId: "c0", policyId: "pol0" },
      ],
      budget: { model: "gpt-4.1", cases: 7, arms: 2, maxTurnsPerCase: 4, hardCeiling: 60, perArmReserve: { A_raw: 7, C_stateful: 28 } },
      runtime: {
        expectedTools: ["list_state", "read_state"], workflowShape: ["list", "read", "decide"],
        rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"],
        completionCondition: "a decision is emitted",
      },
    }));
    assert.equal(r.ok, true, JSON.stringify(r.blocking));
  });

  test("a labelled post-hoc rescore of stored outputs clears without an actor check", () => {
    const r = preflight(valid({
      postHocDiagnosticOnly: true,
      causalQuestion: "How much of the certification rejection was scorer error?",
      subject: { ...valid().subject, midasWorker: false, workerVersion: null },
      criteriaBeforeRun: "x", criteriaAfterRun: "y",
    }));
    assert.equal(r.ok, true, JSON.stringify(r.blocking));
  });
});

describe("every defect this repository paid for is now refused", () => {
  test("D-01 a bare model on a certification path", () => {
    blocks(valid({
      causalQuestion: "Certify the qualifier against the academy tiers.",
      subject: { ...valid().subject, midasWorker: false },
    }), "actor_is_a_midas_worker");
  });

  test("D-19 no execution environment on the subject", () => {
    blocks(valid({ subject: { ...valid().subject, executionEnvironmentId: "" } }), "environment_declared");
  });

  test("D-22 an arm that differs in more than its declared variable", () => {
    blocks(valid({
      arms: [
        { id: "A", changedVariable: "none", tools: [], promptId: "p0", contractId: "c0", policyId: "pol0" },
        { id: "B", changedVariable: "the contract", tools: ["a_tool"], promptId: "p1", contractId: "c1", policyId: "pol1" },
      ],
    }), "one_variable_per_arm");
  });

  test("D-22 an information parity violation", () => {
    blocks(valid({
      arms: [
        { id: "A", changedVariable: "none", tools: [], promptId: "p0", contractId: "c0", policyId: "pol0", informationAccess: ["f1", "f2"] },
        { id: "B", changedVariable: "arrangement", tools: [], promptId: "p0", contractId: "c0", policyId: "pol0", informationAccess: ["f1", "f2", "f3"] },
      ],
    }), "information_parity");
  });

  test("D-23 a sealed set that already informed a diagnosis", () => {
    blocks(valid({ cases: { ...valid().cases, priorSetFingerprints: ["abc123"] } }), "sealed_set_is_fresh");
  });

  test("D-05 a case that contains its own answer", () => {
    blocks(valid({
      cases: {
        ...valid().cases,
        answerPhrases: { c1: ["stop spend"] },
        caseTexts: { c1: "The owner should stop spend on the campaign immediately." },
      },
    }), "no_answer_leakage");
  });

  test("D-20 a gate on a metric no case exercises", () => {
    blocks(valid({
      metrics: [{ id: "selectedActionCorrectness", observableSource: "enum field", exercisedBy: [], direction: "higher" }],
    }), "gated_metric_is_exercised");
  });

  test("D-18 a gate that is not preregistered", () => {
    blocks(valid({ gates: [{ metricId: "selectedActionCorrectness", threshold: 0.75, critical: true, preregistered: false }] }),
      "gates_are_preregistered");
  });

  test("D-12 a rate computed from a free string", () => {
    blocks(valid({
      metrics: [{ id: "ownerInterruptionCorrectRate", observableSource: "free string field ownerActionRequired", exercisedBy: ["c1"], direction: "higher" }],
      gates: [{ metricId: "ownerInterruptionCorrectRate", threshold: 0.6, critical: false, preregistered: true }],
    }), "scorer_reads_a_categorical_field");
  });

  test("D-13 a workflow that needs a tool no arm offers", () => {
    blocks(valid({
      runtime: { expectedTools: ["read_state"], workflowShape: ["read", "decide"], rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"], completionCondition: "x" },
      budget: { model: "gpt-4.1", cases: 12, arms: 2, maxTurnsPerCase: 2, hardCeiling: 60, perArmReserve: { A_baseline_generic: 12, B_contract: 12 } },
    }), "expected_tool_is_offered");
  });

  test("D-15 a turn budget shorter than the workflow", () => {
    blocks(valid({
      arms: valid().arms.map((a: any) => ({ ...a, tools: ["list_state", "read_state"] })),
      runtime: { expectedTools: ["list_state", "read_state"], workflowShape: ["list", "read", "decide"], rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"], completionCondition: "x" },
      budget: { model: "gpt-4.1", cases: 7, arms: 2, maxTurnsPerCase: 2, hardCeiling: 60, perArmReserve: { A_baseline_generic: 14, B_contract: 14 } },
    }), "turns_fit_the_workflow");
  });

  test("D-16 cases planned as calls", () => {
    blocks(valid({
      budget: { model: "gpt-4.1", cases: 6, arms: 2, maxTurnsPerCase: 3, hardCeiling: 12, perArmReserve: { A_baseline_generic: 6, B_contract: 6 } },
      arms: valid().arms.map((a: any) => ({ ...a, tools: ["t"] })),
      runtime: { expectedTools: ["t"], workflowShape: ["list", "read", "decide"], rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"], completionCondition: "x" },
    }), "budget_fits_the_ceiling");
  });

  test("D-17 a multi-turn multi-arm run with no per-arm reserve", () => {
    blocks(valid({
      arms: valid().arms.map((a: any) => ({ ...a, tools: ["t"] })),
      budget: { model: "gpt-4.1", cases: 7, arms: 2, maxTurnsPerCase: 4, hardCeiling: 60 },
      runtime: { expectedTools: ["t"], workflowShape: ["list", "read", "decide"], rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"], completionCondition: "x" },
    }), "per_arm_reservation");
  });

  test("D-08 a margin one case can satisfy on its own", () => {
    blocks(valid({
      metrics: [{ id: "escalationRecall", observableSource: "escalate action present", exercisedBy: ["c1", "c2", "c3"], direction: "higher" }],
      gates: [{ metricId: "escalationRecall", threshold: 0.33, critical: false, preregistered: true }],
    }), "decision_resolution");
  });

  test("D-21 a tool experiment that does not capture its trace", () => {
    blocks(valid({
      arms: valid().arms.map((a: any) => ({ ...a, tools: ["list_state"] })),
      runtime: { expectedTools: ["list_state"], workflowShape: ["list", "decide"], rawTraceCaptured: ["final_output"], completionCondition: "x" },
      budget: { model: "gpt-4.1", cases: 7, arms: 2, maxTurnsPerCase: 3, hardCeiling: 60, perArmReserve: { A_baseline_generic: 21, B_contract: 21 } },
    }), "raw_trace_is_sufficient");
  });

  test("D-18 a criterion mutated between declaration and reporting", () => {
    blocks(valid({ criteriaBeforeRun: "before", criteriaAfterRun: "after" }), "criteria_unchanged");
  });
});

describe("advisory findings warn without blocking", () => {
  test("a turn budget exactly equal to the workflow is a warning, not a refusal", () => {
    const r = preflight(valid({
      arms: valid().arms.map((a: any) => ({ ...a, tools: ["t"] })),
      runtime: { expectedTools: ["t"], workflowShape: ["list", "read", "decide"], rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"], completionCondition: "x" },
      budget: { model: "gpt-4.1", cases: 7, arms: 2, maxTurnsPerCase: 3, hardCeiling: 60, perArmReserve: { A_baseline_generic: 21, B_contract: 21 } },
    }));
    assert.equal(r.ok, true);
    assert.ok(r.findings.some((x) => x.check === "turns_survive_one_wasted_call" && x.severity === "advisory"));
  });
});

describe("the early stop cannot be used to cherry-pick", () => {
  test("an undeclared stop is refused", () => {
    assert.equal(informationValueStop(false, "candidate failed the development test", true).stop, false);
  });

  test("a preregistered stop that is met terminates later stages", () => {
    const r = informationValueStop(true, "candidate failed the development test", true);
    assert.equal(r.stop, true);
    assert.match(r.reason, /Preregistered/);
  });

  test("a preregistered stop that is not met does not", () => {
    assert.equal(informationValueStop(true, "candidate failed", false).stop, false);
  });
});

describe("the criteria fingerprint moves only with the criteria", () => {
  test("a changed gate changes it, a changed comment does not", () => {
    const a = criteriaFingerprint(valid());
    const sameMeaning = criteriaFingerprint(valid({ causalQuestion: "Reworded question, same experiment." }));
    const differentGate = criteriaFingerprint(valid({ gates: [{ metricId: "selectedActionCorrectness", threshold: 0.9, critical: true, preregistered: true }] }));
    assert.equal(a, sameMeaning);
    assert.notEqual(a, differentGate);
  });
});

describe("the inventory this was built from", () => {
  test("every recorded defect uses a declared category", () => {
    for (const d of RECORDED_DEFECTS) {
      assert.ok((DEFECT_CATEGORIES as readonly string[]).includes(d.category), d.id + " " + d.category);
      assert.ok(d.what.length > 60, d.id + " is too thin to be a lesson");
      assert.ok(d.where.length > 5, d.id);
    }
    assert.equal(new Set(RECORDED_DEFECTS.map((d) => d.id)).size, RECORDED_DEFECTS.length);
  });

  test("the claim that harness defects dominate is checkable", () => {
    const s = defectSummary();
    assert.ok(s.total >= 20, "only " + s.total + " defects recorded");
    assert.ok(s.caughtAfterSpend > s.caughtBeforeSpend,
      "the inventory would not support the claim that most were found only after spending");
    assert.ok(s.changedTheDecision >= 8, "only " + s.changedTheDecision + " changed a decision");
  });

  test("REGRESSION: every category that changed a decision has a preflight check", () => {
    // The rule this layer exists for: a category that has already cost a verdict
    // must not be able to cost another silently.
    const costly = [...new Set(RECORDED_DEFECTS.filter((d) => d.changedTheDecision).map((d) => d.category))];
    const covered = new Set([
      "ACTOR_IDENTITY", "CASE_DESIGN", "SCORER_DEFECT", "STATISTICAL_RESOLUTION",
      "TOOL_AFFORDANCE", "RUNTIME_TRUNCATION", "BUDGET_PLANNING", "INFORMATION_PARITY",
      "METRIC_NOT_EXERCISED", "SEALED_CONTAMINATION", "CONFIGURATION_IDENTITY",
      "POST_HOC_CRITERION_CHANGE", "RAW_TRACE_INSUFFICIENCY",
    ]);
    const uncovered = costly.filter((c) => !covered.has(c));
    assert.deepEqual(uncovered, [], "these cost a verdict and have no preflight check: " + uncovered.join(", "));
  });
});
