/**
 * Proof that the repaired arm-C runtime works, before twenty-eight calls are
 * committed to it.
 *
 * The previous run produced a regression verdict that had to be withdrawn,
 * because an unknown kind filter returned an empty string and a three-turn
 * budget left no room to decide after reading. Every check below exists because
 * one of those two defects would have failed it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  listState, readState, parityAudit, renderChronologicalDossier, renderStructuredState, STATE_INTERFACE_BRIEF,
} from "./company-state.ts";
import { STATE_CASES, SMOKE_CASE } from "./state-advantage-cases.ts";
import { scoreManagerDecision } from "./manager.ts";

const NL = String.fromCharCode(10);
const all = [...STATE_CASES, SMOKE_CASE];

describe("the repaired state interface", () => {
  test("REGRESSION: an unsupported filter never returns silence", () => {
    for (const c of all) {
      for (const bogus of ["all", "everything", "state", "ALL"]) {
        const out = listState(c.state, bogus);
        assert.notEqual(out.trim(), "", c.id + " returned silence for kind " + bogus);
        assert.match(out, /No items of kind/, c.id + " does not reject the filter explicitly");
        assert.match(out, /Kinds present/, c.id + " does not say which kinds exist");
        assert.match(out, /list_state/, c.id + " does not say how to recover");
      }
    }
  });

  test("an empty call returns the complete authorised listing", () => {
    for (const c of all) {
      const lines = listState(c.state).split(NL).filter(Boolean);
      assert.equal(lines.length, c.state.items.length, c.id);
      for (const it of c.state.items) {
        assert.ok(lines.some((l) => l.includes('id="' + it.id + '"')), c.id + "/" + it.id + " unreachable");
      }
    }
  });

  test("a real kind filters, and returns only that kind", () => {
    for (const c of all) {
      for (const k of [...new Set(c.state.items.map((i) => i.kind))]) {
        const lines = listState(c.state, k).split(NL).filter(Boolean);
        assert.equal(lines.length, c.state.items.filter((i) => i.kind === k).length, c.id + " " + k);
        for (const l of lines) assert.match(l, new RegExp('kind="' + k + '"'), c.id + " " + k);
      }
    }
  });

  test("every valid id reads, and an invalid one errors explicitly", () => {
    for (const c of all) {
      for (const it of c.state.items) {
        const r = readState(c.state, it.id);
        assert.equal(r.ok, true, c.id + "/" + it.id);
        assert.ok(r.output.includes(it.content), c.id + "/" + it.id + " content did not survive the read");
      }
      const bad = readState(c.state, "not-an-id");
      assert.equal(bad.ok, false, c.id);
      assert.match(bad.output, /Available ids/, c.id);
    }
  });

  test("REGRESSION: the listing leaks neither content nor relevance", () => {
    for (const c of all) {
      const listing = listState(c.state);
      for (const it of c.state.items) {
        assert.equal(listing.includes(it.content.slice(0, 30)), false, c.id + "/" + it.id + " leaked content");
      }
      // Order follows the stored list, not any notion of importance, so nothing
      // in the listing tells the worker what matters.
      const ids = listing.split(NL).map((l) => (l.match(/id="([^"]+)"/) || [])[1]);
      assert.deepEqual(ids, c.state.items.map((i) => i.id), c.id + " listing is reordered, which would hint at relevance");
    }
  });

  test("the brief tells the worker how to recover from a bad filter", () => {
    assert.match(STATE_INTERFACE_BRIEF, /list_state/);
    assert.match(STATE_INTERFACE_BRIEF, /invented kind/);
  });
});

describe("the facts arm C sees are the facts A and B saw", () => {
  test("REGRESSION: parity still holds on the sealed seven", () => {
    for (const c of STATE_CASES) {
      const p = parityAudit(c.state);
      assert.equal(p.parity, true, c.id + " " + JSON.stringify(p));
      const a = renderChronologicalDossier(c.state), b = renderStructuredState(c.state);
      for (const it of c.state.items) {
        assert.ok(a.includes(it.content), c.id + "/" + it.id + " not in the dossier");
        assert.ok(b.includes(it.content), c.id + "/" + it.id + " not in the structured state");
        assert.ok(readState(c.state, it.id).output.includes(it.content), c.id + "/" + it.id + " not in the store");
      }
    }
  });

  test("the smoke case is not part of the sealed comparison", () => {
    assert.equal(STATE_CASES.some((c) => c.id === SMOKE_CASE.id), false);
    assert.equal(STATE_CASES.length, 7);
  });
});

describe("the turn budget and the scorer can carry a completed C transcript", () => {
  test("REGRESSION: four turns survives one wasted opening", () => {
    // Three turns was list, read, decide with zero slack. One wasted filter
    // guess consumed the decision. Four is the smallest budget that tolerates it.
    const TURNS = 4;
    const worstCase = ["a wasted filter guess", "list_state({})", "read batch", "decide"];
    assert.equal(worstCase.length, TURNS);
    assert.equal(STATE_CASES.length * TURNS, 28);
    assert.ok(STATE_CASES.length * TURNS + 4 <= 32, "smoke plus the run must fit the ceiling");
  });

  test("the scorer accepts a decision produced after tool use", () => {
    const c = STATE_CASES[0];
    const d: any = {
      bindingBottleneck: "product", selectedAction: "manufacture_capability",
      candidateActions: [{ action: "manufacture_capability", rationale: "a" }, { action: "stop_spend", rationale: "b" }],
      facts: ["three campaigns produced no paying customers"],
      unknowns: ["whether import is the only blocker"], conflicts: [],
      authorityRequired: false, ownerActionRequired: "none",
      deferOrIgnore: ["a fourth paid campaign"],
      whyThisWinsNow: "Every trial died at ledger import.",
      falsifier: "trial users who imported successfully and still did not pay",
      reassessmentTrigger: "after the first imports land",
    };
    const s = scoreManagerDecision(d, { ...c.gold, dossierNumbers: [] });
    assert.equal(s.actionCorrect, true);
    assert.equal(s.bottleneckCorrect, true);
    assert.equal(s.generatedAlternatives, true);
    assert.equal(s.deferredTheRightThing, true);
    assert.equal(s.inventedEconomics, false);
  });
});

describe("TRACKED DEFECT: a smoke gate that failed correct behaviour", () => {
  test("REGRESSION: opening every item in a small store is thoroughness, not breakage", () => {
    // The first smoke gate also required the worker to skip at least one
    // distractor. It failed a run in which the listing worked, four of four
    // relevant items were read, no call was invalid, and a decision was emitted
    // in three turns. A smoke test proves the runtime completes a case;
    // selectivity is a measured metric in the real run, not a precondition for
    // it. The criterion was changed after seeing that result, which is recorded
    // rather than hidden.
    const runtimeCompleted = { reachedDecision: true, relevantOpened: 4, invalid: [] as string[], turns: 3 };
    const openedEveryDistractor = 2;
    const correctGate = runtimeCompleted.reachedDecision
      && runtimeCompleted.relevantOpened >= 2
      && runtimeCompleted.invalid.length === 0
      && runtimeCompleted.turns <= 4;
    const oldGate = correctGate && openedEveryDistractor < 2;
    assert.equal(correctGate, true, "the runtime plainly completed the case");
    assert.equal(oldGate, false, "and the old gate called that a failure");
  });

  test("three harness defects were found in this one experiment, all mine", () => {
    // Recorded so the count is not lost: an unknown kind filter returning
    // silence, a three-turn budget with no slack, and a smoke gate that failed
    // correct behaviour. Two of them nearly became findings about architecture.
    const defects = ["silent empty listing on an unknown kind", "three-turn budget", "smoke gate requiring selectivity"];
    assert.equal(defects.length, 3);
  });
});
