/**
 * Guards for record identity and cardinality.
 *
 * The production failure: a jobs category page assessed as one opportunity,
 * stably, five times. The contract had no field for what kind of record it was,
 * so every answer available was wrong.
 *
 * Two properties are protected here. An aggregate must never route to `qualify`,
 * and an aggregate must never route to `decline` either — declining it throws
 * away every real posting behind it, which is the failure the previously
 * rejected binary code would have introduced.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { routingFor, scoreIdentity, summariseIdentityRun, RECORD_KINDS, ORG_ROLES, ROUTING } from "./record-identity.ts";
import { DEV_CASES, SEALED_CASES, caseCounts } from "./record-identity-cases.ts";

const id = (over = {}) => ({
  kind: "single_opportunity", opportunityCount: 1, buyerCount: 1,
  orgRole: "buyer", buyerIdentity: "established", ...over,
});

describe("an aggregate is neither one opportunity nor worthless", () => {
  test("REGRESSION: an aggregate never routes to qualify", () => {
    for (const count of [null, 2, 12, 47]) {
      const r = routingFor(id({ kind: "aggregate_listing", opportunityCount: count, orgRole: "platform" }));
      assert.notEqual(r.routing, "qualify", "count " + count + " routed to qualify");
    }
  });

  test("REGRESSION: an aggregate never routes to decline", () => {
    // The failure the rejected binary code would have introduced: deleting a
    // record that contains real work.
    for (const count of [null, 2, 47]) {
      const r = routingFor(id({ kind: "aggregate_listing", opportunityCount: count, orgRole: "platform" }));
      assert.notEqual(r.routing, "decline", "declining an aggregate throws away every posting behind it");
    }
  });

  test("REGRESSION: an unknown count does not demote an aggregate", () => {
    // An earlier rule required a numeric count above one, so a worker that
    // honestly declined to invent a total was routed away from decomposition.
    assert.equal(routingFor(id({ kind: "aggregate_listing", opportunityCount: null, orgRole: "platform" })).routing, "decompose");
  });
});

describe("an intermediary is a customer, not a disqualifier", () => {
  test("an agency that would contract and pay routes to qualify", () => {
    assert.equal(routingFor(id({ kind: "intermediary_record", orgRole: "intermediary" })).routing, "qualify");
  });

  test("an intermediary record whose role is unresolved gets researched, not declined", () => {
    const r = routingFor(id({ kind: "intermediary_record", orgRole: "unresolved" }));
    assert.equal(r.routing, "research_identity");
  });
});

describe("records with no work still keep their value where they have any", () => {
  test("a directory and a marketplace are kept as sources", () => {
    assert.equal(routingFor(id({ kind: "directory", opportunityCount: 0 })).routing, "keep_as_discovery_source");
    assert.equal(routingFor(id({ kind: "marketplace_source", opportunityCount: null })).routing, "keep_as_discovery_source");
  });

  test("only a genuinely non-commercial record is declined", () => {
    assert.equal(routingFor(id({ kind: "non_commercial", opportunityCount: 0 })).routing, "decline");
    assert.equal(routingFor(id({ kind: "company_page", opportunityCount: 0 })).routing, "keep_as_discovery_source");
  });

  test("anonymity alone does not decline a single opportunity", () => {
    assert.equal(routingFor(id({ buyerIdentity: "resolvable" })).routing, "research_identity");
    assert.equal(routingFor(id({ buyerIdentity: "unavailable", orgRole: "unresolved" })).routing, "research_identity");
  });
});

describe("error classes are counted separately because they cost differently", () => {
  const gold = { ...id({ kind: "aggregate_listing", opportunityCount: 47, orgRole: "platform", buyerIdentity: "unavailable" }), routing: "decompose", reasoning: "" };

  test("qualifying an aggregate is recorded as cardinality-blind, not merely wrong", () => {
    const s = scoreIdentity({ kind: "single_opportunity", opportunityCount: 1, routing: "qualify" }, gold as any);
    assert.equal(s.cardinalityBlind, true);
    assert.equal(s.falseAccept, true);
  });

  test("declining an aggregate is recorded as discovery value lost", () => {
    const s = scoreIdentity({ kind: "aggregate_listing", opportunityCount: 47, routing: "decline" }, gold as any);
    assert.equal(s.discoveryValueLost, true);
    assert.equal(s.falseDecline, true);
  });

  test("cardinality is scored by band, not by exact count", () => {
    const s = scoreIdentity({ kind: "aggregate_listing", opportunityCount: 9, routing: "decompose" }, gold as any);
    assert.equal(s.cardinalityCorrect, true, "one versus many is the distinction that changes what happens");
  });

  test("the summary separates accept, decline and hold", () => {
    const r = summariseIdentityRun([
      scoreIdentity({ routing: "qualify" }, gold as any),
      scoreIdentity({ routing: "decline" }, gold as any),
      scoreIdentity({ routing: "research_identity" }, gold as any),
    ]);
    assert.equal(r.falseAcceptRate, Number((1 / 3).toFixed(3)));
    assert.equal(r.falseDeclineRate, Number((1 / 3).toFixed(3)));
    assert.equal(r.falseHoldRate, Number((1 / 3).toFixed(3)));
  });
});

describe("the evaluation material is sound", () => {
  test("REGRESSION: every case's gold agrees with the routing rule", () => {
    for (const c of [...DEV_CASES, ...SEALED_CASES]) {
      assert.equal(routingFor(c.gold).routing, c.gold.routing,
        c.id + " gold routing " + c.gold.routing + " contradicts the rule");
    }
  });

  test("every case uses declared vocabulary", () => {
    for (const c of [...DEV_CASES, ...SEALED_CASES]) {
      assert.ok(RECORD_KINDS.includes(c.gold.kind as any), c.id + " kind");
      assert.ok(ORG_ROLES.includes(c.gold.orgRole as any), c.id + " orgRole");
      assert.ok(ROUTING.includes(c.gold.routing as any), c.id + " routing");
      assert.ok(c.why.length > 40, c.id + " has no stated justification");
    }
  });

  test("REGRESSION: no gold count is invented beyond what its record states", () => {
    // DEV-01 originally claimed 12 opportunities on a record that states no
    // total at all. A worker returning null was more honest than the gold.
    for (const c of [...DEV_CASES, ...SEALED_CASES]) {
      if (c.gold.opportunityCount == null || c.gold.opportunityCount <= 1) continue;
      const digits = String(c.gold.opportunityCount);
      const spelled = { 3: "three", 12: "twelve", 47: "47" }[c.gold.opportunityCount];
      assert.ok(c.record.includes(digits) || (spelled && c.record.toLowerCase().includes(String(spelled))),
        c.id + " gold claims " + digits + " opportunities and the record does not state it");
    }
  });

  test("the sealed set covers every routing outcome and is not all one shape", () => {
    const counts = caseCounts(SEALED_CASES);
    for (const r of ROUTING) {
      assert.ok(counts.byRouting[r] >= 1, "sealed set has no case routing to " + r);
    }
    assert.ok(Object.keys(counts.byKind).length >= 5, "sealed set is too narrow in record kind");
  });

  test("development and sealed cases do not overlap", () => {
    const devRecords = new Set(DEV_CASES.map((c) => c.record));
    for (const s of SEALED_CASES) assert.equal(devRecords.has(s.record), false, s.id + " duplicates a development case");
  });
});
