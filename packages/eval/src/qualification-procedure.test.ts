/**
 * Guards on the qualification reasoning procedure.
 *
 * The procedure is an order, so what is asserted here is the order: that
 * commerciality decides before anything is counted, that a route to work is
 * kept rather than declined, and that the party who signs is the party who
 * matters. Each of these corresponds to a failure that actually happened.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  routeByProcedure, counterpartyIsTransactable, scoreProcedure, meetsMargin,
  PRECEDENCE, COUNTERPARTY_ROLES, COMMERCIALITY, PROCEDURE_TEXT,
} from "./qualification-procedure.ts";
import { QUAL_DEV_CASES, QUAL_SEALED_CASES, routingBalance } from "./qualification-cases.ts";
import { routingFor, ROUTING, RECORD_KINDS, ORG_ROLES } from "./record-identity.ts";
import { ROUTING_SEALED_CASES, ROUTING_DEV_CASES } from "./routing-cases.ts";
import { SEALED_CASES, DEV_CASES } from "./record-identity-cases.ts";

const at = (over = {}) => ({
  counterpartyRole: "direct_buyer", counterpartyEstablished: true,
  commerciality: "direct_work", opportunityCount: 1, ...over,
});

describe("commerciality decides before anything is counted", () => {
  test("REGRESSION: a large object count never routes a record with no work in it", () => {
    for (const count of [0, 12, 41, 260]) {
      for (const kind of ["editorial", "profile_content", "supplier_marketing", "no_commercial_content"]) {
        const r = routeByProcedure(at({ commerciality: kind, opportunityCount: count, counterpartyRole: "no_counterparty", counterpartyEstablished: false }));
        assert.equal(r.routing, "decline", kind + " with count " + count + " routed to " + r.routing);
        assert.equal(r.rule, "P2_no_work_no_route");
      }
    }
  });

  test("REGRESSION: an unknown child count still decomposes", () => {
    for (const count of [null, 3, 44]) {
      const r = routeByProcedure(at({ commerciality: "contains_child_work", opportunityCount: count }));
      assert.equal(r.routing, "decompose", "count " + count);
      assert.equal(r.rule, "P4_child_work_decomposes");
    }
  });

  test("cardinality cannot change the routing of a record that holds work", () => {
    const one = routeByProcedure(at({ commerciality: "contains_child_work", opportunityCount: 1 }));
    const many = routeByProcedure(at({ commerciality: "contains_child_work", opportunityCount: 99 }));
    assert.equal(one.routing, many.routing);
  });
});

describe("a route to work is kept, not discarded", () => {
  test("REGRESSION: a record with no buyer today but a real route is kept", () => {
    const r = routeByProcedure(at({ commerciality: "enables_discovery", counterpartyRole: "no_counterparty", counterpartyEstablished: false, opportunityCount: 0 }));
    assert.equal(r.routing, "keep_as_discovery_source");
    assert.equal(r.rule, "P3_route_beats_absence_of_a_buyer");
  });

  test("declining requires both no work and no route", () => {
    const kept = routeByProcedure(at({ commerciality: "enables_discovery", counterpartyEstablished: false, counterpartyRole: "no_counterparty" }));
    const declined = routeByProcedure(at({ commerciality: "no_commercial_content", counterpartyEstablished: false, counterpartyRole: "no_counterparty" }));
    assert.equal(kept.routing, "keep_as_discovery_source");
    assert.equal(declined.routing, "decline");
  });
});

describe("the party that signs is the party that matters", () => {
  test("REGRESSION: an unnamed beneficiary behind an established counterparty does not cause a hold", () => {
    const r = routeByProcedure(at({ counterpartyRole: "contracting_intermediary", counterpartyEstablished: true }));
    assert.equal(r.routing, "qualify", "a staffing firm that invoices us is a counterparty whoever the end client is");
    assert.equal(r.rule, "P5_contracting_party_decides");
  });

  test("only a party that would contract and pay counts as established", () => {
    assert.equal(counterpartyIsTransactable("direct_buyer"), true);
    assert.equal(counterpartyIsTransactable("contracting_intermediary"), true);
    for (const role of ["referring_intermediary", "beneficiary_only", "platform_host", "aggregator_source", "no_counterparty", "unresolved"]) {
      assert.equal(counterpartyIsTransactable(role), false, role + " must never be treated as the counterparty");
    }
  });

  test("an unestablished counterparty on real work holds rather than declines", () => {
    const r = routeByProcedure(at({ counterpartyRole: "beneficiary_only", counterpartyEstablished: false }));
    assert.equal(r.routing, "research_identity");
    assert.equal(r.rule, "P6_material_identity_gap");
  });

  test("unresolved commerciality is settled before anything else", () => {
    const r = routeByProcedure(at({ commerciality: "unresolved", counterpartyEstablished: true }));
    assert.equal(r.rule, "P1_unresolved_commerciality");
  });
});

describe("the procedure states its order where it can be checked", () => {
  test("precedence is ordered and every rule appears in the text the worker receives", () => {
    assert.equal(PRECEDENCE[0].id, "P1_unresolved_commerciality");
    assert.equal(PRECEDENCE[1].id, "P2_no_work_no_route");
    for (const p of PRECEDENCE) assert.ok(PROCEDURE_TEXT.includes(p.rule), p.id + " is not in the procedure text");
  });

  test("the procedure names no record, platform or company from any evaluation set", () => {
    for (const c of [...QUAL_SEALED_CASES, ...ROUTING_SEALED_CASES, ...SEALED_CASES]) {
      const org = c.record.split(/[\s,.]+/).filter((w) => /^[A-Z][a-z]{4,}$/.test(w))[0];
      if (org) assert.equal(PROCEDURE_TEXT.includes(org), false, "the procedure mentions " + org + " from " + c.id);
    }
  });
});

describe("the scoring separates honesty from correctness", () => {
  const gold = {
    counterpartyRole: "platform_host", counterpartyEstablished: false, commerciality: "contains_child_work",
    kind: "aggregate_listing", opportunityCount: null, buyerCount: null, orgRole: "platform",
    buyerIdentity: "unavailable", routing: "decompose", reasoning: "",
  };

  test("a supplied number on a record that states none is an invented count", () => {
    assert.equal(scoreProcedure({ opportunityCount: 20 }, gold, "").inventedCount, true);
    assert.equal(scoreProcedure({ opportunityCount: null }, gold, "").inventedCount, false);
  });

  test("saying unknown is scored as honest, not as a miss", () => {
    assert.equal(scoreProcedure({ opportunityCount: null }, gold, "").unknownHonest, true);
  });

  test("claiming an established buyer where none is available is an invented identity", () => {
    assert.equal(scoreProcedure({ buyerIdentity: "established" }, gold, "").inventedIdentity, true);
    assert.equal(scoreProcedure({ buyerIdentity: "unavailable" }, gold, "").inventedIdentity, false);
  });
});

describe("a declared margin is not defeated by floating point", () => {
  test("REGRESSION: three correct cases in thirty meets a 0.10 margin", () => {
    // The gate reported FAIL at a detail line reading "0.100": 0.867 - 0.767 is
    // 0.09999999999999998. The threshold was never the problem.
    assert.equal(0.867 - 0.767 >= 0.1, false, "the raw comparison is the defect this guards");
    const m = meetsMargin(0.867, 0.767, 0.1);
    assert.equal(m.margin, 0.1);
    assert.equal(m.meets, true);
  });

  test("a genuine shortfall still fails", () => {
    assert.equal(meetsMargin(0.8, 0.75, 0.1).meets, false);
  });
});

describe("the sealed set can support the gates written against it", () => {
  test("REGRESSION: every gold agrees with both the procedure and the identity rule", () => {
    for (const c of [...QUAL_DEV_CASES, ...QUAL_SEALED_CASES]) {
      assert.equal(routeByProcedure(c.gold).routing, c.gold.routing, c.id + " contradicts the procedure");
      assert.equal(routingFor(c.gold).routing, c.gold.routing, c.id + " contradicts the identity rule");
      assert.equal(counterpartyIsTransactable(c.gold.counterpartyRole), c.gold.counterpartyEstablished,
        c.id + " marks " + c.gold.counterpartyRole + " as established=" + c.gold.counterpartyEstablished);
    }
  });

  test("there are enough positive cases for the recall gate to have resolution", () => {
    const positives = QUAL_SEALED_CASES.filter((c) => c.gold.routing === "qualify").length;
    assert.ok(positives >= 10, "a 0.90 recall gate needs at least ten positives to mean 'at most one miss'");
    assert.equal(routingBalance(QUAL_SEALED_CASES).qualify, positives);
  });

  test("every routing outcome is represented and none dominates", () => {
    const b = routingBalance(QUAL_SEALED_CASES);
    for (const r of ROUTING) assert.ok(b[r] >= 4, "only " + (b[r] || 0) + " sealed cases route to " + r);
    assert.ok(b.qualify / QUAL_SEALED_CASES.length <= 0.4, "the set is too weighted toward one answer");
  });

  test("the sealed set reuses no record from a set that has informed a diagnosis", () => {
    const seen = new Set([...DEV_CASES, ...SEALED_CASES, ...ROUTING_DEV_CASES, ...ROUTING_SEALED_CASES, ...QUAL_DEV_CASES].map((c) => c.record));
    for (const c of QUAL_SEALED_CASES) assert.equal(seen.has(c.record), false, c.id + " is not a clean holdout");
  });

  test("every case uses declared vocabulary", () => {
    for (const c of [...QUAL_DEV_CASES, ...QUAL_SEALED_CASES]) {
      assert.ok(COUNTERPARTY_ROLES.includes(c.gold.counterpartyRole as any), c.id + " counterpartyRole");
      assert.ok(COMMERCIALITY.includes(c.gold.commerciality as any), c.id + " commerciality");
      assert.ok(RECORD_KINDS.includes(c.gold.kind as any), c.id + " kind");
      assert.ok(ORG_ROLES.includes(c.gold.orgRole as any), c.id + " orgRole");
      assert.ok(c.why.length > 40, c.id + " has no stated justification");
    }
  });

  test("REGRESSION: no gold count exceeds what its record states", () => {
    for (const c of [...QUAL_DEV_CASES, ...QUAL_SEALED_CASES]) {
      const n = c.gold.opportunityCount;
      if (n == null || n <= 1) continue;
      const spelled: Record<number, string> = { 3: "(1)", 4: "four", 9: "9", 29: "29", 44: "44" };
      assert.ok(c.record.includes(String(n)) || (spelled[n] && c.record.includes(spelled[n])),
        c.id + " gold claims " + n + " opportunities and the record does not state it");
    }
  });

  test("the adversarial near-neighbours differ only in commercial meaning", () => {
    const buyers = QUAL_SEALED_CASES.find((c) => c.id === "QS-23");
    const sellers = QUAL_SEALED_CASES.find((c) => c.id === "QS-29");
    assert.equal(buyers!.gold.kind === sellers!.gold.kind, false, "the pair must not be separable by record kind alone");
    assert.notEqual(buyers!.gold.routing, sellers!.gold.routing);
    for (const c of [buyers!, sellers!]) assert.ok(/[Dd]irectory/.test(c.record), c.id + " no longer presents as a directory");
  });
});
