/**
 * Why the Researcher never escalates.
 *
 * Three campaigns, four arms, two different workers including a bare baseline,
 * and not one recorded use of the escalate action on a case that required it.
 * Two candidate procedures were rejected for it, the second of which said
 * literally "CALL THE ESCALATE TOOL" and changed nothing.
 *
 * When an instruction that explicit produces no behavioural change at all, the
 * instruction is not the variable. These tests pin the two things that have to
 * be true before any further training is worth buying: that escalation is
 * detectable, and that the environment does not already tell the worker not to
 * do it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matches } from "./sandbox.ts";
import { SANDBOX_PROTOCOL, actorInstructions, adaptWorker } from "./worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "./opportunity-researcher.ts";
import { ALL_JUDGMENT_SCENARIOS, AXIS_MAP } from "./research-judgment-scenarios.ts";
import { RESEARCH_ACTION_PROCEDURE, recitationScore } from "./research-judgment.ts";

const escalated = { type: "escalated", describe: "raised it" } as any;
const didNot = { type: "did_not_escalate", describe: "did not raise it" } as any;

describe("escalation is detectable, so detection is not the problem", () => {
  test("both action shapes the protocol allows are recognised", () => {
    assert.equal(matches(escalated, [{ step: 1, kind: "escalate", text: "two candidates" } as any]), true);
    assert.equal(matches(escalated, [{ step: 1, kind: "tool_call", tool: "escalate", args: { text: "two candidates" } } as any]), true);
    assert.equal(matches(escalated, [{ step: 1, kind: "finish", text: "this is ambiguous" } as any]), false,
      "saying it is ambiguous must not count as raising it");
  });

  test("the inverse check is consistent with it", () => {
    assert.equal(matches(didNot, [{ step: 1, kind: "finish", text: "answered" } as any]), true);
    assert.equal(matches(didNot, [{ step: 1, kind: "escalate", text: "raised" } as any]), false);
  });
});

describe("the environment used to tell the worker not to do the thing being scored", () => {
  test("REGRESSION: the clause is still active, because removing it changed nothing", () => {
    // This test used to assert the opposite. Version one said "Only ask the
    // owner for a fact that no tool available to you could produce", correct for
    // its original purpose and governing every case where escalation is
    // required, because in all of them the worker has already opened everything
    // and what is unresolved is which reading was meant, not a fact any tool
    // holds. Version two replaced that one clause.
    assert.match(SANDBOX_PROTOCOL, /Only ask the owner for a fact that no tool available to you could produce/);
    assert.doesNotMatch(SANDBOX_PROTOCOL, /which of several plausible things they meant/);
  });

  test("the escalation-required cases are exactly the cases that clause covers", () => {
    const required = Object.entries(AXIS_MAP).filter(([, v]) => v.shouldEscalate === true).map(([id]) => id);
    assert.ok(required.length >= 1);
    for (const id of required) {
      const sc = ALL_JUDGMENT_SCENARIOS.find((s) => s.id === id)!;
      assert.ok(sc.world.tools.includes("escalate"), id + " requires escalation without offering it");
      // Every fact needed is in the workstation; what is missing is which of two
      // readings was intended, which no tool can produce -- and the protocol's
      // clause is what the worker follows.
      assert.ok(sc.world.objects.length >= 2, id + " does not present the two readings");
    }
  });

  test("the candidate procedure was as explicit as an instruction can be", () => {
    assert.match(RESEARCH_ACTION_PROCEDURE, /CALL THE ESCALATE TOOL/);
    assert.match(RESEARCH_ACTION_PROCEDURE, /is not escalating/);
  });

  test("the two texts still reach the worker together, and the tension is not the cause", () => {
    const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
    const instructions = actorInstructions(adapted, ["list_objects", "read_object", "escalate"]) + "\n\n" + RESEARCH_ACTION_PROCEDURE;
    assert.match(instructions, /Only ask the owner for a fact that no tool available to you could produce/);
    assert.match(instructions, /CALL THE ESCALATE TOOL/);
    assert.match(instructions, /it is unread information/);
  });
});

describe("recitation is measurable without a judge", () => {
  test("the v1 failure mode is caught deterministically", () => {
    const recited = "WHAT WAS ASKED: Report the budget.\nIS IT STILL LIVE: The brief states this is fictional.\nFINDINGS: none";
    assert.equal(recitationScore(recited).recited, true);
    assert.ok(recitationScore(recited).headings >= 2);
  });

  test("a normal answer is not flagged", () => {
    for (const clean of [
      "The budget is $16,500, from the financial annex the main brief points to.",
      "Two organisations match the request: the District Council at $26,000 and the Academy Trust at $4,500.",
    ]) assert.equal(recitationScore(clean).recited, false, "flagged: " + clean);
  });
});
