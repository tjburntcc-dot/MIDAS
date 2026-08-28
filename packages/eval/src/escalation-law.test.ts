/**
 * The escalation law, tested for what it means rather than for what it says.
 *
 * These assert rulings produced by a function, not substrings in a paragraph,
 * because the defect being repaired was precisely that the paragraph said
 * something true about facts and wrong about everything else. A test that
 * checked for the presence of a sentence would have passed all along.
 *
 * The last sections pin the prose to the function so the two cannot drift.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  escalationRuling, escalationRequired, LAW_CLAUSES, UNCERTAINTY_KINDS, ESCALATION_ACTIONS,
  CLAUSES_COVERED_BY_WORKSTATION_TEXT,
} from "./escalation-law.ts";
import { SANDBOX_PROTOCOL, SANDBOX_PROTOCOL_V1, SANDBOX_PROTOCOL_V2, SANDBOX_PROTOCOL_ID } from "./worker-adapter.ts";

const sit = (over: any) => ({ kind: "fact", material: true, toolCanResolve: true, evidenceUnread: false, ...over });

describe("the six kinds of not-knowing get the six right answers", () => {
  test("FACT the tools can establish: research, do not ask", () => {
    assert.equal(escalationRuling(sit({ kind: "fact", toolCanResolve: true })).action, "research");
    assert.equal(escalationRequired(sit({ kind: "fact", toolCanResolve: true })), false);
  });

  test("REGRESSION: UNREAD evidence is read, never asked about", () => {
    // The repair being preserved. A worker must not ask about something sitting
    // unopened in front of it, whatever kind of uncertainty it believes it has.
    for (const kind of UNCERTAINTY_KINDS) {
      const r = escalationRuling(sit({ kind, evidenceUnread: true, toolCanResolve: false, material: true }));
      assert.equal(r.action, "read_evidence", kind + " with unread evidence asked instead of reading");
    }
  });

  test("a RESOLVABLE source conflict is researched, not escalated", () => {
    assert.equal(escalationRuling(sit({ kind: "evidence_conflict", toolCanResolve: true })).action, "research");
  });

  test("an UNRESOLVABLE material source conflict is escalated", () => {
    assert.equal(escalationRuling(sit({ kind: "evidence_conflict", toolCanResolve: false })).action, "escalate");
  });

  test("REFERENT ambiguity no tool can settle, and it matters: escalate", () => {
    assert.equal(escalationRequired(sit({ kind: "referent", toolCanResolve: false })), true);
  });

  test("REFERENT ambiguity a tool can settle: research it instead", () => {
    assert.equal(escalationRuling(sit({ kind: "referent", toolCanResolve: true })).action, "research");
  });

  test("OWNER INTENT that changes the recommended action: escalate", () => {
    assert.equal(escalationRequired(sit({ kind: "owner_intent", toolCanResolve: false })), true);
  });

  test("AUTHORITY is granted, not deduced", () => {
    assert.equal(escalationRequired(sit({ kind: "authority", toolCanResolve: false, authorityEstablished: false })), true);
    assert.equal(escalationRuling(sit({ kind: "authority", authorityEstablished: true })).action, "proceed");
  });

  test("REGRESSION: authority is never inferred from the tools answering something else", () => {
    const r = escalationRuling(sit({ kind: "authority", toolCanResolve: true, authorityEstablished: false }));
    assert.equal(r.action, "escalate", "a tool that can settle a fact cannot settle permission");
  });

  test("IMMATERIAL ambiguity is noted and passed over", () => {
    for (const kind of UNCERTAINTY_KINDS) {
      const r = escalationRuling(sit({ kind, material: false, toolCanResolve: false }));
      assert.equal(r.action, "proceed", kind + " escalated an ambiguity that changes nothing");
    }
  });

  test("nothing no tool can produce is silently guessed when it matters", () => {
    for (const kind of ["referent", "owner_intent", "evidence_conflict"]) {
      assert.equal(escalationRequired(sit({ kind, toolCanResolve: false, material: true })), true, kind);
    }
  });

  test("every ruling is one of the declared actions and carries a reason", () => {
    for (const kind of UNCERTAINTY_KINDS) {
      for (const material of [true, false]) {
        for (const toolCanResolve of [true, false]) {
          for (const evidenceUnread of [true, false]) {
            const r = escalationRuling({ kind, material, toolCanResolve, evidenceUnread, authorityEstablished: false });
            assert.ok((ESCALATION_ACTIONS as readonly string[]).includes(r.action), JSON.stringify({ kind, material, toolCanResolve, evidenceUnread }));
            assert.ok(r.why.length > 30, "a ruling with no reason is not a ruling");
          }
        }
      }
    }
  });

  test("REGRESSION: asking is never the answer when a tool could get it", () => {
    for (const kind of ["fact", "evidence_conflict", "referent", "owner_intent"]) {
      const r = escalationRuling(sit({ kind, toolCanResolve: true, material: true, evidenceUnread: false }));
      assert.notEqual(r.action, "escalate", kind + " outsourced retrievable information to the owner");
    }
  });
});

describe("the protocol says what the law does", () => {
  test("REGRESSION: every clause situation produces the action it promises", () => {
    for (const c of LAW_CLAUSES) {
      const got = escalationRuling(c.situation as any).action;
      assert.equal(got, c.action, c.id + " promises " + c.action + " and the law returns " + got);
    }
  });

  test("every clause reaches the worker, in the law text or in the workstation paragraph", () => {
    for (const c of LAW_CLAUSES) {
      if (CLAUSES_COVERED_BY_WORKSTATION_TEXT.includes(c.id)) continue;
      assert.ok(SANDBOX_PROTOCOL_V2.includes(c.clause), c.id + " is not in the protocol");
    }
  });

  test("the two clauses carried by the workstation paragraph really are carried by it", () => {
    assert.match(SANDBOX_PROTOCOL_V2, /Before asking anyone for information, inventory what is already available to you and open it/);
    assert.match(SANDBOX_PROTOCOL_V2, /not missing information -- it is unread information/);
  });
});

describe("version two changes exactly one thing", () => {
  test("REGRESSION: the clause that forbade the correct behaviour is gone", () => {
    assert.match(SANDBOX_PROTOCOL_V1, /Only ask the owner for a fact that no tool available to you could produce/);
    assert.doesNotMatch(SANDBOX_PROTOCOL_V2, /Only ask the owner for a fact that no tool available to you could produce/);
  });

  test("REGRESSION: the unread repair survives untouched", () => {
    const unread = "Information you have not opened is not missing information -- it is unread information, and the difference matters.";
    assert.ok(SANDBOX_PROTOCOL_V1.includes(unread));
    assert.ok(SANDBOX_PROTOCOL_V2.includes(unread), "the repair this protocol was built for must not be collateral damage");
  });

  test("everything else in the protocol is identical", () => {
    const strip = (s: string) => s
      .replace("Only ask the owner for a fact that no tool available to you could produce. ", "")
      .replace("Ask the owner when a decision depends on something your tools cannot settle: which of several plausible things they meant, which outcome they want, or whether you are permitted to act. Do not ask about an ambiguity that would not change what happens; note it and continue. Do not choose between materially different readings on your own. ", "");
    assert.equal(strip(SANDBOX_PROTOCOL_V1), strip(SANDBOX_PROTOCOL_V2), "more than the escalation clause changed");
  });

  test("REGRESSION: v2 was built, measured and rejected, so v1 is still active", () => {
    // Removing the clause did not produce escalation: recall went 0.2 to 0.0 on
    // the probe. Adopting it anyway would have cost every escalation number in
    // the repository its comparability in exchange for nothing.
    assert.equal(SANDBOX_PROTOCOL, SANDBOX_PROTOCOL_V1);
    assert.equal(SANDBOX_PROTOCOL_ID, "sandbox-protocol-v1");
    assert.notEqual(SANDBOX_PROTOCOL_V1, SANDBOX_PROTOCOL_V2, "v2 is kept because it is what the rejected result describes");
  });

  test("the protocol stays short enough to be read", () => {
    assert.ok(SANDBOX_PROTOCOL_V2.length < SANDBOX_PROTOCOL_V1.length * 1.5,
      "the repair turned the protocol into an essay: " + SANDBOX_PROTOCOL_V2.length + " vs " + SANDBOX_PROTOCOL_V1.length);
  });
});
