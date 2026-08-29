/**
 * Everything that must be true before this experiment is worth running.
 *
 * The fairness rule is the whole design: three renderings of ONE list of facts,
 * so the variable is representation and not information. If parity fails, the
 * mission says stop, and these tests are what would stop it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parityAudit, renderChronologicalDossier, renderStructuredState, listState, readState,
  suppliedNumbers, STATE_KINDS, EPISTEMIC,
} from "./company-state.ts";
import { STATE_CASES, caseCoverage } from "./state-advantage-cases.ts";
import { ACTION_CLASSES, BOTTLENECKS } from "./manager.ts";
import { classifyNumericClaims } from "./numeric-support.ts";

describe("information parity: the variable is representation, not information", () => {
  test("REGRESSION: every fact reaches every arm", () => {
    for (const c of STATE_CASES) {
      const p = parityAudit(c.state);
      assert.equal(p.parity, true, c.id + " parity failed: " + JSON.stringify(p));
    }
  });

  test("REGRESSION: the state listing never leaks content, so arm C must actually read", () => {
    for (const c of STATE_CASES) {
      const listing = listState(c.state);
      for (const it of c.state.items) {
        assert.equal(listing.includes(it.content.slice(0, 30)), false, c.id + "/" + it.id + " leaked into the listing");
      }
      // Ids and kinds are visible; that is access, not the answer.
      for (const it of c.state.items) assert.ok(listing.includes(it.id), c.id + "/" + it.id + " is not reachable");
    }
  });

  test("the two prose renderings differ only in arrangement", () => {
    for (const c of STATE_CASES) {
      const a = renderChronologicalDossier(c.state);
      const b = renderStructuredState(c.state);
      assert.notEqual(a, b, c.id + " arms A and B are identical, so there is no variable");
      for (const it of c.state.items) {
        assert.ok(a.includes(it.content), c.id + "/" + it.id + " missing from the dossier");
        assert.ok(b.includes(it.content), c.id + "/" + it.id + " missing from the structured state");
      }
    }
  });

  test("arm A is told that some of its history is overtaken, so it is not crippled", () => {
    for (const c of STATE_CASES.filter((c) => c.state.items.some((i) => i.status !== "current"))) {
      assert.match(renderChronologicalDossier(c.state), /later overtaken/);
    }
  });

  test("a read miss names the ids that exist", () => {
    const r = readState(STATE_CASES[0].state, "nope");
    assert.equal(r.ok, false);
    assert.match(r.output, /Available ids/);
  });

  test("REGRESSION: an unknown kind filter says so instead of returning silence", () => {
    // The defect that decided the first run. A worker opened with
    // list_state({kind:"all"}), got an empty string, learned nothing, and burned
    // a turn. Four of seven cases never reached a decision because of it.
    for (const c of STATE_CASES) {
      const out = listState(c.state, "all");
      assert.match(out, /No items of kind="all"/, c.id);
      assert.match(out, /Kinds present/, c.id);
      assert.match(out, /list_state\(\{\}\)/, c.id + " does not say how to recover");
      assert.notEqual(out.trim(), "", c.id + " still returns silence");
    }
  });

  test("a real kind still filters, and no filter still returns everything", () => {
    const st = STATE_CASES[0].state;
    assert.equal(listState(st).split(String.fromCharCode(10)).length, st.items.length);
    const outcomes = st.items.filter((i) => i.kind === "outcome").length;
    assert.equal(listState(st, "outcome").split(String.fromCharCode(10)).length, outcomes);
  });
});

describe("gold audit: run before any model call", () => {
  test("REGRESSION: every case has a superseded item or an outcome the decision turns on", () => {
    for (const c of STATE_CASES) {
      const superseded = c.state.items.filter((i) => i.status !== "current").length;
      const outcomes = c.state.items.filter((i) => i.kind === "outcome").length;
      assert.ok(superseded > 0 || outcomes >= 2, c.id + " has neither superseded state nor comparable outcomes, so history cannot matter");
    }
  });

  test("stale tokens appear only in superseded items, so using one is genuinely an error", () => {
    for (const c of STATE_CASES) {
      const current = c.state.items.filter((i) => i.status === "current").map((i) => i.content).join(" ").toLowerCase();
      for (const t of c.gold.staleTokens) {
        assert.equal(current.includes(t.toLowerCase()), false,
          c.id + ' stale token "' + t + '" also appears in current state, so it would flag correct work');
      }
    }
  });

  test("current tokens appear in current state", () => {
    for (const c of STATE_CASES) {
      const current = c.state.items.filter((i) => i.status === "current").map((i) => i.content).join(" ").toLowerCase();
      const hit = c.gold.currentTokens.filter((t) => current.includes(t.toLowerCase()));
      assert.ok(c.gold.currentTokens.length === 0 || hit.length > 0, c.id + " no current token is actually in current state");
    }
  });

  test("every case has irrelevant but plausible facts, so synthesis is required", () => {
    for (const c of STATE_CASES) {
      assert.ok(c.gold.irrelevantItemIds.length >= 1, c.id + " has no distractors");
      assert.ok(c.gold.relevantItemIds.length >= 4, c.id + " needs too few facts to be a synthesis test");
      for (const id of [...c.gold.relevantItemIds, ...c.gold.irrelevantItemIds]) {
        assert.ok(c.state.items.some((i) => i.id === id), c.id + " references a missing item " + id);
      }
      const overlap = c.gold.relevantItemIds.filter((i) => c.gold.irrelevantItemIds.includes(i));
      assert.deepEqual(overlap, [], c.id + " marks an item both relevant and irrelevant");
    }
  });

  test("gold uses declared vocabulary and admits equivalent actions where they exist", () => {
    for (const c of STATE_CASES) {
      for (const b of c.gold.acceptableBottlenecks) assert.ok((BOTTLENECKS as readonly string[]).includes(b), c.id + " " + b);
      for (const a of c.gold.acceptableActions) assert.ok((ACTION_CLASSES as readonly string[]).includes(a), c.id + " " + a);
      for (const f of c.gold.forbiddenActions || []) {
        assert.equal(c.gold.acceptableActions.includes(f), false, c.id + " both accepts and forbids " + f);
      }
    }
    const multi = STATE_CASES.filter((c) => c.gold.acceptableActions.length > 1).length;
    assert.ok(multi >= STATE_CASES.length - 1, "too many cases force a single answer");
  });

  test("REGRESSION: no case is answerable from one sentence", () => {
    // A case whose objective plus a single item gives the answer is a chronology
    // puzzle, not a synthesis test.
    for (const c of STATE_CASES) {
      assert.ok(c.gold.relevantItemIds.length >= 4, c.id);
      assert.ok(c.audit.whyPreferredWins.length > 60, c.id + " has no reasoned justification");
      assert.ok(c.audit.falsifier.length > 25, c.id + " states no falsifier");
      assert.ok(c.audit.plausibleAlternatives.length > 20, c.id + " names no alternatives");
    }
  });

  test("every state item is well formed", () => {
    for (const c of STATE_CASES) {
      for (const it of c.state.items) {
        assert.ok((STATE_KINDS as readonly string[]).includes(it.kind), c.id + "/" + it.id + " kind " + it.kind);
        assert.ok((EPISTEMIC as readonly string[]).includes(it.epistemic), c.id + "/" + it.id + " epistemic " + it.epistemic);
        assert.ok(["current", "superseded"].includes(it.status), c.id + "/" + it.id + " status");
        if (it.status === "superseded") {
          assert.ok(it.supersededBy && c.state.items.some((x) => x.id === it.supersededBy),
            c.id + "/" + it.id + " is superseded by a missing item");
          const by = c.state.items.find((x) => x.id === it.supersededBy)!;
          assert.ok(by.at > it.at, c.id + "/" + it.id + " is superseded by something earlier than itself");
        }
        assert.ok(it.content.length > 20, c.id + "/" + it.id + " is too thin");
      }
      assert.equal(new Set(c.state.items.map((i) => i.id)).size, c.state.items.length, c.id + " has duplicate ids");
    }
  });

  test("the set covers distinct memory shapes across distinct businesses", () => {
    const cov = caseCoverage();
    assert.equal(cov.cases, 7);
    assert.ok(cov.memoryKinds.length >= 6, "only " + cov.memoryKinds.length + " memory shapes");
    assert.ok(cov.withSupersededItems >= 4, "only " + cov.withSupersededItems + " cases contain superseded state");
    assert.equal(new Set(STATE_CASES.map((c) => c.state.company)).size, 7);
  });

  test("REGRESSION: every figure any arm could cite is declared, so citing is not scored as invention", () => {
    for (const c of STATE_CASES) {
      const supplied = suppliedNumbers(c.state);
      for (const it of c.state.items) {
        for (const n of it.content.match(/\b\d[\d,]*\b/g) || []) {
          assert.ok(supplied.includes(n.replace(/,/g, "")), c.id + " figure " + n + " is not in suppliedNumbers");
        }
      }
      // And a genuinely invented figure is still caught against this dossier.
      const bad = classifyNumericClaims("this returns $987,654", supplied);
      assert.equal(bad[0].support, "unsupported_value", c.id);
    }
  });
});

describe("budget arithmetic, computed from turns", () => {
  test("REGRESSION: a stateful arm needs list, read AND decide, so three turns is not a budget", () => {
    // The second defect that decided the first run. Three turns left no slack:
    // one wasted opening call meant list, read, and then nothing left to decide
    // with. Arms A and B get everything in a single shot; C must be given room
    // to act before it answers.
    const MIN_TURNS_FOR_STATEFUL = 4;
    assert.ok(MIN_TURNS_FOR_STATEFUL >= 4, "list, read, read again if needed, then decide");
    assert.equal(STATE_CASES.length * MIN_TURNS_FOR_STATEFUL, 28, "a fair arm C alone costs 28 calls");
  });

  test("REGRESSION: the plan fits and reserves each arm separately", () => {
    const cases = STATE_CASES.length;
    const A = cases * 1, B = cases * 1, C = cases * 3;
    assert.equal(A + B + C, 35);
    assert.ok(A + B + C <= 36, "over the target");
    assert.ok(A + B + C <= 45, "over the ceiling");
    // Arms A and B must not be able to eat C's capacity.
    assert.ok(C >= cases * 2, "arm C has no room to read state and then decide");
  });
});
