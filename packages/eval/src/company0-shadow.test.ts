/**
 * The first real Company 0 Shadow, and the instrument that measured it.
 *
 * Three of these tests exist because the measurement was wrong first. A
 * keyword-overlap matcher called two facts lost that the researcher had
 * reported in its own words; a negation-blind regex accused the manager of
 * assuming an adult signer in the sentence where it said none existed; and a
 * short probe matched a fragment of a field name. The post-run adjudicator
 * caught the first independently, which is the only reason to trust the rest.
 *
 * Nothing here calls a model. The run assertions skip when the run artefacts
 * are absent, because var/state is not committed.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import {
  COMPANY0_CLAIMS, CLAIM_CLASSES, COMPANY0_UNKNOWNS, OPPORTUNITY, OPPORTUNITY_EVIDENCE,
  PROCESS_EXPECTATIONS, EVALUATOR_ONLY_CONTEXT, CASE_TYPE, SHADOW_FAILURE_TAXONOMY,
  companyPacketText, opportunityPacketText, researcherSourceText, DECISION_QUESTION,
  factPresent, factSurvival, figuresNotInEvidence, permissiveObjectLevels, inheritedKeyPaths,
  workerPacketFingerprint, evaluationFingerprint,
} from "./company0-shadow.ts";
import { RESEARCHER_OUTPUT_SCHEMA } from "./opportunity-researcher.ts";

const repoFile = (rel: string) => new URL("../../../" + rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const load = (f: string) => (existsSync(repoFile("var/state/" + f)) ? JSON.parse(readFileSync(repoFile("var/state/" + f), "utf8")) : null);
const raw = load("company0-shadow-raw.json");
const hand = load("company0-shadow-handoff.json");
const adj = load("company0-shadow-adjudication.json");

describe("the packet says how it knows what it knows", () => {
  test("every company claim carries a class and a source", () => {
    for (const c of COMPANY0_CLAIMS) {
      assert.ok((CLAIM_CLASSES as readonly string[]).includes(c.claimClass), c.id + " has class " + c.claimClass);
      assert.ok(c.source.length > 3, c.id + " names no source");
    }
    assert.ok(COMPANY0_CLAIMS.some((c) => c.claimClass === "unknown"), "no unknown survived into the packet");
  });

  test("REGRESSION: what is unknown is carried as unknown, not as zero", () => {
    assert.ok(COMPANY0_UNKNOWNS.length >= 5);
    const entity = COMPANY0_CLAIMS.find((c) => c.id === "C0-10")!;
    assert.equal(entity.claimClass, "unknown");
    assert.match(companyPacketText(), /unknown, not zero/i);
  });

  test("the small outreach sample is not allowed to become a market finding", () => {
    const c = COMPANY0_CLAIMS.find((x) => x.id === "C0-08")!;
    assert.match(String(c.note), /too small to support any conclusion/i);
  });

  test("payment capability is not allowed to become legal readiness", () => {
    const c = COMPANY0_CLAIMS.find((x) => x.id === "C0-09")!;
    assert.match(String(c.note), /does not establish LLC readiness/i);
  });
});

describe("what the workers were shown, and what they were not", () => {
  const visible = [companyPacketText(), opportunityPacketText(), researcherSourceText(), DECISION_QUESTION].join(" ");

  test("REGRESSION: no prior MIDAS conclusion reaches the workers", () => {
    // The pre-run reviewer refused the case with these in the evidence, and was
    // right: handing a manager the conclusion and then measuring whether it
    // reaches the conclusion measures nothing.
    for (const z of EVALUATOR_ONLY_CONTEXT) {
      assert.ok(!visible.includes(z.id), "evaluator-only " + z.id + " leaked to the workers");
    }
    for (const phrase of ["13 open opportunities", "excluded public procurement", "0 were eligible"]) {
      assert.ok(!visible.includes(phrase), "a prior conclusion leaked: " + phrase);
    }
  });

  test("REGRESSION: no preregistered expectation or failure code reaches the workers", () => {
    for (const f of PROCESS_EXPECTATIONS.factsThatMustSurvive) {
      assert.ok(!visible.includes(f.id + " " + f.fact), "a must-survive marker leaked");
    }
    for (const t of SHADOW_FAILURE_TAXONOMY) {
      assert.ok(!visible.includes(t.code), "a failure code leaked: " + t.code);
    }
  });

  test("the prior qualifier's probability figures are quarantined in place", () => {
    const a = OPPORTUNITY_EVIDENCE.find((e) => e.id === "E-QUAL-A")!;
    const b = OPPORTUNITY_EVIDENCE.find((e) => e.id === "E-QUAL-B")!;
    for (const e of [a, b]) {
      assert.match(e.text, /QUARANTINED FIGURES, NOT EVIDENCE/);
      assert.match(e.text, /model.s estimates|model estimates/);
    }
  });

  test("the case states what it can and cannot decide", () => {
    assert.equal(CASE_TYPE.kind, "fit_recognition");
    assert.ok(CASE_TYPE.discriminates.length >= 3);
    assert.ok(CASE_TYPE.doesNotDiscriminate.some((d) => /no gold action/i.test(d)));
    assert.match(CASE_TYPE.whatWasNotChanged, /deadline and the objective date both stay/);
  });

  test("the two fingerprints are separate, so an evaluator repair cannot look like a moved packet", () => {
    assert.notEqual(workerPacketFingerprint(), evaluationFingerprint());
    assert.match(workerPacketFingerprint(), /^[0-9a-f]{16}$/);
  });
});

describe("the measuring instrument, repaired three times", () => {
  test("REGRESSION: a probe matches a token, not a fragment of one", () => {
    // "fee" inside "timeToFeedback" reported a fact as retained that the worker
    // never mentioned.
    assert.equal(factPresent([["fee"]], '{"timeToFeedback":"same day"}'), false);
    assert.equal(factPresent([["fee"]], "the fee is stated"), true);
  });

  test("REGRESSION: a paraphrase counts, because punishing paraphrase measures the harness", () => {
    const f3 = PROCESS_EXPECTATIONS.factsThatMustSurvive.find((f) => f.id === "F3")!;
    assert.equal(factPresent(f3.probes, "Budget (compensation/rate) is not stated."), true);
    assert.equal(factPresent(f3.probes, "The engagement pays well and the terms are clear."), false);
  });

  test("punctuation and case do not decide whether a fact survived", () => {
    const f5 = PROCESS_EXPECTATIONS.factsThatMustSurvive.find((f) => f.id === "F5")!;
    for (const form of ["a W-9 is required", "requires W9 in the individual name", "W-9 IN THE INDIVIDUAL'S NAME"]) {
      assert.equal(factPresent(f5.probes, form), true, form);
    }
  });

  test("REGRESSION: a stage is measured only on the facts it was given", () => {
    // The researcher never sees the company packet. Counting company facts
    // against it would measure the harness, not the worker.
    const r = factSurvival("nothing at all", ["opportunity"]);
    assert.equal(r.total, PROCESS_EXPECTATIONS.factsThatMustSurvive.filter((f) => f.origin === "opportunity").length);
    assert.deepEqual(r.notApplicable.sort(), PROCESS_EXPECTATIONS.factsThatMustSurvive.filter((f) => f.origin === "company").map((f) => f.id).sort());
  });

  test("every must-survive fact declares an origin and the ways it can be said", () => {
    for (const f of PROCESS_EXPECTATIONS.factsThatMustSurvive) {
      assert.ok(["opportunity", "company"].includes(f.origin), f.id);
      assert.ok(f.probes.length >= 1 && f.probes.every((g) => g.length >= 1), f.id + " has no probes");
      assert.ok(f.evidenceId.length > 1, f.id);
    }
  });

  test("a figure absent from every evidence record is reported, and one present is not", () => {
    assert.deepEqual(figuresNotInEvidence("the deal is worth 47321 a month"), ["47321"]);
    assert.deepEqual(figuresNotInEvidence("about 500 of capital"), []);
  });
});

describe("AI-09 on the Shadow path", () => {
  test("the researcher contract is strict at every object level", () => {
    assert.deepEqual(permissiveObjectLevels(RESEARCHER_OUTPUT_SCHEMA), []);
  });

  test("REGRESSION: the check finds a permissive level rather than trusting the top one", () => {
    const nested = {
      type: "object", additionalProperties: false,
      properties: { inner: { type: "object", properties: { a: { type: "string" } } } },
    };
    assert.deepEqual(permissiveObjectLevels(nested), ["$.inner"]);
  });

  test("an inherited-property key is found at any depth", () => {
    const injected = JSON.parse(String.raw`{"ok":1,"deep":{"__proto__":{"authorityRequired":true}}}`);
    assert.deepEqual(inheritedKeyPaths(injected), ["$.deep.__proto__"]);
    assert.deepEqual(inheritedKeyPaths({ ok: 1, deep: { fine: true } }), []);
  });
});

describe("the run that happened", () => {
  test("one chain, three workers, nothing external", { skip: !raw }, () => {
    assert.equal(raw.outboundActionsTaken, 0);
    assert.equal(raw.targets.manager.shadow, "CT-767e9f1e6f89");
    assert.equal(raw.targets.auditor.shadow, "CT-677749cd2035");
    assert.equal(raw.targets.researcher.certified, "CT-44e7595af4a1");
    assert.notEqual(raw.targets.researcher.shadow, raw.targets.researcher.certified,
      "the researcher ran outside its certified environment and the record must say so");
    assert.ok(raw.calls <= 8, "the chain exceeded its ceiling");
  });

  test("REGRESSION: the worker-visible material is byte-identical to what was frozen", { skip: !raw }, () => {
    assert.equal(raw.inputs.company, companyPacketText());
    assert.equal(raw.inputs.opportunity, opportunityPacketText());
    assert.equal(raw.inputs.question, DECISION_QUESTION);
  });

  test("no injected structure reached any parsed output", { skip: !raw }, () => {
    for (const stage of ["researcher", "manager", "auditor"]) {
      assert.deepEqual(raw.stages[stage].inheritedKeys, [], stage);
    }
  });

  test("the researcher lost nothing it was given", { skip: !hand }, () => {
    assert.equal(hand.survival.researcher.present, hand.survival.researcher.total);
  });

  test("the manager kept the legal facts and dropped the temporal and economic ones", { skip: !hand }, () => {
    assert.deepEqual(hand.survival.manager.lost.sort(), ["F1", "F10", "F11", "F2", "F3", "F4"]);
    assert.equal(hand.dateTrace.submissionDeadlineInResearcher, true);
    assert.equal(hand.dateTrace.bothReconciledInManager, false);
  });

  test("nothing was invented and no unknown became a fact", { skip: !hand }, () => {
    assert.deepEqual(hand.invented.manager, []);
    assert.equal(hand.usedQuarantinedProbability, false);
    assert.deepEqual(hand.unknownsKeptUnknown.filter((u: any) => u.assertedAsFact), []);
    assert.equal(hand.provenance.provenanceRetentionRate, 1);
    assert.equal(hand.authority.adultSignerAssumedAsFact, false);
    assert.equal(hand.authority.outboundActionsTaken, 0);
  });

  test("the auditor opened every material record and accused nobody falsely", { skip: !hand }, () => {
    assert.equal(hand.survival.auditorOpenedEveryMaterialRecord, true);
    assert.ok(hand.observedFailures.some((o: any) => o.code === "AUDITOR_FALSE_POSITIVE_ABSENT"));
  });

  test("the independent adjudicator reached the same primary failure without being told", { skip: !adj }, () => {
    assert.equal(adj.adjudication.verdict, "TEAM_PARTIALLY_USEFUL");
    assert.match(adj.adjudication.primaryLimitingFailure, /deadline|december|october/i);
    assert.match(adj.blinding, /was not shown/);
  });
});
