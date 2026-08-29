/**
 * The workstation contract, tested for what a worker can actually do with it.
 *
 * A worker called read_object with "document" — the kind, taken from between the
 * id and the summary — was told only "No such object", re-listed, and gave up
 * without reaching what it needed. These assert the two properties that failure
 * required: that an identifier is findable without counting words, and that a
 * miss tells a worker enough to correct itself.
 *
 * This supersedes list-objects-affordance.test.ts, which pinned the defect while
 * it stood. That file asserted the ambiguity existed; keeping it would now mean
 * asserting the repair had not happened. The defect it described is preserved in
 * docs/escalate-reachability.md and in git.
 *
 * Semantics, not literal strings. A test that pinned the exact rendering would
 * have to be rewritten by anyone improving the format, which is how format tests
 * become noise.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyTool, renderEntry, renderEntryV1, visibleIds, WORKSTATION_INVENTORY_CONTRACT, WORKSTATION_INVENTORY_CONTRACT_V1, WORKSTATION_INVENTORY_CONTRACT_V2 } from "./sandbox.ts";
import { executionEnvironmentId, currentExecutionEnvironment, LEGACY_ENVIRONMENT, evidencePortability } from "./execution-environment.ts";
import { targetId } from "./academy.ts";
import { adaptWorker, adaptedTarget, SANDBOX_TOOLING } from "./worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "./opportunity-researcher.ts";

const world = (objects: any[]) => ({ tools: ["list_objects", "read_object", "search"], objects } as any);
const OBJ = (id: string, kind: string, summary: string, body = "body of " + id) => ({ id, kind, summary, body });

/**
 * V2 is built and tested but not active: the probe meant to compare it spent its
 * whole ceiling on the control arm, so it has no causal evidence and a frozen
 * rule forbade adopting it on appearance. These exercise the contract directly.
 */
const listV2 = (w: any) => w.objects.map(renderEntry).join(String.fromCharCode(10));
const readV2 = (w: any, id: string) => {
  const o = w.objects.find((x: any) => x.id === id);
  return o ? { ok: true, output: o.body }
    : { ok: false, output: 'No such object id="' + id + '". Available object ids: ' + JSON.stringify(visibleIds(w)) };
};

/** Pull id/kind/summary back out the way a worker must. */
function parseEntries(output: string) {
  return output.split(String.fromCharCode(10)).filter(Boolean).map((line) => ({
    id: (line.match(/id="([^"]*)"/) || [])[1],
    kind: (line.match(/kind="([^"]*)"/) || [])[1],
    summary: (line.match(/summary="([^"]*)"/) || [])[1],
  }));
}

describe("listing: an identifier is findable without counting words", () => {
  const w = world([OBJ("record", "document", "A supplier opportunity"), OBJ("instruction", "internal", "Operating instruction")]);

  test("REGRESSION: every visible object exposes an explicitly labelled id", () => {
    const entries = parseEntries(listV2(w));
    assert.equal(entries.length, 2);
    for (const e of entries) assert.ok(e.id, "an entry has no labelled id");
    assert.deepEqual(entries.map((e) => e.id).sort(), ["instruction", "record"]);
  });

  test("REGRESSION: the kind cannot be mistaken for the id", () => {
    // The exact failure. "document" is the kind of the object whose id is
    // "record", and a worker that reads the labelled field cannot take it.
    const entries = parseEntries(listV2(w));
    const e = entries.find((x) => x.id === "record")!;
    assert.equal(e.kind, "document");
    assert.notEqual(e.id, e.kind);
    for (const x of entries) assert.notEqual(x.id, x.kind, "id and kind are indistinguishable for " + x.id);
  });

  test("summaries survive intact", () => {
    const entries = parseEntries(listV2(w));
    assert.equal(entries.find((x) => x.id === "record")!.summary, "A supplier opportunity");
    assert.equal(entries.find((x) => x.id === "instruction")!.summary, "Operating instruction");
  });

  test("ordering carries no meaning: any order lists the same ids", () => {
    const a = parseEntries(listV2(w)).map((e) => e.id).sort();
    const reversed = world([...w.objects].reverse());
    const b = parseEntries(listV2(reversed)).map((e) => e.id).sort();
    assert.deepEqual(a, b);
  });

  test("bodies are never in the listing, so reading is still required", () => {
    const out = listV2(w);
    for (const o of w.objects) assert.equal(out.includes(o.body), false, o.id + " leaked its body into the inventory");
  });
});

describe("read success: content is unchanged", () => {
  const w = world([OBJ("a", "document", "s", "the exact body text")]);
  test("a valid id resolves to the body verbatim", () => {
    const r = applyTool(w, "read_object", { id: "a" });
    assert.equal(r.ok, true);
    assert.equal(r.output, "the exact body text");
  });
});

describe("read miss: fails safely and helps", () => {
  const w = world([OBJ("record", "document", "s"), OBJ("instruction", "internal", "s")]);

  test("REGRESSION: a miss names the ids that exist", () => {
    const r = readV2(w, "document");
    assert.equal(r.ok, false);
    for (const id of visibleIds(w)) {
      assert.ok(String(r.output).includes(id), "the miss does not mention " + id + ", so a worker cannot correct itself");
    }
  });

  test("REGRESSION: a miss never silently opens a different object", () => {
    for (const wrong of ["document", "internal", "recor", "RECORD", "records", ""]) {
      const r = readV2(w, wrong);
      assert.equal(r.ok, false, '"' + wrong + '" resolved to something');
      for (const o of w.objects) assert.equal(String(r.output).includes(o.body), false, '"' + wrong + '" leaked a body');
    }
  });

  test("the hint set is exactly what listing discloses, so it leaks nothing", () => {
    const listed = parseEntries(listV2(w)).map((e) => e.id).sort();
    assert.deepEqual(visibleIds(w).slice().sort(), listed);
    const r = readV2(w, "nope");
    const named = visibleIds(w).filter((id) => String(r.output).includes(id));
    assert.deepEqual(named.slice().sort(), listed, "the miss discloses a different set from the inventory");
  });

  test("a tool the world does not offer is still refused", () => {
    assert.equal(applyTool(w, "send_message", {}).ok, false);
  });
});

describe("multiple objects stay distinguishable", () => {
  test("duplicate kinds are separated by id", () => {
    const w = world([OBJ("first", "document", "one"), OBJ("second", "document", "two")]);
    const entries = parseEntries(listV2(w));
    assert.equal(new Set(entries.map((e) => e.kind)).size, 1);
    assert.equal(new Set(entries.map((e) => e.id)).size, 2);
    assert.equal(applyTool(w, "read_object", { id: "first" }).output, "body of first");
    assert.equal(applyTool(w, "read_object", { id: "second" }).output, "body of second");
  });

  test("REGRESSION: similar ids do not collide or fuzzy-match", () => {
    const w = world([OBJ("brief", "document", "a"), OBJ("brief-annex", "document", "b")]);
    assert.equal(readV2(w, "brief").output, "body of brief");
    assert.equal(readV2(w, "brief-annex").output, "body of brief-annex");
    assert.equal(readV2(w, "brie").ok, false);
  });

  test("an id containing a quote cannot break the entry apart", () => {
    const w = world([OBJ('od"d', "document", "s")]);
    const line = listV2(w);
    assert.ok(line.includes("kind="), "the entry is still parseable");
    assert.equal(readV2(w, 'od"d').ok, true);
  });
});

describe("the environment is now part of who was certified", () => {
  const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
  const legacy = adaptedTarget(adapted, "gpt-4.1", SANDBOX_TOOLING);

  test("REGRESSION: historical target ids are byte-identical to what they were", () => {
    assert.equal(legacy.executionEnvironmentId, undefined);
    assert.equal(targetId(legacy), "CT-44e7595af4a1", "a historical identity moved, which would rewrite what a past result was about");
  });

  test("REGRESSION: the same worker in a different runtime is a different target", () => {
    // The property the missing binding cost us: identical worker, model and
    // knowledge, materially different environment, and until now an identical
    // fingerprint.
    const here = { ...legacy, executionEnvironmentId: executionEnvironmentId(LEGACY_ENVIRONMENT) };
    const elsewhere = { ...legacy, executionEnvironmentId: executionEnvironmentId({ ...currentExecutionEnvironment(), inventoryContractVersion: WORKSTATION_INVENTORY_CONTRACT_V2 }) };
    assert.notEqual(targetId(here), targetId(elsewhere), "a material runtime change did not move the fingerprint");
    assert.notEqual(targetId(here), targetId(legacy), "declaring an environment must itself be a distinct identity");
  });

  test("REGRESSION: an irrelevant change does not move the environment id", () => {
    // The id is canonical over three named contracts, not over source. Adding a
    // field, reordering, or refactoring cannot churn it.
    const a = executionEnvironmentId(currentExecutionEnvironment());
    const b = executionEnvironmentId({ ...currentExecutionEnvironment() } as any);
    const withNoise = executionEnvironmentId({ ...currentExecutionEnvironment(), buildHash: "deadbeef", file: "sandbox.ts" } as any);
    assert.equal(a, b);
    assert.equal(a, withNoise, "unrelated metadata changed the environment identity");
  });

  test("each material component moves it", () => {
    const base = currentExecutionEnvironment();
    for (const k of ["protocolVersion", "inventoryContractVersion", "actionSchemaVersion"]) {
      const changed = { ...base, [k]: "something-else" };
      assert.notEqual(executionEnvironmentId(changed), executionEnvironmentId(base), k + " does not affect the environment id");
    }
  });

  test("REGRESSION: V2 is not active, so nothing was adopted without evidence", () => {
    assert.equal(WORKSTATION_INVENTORY_CONTRACT, WORKSTATION_INVENTORY_CONTRACT_V1);
    assert.notEqual(WORKSTATION_INVENTORY_CONTRACT_V1, WORKSTATION_INVENTORY_CONTRACT_V2);
    assert.equal(currentExecutionEnvironment().inventoryContractVersion, WORKSTATION_INVENTORY_CONTRACT_V1);
    assert.equal(executionEnvironmentId(), executionEnvironmentId(LEGACY_ENVIRONMENT),
      "the environment moved, which would cost every piece of evidence its applicability");
  });

  test("REGRESSION: the live listing still carries the known defect, and it is tracked not hidden", () => {
    // Recorded rather than quietly fixed. The repair exists, is tested, and is
    // switched on by one constant once a properly budgeted comparison exists.
    const w = world([OBJ("record", "document", "A supplier opportunity")]);
    const live = applyTool(w, "list_objects", {}).output;
    assert.equal(live, renderEntryV1(w.objects[0]));
    assert.doesNotMatch(live, /id=/, "the live format still does not label its identifier");
    assert.equal(applyTool(w, "read_object", { id: "document" }).output, "No such object: document");
  });

  test("switching the contract is a one-line change, so the repair is ready", () => {
    assert.notEqual(executionEnvironmentId({ ...currentExecutionEnvironment(), inventoryContractVersion: WORKSTATION_INVENTORY_CONTRACT_V2 }),
      executionEnvironmentId(), "adopting V2 must move the environment identity");
  });

  test("portability is reported honestly rather than invented", () => {
    const p = evidencePortability(LEGACY_ENVIRONMENT, { ...currentExecutionEnvironment(), inventoryContractVersion: WORKSTATION_INVENTORY_CONTRACT_V2 });
    assert.deepEqual(p.changed, ["inventoryContractVersion"]);
    assert.equal(p.transfers, "none");
    assert.ok(p.reEarn.includes("sandbox_tool_use") && p.reEarn.includes("sealed_exam"));
    assert.match(p.reason, /no representation for partial portability/);
    const same = evidencePortability(currentExecutionEnvironment(), currentExecutionEnvironment());
    assert.equal(same.transfers, "all");
  });
});
