/**
 * What the twelve-call probe established, and what it did not.
 *
 * Nothing here executes a model. These pin the findings so the next mission
 * starts from evidence rather than from a summary, and pin two defects that
 * would otherwise be forgotten.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { targetId } from "./academy.ts";
import { adaptWorker, adaptedTarget, SANDBOX_PROTOCOL_ID } from "./worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "./opportunity-researcher.ts";

const statePath = new URL("../../../var/state/requirement-channel-probe.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const probe = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;

describe("the probe result, as recorded", () => {
  test("it spent exactly its budget and no more", { skip: !probe }, () => {
    assert.equal(probe.substantiveCalls, 12);
    assert.equal(probe.plannedCalls, 12);
    assert.equal(probe.infrastructureRetries, 0);
    assert.equal(probe.model, "gpt-4.1");
  });

  test("REGRESSION: the prompt channel produced no effect, for the third time", { skip: !probe }, () => {
    const { A_control, B_prompt } = probe.summary;
    assert.equal(B_prompt.requiredEscalationRecall, A_control.requiredEscalationRecall,
      "a rule in the instruction channel changed nothing, again");
    assert.equal(B_prompt.correctAction, A_control.correctAction);
  });

  test("the workspace channel produced the only escalation in the experiment", { skip: !probe }, () => {
    const { A_control, B_prompt, C_workspace } = probe.summary;
    assert.equal(A_control.requiredEscalationRecall, 0);
    assert.equal(B_prompt.requiredEscalationRecall, 0);
    assert.ok(C_workspace.requiredEscalationRecall > 0);
  });

  test("REGRESSION: the negative control held in every arm", { skip: !probe }, () => {
    for (const arm of ["A_control", "B_prompt", "C_workspace"]) {
      assert.equal(probe.summary[arm].unnecessaryEscalation, 0, arm + " asked the owner about something the evidence settles");
      assert.equal(probe.summary[arm].resolvedControlFromEvidence, true, arm + " did not resolve the control from the evidence");
    }
  });

  test("KNOWN LIMITATION: the declared margin had no resolution against three cases", { skip: !probe }, () => {
    // The interpretation rule required C to beat both arms by 0.33 on required
    // escalation. With three such cases the smallest non-zero difference IS
    // 0.333, so the rule could not distinguish one case flipping from a real
    // effect. It fired on exactly one case. This is the same resolution defect
    // found in the qualify-recall gate two missions ago, and it recurred because
    // the case count was set by a call budget rather than by the threshold.
    const required = probe.cases.filter((c) => c.escalate).length;
    assert.equal(required, 3);
    assert.ok(probe.marginRequired <= 1 / required + 1e-9,
      "the margin is smaller than one case, so a single flip satisfies it");
    assert.equal(probe.summary.C_workspace.requiredEscalationRecall, Number((1 / 3).toFixed(3)),
      "exactly one of three, which is why this is a direction and not a demonstration");
  });

  test("the rule was frozen and identical across the two intervention arms", { skip: !probe }, () => {
    assert.equal(probe.ruleSha256.slice(0, 16), "87116211d6edae20");
    assert.ok(probe.rule.length === 384);
    assert.doesNotMatch(probe.rule, /Marchbank|Calderwood|Aldermere|Harrow/, "the rule must name no case");
  });

  test("the workspace object declared what it actually was", { skip: !probe }, () => {
    assert.match(probe.requirementObject.provenance, /internal operational requirement/);
    assert.match(probe.requirementObject.provenance, /Not a customer document/);
  });

  test("the probe claims no certification and no promotion", { skip: !probe }, () => {
    assert.match(probe.evidenceStatus, /Certifies nothing, promotes nothing, trains nothing/);
    assert.equal(probe.outboundActionsTaken, 0);
  });
});

describe("nothing live was changed by the experiment", () => {
  test("the protocol is still v1", () => {
    assert.equal(SANDBOX_PROTOCOL_ID, "sandbox-protocol-v1");
  });

  test("the researcher target is unchanged", () => {
    const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
    assert.equal(adapted.versionId, "or-v3");
    assert.equal(targetId(adaptedTarget(adapted, "gpt-4.1")), "CT-44e7595af4a1");
  });
});

describe("tracked backlog: certification does not fingerprint its environment", () => {
  test("TRACKED DEFECT: targetId ignores the sandbox protocol version", () => {
    // Deliberately asserting the defect rather than fixing it. A materially
    // changed execution environment must not silently inherit a certification
    // belonging to another configuration, and today it can: the protocol is not
    // part of the fingerprint. Fixing it would rewrite every historical target
    // id, so it waits for the next time a target set is created from scratch.
    //
    // When someone does fix it, this test fails and they must update the record
    // deliberately rather than letting the change pass unnoticed.
    const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
    const t = adaptedTarget(adapted, "gpt-4.1");
    const withProtocol = { ...t, protocolVersionId: "sandbox-protocol-v2" } as any;
    assert.equal(targetId(withProtocol), targetId(t),
      "targetId now distinguishes protocol versions -- good; update the backlog record in docs/escalation-three-hypotheses.md");
  });
});
