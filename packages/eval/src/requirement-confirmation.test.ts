/**
 * What the powered confirmation established.
 *
 * The previous probe returned a directional "workspace effect" that one case
 * carried entirely. This set gave the same comparison ten required-escalation
 * cases instead of three, so a single flip is worth 0.10 against a 0.30 margin
 * and cannot decide anything. The effect did not survive.
 *
 * These pin the result and the correction, so the next mission cannot inherit a
 * finding that was already withdrawn.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { adaptWorker, adaptedTarget, SANDBOX_TOOLING, SANDBOX_PROTOCOL_ID } from "./worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "./opportunity-researcher.ts";
import { targetId } from "./academy.ts";

const p = new URL("../../../var/state/requirement-confirmation.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const run = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;

describe("the confirmation overturns the directional finding", () => {
  test("REGRESSION: the workspace representation did not survive a powered test", { skip: !run }, () => {
    assert.equal(run.result, "RESULT_B_no_effect");
    assert.equal(run.confirmed, false);
    assert.ok(run.margin < run.standard.minMarginOverControl,
      "margin " + run.margin + " against a declared " + run.standard.minMarginOverControl);
  });

  test("the design could not be decided by one case, unlike its predecessor", { skip: !run }, () => {
    assert.equal(run.standard.canOneCaseDecide, false);
    assert.equal(run.standard.requiredCases, 10);
    assert.equal(run.standard.oneCaseIsWorth, 0.1);
    assert.ok(run.standard.minimumFlipsToWin >= 4);
  });

  test("it tested the same sentence as the probe, read rather than retyped", { skip: !run }, () => {
    assert.equal(run.ruleSha256, "87116211d6edae20107cc168fafbff67f4e1f7ce87598b8f229f5d9ce3be6e2b");
    assert.match(run.ruleSource, /not retyped/);
  });

  test("it spent exactly its ceiling", { skip: !run }, () => {
    assert.equal(run.actualCalls, 26);
    assert.equal(run.plannedCalls, 26);
    assert.equal(run.infrastructureRetries, 0);
    assert.equal(run.model, "gpt-4.1");
  });

  test("REGRESSION: the negative controls held in both arms", { skip: !run }, () => {
    assert.equal(run.summary.A_control.unnecessaryEscalation, 0);
    assert.equal(run.summary.C_workspace.unnecessaryEscalation, 0);
  });

  test("escalation remains rare rather than category-locked", { skip: !run }, () => {
    // Three escalations exist in the whole record: one on an authority case
    // before this line of work, one on a referent case in the probe, and one on
    // an authority case here. Too few and too scattered to support a rule about
    // which categories trigger it.
    assert.equal(run.summary.C_workspace.requiredEscalations, 1);
    assert.equal(run.summary.A_control.requiredEscalations, 0);
  });

  test("it claims no certification and no promotion", { skip: !run }, () => {
    assert.match(run.evidenceStatus, /Certifies nothing, promotes nothing, trains nothing/);
    assert.equal(run.outboundActionsTaken, 0);
  });
});

describe("nothing live changed", () => {
  test("protocol, worker and target are untouched", () => {
    assert.equal(SANDBOX_PROTOCOL_ID, "sandbox-protocol-v1");
    const a = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
    assert.equal(a.versionId, "or-v3");
    assert.equal(targetId(adaptedTarget(a, "gpt-4.1", SANDBOX_TOOLING)), "CT-44e7595af4a1");
  });
});
