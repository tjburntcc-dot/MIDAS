import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileStore,
  ensureAtlasV0,
  freezeAtlasV1,
  ensureAtlasV2,
  ensureAtlasV3,
  ensureAtlasV4,
  ensureAtlasV5,
  ATLAS_V0_ID,
  ATLAS_V1_ID,
  ATLAS_V2_ID,
  ATLAS_V3_ID,
  ATLAS_V4_ID,
  ATLAS_V5_ID,
} from "@midas/db";
import { fixtureRespond } from "@midas/model";
import { loadDevelopmentCases } from "./load.ts";
import { presentCase } from "./present.ts";
import { projectRuntimeCase } from "./project.ts";
import { persistDevelopmentEval, sanitizeValidationErrors } from "./persist-run.ts";
import { ingestCurriculumPack, retrieveForCase, retrievePlaceboForCase, leakageHits } from "./curriculum.ts";
import { ingestOwnerPolicyPack, retrieveOracleForCase, leakScanOwnerText, loadOwnerLeakNames } from "./owner-policy.ts";
import { suiteAudit } from "./suite-audit.ts";
import { runFixtureCalibration } from "./evidence-judge.ts";
import { compareExperimentArms, latestExperimentTrio, latestCompletedExperimentTrio, experimentPointers } from "./compare.ts";
import {
  DEV_CASES_V0,
  DEV_CASES_V01,
  DEV_CASES_V01_MANIFEST,
  CHALLENGE_CASES_V0,
  CHALLENGE_CASES_V0_MANIFEST,
  CHALLENGE_FREEZE_ORDER,
  CHALLENGE_POLICIES_DIR,
  FROZEN_V0_JSONL_SHA256,
  FROZEN_ATLAS_V0,
  FROZEN_ATLAS_V1,
  FROZEN_ATLAS_V2,
  FROZEN_ATLAS_V3,
  SUITE_V01_VERSION,
} from "./paths.ts";

const PHASE0 = join(import.meta.dirname, "../../../docs/phase0/ATLAS_CURRICULUM_SOURCES_V0.md");
const SECRET = "test-evaluator-secret-not-for-production";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function seededStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m03-"));
  process.env.MIDAS_SKIP_LIVE_FETCH = "1";
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  const v0 = ensureAtlasV0(store);
  await ingestCurriculumPack({
    store: store,
    curriculumRoot: join(dir, "curriculum"),
    phase0Path: PHASE0,
    casesPath: DEV_CASES_V0,
  });
  const v1 = freezeAtlasV1(store, { parentVersionId: ATLAS_V0_ID });
  const v2 = ensureAtlasV2(store);
  const v3 = ensureAtlasV3(store);
  const owner = await ingestOwnerPolicyPack({ store: store, curriculumRoot: join(dir, "curriculum") });
  const v4 = ensureAtlasV4(store);
  const v5 = ensureAtlasV5(store);
  return { dir, store, v0, v1, v2, v3, v4, v5, owner };
}

describe("frozen historical artifacts", () => {
  test("original v0 jsonl hash unchanged", () => {
    assert.equal(sha256File(DEV_CASES_V0), FROZEN_V0_JSONL_SHA256);
  });

  test("atlas-v0 through atlas-v3 contentHash unchanged", async () => {
    const { store } = await seededStore();
    assert.equal(store.getVersion(ATLAS_V0_ID).contentHash, FROZEN_ATLAS_V0);
    assert.equal(store.getVersion(ATLAS_V2_ID).contentHash, FROZEN_ATLAS_V2);
    // v1/v3 hashes include snapshot.id (LOCAL_REFERENCE bytes embed retrievedAt). Fresh ingest cannot
    // reproduce the production snapshot id, but historical FileStore records must stay frozen.
    const historical = join(import.meta.dirname, "../../../var/state/agent_versions.json");
    if (existsSync(historical)) {
      const versions = JSON.parse(readFileSync(historical, "utf8"));
      const byId = Object.fromEntries(versions.map((v) => [v.id, v]));
      assert.equal(byId["atlas-v0"].contentHash, FROZEN_ATLAS_V0);
      assert.equal(byId["atlas-v1"].contentHash, FROZEN_ATLAS_V1);
      assert.equal(byId["atlas-v2"].contentHash, FROZEN_ATLAS_V2);
      assert.equal(byId["atlas-v3"].contentHash, FROZEN_ATLAS_V3);
    }
    assert.equal(ensureAtlasV0(store).version.contentHash, store.getVersion(ATLAS_V0_ID).contentHash);
    assert.equal(ensureAtlasV2(store).version.contentHash, store.getVersion(ATLAS_V2_ID).contentHash);
    assert.equal(ensureAtlasV3(store).version.contentHash, store.getVersion(ATLAS_V3_ID).contentHash);
    assert.equal(store.getVersion(ATLAS_V4_ID).parentVersionId, ATLAS_V2_ID);
    assert.equal(store.getVersion(ATLAS_V5_ID).parentVersionId, ATLAS_V4_ID);
    assert.equal(store.getVersion(ATLAS_V4_ID).retrievalPolicy.enabled, false);
    assert.equal(store.getVersion(ATLAS_V5_ID).retrievalPolicy.enabled, true);
    assert.deepEqual(store.getVersion(ATLAS_V5_ID).promptBundle, store.getVersion(ATLAS_V4_ID).promptBundle);
    assert.notEqual(store.getVersion(ATLAS_V4_ID).contentHash, FROZEN_ATLAS_V2);
  });
});

describe("v0.1 suite audit and gold visibility", () => {
  test("v0.1 audit passes and DEV-006 gold keys are runtime-visible", () => {
    const cases = loadDevelopmentCases(DEV_CASES_V01);
    const audit = suiteAudit(cases);
    assert.equal(audit.ok, true, JSON.stringify(audit.findings, null, 2));
    const rec = cases.find((c) => c.case_id === "ATLAS-DEV-006");
    const p3 = rec.prospects.find((p) => p.id === "P3");
    assert.equal(Object.prototype.hasOwnProperty.call(p3.facts, "open_roles"), true);
    assert.equal(p3.facts.open_roles, null);
    assert.equal(Object.prototype.hasOwnProperty.call(p3.facts, "current_first_party_hiring_signal"), true);
    assert.equal(p3.facts.current_first_party_hiring_signal, null);
    const runtime = projectRuntimeCase(rec);
    const rp3 = runtime.prospects.find((p) => p.id === "P3");
    assert.equal(Object.prototype.hasOwnProperty.call(rp3.facts, "current_first_party_hiring_signal"), true);
    const man = JSON.parse(readFileSync(DEV_CASES_V01_MANIFEST, "utf8"));
    assert.equal(man.sha256, sha256File(DEV_CASES_V01));
    assert.equal(man.parentSuite.sha256, FROZEN_V0_JSONL_SHA256);
  });

  test("no gold in runtime inputs for v0.1 or challenge", () => {
    for (const path of [DEV_CASES_V01, CHALLENGE_CASES_V0]) {
      for (const record of loadDevelopmentCases(path)) {
        const runtime = projectRuntimeCase(record);
        const json = JSON.stringify(runtime);
        assert.equal(Object.prototype.hasOwnProperty.call(runtime, "gold"), false);
        assert.equal(json.includes("ranked_tiers"), false);
        assert.equal(json.includes("required_unknowns"), false);
        const presented = presentCase({
          record: record,
          evaluatorSecret: SECRET,
          suiteVersion: SUITE_V01_VERSION,
          trialIndex: 0,
        });
        const pjson = JSON.stringify(presented.runtimeInput);
        assert.equal(pjson.includes('"gold"'), false);
      }
    }
  });
});

describe("fault-tolerant persist", () => {
  test("one invalid case does not abort remaining cases; invalids are null and counted", async () => {
    const { store, v4 } = await seededStore();
    let n = 0;
    const out = await persistDevelopmentEval({
      store: store,
      agentVersionId: v4.version.id,
      trialIndex: 0,
      arm: "baseline",
      suiteId: "atlas-dev-v0.1",
      responderKind: "fixture",
      casesPath: DEV_CASES_V01,
      evaluatorSecret: SECRET,
      responder: (input) => {
        n += 1;
        if (input.case_id === "ATLAS-DEV-002") return { case_id: "nope" };
        return fixtureRespond(input);
      },
    });
    assert.ok(n >= 8, "remaining cases continued, saw " + n);
    assert.equal(out.results.length, 8);
    const bad = out.results.find((r) => r.caseId === "ATLAS-DEV-002");
    const good = out.results.find((r) => r.caseId === "ATLAS-DEV-001");
    assert.equal(bad.scoreStatus, "invalid");
    assert.equal(bad.weightedTotal, null);
    assert.equal(good.scoreStatus, "scored");
    assert.equal(typeof good.weightedTotal, "number");
    assert.equal(out.run.status, "completed_with_invalids");
    assert.equal(out.run.nInvalid, 1);
    assert.equal(out.run.nAttempted, 8);
    assert.equal(out.run.nScored, 7);
    assert.equal(out.run.eligibleForPromotion, false);
    assert.equal(out.run.eligibleForInterpretation, false);
  });

  test("retry payload contains no gold and is identical across arms", async () => {
    const { store, v4 } = await seededStore();
    const seen = [];
    const responder = (input, meta) => {
      if (meta && meta.repair) {
        seen.push(JSON.stringify({ input: input, repair: meta.repair }));
        return fixtureRespond(input);
      }
      return { case_id: "nope" };
    };
    for (const arm of ["baseline", "relevant", "placebo"]) {
      await persistDevelopmentEval({
        store: store,
        agentVersionId: v4.version.id,
        trialIndex: 9,
        arm: arm,
        responderKind: "fixture",
        casesPath: DEV_CASES_V01,
        evaluatorSecret: SECRET,
        maxCases: 1,
        responder: responder,
      });
    }
    assert.equal(seen.length, 3);
    assert.equal(seen[0], seen[1]);
    assert.equal(seen[1], seen[2]);
    for (const blob of seen) {
      assert.equal(blob.includes("ranked_tiers"), false);
      assert.equal(blob.includes("required_unknowns"), false);
      assert.equal(/"gold"/.test(blob), false);
      assert.equal(blob.includes("desired"), false);
      assert.equal(blob.includes("baseline"), false);
    }
    const sanitized = sanitizeValidationErrors(["/assessments must have required property 'gold' and arm=relevant"]);
    assert.equal(sanitized.join(" ").includes("gold"), false);
    assert.equal(sanitized.join(" ").includes("relevant"), false);
  });
});

describe("experiment pointers", () => {
  test("latest-completed is not replaced by a newer blocked trio", async () => {
    const { store, v4, v5 } = await seededStore();
    const runArm = async (arm, versionId, trial, statusOverride) => {
      const out = await persistDevelopmentEval({
        store: store,
        agentVersionId: versionId,
        trialIndex: trial,
        arm: arm,
        responderKind: "fixture",
        casesPath: DEV_CASES_V01,
        evaluatorSecret: SECRET,
        maxCases: 1,
        responder: (input) => fixtureRespond(input),
      });
      if (statusOverride) {
        store.putEvalRun({ ...store.getEvalRun(out.run.id), status: statusOverride, inconclusive: statusOverride === "blocked", eligibleForInterpretation: false });
      }
      return out.run.id;
    };
    await runArm("baseline", v4.version.id, 0);
    await runArm("relevant", v5.version.id, 0);
    await runArm("placebo", v5.version.id, 0);
    await runArm("baseline", v4.version.id, 1, "blocked");
    await runArm("relevant", v5.version.id, 1, "blocked");
    await runArm("placebo", v5.version.id, 1, "blocked");
    const completed = latestCompletedExperimentTrio(store);
    const attempted = latestExperimentTrio(store);
    const pointers = experimentPointers(store);
    assert.equal(completed.trialIndex, 0);
    assert.equal(attempted.trialIndex, 1);
    assert.equal(pointers.latestBlocked.trialIndex, 1);
    assert.equal(pointers.latestCompleted.trialIndex, 0);
    const cmp = compareExperimentArms(store, completed.baseline.id, completed.relevant.id, completed.placebo.id);
    assert.equal(cmp.eligibleForInterpretation, true);
  });
});

describe("retrieval and challenge/policy order", () => {
  test("retrieval is selective and placebo/relevant share presentation", async () => {
    const { store, v5 } = await seededStore();
    const rec = loadDevelopmentCases(CHALLENGE_CASES_V0)[0];
    const runtime = projectRuntimeCase(rec);
    const rel = retrieveForCase(store, runtime, { maxItems: 6, sourceAllowlist: ["SRC-OWN-001", "SRC-OWN-002", "SRC-OWN-003", "SRC-OWN-004", "SRC-OWN-005", "SRC-OWN-006"] });
    assert.ok(rel.retrievedItemIds.length <= 6);
    assert.ok(rel.retrievedItemIds.length < rel.candidateCount || rel.candidateCount <= 6);
    const seen = [];
    const responder = (input) => {
      seen.push(input.prospects.map((p) => p.id + ":" + p.company).join("|"));
      return fixtureRespond(input);
    };
    await persistDevelopmentEval({
      store: store, agentVersionId: v5.version.id, trialIndex: 4, arm: "relevant",
      responderKind: "fixture", casesPath: CHALLENGE_CASES_V0, evaluatorSecret: SECRET, maxCases: 1, responder: responder,
    });
    await persistDevelopmentEval({
      store: store, agentVersionId: v5.version.id, trialIndex: 4, arm: "placebo",
      responderKind: "fixture", casesPath: CHALLENGE_CASES_V0, evaluatorSecret: SECRET, maxCases: 1, responder: responder,
    });
    assert.equal(seen[0], seen[1]);
  });

  test("challenge was frozen before policy snapshot order", async () => {
    const order = JSON.parse(readFileSync(CHALLENGE_FREEZE_ORDER, "utf8"));
    const man = JSON.parse(readFileSync(CHALLENGE_CASES_V0_MANIFEST, "utf8"));
    assert.equal(man.sha256, sha256File(CHALLENGE_CASES_V0));
    assert.equal(order.challengeSha256, man.sha256);
    assert.ok(order.challengeFrozenAt <= order.policiesWrittenAt);
    const { owner } = await seededStore();
    assert.ok(owner.snapshot.createdAt >= order.challengeFrozenAt);
    assert.ok(String(owner.snapshot.id).startsWith("curriculum-owner-dev-"));
    const audit = suiteAudit(loadDevelopmentCases(CHALLENGE_CASES_V0));
    assert.equal(audit.ok, true, JSON.stringify(audit.findings, null, 2));
  });

  test("policy leak scan rejects case-id contamination", () => {
    const names = loadOwnerLeakNames();
    const hits = leakScanOwnerText("Do not qualify ATLAS-DEV-101 or Cedar Quay Analytics.", names);
    assert.ok(hits.length > 0, "expected leak hits");
    assert.ok(hits.some((h) => /ATLAS-DEV-/.test(String(h))) || hits.includes("Cedar Quay Analytics"));
    const clean = leakScanOwnerText("Serve United States accounts only.", names);
    assert.equal(clean.length, 0);
  });
});

describe("historical FileStore and judge honesty", () => {
  test("historical FileStore records still load after v4/v5", async () => {
    const { dir, store, v0 } = await seededStore();
    const run = await persistDevelopmentEval({
      store: store,
      agentVersionId: ATLAS_V0_ID,
      trialIndex: 0,
      arm: "baseline",
      responderKind: "fixture",
      casesPath: DEV_CASES_V0,
      evaluatorSecret: SECRET,
      responder: (input) => fixtureRespond(input),
    });
    const second = new FileStore(dir);
    assert.equal(second.getVersion(ATLAS_V0_ID).contentHash, v0.version.contentHash);
    assert.equal(second.getVersion(ATLAS_V4_ID)?.id, ATLAS_V4_ID);
    assert.equal(second.getEvalRun(run.run.id)?.status, "completed");
    assert.equal(second.listCaseResults(run.run.id).length, 8);
    const scored = second.listCaseResults(run.run.id)[0];
    assert.ok(Object.prototype.hasOwnProperty.call(scored, "researchQueueIds"));
  });

  test("fixture calibration is official=false and does not activate scores", () => {
    const report = runFixtureCalibration();
    assert.equal(report.official, false);
    assert.equal(report.kind, "fixture_rubric");
    assert.ok(report.agreement >= 0.85);
    assert.equal(report.falseAcceptRate, 0);
  });

  test("oracle retrieval is diagnostic and bounded", async () => {
    const { store } = await seededStore();
    const oracle = retrieveOracleForCase(store, "ATLAS-DEV-101", { maxItems: 6 });
    assert.equal(oracle.diagnostic, true);
    assert.ok(oracle.retrievedItemIds.length >= 1);
    assert.ok(oracle.retrievedItemIds.every((id) => String(id).startsWith("K-OWN-001")));
    assert.match(oracle.note, /diagnostic/i);
  });
});
