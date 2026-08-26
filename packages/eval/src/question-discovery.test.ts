/**
 * Guards for question-class discovery.
 *
 * The test that decides whether any of this is real is the seeded-omission one:
 * a question class is removed without telling the discovery layer which, and the
 * layer has to notice the hole. Everything else here is a supporting property.
 *
 * The second test that matters is the live regression. The permission sentence
 * that produced a wrong verdict on a real pursuit is fed in as raw text, and the
 * source parser has to raise it with no generator knowing the domain.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import {
  questionsFromSource, detectCoverageGaps, expectedDimensions, DECISION_DIMENSIONS,
  generaliseMissedQuestion, evaluateCandidate, valueOfInformation,
  validateDecisionShape, probesFor, UNKNOWN_UNKNOWN_PROBES,
} from "./question-discovery.ts";
import { generateQuestions } from "./decision-assurance.ts";

describe("questions come out of the source's own structure", () => {
  // Paraphrased shapes, not the live document: the parser must work on form.
  const segments = [
    { id: "s1", heading: "Purpose", text: "The selected supplier shall deliver a complete replacement. This is not a partial update." },
    { id: "s2", heading: "Budget", text: "Total funds available are limited. Suppliers may propose phased approaches if helpful." },
    { id: "s3", heading: "Eligibility", text: "Submissions received after the stated time will not be considered." },
    { id: "s4", heading: "Definitions", text: "Deliverable means any artifact transferred to the client for acceptance." },
  ];

  test("REGRESSION: a permission in the text becomes a question with no domain knowledge", () => {
    // The live failure: this sentence was captured, never turned into a question.
    const qs = questionsFromSource(segments);
    const permission = qs.find((q) => q.elementKind === "permission");
    assert.ok(permission, "a 'may propose' sentence must surface as a permission");
    assert.match(permission.question, /grants a permission/);
    assert.match(permission.excerpt, /may propose phased approaches/);
    assert.equal(permission.heading, "Budget");
  });

  test("obligations, prohibitions and definitions are separated, not lumped", () => {
    const kinds = new Set(questionsFromSource(segments).map((q) => q.elementKind));
    for (const k of ["obligation", "permission", "prohibition", "definition"]) {
      assert.ok(kinds.has(k), "missed element kind: " + k);
    }
  });

  test("every source question carries its excerpt, so it can be checked", () => {
    for (const q of questionsFromSource(segments)) {
      assert.ok(q.excerpt.length > 10, "a question with no excerpt cannot be verified against the source");
      assert.ok(q.whyItMatters.length > 20);
      assert.ok(segments.some((s) => s.id === q.segmentId));
    }
  });

  test("ids are stable across runs so a source can be re-parsed without churn", () => {
    const a = questionsFromSource(segments).map((q) => q.id);
    const b = questionsFromSource(segments).map((q) => q.id);
    assert.deepEqual(a, b);
  });

  test("a clause repeated across pages is raised once, not once per page", () => {
    const repeated = [
      { id: "p1", heading: "Terms", text: "The supplier may request an extension." },
      { id: "p2", heading: "Terms", text: "The supplier  may request an extension." },
    ];
    const qs = questionsFromSource(repeated);
    assert.equal(qs.filter((q) => /request an extension/i.test(q.excerpt)).length, 1,
      "raising one clause twice buries the clauses raised once");
  });

  test("an empty or trivial source produces nothing rather than noise", () => {
    assert.equal(questionsFromSource([]).length, 0);
    assert.equal(questionsFromSource([{ id: "x", text: "Hello." }]).length, 0);
  });
});

describe("SEEDED OMISSION: the hole is found without being named", () => {
  /**
   * The real test of the claim. A decision touches a set of dimensions. Remove
   * every question addressing one of them and ask the detector what is missing.
   * It is never told which dimension was removed.
   */
  const decision = {
    id: "SO1", question: "Should we take this on?", domain: "commercial_pursuit", stakesTier: "critical",
    stakeholders: ["client", "owner"],
    attributes: {
      governedBySourceDocument: true, externalCommitment: true, technicalBuild: true,
      handlesPersonalOrSensitiveData: true, irreversible: true, dependsOnThirdParty: true,
    },
  };

  test("removing a class makes exactly that class appear as a gap", () => {
    const all = generateQuestions(decision);
    const dimensions = expectedDimensions(decision.attributes);
    const found: string[] = [];
    for (const seeded of dimensions) {
      const surviving = all.filter((q) => q.category !== seeded).map((q) => q.category);
      const gaps = detectCoverageGaps({ attributes: decision.attributes, questionCategories: surviving, stakesTier: "critical" });
      if (gaps.some((g) => g.dimension === seeded)) found.push(seeded);
    }
    assert.deepEqual(found.sort(), dimensions.sort(),
      "every seeded omission must be detected; undetected: " + dimensions.filter((d) => !found.includes(d)));
  });

  test("with nothing removed, a full question set reports no gaps", () => {
    const cats = generateQuestions(decision).map((q) => q.category);
    const gaps = detectCoverageGaps({ attributes: decision.attributes, questionCategories: cats, stakesTier: "critical" });
    assert.deepEqual(gaps, [], "false gaps would train the operator to ignore the detector: " + JSON.stringify(gaps));
  });

  test("a gap names a candidate class rather than only complaining", () => {
    const gaps = detectCoverageGaps({ attributes: decision.attributes, questionCategories: [], stakesTier: "critical" });
    assert.ok(gaps.length > 5);
    for (const g of gaps) {
      assert.match(g.candidateClassName, /_questions$/);
      assert.ok(DECISION_DIMENSIONS.includes(g.dimension as any));
    }
  });

  test("dimensions are inferred from shape, so an under-described decision expects less", () => {
    assert.ok(expectedDimensions({ externalCommitment: true }).includes("authority"));
    assert.equal(expectedDimensions({}).includes("authority"), false);
    assert.ok(expectedDimensions({ handlesPersonalOrSensitiveData: true }).includes("data_governance"));
  });
});

describe("declared shape is not trusted on its own", () => {
  test("REGRESSION: an under-declared decision is caught and the union is used", () => {
    // A caller describes a binding external submission but declares nothing.
    const v = validateDecisionShape({
      declared: {},
      descriptionText: "We would submit a proposal against their published requirements document, which is binding once signed, and it stores donor payment records.",
    });
    const attrs = v.underDeclared.map((u) => u.attribute);
    assert.ok(attrs.includes("externalCommitment"));
    assert.ok(attrs.includes("governedBySourceDocument"));
    assert.ok(attrs.includes("irreversible"));
    assert.ok(attrs.includes("handlesPersonalOrSensitiveData"));
    assert.equal(v.reconciled.externalCommitment, true, "the union is what gets interrogated");
    assert.match(v.ruling, /Interrogating the union/);
  });

  test("each under-declaration says what questions it would have cost", () => {
    const v = validateDecisionShape({ declared: {}, descriptionText: "A binding contract with a third-party vendor." });
    for (const u of v.underDeclared) {
      assert.ok(u.consequence.length > 20, "a mismatch without a consequence is a statistic");
      assert.ok(u.evidence.includes("..."), "must quote the text that triggered it");
    }
  });

  test("over-declaration is reported but does not weaken the set", () => {
    const v = validateDecisionShape({ declared: { hiringOrTeamDesign: true, pricing: true }, descriptionText: "An internal note about nothing in particular." });
    assert.deepEqual(v.overDeclared, ["pricing"]);
    assert.equal(v.underDeclared.length, 0);
    assert.equal(v.reconciled.pricing, true, "over-declaring buys extra questions; it never removes any");
  });

  test("agreement is silent rather than congratulatory", () => {
    const v = validateDecisionShape({ declared: { externalCommitment: true }, descriptionText: "We will submit an offer." });
    assert.deepEqual(v.underDeclared, []);
    assert.ok(v.agreements.includes("externalCommitment"));
    assert.match(v.ruling, /consistent with the description/);
  });
});

describe("a candidate class must earn promotion", () => {
  const candidate = {
    candidateId: "CC-1", testedOnUnseenDecisions: 5, firedOn: 4,
    novelFindings: 3, redundantFindings: 1, falseBlockers: 0, addedQuestionsPerDecision: 2,
  };

  test("a class that finds new things on unseen decisions is promoted", () => {
    const r = evaluateCandidate(candidate);
    assert.equal(r.promote, true);
    assert.equal(r.verdict, "promote");
  });

  test("a class only tested on what produced it is rejected", () => {
    const r = evaluateCandidate({ ...candidate, testedOnUnseenDecisions: 1 });
    assert.equal(r.promote, false);
    assert.match(r.reason, /tested_on_unseen/);
  });

  test("a mostly redundant class is rejected however often it fires", () => {
    const r = evaluateCandidate({ ...candidate, novelFindings: 2, redundantFindings: 9 });
    assert.equal(r.promote, false);
    assert.match(r.reason, /not_mostly_redundant/);
  });

  test("a class that floods every decision is rejected", () => {
    const r = evaluateCandidate({ ...candidate, addedQuestionsPerDecision: 12 });
    assert.equal(r.promote, false);
    assert.match(r.reason, /does_not_flood/);
  });

  test("a class that cries blocker is rejected", () => {
    const r = evaluateCandidate({ ...candidate, falseBlockers: 4 });
    assert.equal(r.promote, false);
    assert.match(r.reason, /few_false_blockers/);
  });

  test("a correction is abstracted away from its instance before testing", () => {
    const c = generaliseMissedQuestion({
      id: "M1", question: "What does the source permit that we have not considered doing?",
      caughtBy: "external_reviewer", decisionDomain: "commercial_pursuit",
      whyItMattered: "The permission was in captured evidence and never became an option.",
      economicImportance: "changed the verdict",
    }, ["governedBySourceDocument"]);
    assert.equal(c.status, "candidate", "a correction enters as a candidate, never as a promoted class");
    assert.deepEqual(c.derivedFrom, ["M1"]);
    assert.match(c.origin, /^correction:/);
    assert.ok(c.triggerAttributes.includes("governedBySourceDocument"));
  });
});

describe("chasing an unknown is an economic decision", () => {
  test("a cheap fact that would flip the decision is pursued", () => {
    const r = valueOfInformation({ probabilityItChangesDecision: 0.4, economicImpactIfItChanges: 50000, costToObtain: 100, daysToObtain: 1, daysAvailable: 5, decisionIsReversible: true });
    assert.equal(r.ruling, "pursue");
  });

  test("an expensive fact that changes little is not pursued", () => {
    const r = valueOfInformation({ probabilityItChangesDecision: 0.05, economicImpactIfItChanges: 500, costToObtain: 2000, daysToObtain: 1, daysAvailable: 5, decisionIsReversible: true });
    assert.equal(r.ruling, "proceed_without");
  });

  test("irreversibility raises the bar for proceeding in ignorance", () => {
    const args = { probabilityItChangesDecision: 0.3, economicImpactIfItChanges: 1000, costToObtain: 900, daysToObtain: 1, daysAvailable: 5 };
    assert.equal(valueOfInformation({ ...args, decisionIsReversible: true }).ruling, "proceed_without");
    assert.equal(valueOfInformation({ ...args, decisionIsReversible: false }).ruling, "pursue_despite_cost_because_irreversible");
  });

  test("an answer that cannot arrive in time becomes an explicit unknown", () => {
    const r = valueOfInformation({ probabilityItChangesDecision: 0.9, economicImpactIfItChanges: 100000, costToObtain: 10, daysToObtain: 30, daysAvailable: 2, decisionIsReversible: false });
    assert.equal(r.ruling, "cannot_obtain_in_time");
    assert.equal(r.obtainable, false);
  });

  test("no deadline means the clock never blocks pursuit", () => {
    const r = valueOfInformation({ probabilityItChangesDecision: 0.9, economicImpactIfItChanges: 100000, costToObtain: 10, daysToObtain: 300, daysAvailable: null, decisionIsReversible: false });
    assert.equal(r.obtainable, true);
  });
});

describe("probes are bought with stakes", () => {
  test("a routine decision gets no reflective probes", () => {
    assert.deepEqual(probesFor("routine"), []);
  });

  test("a critical decision gets all of them", () => {
    assert.equal(probesFor("critical").length, UNKNOWN_UNKNOWN_PROBES.length);
    assert.ok(probesFor("elevated").length < probesFor("critical").length);
  });

  test("probes interrogate the analysis, not the decision", () => {
    for (const p of UNKNOWN_UNKNOWN_PROBES) {
      assert.ok(/we|our|analysis|us/i.test(p.probe), "a probe must turn on the analyst: " + p.probe);
    }
  });
});

describe("discovery stays general", () => {
  test("no company, buyer, industry or amount appears in it", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "question-discovery.ts"), "utf8");
    for (const leak of ["Idaho", "AEYC", "Hemmer", "Mason", "Boise", "RFP", "50000", "$50", "Drupal", "nonprofit", "donor"]) {
      assert.equal(src.includes(leak), false, "leaked into the general layer: " + leak);
    }
  });

  test("source parsing keys on language form, never on a document type", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "question-discovery.ts"), "utf8");
    assert.equal(/kind: "obligation", re: [^\n]*\b(rfp|tender|invoice)\b/i.test(src), false);
  });
});
