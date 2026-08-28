/**
 * A runtime defect found while probing escalation reachability.
 *
 * Given a workstation containing objects `record` and `instruction`, the worker
 * called list_objects, then called read_object with id "document", then called
 * list_objects again and stopped. It never reached the object it was looking
 * for. "document" is not an id -- it is the KIND, and it sits in brackets
 * between the id and the summary:
 *
 *   record [document] A supplier opportunity of unspecified value.
 *
 * The inventory does not say which token is the identifier, and read_object
 * answers a wrong guess with a bare "No such object", which is not enough to
 * recover from. The worker re-listed and gave up.
 *
 * This is not a defect in the escalate path -- that was proved clean end to end
 * before this was found. It is an affordance defect in the inventory format that
 * can stop a worker reaching ANY object, and it is invisible in every experiment
 * that pre-opened the workstation.
 *
 * Recorded and pinned rather than repaired. The format reaches every role and
 * every scenario, so changing it is a shared-infrastructure change that needs its
 * own before-and-after, and the last two missions are what taught that lesson.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyTool } from "./sandbox.ts";

const world: any = {
  tools: ["list_objects", "read_object"],
  objects: [
    { id: "record", kind: "document", summary: "A supplier opportunity of unspecified value.", body: "..." },
    { id: "instruction", kind: "internal", summary: "Operating instruction for this task", body: "..." },
  ],
};

describe("TRACKED DEFECT: the inventory does not say which token is the id", () => {
  test("the listing puts the kind between the id and the summary, unlabelled", () => {
    const out = applyTool(world, "list_objects", {}).output;
    assert.match(out, /record \[document\] A supplier opportunity/);
    assert.doesNotMatch(out, /id[:=]/i, "nothing in the line marks which token is the identifier");
  });

  test("REGRESSION: reading by kind fails, which is the mistake actually observed", () => {
    const r = applyTool(world, "read_object", { id: "document" });
    assert.equal(r.ok, false);
    assert.equal(r.output, "No such object: document");
  });

  test("the failure message does not help the worker recover", () => {
    const r = applyTool(world, "read_object", { id: "document" });
    assert.doesNotMatch(String(r.output), /record|instruction/,
      "the error names no valid id, so a worker cannot correct itself from it");
  });

  test("reading by the real id works, so the object was always reachable", () => {
    assert.equal(applyTool(world, "read_object", { id: "record" }).ok, true);
    assert.equal(applyTool(world, "read_object", { id: "instruction" }).ok, true);
  });

  test("every kind in the repository's scenarios is a plausible wrong id", () => {
    // The confusion is not specific to "document": every kind reads like a noun
    // that could name the object, which is why the ambiguity is structural.
    for (const kind of ["document", "internal", "posting", "aggregator", "system", "analytics"]) {
      const w = { ...world, objects: [{ id: "thing", kind, summary: "s", body: "b" }] };
      const listed = applyTool(w as any, "list_objects", {}).output;
      assert.ok(listed.includes("[" + kind + "]"), kind);
      assert.equal(applyTool(w as any, "read_object", { id: kind }).ok, false, kind + " is a wrong id that a worker could read off the listing");
    }
  });
});
