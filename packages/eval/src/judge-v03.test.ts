/**
 * Structural guards for evidence judge v0.3.
 *
 * These are deterministic and run offline. They do not assert that the judge is
 * accurate — only a live calibration can do that — but they pin the things that
 * would let an inaccurate judge look accurate: leaked answers, a mutated frozen
 * set, an unexplained relabel, a calibration path that differs from the scoring
 * path, or a prompt version whose instructions are not the ones it names.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import {
  GRADING_INSTRUCTIONS,
  GRADING_INSTRUCTIONS_V03,
  gradingInstructionsFor,
  JUDGE_PROMPT_VERSION,
  JUDGE_PROMPT_VERSION_V03,
  JUDGE_CALIBRATION_OVERALL_GATE,
  JUDGE_CALIBRATION_CLASS_GATE,
  CALIBRATION_V02_PATH,
  CALIBRATION_V03_PATH,
  ADVERSARIAL_V03_PATH,
  OVERRIDES_V03_PATH,
  loadCalibrationSet,
  evaluateCalibration,
  buildJudgeInput,
} from "./evidence-judge.ts";

const V03 = loadCalibrationSet(CALIBRATION_V03_PATH);
const V02 = loadCalibrationSet(CALIBRATION_V02_PATH);
const ADV = loadCalibrationSet(ADVERSARIAL_V03_PATH);
const OVR = loadCalibrationSet(OVERRIDES_V03_PATH);

function sha(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function manifestFor(name) {
  return JSON.parse(readFileSync(repoPath("packages", "eval", "src", "fixtures", name), "utf8"));
}

describe("gates are not weakened", () => {
  test("the published gate values are unchanged", () => {
    assert.equal(JUDGE_CALIBRATION_OVERALL_GATE, 0.9);
    assert.equal(JUDGE_CALIBRATION_CLASS_GATE, 0.8);
  });

  test("a run is official only when every gate holds", () => {
    const labels = [
      { id: "a", class: "x", expected_verdict: "supports" },
      { id: "b", class: "x", expected_verdict: "supports" },
      { id: "c", class: "y", expected_verdict: "does_not_establish", critical_fabricated: true },
    ];
    const perfect = evaluateCalibration(
      [{ verdict: "supports" }, { verdict: "supports" }, { verdict: "does_not_establish" }],
      labels,
    );
    assert.equal(perfect.expandedPassed, true);

    // One class below the class gate sinks the run even with high overall agreement.
    const manyLabels = [];
    const manyPreds = [];
    for (let i = 0; i < 95; i += 1) {
      manyLabels.push({ id: "ok" + i, class: "big", expected_verdict: "supports" });
      manyPreds.push({ verdict: "supports" });
    }
    for (let i = 0; i < 5; i += 1) {
      manyLabels.push({ id: "bad" + i, class: "small", expected_verdict: "ambiguous" });
      manyPreds.push({ verdict: "supports" });
    }
    const classFail = evaluateCalibration(manyPreds, manyLabels);
    assert.ok(classFail.agreement > JUDGE_CALIBRATION_OVERALL_GATE);
    assert.equal(classFail.classGate, false);
    assert.equal(classFail.expandedPassed, false);

    // A single critical false accept sinks the run.
    const critFail = evaluateCalibration(
      [{ verdict: "supports" }, { verdict: "supports" }, { verdict: "supports" }],
      labels,
    );
    assert.equal(critFail.criticalFalseAccept, 1);
    assert.equal(critFail.expandedPassed, false);
  });
});

describe("the v0.2 record stays frozen", () => {
  test("the v0.2 set still hashes to its manifest", () => {
    assert.equal(sha(CALIBRATION_V02_PATH), manifestFor("judge-calibration-v02.manifest.json").sha256);
  });

  test("v0.2 still holds sixteen items in each of its four classes", () => {
    const counts = {};
    for (const it of V02.items) counts[it.class] = (counts[it.class] || 0) + 1;
    assert.deepEqual(counts, { supported: 16, unsupported: 16, contradicted: 16, ambiguous: 16 });
  });
});

describe("v0.3 sets are internally sound", () => {
  for (const [name, set, manifest] of [
    ["calibration", V03, "judge-calibration-v03.manifest.json"],
    ["adversarial", ADV, "judge-adversarial-v03.manifest.json"],
    ["overrides", OVR, "judge-overrides-v03.manifest.json"],
  ]) {
    test(name + " set matches its frozen hash and has unique ids", () => {
      const m = manifestFor(manifest);
      assert.equal(sha(repoPath("packages", "eval", "src", "fixtures", m.path.split("/").pop())), m.sha256);
      const ids = set.items.map((i) => i.id);
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(set.items.length, m.n);
    });

    test(name + " items are well formed", () => {
      for (const it of set.items) {
        assert.ok(it.claim && it.claim.length > 5, it.id + " claim");
        assert.ok(["supports", "contradicts", "does_not_establish", "ambiguous"].includes(it.expected_verdict), it.id + " verdict");
        assert.ok(Array.isArray(it.cited_evidence_ids), it.id + " cites");
        // Misattribution items cite an id deliberately not on this prospect; that
        // is the behaviour under test, not a malformed fixture.
        if (!/wrong_prospect|misattrib/i.test(it.subtype || "")) {
          for (const cid of it.cited_evidence_ids) {
            assert.ok(it.evidence.some((e) => e.id === cid), it.id + " cites a missing evidence id");
          }
        }
      }
    });
  }

  test("every relabelled item carries a written justification", () => {
    const relabelled = V03.items.filter((i) => i.relabelled_from);
    assert.ok(relabelled.length > 0);
    for (const it of relabelled) {
      const entry = V03.relabelLedger.find((l) => l.id === it.id);
      assert.ok(entry, it.id + " missing from the ledger");
      assert.equal(entry.changed, true);
      assert.ok(entry.why && entry.why.length > 40, it.id + " justification is too thin");
      assert.equal(entry.from_class, it.relabelled_from.class);
      assert.equal(entry.from_verdict, it.relabelled_from.expected_verdict);
    }
  });

  test("the ledger accounts for every item that is not a straight carry-over", () => {
    const carried = V03.items.filter((i) => i.origin === "v0.2" && !i.relabelled_from).map((i) => i.id);
    const ledgerIds = new Set(V03.relabelLedger.map((l) => l.id));
    for (const it of V03.items) {
      if (carried.includes(it.id) && !ledgerIds.has(it.id)) continue;
      assert.ok(ledgerIds.has(it.id), it.id + " is not explained by the ledger");
    }
  });

  test("ambiguous items all carry evidence on two sides", () => {
    // The rubric defines ambiguity as two-sided evidence. An item with a single
    // short evidence record and nothing to weigh against it cannot qualify.
    for (const it of V03.items.filter((i) => i.class === "ambiguous")) {
      const twoRecords = it.evidence.length >= 2;
      const internallyConflicting = it.evidence.length === 1 && /while|and neither|whereas|but the/i.test(it.evidence[0].claim);
      assert.ok(twoRecords || internallyConflicting, it.id + " is not two-sided");
    }
  });

  test("record_state items expect supports and unsupported items do not", () => {
    for (const it of V03.items.filter((i) => i.class === "record_state")) {
      assert.equal(it.expected_verdict, "supports", it.id);
    }
    for (const it of V03.items.filter((i) => i.class === "unsupported")) {
      assert.equal(it.expected_verdict, "does_not_establish", it.id);
    }
  });

  test("the held-out sets share no ids or claims with calibration", () => {
    const calIds = new Set(V03.items.map((i) => i.id));
    const calClaims = new Set(V03.items.map((i) => i.claim));
    for (const set of [ADV, OVR]) {
      for (const it of set.items) {
        assert.equal(calIds.has(it.id), false, it.id + " also appears in calibration");
        assert.equal(calClaims.has(it.claim), false, it.id + " reuses a calibration claim");
      }
    }
  });
});

describe("the judge prompt carries no answers", () => {
  test("the version a run reports is the text it was given", () => {
    assert.equal(gradingInstructionsFor(JUDGE_PROMPT_VERSION_V03), GRADING_INSTRUCTIONS_V03);
    assert.equal(gradingInstructionsFor(JUDGE_PROMPT_VERSION), GRADING_INSTRUCTIONS);
    assert.notEqual(GRADING_INSTRUCTIONS_V03, GRADING_INSTRUCTIONS);
  });

  test("buildJudgeInput sends the instructions matching the requested version", () => {
    const input = buildJudgeInput({
      prospect_id: "P1", claim: "x", cited_evidence_ids: [], facts: {}, evidence: [],
      judgePromptVersion: JUDGE_PROMPT_VERSION_V03,
    });
    assert.equal(input.judgePromptVersion, JUDGE_PROMPT_VERSION_V03);
    assert.equal(input.grading_instructions, GRADING_INSTRUCTIONS_V03);
  });

  test("no case identifier appears in the instructions", () => {
    for (const set of [V02, V03, ADV, OVR]) {
      for (const it of set.items) {
        assert.equal(GRADING_INSTRUCTIONS_V03.includes(it.id), false, "instructions name " + it.id);
      }
    }
    assert.equal(/J0[23]-|X03-|O03-/.test(GRADING_INSTRUCTIONS_V03), false);
  });

  test("no fixture claim or evidence sentence is quoted in the instructions", () => {
    const haystack = GRADING_INSTRUCTIONS_V03.toLowerCase();
    for (const set of [V02, V03, ADV, OVR]) {
      for (const it of set.items) {
        const claim = it.claim.toLowerCase().replace(/[.]$/, "");
        assert.equal(haystack.includes(claim), false, "instructions quote the claim of " + it.id);
        for (const e of it.evidence) {
          const ev = e.claim.toLowerCase().replace(/[.]$/, "");
          assert.equal(haystack.includes(ev), false, "instructions quote evidence of " + it.id);
        }
      }
    }
  });

  test("no long phrase is shared between the instructions and any fixture claim", () => {
    // A weaker but broader check than exact quoting: an eight-word run copied out
    // of a fixture would be answer leakage even if punctuation differed.
    const words = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    const promptGrams = new Set();
    const pw = words(GRADING_INSTRUCTIONS_V03);
    for (let i = 0; i + 8 <= pw.length; i += 1) promptGrams.add(pw.slice(i, i + 8).join(" "));
    for (const set of [V02, V03, ADV, OVR]) {
      for (const it of set.items) {
        const cw = words(it.claim);
        for (let i = 0; i + 8 <= cw.length; i += 1) {
          assert.equal(promptGrams.has(cw.slice(i, i + 8).join(" ")), false, "shared phrase with " + it.id);
        }
      }
    }
  });

  test("the instructions carry no concrete version, arm, or gold reference", () => {
    // The closing sentence deliberately names what the judge is NOT told. Strip
    // it before scanning, then require that no concrete identifier survives.
    const blinding = "You are not told a version, arm, desired winner, or promotion threshold.";
    assert.ok(GRADING_INSTRUCTIONS_V03.includes(blinding), "the blinding disclaimer must stay");
    const body = GRADING_INSTRUCTIONS_V03.replace(blinding, "");
    assert.equal(/atlas-v\d|placebo|ranked_tiers|required_evidence|answer key|\bgold\b/i.test(body), false);
    assert.equal(/\barm\b|desired winner|promotion threshold/i.test(body), false);
  });
});

describe("presentation order is controlled, not accidental", () => {
  test("the judge module permutes claims and restores the caller's order", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "evidence-judge.ts"), "utf8");
    assert.match(src, /permutationFor/);
    assert.match(src, /claimOrderSeed/);
    assert.match(src, /restored\[order\[k\]\] = judgments\[k\]/);
  });

  test("scoring uses the same batched path calibration measures", () => {
    const persist = readFileSync(repoPath("packages", "eval", "src", "persist-run.ts"), "utf8");
    assert.match(persist, /liveJudgeClaimsBatched/);
    assert.equal(/await liveJudgeClaims\(/.test(persist), false, "scoring must not use an uncalibrated call path");
    assert.match(persist, /judgePromptVersion: activatedJudgeVersion/);
  });
});
