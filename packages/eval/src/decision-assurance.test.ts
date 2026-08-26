/**
 * Guards for the decision assurance loop.
 *
 * The regression that matters is the first one: a decision governed by a source
 * document must generate the question "what does the source permit that we have
 * not considered doing?" before any answer exists. That question's absence is
 * what produced a wrong verdict on a live pursuit while the permitting sentence
 * sat in captured evidence.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import {
  generateQuestions, followUps, assumptionRegister, processCoverageAudit,
  requiredStages, correctionAnalysis, REASONING_STAGES,
} from "./decision-assurance.ts";

const sourceGoverned = {
  id: "T1", question: "Should we respond?", domain: "commercial_pursuit", stakesTier: "critical",
  stakeholders: ["buyer", "owner"],
  attributes: { governedBySourceDocument: true, externalCommitment: true, irreversible: true },
};
const routine = {
  id: "T2", question: "Should we try a channel?", domain: "marketing_experiment", stakesTier: "routine",
  attributes: { capitalAllocation: true, timeBounded: true },
};

describe("questions are generated before answers exist", () => {
  test("generation takes only the decision, never a proposed answer", () => {
    const qs = generateQuestions(sourceGoverned);
    assert.ok(qs.length > 20);
    // The signature is the guarantee: nothing about a conclusion is an input.
    assert.equal(generateQuestions.length, 1);
    for (const q of qs) {
      assert.ok(q.whyItMatters && q.whyItMatters.length > 15, "a question must say why it changes what we do");
      assert.equal(q.depth, 0);
    }
  });

  test("REGRESSION: a source-governed decision asks what the source permits", () => {
    // This is the exact question whose absence produced the live failure.
    const qs = generateQuestions(sourceGoverned);
    assert.ok(qs.some((q) => /what does the source permit/i.test(q.question)),
      "the permitting question must be generated, not remembered by a human");
    assert.ok(qs.some((q) => /threshold.*scored preference|scored preference.*threshold/i.test(q.question)),
      "must distinguish a hard threshold from a scored preference");
    assert.ok(qs.some((q) => /silence is not permission|leave silent/i.test(q.question + " " + q.whyItMatters)),
      "must ask whether silence is being read as permission");
    assert.ok(qs.some((q) => /attachments, amendments, addenda/i.test(q.question)),
      "must ask for the documents the advertising page does not carry");
  });

  test("a decision without a governing source does not get source questions", () => {
    const qs = generateQuestions(routine);
    assert.equal(qs.some((q) => /what does the source permit/i.test(q.question)), false);
  });
});

describe("depth is bought with stakes, not spent everywhere", () => {
  test("a routine decision is interrogated less than a critical one", () => {
    const few = generateQuestions(routine).length;
    const many = generateQuestions(sourceGoverned).length;
    assert.ok(many > few * 1.5, "critical " + many + " should far exceed routine " + few);
  });

  test("expensive reflective stages do not fire on routine decisions", () => {
    const qs = generateQuestions(routine);
    assert.equal(qs.some((q) => q.generator === "success_conditions"), false,
      "success pre-mortem is elevated-and-above work");
    assert.equal(qs.some((q) => q.generator === "professional_knowledge"), false);
  });

  test("required stages scale with stakes", () => {
    assert.ok(requiredStages("critical").length > requiredStages("routine").length);
    assert.ok(requiredStages("critical").includes("independent_review"));
    assert.equal(requiredStages("routine").includes("independent_review"), false);
    // Question generation and option enumeration are never optional at any tier.
    for (const tier of ["routine", "standard", "elevated", "high", "critical"]) {
      assert.ok(requiredStages(tier).includes("questions_generated"));
      assert.ok(requiredStages(tier).includes("options_enumerated"));
    }
  });
});

describe("questions are about the decision, not about decisions in general", () => {
  test("the same generator phrases differently for different decisions", () => {
    const a = generateQuestions(sourceGoverned).find((q) => q.generator === "objective");
    const b = generateQuestions(routine).find((q) => q.generator === "objective");
    assert.notEqual(a.question, b.question, "a generic question invites a generic answer");
    assert.ok(a.question.includes("commercial pursuit"));
    assert.ok(b.question.includes("marketing experiment"));
  });

  test("named stakeholders appear in the question that asks who bears the cost", () => {
    const q = generateQuestions(sourceGoverned).find((x) => x.category === "stakeholders");
    assert.match(q.question, /buyer/);
  });

  test("a reversibility question appears only where the decision is irreversible", () => {
    const irreversible = generateQuestions(sourceGoverned);
    const reversible = generateQuestions({ ...sourceGoverned, id: "T3", attributes: { ...sourceGoverned.attributes, irreversible: false } });
    assert.ok(irreversible.some((q) => /reversible version/i.test(q.question)));
    assert.equal(reversible.some((q) => /reversible version/i.test(q.question)), false);
  });
});

describe("unresolved material questions spawn work rather than notes", () => {
  test("an unresolved material question produces a route to closure", () => {
    const q = generateQuestions(sourceGoverned)[0];
    const f = followUps({ question: q, answer: "partly", resolved: false, material: true });
    assert.equal(f.length, 3);
    assert.ok(f.some((x) => /who or what can obtain that evidence/i.test(x.question)), "must route the work");
    assert.ok(f.some((x) => /block the decision or get disclosed/i.test(x.question)), "unresolvable is not ignorable");
    for (const x of f) assert.equal(x.parentId, q.id);
  });

  test("a resolved or immaterial question spawns nothing", () => {
    const q = generateQuestions(sourceGoverned)[0];
    assert.equal(followUps({ question: q, answer: "yes", resolved: true, material: true }).length, 0);
    assert.equal(followUps({ question: q, answer: "no", resolved: false, material: false }).length, 0);
  });

  test("depth is bounded", () => {
    const deep = { ...generateQuestions(sourceGoverned)[0], depth: 3 };
    assert.equal(followUps({ question: deep, answer: "x", resolved: false, material: true }, 3).length, 0);
  });
});

describe("the process gate refuses a verdict, which is the whole mechanism", () => {
  test("a critical decision missing independent review cannot issue a verdict", () => {
    const audit = processCoverageAudit({
      stakesTier: "critical",
      completedStages: requiredStages("critical").filter((s) => s !== "independent_review"),
      questionsGenerated: 40, questionsUnresolvedMaterial: 0, verdictProposed: true,
    });
    assert.equal(audit.verdictReady, false);
    assert.match(audit.ruling, /VERDICT REFUSED/);
    assert.deepEqual(audit.missing, ["independent_review"]);
  });

  test("a verdict with no questions generated is refused however complete it looks", () => {
    const audit = processCoverageAudit({
      stakesTier: "standard", completedStages: requiredStages("standard"),
      questionsGenerated: 0, questionsUnresolvedMaterial: 0, verdictProposed: true,
    });
    assert.equal(audit.verdictReady, false);
    assert.match(audit.problems.join(" "), /No questions were generated/);
  });

  test("unresolved material questions block even when every stage ran", () => {
    const audit = processCoverageAudit({
      stakesTier: "high", completedStages: requiredStages("high"),
      questionsGenerated: 30, questionsUnresolvedMaterial: 2, verdictProposed: true,
    });
    assert.equal(audit.verdictReady, false);
  });

  test("a complete process permits a verdict", () => {
    const audit = processCoverageAudit({
      stakesTier: "critical", completedStages: requiredStages("critical"),
      questionsGenerated: 47, questionsUnresolvedMaterial: 0, verdictProposed: true,
    });
    assert.equal(audit.verdictReady, true);
  });

  test("every reasoning stage is reachable from some tier", () => {
    const all = new Set(["routine", "standard", "elevated", "high", "critical"].flatMap((t) => requiredStages(t)));
    for (const s of REASONING_STAGES) assert.ok(all.has(s), "unreachable stage " + s);
  });
});

describe("assumptions cannot hide", () => {
  const assumptions = [
    { id: "A1", assumption: "x", whyRequired: "y", status: "conflicted", impactIfWrong: "The whole option disappears and the decision reverts.", testable: true, costToTest: "one question", action: "test it" },
    { id: "A2", assumption: "y", whyRequired: "y", status: "verified", impactIfWrong: "minor", testable: false, action: "none" },
  ];

  test("a load-bearing untested assumption that is testable means the analysis stopped early", () => {
    const r = assumptionRegister(assumptions);
    assert.equal(r.analysisStoppedEarly, true);
    assert.equal(r.loadBearingUntested.length, 1);
    assert.equal(r.testableNow.length, 1);
  });

  test("verified assumptions are not counted as untested", () => {
    const r = assumptionRegister(assumptions);
    assert.equal(r.untested, 1);
  });
});

describe("repeated human correction is measured, not normalised", () => {
  test("a recurring correction class is reclassified as a question-generation gap", () => {
    const r = correctionAnalysis([
      { id: "1", at: "d", correctedBy: "reviewer", whatWasMissed: "a", questionSystemShouldHaveAsked: "q", classification: "question_generation_gap", generalCapabilityGap: true, repair: "r" },
      { id: "2", at: "d", correctedBy: "owner", whatWasMissed: "b", questionSystemShouldHaveAsked: "q", classification: "question_generation_gap", generalCapabilityGap: true, repair: "r" },
    ]);
    assert.equal(r.recurringClasses.length, 1);
    assert.match(r.verdict, /question-generation gap rather than a series of individual mistakes/);
  });

  test("an unrepaired general gap is surfaced by id", () => {
    const r = correctionAnalysis([
      { id: "X", at: "d", correctedBy: "owner", whatWasMissed: "a", questionSystemShouldHaveAsked: "q", classification: "other", generalCapabilityGap: true },
    ]);
    assert.deepEqual(r.unrepairedGeneralGaps, ["X"]);
  });

  test("every correction records the question the system should have asked itself", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "decision-assurance.ts"), "utf8");
    assert.match(src, /questionSystemShouldHaveAsked/,
      "the point of tracking a correction is recovering the missing question, not logging the mistake");
  });
});

describe("the loop stays general", () => {
  test("no company, buyer, industry or amount appears in it", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "decision-assurance.ts"), "utf8");
    for (const leak of ["Idaho", "AEYC", "Hemmer", "Mason", "CMS", "RFP", "50000", "$50", "Drupal", "nonprofit"]) {
      assert.equal(src.includes(leak), false, "leaked into the general loop: " + leak);
    }
  });

  test("generators key on decision shape, never on a domain name", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "decision-assurance.ts"), "utf8");
    const applies = [...src.matchAll(/applies: \(d\) => ([^,]+),/g)].map((m) => m[1]);
    for (const a of applies) {
      assert.equal(/d\.domain\s*===/.test(a), false,
        "keying on a domain name would fail on the first unfamiliar domain: " + a);
    }
  });
});
