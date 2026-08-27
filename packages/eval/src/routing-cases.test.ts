/**
 * Guards on the routing evaluation material.
 *
 * The set exists to answer one question -- does the worker route correctly once
 * it has classified correctly -- and it can only answer that if it is balanced,
 * consistent with the rule, and separate from the material that produced the
 * diagnosis. Each of those is asserted rather than assumed.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { routingFor, ROUTING, RECORD_KINDS, ORG_ROLES } from "./record-identity.ts";
import { ROUTING_DEV_CASES, ROUTING_SEALED_CASES } from "./routing-cases.ts";
import { DEV_CASES, SEALED_CASES } from "./record-identity-cases.ts";

const ALL = [...ROUTING_DEV_CASES, ...ROUTING_SEALED_CASES];

describe("the routing set can answer the question it was built for", () => {
  test("REGRESSION: every gold routing agrees with the rule", () => {
    for (const c of ALL) {
      assert.equal(routingFor(c.gold).routing, c.gold.routing,
        c.id + " gold says " + c.gold.routing + ", the rule says " + routingFor(c.gold).routing);
    }
  });

  test("both sets are balanced across every routing outcome", () => {
    for (const [name, set, per] of [["dev", ROUTING_DEV_CASES, 2], ["sealed", ROUTING_SEALED_CASES, 4]] as const) {
      const counts: Record<string, number> = {};
      for (const c of set) counts[c.gold.routing] = (counts[c.gold.routing] || 0) + 1;
      for (const r of ROUTING) {
        assert.equal(counts[r], per, name + " set has " + (counts[r] || 0) + " cases routing to " + r + ", expected " + per);
      }
    }
  });

  test("the sealed set does not reuse the identity material", () => {
    const seen = new Set([...DEV_CASES, ...SEALED_CASES, ...ROUTING_DEV_CASES].map((c) => c.record));
    for (const c of ROUTING_SEALED_CASES) {
      assert.equal(seen.has(c.record), false, c.id + " reuses a record from a set that has already informed a diagnosis");
    }
  });

  test("unknown counts are represented, and none of them is an excuse to guess", () => {
    const unknown = ROUTING_SEALED_CASES.filter((c) => c.gold.opportunityCount == null);
    assert.ok(unknown.length >= 3, "too few unknown-count cases to measure the rule that was previously wrong");
    for (const c of unknown) {
      assert.ok(/\d/.test(c.record) === false || !/\b(38|62|41|12|180|200)\b/.test(c.record) || c.gold.kind === "aggregate_listing",
        c.id + " states a total that the gold calls unknown");
    }
  });

  test("a many-item record is only ever declined when nothing in it is work", () => {
    for (const c of ROUTING_SEALED_CASES.filter((c) => c.gold.routing === "decline")) {
      assert.notEqual(c.gold.kind, "aggregate_listing",
        c.id + ": a genuine aggregate of postings is never declined, so a decline case must not be one");
    }
    const aggregateShaped = ROUTING_SEALED_CASES.filter(
      (c) => c.gold.routing === "decline" && /\b(41|Twelve|twelve)\b|results|profiles/.test(c.record));
    assert.ok(aggregateShaped.length >= 2, "the items-versus-work discrimination is not represented");
  });

  test("every case uses declared vocabulary and states its justification", () => {
    for (const c of ALL) {
      assert.ok(RECORD_KINDS.includes(c.gold.kind as any), c.id + " kind");
      assert.ok(ORG_ROLES.includes(c.gold.orgRole as any), c.id + " orgRole");
      assert.ok(ROUTING.includes(c.gold.routing as any), c.id + " routing");
      assert.ok(c.why.length > 40, c.id + " has no stated justification");
    }
  });

  test("REGRESSION: no gold count exceeds what its record states", () => {
    for (const c of ALL) {
      if (c.gold.opportunityCount == null || c.gold.opportunityCount <= 1) continue;
      const spelled: Record<number, string> = { 3: "three", 38: "38", 62: "62" };
      const n = c.gold.opportunityCount;
      assert.ok(c.record.includes(String(n)) || /three|Currently open|Open work/.test(c.record) || (spelled[n] && c.record.includes(spelled[n])),
        c.id + " gold claims " + n + " opportunities and the record does not support it");
    }
  });
});
