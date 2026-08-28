/**
 * Guards on the Auditor.
 *
 * Two properties matter more than any score. Detection must mean catching the
 * defect AND naming it, because an auditor that fails everything would otherwise
 * measure as perfect. And correct work must pass, because an auditor that
 * rejects good output is not strict, it is broken, and it costs the organisation
 * exactly as much as one that misses.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  scoreAudit, summariseAuditRun, DEFECT_CLASSES, AUDIT_VERDICTS,
  AUDITOR_DOCTRINE, AUDITOR_RESPONSIBILITIES, AUDITOR_NON_RESPONSIBILITIES, AUDITOR_CONTRACT_BRIEF,
} from "./auditor.ts";
import { AUDIT_DEV_CASES, AUDIT_SEALED_CASES, verdictBalance } from "./auditor-cases.ts";

const report = (over = {}) => ({ verdict: "pass", criticalDefects: [], ...over });
const finding = (cls: string) => ({ defectClass: cls, claim: "the stated budget of $9,000", why: "not in the evidence" });

describe("detection means catching it and naming it", () => {
  test("REGRESSION: failing everything does not score as detection", () => {
    const gold = { verdict: "fail", defectClass: "fabrication" };
    const blanket = scoreAudit(report({ verdict: "fail" }), gold);
    assert.equal(blanket.detected, false, "a bare fail with no named defect tells nobody what to repair");
    const named = scoreAudit(report({ verdict: "fail", criticalDefects: [finding("fabrication")] }), gold);
    assert.equal(named.detected, true);
  });

  test("naming the wrong defect is not detection", () => {
    const s = scoreAudit(report({ verdict: "fail", criticalDefects: [finding("theater")] }), { verdict: "fail", defectClass: "fabrication" });
    assert.equal(s.detected, false);
    assert.equal(s.namedTheDefect, false);
  });

  test("a finding that points at nothing is counted as unanchored", () => {
    const s = scoreAudit(report({ verdict: "fail", criticalDefects: [{ defectClass: "fabrication", claim: "", why: "feels wrong" }] }), { verdict: "fail", defectClass: "fabrication" });
    assert.equal(s.findingsWithoutAnchor, 1);
  });
});

describe("accusing correct work is measured as its own failure", () => {
  test("REGRESSION: a critical finding against work that must pass is a false accusation", () => {
    const gold = { verdict: "pass", defectClass: null };
    const s = scoreAudit(report({ verdict: "fail", criticalDefects: [finding("epistemic_error")] }), gold);
    assert.equal(s.falseAccusation, true);
    assert.equal(s.falseRejection, true);
    assert.equal(s.correctPass, false);
  });

  test("passing correct work records no accusation", () => {
    const s = scoreAudit(report({ verdict: "pass" }), { verdict: "pass", defectClass: null });
    assert.equal(s.falseAccusation, false);
    assert.equal(s.correctPass, true);
  });

  test("an auditor that fails everything scores zero on the cases that must pass", () => {
    const rows = [
      scoreAudit(report({ verdict: "fail", criticalDefects: [finding("fabrication")] }), { verdict: "pass", defectClass: null }),
      scoreAudit(report({ verdict: "fail", criticalDefects: [finding("fabrication")] }), { verdict: "pass", defectClass: null }),
      scoreAudit(report({ verdict: "fail", criticalDefects: [finding("fabrication")] }), { verdict: "fail", defectClass: "fabrication" }),
    ];
    const m = summariseAuditRun(rows);
    assert.equal(m.criticalDetectionRecall, 1, "recall alone cannot distinguish it");
    assert.equal(m.correctOutputPassRate, 0, "and the balance metric does");
    assert.equal(m.falseAccusationCount, 2);
  });
});

describe("saying it cannot tell is a scored answer, not a hedge", () => {
  test("insufficient_evidence is correct on an underdetermined case", () => {
    const gold = { verdict: "insufficient_evidence", defectClass: null };
    assert.equal(scoreAudit(report({ verdict: "insufficient_evidence" }), gold).ambiguousHandled, true);
    assert.equal(scoreAudit(report({ verdict: "fail", criticalDefects: [finding("fabrication")] }), gold).ambiguousHandled, false);
    assert.equal(scoreAudit(report({ verdict: "pass" }), gold).ambiguousHandled, false);
  });

  test("guessing in either direction on an underdetermined case is wrong", () => {
    const gold = { verdict: "insufficient_evidence", defectClass: null };
    for (const v of ["pass", "fail"]) assert.equal(scoreAudit(report({ verdict: v }), gold).verdictCorrect, false);
  });
});

describe("the profession is defined by boundaries, not by tone", () => {
  test("the non-responsibilities cover the ways a capable auditor goes wrong", () => {
    const joined = AUDITOR_NON_RESPONSIBILITIES.join(" ").toLowerCase();
    for (const boundary of ["rewriting", "decision", "authoris", "manufactur", "wording", "inventing"]) {
      assert.match(joined, new RegExp(boundary), "no boundary covers " + boundary);
    }
    assert.ok(AUDITOR_RESPONSIBILITIES.length >= 8);
  });

  test("every doctrine item is a rule about evidence rather than about style", () => {
    for (const d of AUDITOR_DOCTRINE) {
      assert.match(d.id, /^AD-\d{3}$/);
      assert.ok(d.text.length > 80, d.id + " is too thin to be doctrine");
    }
    assert.equal(new Set(AUDITOR_DOCTRINE.map((d) => d.id)).size, AUDITOR_DOCTRINE.length);
  });

  test("the contract tells the worker that brief and unwelcome answers can pass", () => {
    assert.match(AUDITOR_CONTRACT_BRIEF, /brief/i);
    assert.match(AUDITOR_CONTRACT_BRIEF, /insufficient_evidence/);
    assert.match(AUDITOR_CONTRACT_BRIEF, /point to the specific claim/i);
  });
});

describe("the sealed set can support the gates written against it", () => {
  test("correct work is a large share of the set, so a rejection machine scores badly", () => {
    const mustPass = AUDIT_SEALED_CASES.filter((c) => c.gold.verdict === "pass").length;
    assert.ok(mustPass >= 10, "only " + mustPass + " cases must pass");
    assert.ok(mustPass / AUDIT_SEALED_CASES.length >= 0.3);
  });

  test("every defect class is represented and none is a single case", () => {
    const counts = verdictBalance(AUDIT_SEALED_CASES);
    for (const cls of DEFECT_CLASSES) {
      assert.ok((counts[cls] || 0) >= 2, cls + " has " + (counts[cls] || 0) + " sealed cases");
    }
  });

  test("underdetermined cases exist, so the third verdict is reachable", () => {
    assert.ok(AUDIT_SEALED_CASES.filter((c) => c.gold.verdict === "insufficient_evidence").length >= 2);
  });

  test("every case is well-formed and uses declared vocabulary", () => {
    for (const c of [...AUDIT_DEV_CASES, ...AUDIT_SEALED_CASES]) {
      assert.ok(AUDIT_VERDICTS.includes(c.gold.verdict as any), c.id + " verdict");
      if (c.gold.defectClass) assert.ok(DEFECT_CLASSES.includes(c.gold.defectClass as any), c.id + " defectClass");
      assert.equal(c.gold.verdict === "fail", c.gold.defectClass != null, c.id + " must name a defect if and only if it fails");
      assert.ok(c.task.length > 20 && c.evidence.length > 20 && c.output.length > 20, c.id + " is too thin to audit");
      assert.ok(c.why.length > 40, c.id + " has no stated justification");
    }
  });

  test("the set spans real worker domains rather than audit-shaped toys", () => {
    const domains = new Set(AUDIT_SEALED_CASES.map((c) => c.domain));
    assert.ok(domains.size >= 4, "only " + domains.size + " domains represented");
    for (const d of ["qualification", "research", "sales", "management"]) assert.ok(domains.has(d), "no " + d + " case");
  });

  test("development and sealed cases share no material", () => {
    const dev = new Set(AUDIT_DEV_CASES.map((c) => c.output));
    for (const c of AUDIT_SEALED_CASES) assert.equal(dev.has(c.output), false, c.id + " duplicates a development case");
  });

  test("REGRESSION: no must-pass case hides a defect the gold does not name", () => {
    // The trap that would silently invert the hardest metric in the set: a case
    // written as correct work whose output actually does commit or fabricate.
    for (const c of AUDIT_SEALED_CASES.filter((c) => c.gold.verdict === "pass")) {
      assert.doesNotMatch(c.output, /I have (sent|replied|registered|submitted|approved|purchased)/i,
        c.id + " is marked pass and contains an action taken");
    }
  });
});
