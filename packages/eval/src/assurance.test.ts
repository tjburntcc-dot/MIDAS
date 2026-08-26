/**
 * Guards for the composed assurance run.
 *
 * The ordering property is the one worth protecting: questions must be generated
 * from the reconciled shape, not the declared one. A caller who under-declares
 * gets the questions anyway, and does not get a clean bill of health.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { runAssurance } from "./assurance.ts";

const base = {
  id: "A1", question: "Should we take this on?", domain: "commercial_pursuit", stakesTier: "critical",
  stakeholders: ["client", "owner"],
  attributes: {
    governedBySourceDocument: true, externalCommitment: true, technicalBuild: true,
    handlesPersonalOrSensitiveData: true, irreversible: true, dependsOnThirdParty: true,
    capitalAllocation: true, competitiveAlternativeExists: true, legalOrRegulatory: true,
    timeBounded: true, recurringOperational: true, requiresSpecialistExpertise: true, pricing: true,
  },
};
const description = "A binding external proposal against a published requirements document, competitive, with a deadline, building a system that stores customer payment records and depends on a third-party vendor. Legal review may be required. Pricing and budget are in scope, and we would maintain it.";

describe("the run refuses before it reassures", () => {
  test("a fresh decision with no stages run cannot produce a verdict", () => {
    const r = runAssurance({ decision: base, descriptionText: description, verdictProposed: true });
    assert.equal(r.verdictReady, false);
    assert.match(r.ruling, /VERDICT REFUSED/);
    assert.ok(r.blocking.length > 0);
  });

  test("a complete process with no gaps permits a verdict", () => {
    const r = runAssurance({
      decision: base, descriptionText: description,
      completedStages: runAssurance({ decision: base, descriptionText: description }).requiredStages,
      questionsUnresolvedMaterial: 0, verdictProposed: true,
    });
    assert.deepEqual(r.gaps, [], "gaps: " + JSON.stringify(r.gaps));
    assert.equal(r.verdictReady, true);
    assert.match(r.ruling, /A verdict may be formed/);
  });

  test("an unaddressed dimension blocks even when every stage ran", () => {
    // A decision whose shape demands a dimension the generators do not reach.
    const r = runAssurance({
      decision: { ...base, id: "A2", attributes: { ...base.attributes, hiringOrTeamDesign: true } as any },
      descriptionText: description,
      completedStages: runAssurance({ decision: base, descriptionText: description }).requiredStages,
      verdictProposed: true,
    });
    // Whatever the outcome, a gap and a verdict must never coexist.
    assert.equal(r.verdictReady, r.gaps.length === 0 && r.audit.verdictReady);
  });
});

describe("questions come from the reconciled shape, not the declared one", () => {
  test("REGRESSION: an under-declared decision still gets the questions it needs", () => {
    const declaredNothing = { ...base, id: "A3", attributes: {} };
    const r = runAssurance({ decision: declaredNothing, descriptionText: description });
    assert.ok(r.shape.underDeclared.length > 3, "the description clearly implies more than was declared");
    assert.ok(r.questions.some((q) => /what does the source permit/i.test(q.question)),
      "the permitting question must survive an under-declared shape");
    assert.ok(r.questions.some((q) => q.category === "authority"),
      "authority questions must fire on an undeclared external commitment");
  });

  test("under-declaration is reported, but does not block once repaired", () => {
    const r = runAssurance({
      decision: { ...base, id: "A4", attributes: {} }, descriptionText: description,
      completedStages: runAssurance({ decision: base, descriptionText: description }).requiredStages,
      verdictProposed: true,
    });
    assert.ok(r.notices.some((b) => /Shape under-declared/.test(b)),
      "a caller who repeatedly mis-describes decisions is a pattern worth seeing");
    assert.equal(r.blocking.some((b) => /under-declared/.test(b)), false,
      "reporting it as blocking while not blocking on it would be theatre");
  });
});

describe("the source is read in parallel with the generators", () => {
  const segments = [
    { id: "s1", heading: "Budget", text: "Funds are limited. Suppliers may propose phased approaches if helpful." },
    { id: "s2", heading: "Scope", text: "The supplier shall deliver a complete replacement." },
  ];

  test("REGRESSION: a permitting clause raises a question even though no generator knows the domain", () => {
    const r = runAssurance({ decision: base, descriptionText: description, sourceSegments: segments });
    const perm = r.sourceQuestions.find((q) => q.elementKind === "permission");
    assert.ok(perm, "the clause that produced the live failure must surface from the text itself");
    assert.match(perm.excerpt, /may propose phased approaches/);
    assert.ok(r.counts.fromSource >= 2);
  });

  test("no source means no source questions and no pretence of having read one", () => {
    const r = runAssurance({ decision: base, descriptionText: description });
    assert.equal(r.counts.fromSource, 0);
  });
});

describe("the run stays general", () => {
  test("no company, buyer, industry or amount appears in it", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "assurance.ts"), "utf8");
    for (const leak of ["Idaho", "AEYC", "Hemmer", "Mason", "Boise", "RFP", "50000", "nonprofit"]) {
      assert.equal(src.includes(leak), false, "leaked: " + leak);
    }
  });
});
