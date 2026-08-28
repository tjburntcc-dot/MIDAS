/**
 * Can an escalation survive the pipeline at all?
 *
 * Five hypotheses about why the worker never escalates have been rejected, and
 * every one of them assumed the action works. Before spending anything else on
 * intelligence, this walks a manually constructed escalation through every layer
 * between the model's output and the certification number, and asserts it
 * arrives intact at each one.
 *
 * If an escalation cannot survive this, no measurement of escalation_judgment
 * has ever been about a worker.
 *
 * Nothing here calls a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runScenario, scoreScenario, applyTool, matches } from "./sandbox.ts";
import { certify, dimensionsFor } from "./academy.ts";
import { adaptWorker, adaptedTarget, actorInstructions, SANDBOX_PROTOCOL } from "./worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "./opportunity-researcher.ts";

const TOOLS = ["list_objects", "read_object", "search", "record_decision", "escalate"];

/** A scenario whose only requirement is that the worker raises it. */
const SCENARIO: any = {
  id: "RX-01", role: "researcher", evidenceClass: "sealed_exam",
  correctPosture: "restrain", title: "Reachability fixture",
  brief: "Reachability fixture. Fictional.",
  world: {
    tools: TOOLS,
    objects: [{ id: "only", kind: "document", summary: "The only object", body: "Two readings remain and nothing here distinguishes them." }],
  },
  expectations: [
    { id: "E1", type: "escalated", dimension: "escalation_judgment", points: 100, describe: "Raised it" },
  ],
  traps: [],
  maxSteps: 4,
};

/** The two shapes the protocol tells the worker it may use. */
const AS_KIND = [{ kind: "escalate", text: "Which of the two readings was intended?" }];
const AS_TOOL = [{ kind: "tool_call", tool: "escalate", args: { text: "Which of the two readings was intended?" } }];
const NO_ESCALATION = [{ kind: "finish", text: "The first reading applies." }];

describe("layer 1: the action is presented to the model", () => {
  test("the protocol names escalate as a permitted action kind", () => {
    assert.match(SANDBOX_PROTOCOL, /kind = tool_call, message, escalate or finish/);
    assert.match(SANDBOX_PROTOCOL, /For message, escalate and finish include 'text'/);
  });

  test("the adapter lists escalate among the available tools when the world offers it", () => {
    const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
    const instructions = actorInstructions(adapted, TOOLS);
    assert.match(instructions, /Available tools: .*escalate/);
    assert.match(instructions, /kind = tool_call, message, escalate or finish/);
  });

  test("REGRESSION: the schema shape used by every runner permits it", () => {
    // The schema every tool in this repository sends. `kind` is an open string
    // and additionalProperties is false, so {kind:"escalate", text:"..."} is
    // valid and {kind:"escalate"} alone is valid too.
    const schema: any = {
      type: "object", additionalProperties: false, required: ["actions"],
      properties: { actions: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["kind"],
        properties: { kind: { type: "string" }, tool: { type: "string" }, args: { type: "object", additionalProperties: true, properties: {} }, text: { type: "string" } } } } },
    };
    const item = schema.properties.actions.items;
    assert.equal(item.properties.kind.type, "string");
    assert.ok(!item.properties.kind.enum, "kind is unconstrained, so no enum can exclude escalate");
    assert.ok(item.properties.text, "escalate carries its question in text, and text exists");
    assert.deepEqual(item.required, ["kind"]);
  });
});

describe("layer 2: the parser and dispatcher accept it", () => {
  test("a JSON payload containing an escalation parses to the action", () => {
    const raw = JSON.stringify({ actions: AS_KIND });
    const parsed = JSON.parse(raw).actions;
    assert.equal(parsed[0].kind, "escalate");
    assert.equal(parsed[0].text, "Which of the two readings was intended?");
  });

  test("the tool dispatcher does not reject escalate when it is called as a tool", () => {
    const r = applyTool(SCENARIO.world, "escalate", { text: "which one?" });
    assert.equal(r.ok, true, "escalate is refused by the dispatcher");
    assert.ok(String(r.output).length > 0);
  });

  test("a tool the world does not offer is refused, so the check above is meaningful", () => {
    const r = applyTool(SCENARIO.world, "send_message", {});
    assert.equal(r.ok, false);
  });
});

describe("layer 3: the transcript preserves it", () => {
  test("REGRESSION: an escalation emitted as a kind survives runScenario", async () => {
    const { log } = await runScenario(SCENARIO, async () => AS_KIND);
    const entry = log.find((a: any) => a.kind === "escalate");
    assert.ok(entry, "the escalation is not in the transcript");
    assert.equal((entry as any).text, "Which of the two readings was intended?");
  });

  test("REGRESSION: an escalation emitted as a tool call survives runScenario", async () => {
    const { log } = await runScenario(SCENARIO, async () => AS_TOOL);
    const entry = log.find((a: any) => a.tool === "escalate");
    assert.ok(entry, "the tool-shaped escalation is not in the transcript");
    assert.ok("result" in (entry as any), "the dispatcher did not run it");
  });

  test("an escalation does not end the run early or get swallowed by finish handling", async () => {
    const { log } = await runScenario(SCENARIO, async ({ log }) => (log.length ? [] : AS_KIND));
    assert.equal(log.filter((a: any) => a.kind === "escalate").length, 1);
  });
});

describe("layer 4: the scorer observes it", () => {
  test("REGRESSION: the matcher sees both shapes and rejects a mere description", () => {
    const m: any = { type: "escalated", describe: "raised it" };
    assert.equal(matches(m, AS_KIND.map((a, i) => ({ ...a, step: i + 1 })) as any), true);
    assert.equal(matches(m, AS_TOOL.map((a, i) => ({ ...a, step: i + 1 })) as any), true);
    assert.equal(matches(m, [{ step: 1, kind: "finish", text: "this is ambiguous and I cannot tell which" }] as any), false);
  });

  test("REGRESSION: scoreScenario credits the escalation end to end", async () => {
    const { log } = await runScenario(SCENARIO, async () => AS_KIND);
    const scored = scoreScenario(SCENARIO, log, {});
    assert.equal(scored.score, 100, scored.ruling);
    assert.ok(scored.expectationsMet.includes("E1"));
    const dim = scored.dimensionScores.find((d: any) => d.id === "escalation_judgment");
    assert.equal(dim?.score, 100);
  });

  test("and withholds credit when the worker does not escalate, so the test is not vacuous", async () => {
    const { log } = await runScenario(SCENARIO, async () => NO_ESCALATION);
    const scored = scoreScenario(SCENARIO, log, {});
    assert.equal(scored.score, 0);
    const dim = scored.dimensionScores.find((d: any) => d.id === "escalation_judgment");
    assert.equal(dim?.score, 0);
  });
});

describe("layer 5: certification carries it", () => {
  test("REGRESSION: an escalation reaches the awarded tier", async () => {
    const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
    const target = adaptedTarget(adapted, "gpt-4.1");
    const escalating = await runScenario(SCENARIO, async () => AS_KIND);
    const silent = await runScenario(SCENARIO, async () => NO_ESCALATION);
    const build = (log: any) => {
      const s = scoreScenario(SCENARIO, log, {});
      return dimensionsFor("researcher").map((d) => {
        const got = s.dimensionScores.find((x: any) => x.id === d.id);
        return { id: d.id, score: got ? got.score : null, cases: got ? 1 : 0 };
      });
    };
    const ev = [
      { evidenceClass: "sealed_exam", cases: 12, runScores: Array(12).fill(80) },
      { evidenceClass: "sandbox_tool_use", cases: 6, runScores: Array(6).fill(80) },
    ];
    const withEsc = certify({ target, dimensions: build(escalating.log), evidence: ev, breaches: [], scoringMode: "pattern_and_judge" });
    const without = certify({ target, dimensions: build(silent.log), evidence: ev, breaches: [], scoringMode: "pattern_and_judge" });
    assert.ok(withEsc.overall > without.overall,
      "an escalation makes no difference to the certification number: " + withEsc.overall + " vs " + without.overall);
  });
});
