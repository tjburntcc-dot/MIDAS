import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
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
  ensureAtlasV6,
  ATLAS_V0_ID,
  ATLAS_V1_ID,
  ATLAS_V2_ID,
  ATLAS_V3_ID,
  ATLAS_V4_ID,
  ATLAS_V5_ID,
  ATLAS_V6_ID,
} from "@midas/db";
import { fixtureRespond } from "@midas/model";
import { loadDevelopmentCases } from "./load.ts";
import { projectRuntimeCase } from "./project.ts";
import { persistDevelopmentEval } from "./persist-run.ts";
import { ingestCurriculumPack, retrieveForCase, DEFAULT_MAX_ITEMS } from "./curriculum.ts";
import { ingestOwnerPolicyPack, ingestOwnerPolicyRevision } from "./owner-policy.ts";
import { evaluateRetrievalSuite, retrievalGatesPass } from "./retrieval-metrics.ts";
import { attributeCaseResult, ATTRIBUTION_STAGES } from "./attribution.ts";
import { loadRetrievalRelevance, retrievalRelevanceSha256 } from "./relevance-labels.ts";
import { runFixtureCalibration, runExpandedFixtureCalibration } from "./evidence-judge.ts";
import { latestCompletedExperimentTrio, experimentPointers } from "./compare.ts";
import {
  DEV_CASES_V0,
  CHALLENGE_CASES_V0,
  MISSION03_EVIDENCE_LOCK,
  RETRIEVAL_RELEVANCE_V0,
  RETRIEVAL_RELEVANCE_V0_MANIFEST,
  FROZEN_ATLAS_V0,
  FROZEN_ATLAS_V1,
  FROZEN_ATLAS_V2,
  FROZEN_ATLAS_V3,
  FROZEN_ATLAS_V4,
  FROZEN_ATLAS_V5,
  FROZEN_OWNER_SNAPSHOT,
  FROZEN_CHALLENGE_JSONL,
} from "./paths.ts";

const PHASE0 = join(import.meta.dirname, "../../../docs/phase0/ATLAS_CURRICULUM_SOURCES_V0.md");
const SECRET = "test-evaluator-secret-not-for-production";
const OWNER_ALLOW = [
  "SRC-OWN-001",
  "SRC-OWN-002",
  "SRC-OWN-003",
  "SRC-OWN-004",
  "SRC-OWN-005",
  "SRC-OWN-006",
  "SRC-OWN-007",
];

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readSource(rel) {
  return readFileSync(join(import.meta.dirname, rel), "utf8");
}

async function seededStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m04-"));
  process.env.MIDAS_SKIP_LIVE_FETCH = "1";
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  ensureAtlasV0(store);
  await ingestCurriculumPack({
    store: store,
    curriculumRoot: join(dir, "curriculum"),
    phase0Path: PHASE0,
    casesPath: DEV_CASES_V0,
  });
  freezeAtlasV1(store, { parentVersionId: ATLAS_V0_ID });
  ensureAtlasV2(store);
  ensureAtlasV3(store);
  const owner = await ingestOwnerPolicyPack({ store: store, curriculumRoot: join(dir, "curriculum") });
  const v4 = ensureAtlasV4(store);
  const v5 = ensureAtlasV5(store);
  const revision = await ingestOwnerPolicyRevision({ store: store, curriculumRoot: join(dir, "curriculum") });
  const v6 = ensureAtlasV6(store);
  return { dir, store, owner, revision, v4, v5, v6 };
}

describe("mission 03 lock and frozen hashes", () => {
  test("lock file records immutable M03 hashes", () => {
    const lock = JSON.parse(readFileSync(MISSION03_EVIDENCE_LOCK, "utf8"));
    assert.equal(lock.challengeSuite.sha256, FROZEN_CHALLENGE_JSONL);
    assert.equal(lock.ownerSnapshot.contentHash, FROZEN_OWNER_SNAPSHOT);
    assert.equal(lock.ownerSnapshot.id, "curriculum-owner-dev-edc222091f5c");
    assert.equal(lock.versions["atlas-v4"].contentHash, FROZEN_ATLAS_V4);
    assert.equal(lock.versions["atlas-v5"].contentHash, FROZEN_ATLAS_V5);
    assert.equal(lock.versions["atlas-v5"].maxItems, 6);
    assert.equal(lock.retrievalPolicy.version, "fixed-top-6-lexical");
    assert.equal(lock.judge.version, "atlas-evidence-judge-v0.1.0");
    assert.equal(lock.model, "gpt-4.1-2025-04-14");
    assert.equal(lock.challengeTrials[0].relevant, 86.37);
    assert.equal(lock.challengeTrials[1].relevant, 86.98);
  });

  test("challenge jsonl hash unchanged", () => {
    assert.equal(sha256File(CHALLENGE_CASES_V0), FROZEN_CHALLENGE_JSONL);
    assert.equal(sha256File(CHALLENGE_CASES_V0), "1e96764dd2f4418b20fdc93a32cb7f26e0fc52059f269385f8be71e69695710d");
  });

  test("owner pack still produces frozen snapshot; revision is a new snapshot", async () => {
    const { owner, revision } = await seededStore();
    assert.equal(owner.snapshot.contentHash, FROZEN_OWNER_SNAPSHOT);
    assert.equal(owner.snapshot.id, "curriculum-owner-dev-edc222091f5c");
    assert.ok(revision.snapshot.contentHash);
    assert.notEqual(revision.snapshot.contentHash, FROZEN_OWNER_SNAPSHOT);
    assert.ok(revision.snapshot.sourceIds.includes("SRC-OWN-007"));
    assert.ok(!owner.snapshot.sourceIds.includes("SRC-OWN-007"));
  });

  test("historical FileStore atlas-v0..v5 hashes unchanged", () => {
    const historical = join(import.meta.dirname, "../../../var/state/agent_versions.json");
    assert.equal(existsSync(historical), true);
    const versions = JSON.parse(readFileSync(historical, "utf8"));
    const byId = Object.fromEntries(versions.map((v) => [v.id, v]));
    assert.equal(byId["atlas-v0"].contentHash, FROZEN_ATLAS_V0);
    assert.equal(byId["atlas-v1"].contentHash, FROZEN_ATLAS_V1);
    assert.equal(byId["atlas-v2"].contentHash, FROZEN_ATLAS_V2);
    assert.equal(byId["atlas-v3"].contentHash, FROZEN_ATLAS_V3);
    assert.equal(byId["atlas-v4"].contentHash, FROZEN_ATLAS_V4);
    assert.equal(byId["atlas-v5"].contentHash, FROZEN_ATLAS_V5);
    assert.equal(byId["atlas-v5"].retrievalPolicy.maxItems, 6);
    if (byId["atlas-v6"]) {
      assert.notEqual(byId["atlas-v6"].contentHash, FROZEN_ATLAS_V5);
      assert.equal(byId["atlas-v5"].contentHash, FROZEN_ATLAS_V5);
    }
  });

  test("fresh store v4/v5 hashes match frozen; v6 is new and does not rewrite v5", async () => {
    const { store } = await seededStore();
    assert.equal(store.getVersion(ATLAS_V4_ID).contentHash, FROZEN_ATLAS_V4);
    assert.equal(store.getVersion(ATLAS_V5_ID).contentHash, FROZEN_ATLAS_V5);
    const v6 = store.getVersion(ATLAS_V6_ID);
    assert.ok(v6);
    assert.equal(v6.retrievalPolicy.version, "hybrid-v0.1");
    assert.equal(v6.retrievalPolicy.maxItems, 12);
    assert.notEqual(v6.contentHash, FROZEN_ATLAS_V5);
    assert.deepEqual(v6.promptBundle, store.getVersion(ATLAS_V4_ID).promptBundle);
    assert.equal(ensureAtlasV5(store).version.contentHash, FROZEN_ATLAS_V5);
    assert.equal(ensureAtlasV6(store).created, false);
  });
});

describe("evaluator-only relevance labels", () => {
  test("manifest hash matches relevance file", () => {
    const man = JSON.parse(readFileSync(RETRIEVAL_RELEVANCE_V0_MANIFEST, "utf8"));
    assert.equal(man.sha256, sha256File(RETRIEVAL_RELEVANCE_V0));
    assert.equal(man.sha256, retrievalRelevanceSha256());
    const labels = loadRetrievalRelevance();
    assert.equal(labels.evaluatorOnly, true);
    for (const id of ["ATLAS-DEV-101", "ATLAS-DEV-102", "ATLAS-DEV-103", "ATLAS-DEV-104", "ATLAS-DEV-105", "ATLAS-DEV-106", "ATLAS-DEV-107"]) {
      assert.ok(labels.cases[id], id);
      assert.ok(labels.cases[id].critical.length >= 1, id);
    }
    const blob = JSON.stringify(labels);
    assert.equal(blob.includes("ranked_tiers"), false);
    assert.equal(blob.includes("required_unknowns"), false);
  });

  test("retrieveForCase and retrieve-v2 never import relevance or hardcode case answers", () => {
    const v2 = readSource("./retrieve-v2.ts");
    const curr = readSource("./curriculum.ts");
    for (const src of [v2, curr]) {
      assert.equal(src.includes("retrieval_relevance"), false);
      assert.equal(src.includes("relevance-labels"), false);
      assert.equal(/ATLAS-DEV-10[136]/.test(src), false);
      assert.equal(src.includes("K-OWN-001-01"), false);
    }
  });
});

describe("hybrid retrieval gates", () => {
  test("100% critical recall, budget, no gold, no full-doc", async () => {
    const { store } = await seededStore();
    const report = evaluateRetrievalSuite({
      store: store,
      retrieveOpts: { maxItems: 12, sourceAllowlist: OWNER_ALLOW, contextBudgetTokens: 4000 },
    });
    assert.equal(retrievalGatesPass(report), true, JSON.stringify({
      gates: report.gates,
      overallRelevantRecall: report.overallRelevantRecall,
      cases: report.cases.map((c) => ({
        id: c.caseId,
        criticalRecall: c.criticalRecall,
        hitCritical: c.hitCritical,
        missing: c.criticalIds.filter((id) => !c.hitCritical.includes(id)),
        retrieved: c.retrievedItemIds,
      })),
    }, null, 2));
    assert.equal(report.overallCriticalRecall, true);
    assert.ok(report.overallRelevantRecall >= 0.9);
    assert.equal(report.noDangerousBeforeCritical, true);
    assert.equal(report.noFullDocInjection, true);
    assert.equal(report.noGoldInQuery, true);
    assert.equal(report.budgetHonored, true);
    for (const row of report.cases) {
      assert.ok(row.tokensUsed <= 4000);
      assert.equal(row.goldInQuery, false);
      assert.ok(row.retrievedItemIds.length < row.criticalIds.length + 20);
    }
  });

  test("101/106/103 critical items retrieved without those case ids in retriever source", async () => {
    const { store } = await seededStore();
    const labels = loadRetrievalRelevance();
    const cases = loadDevelopmentCases(CHALLENGE_CASES_V0);
    const want = {
      "ATLAS-DEV-101": labels.cases["ATLAS-DEV-101"].critical.map((r) => r.id),
      "ATLAS-DEV-106": labels.cases["ATLAS-DEV-106"].critical.map((r) => r.id),
      "ATLAS-DEV-103": labels.cases["ATLAS-DEV-103"].critical.map((r) => r.id),
    };
    for (const rec of cases) {
      if (!want[rec.case_id]) continue;
      const runtime = projectRuntimeCase(rec);
      const trace = retrieveForCase(store, runtime, { maxItems: 12, sourceAllowlist: OWNER_ALLOW });
      for (const id of want[rec.case_id]) {
        assert.ok(trace.retrievedItemIds.includes(id), rec.case_id + " missing " + id + " got " + trace.retrievedItemIds.join(","));
      }
      assert.equal(/ATLAS-DEV-10[136]/.test(trace.query), false);
      assert.ok(trace.tokensUsed <= 4000);
      assert.ok(trace.retrievedItemIds.length <= 12);
      assert.ok(trace.retrievedItemIds.length < store.listKnowledge().filter((k) => String(k.sourceId).startsWith("SRC-OWN-")).length);
    }
    const v2 = readSource("./retrieve-v2.ts");
    assert.equal(/ATLAS-DEV-10[136]/.test(v2), false);
    assert.equal(v2.includes("K-OWN-001-01"), false);
  });

  test("token budget stays 4000 and DEFAULT_MAX_ITEMS remains 6 for older tests", () => {
    assert.equal(DEFAULT_MAX_ITEMS, 6);
  });
});

describe("failure attribution", () => {
  test("enum is closed and persisted on case results", async () => {
    assert.deepEqual(ATTRIBUTION_STAGES, [
      "not_retrieved",
      "retrieved_ignored",
      "retrieved_misapplied",
      "evidence_misread",
      "schema_or_repair",
      "deterministic_scorer",
      "semantic_judge",
      "benchmark_defect",
      "model_reasoning",
    ]);
    const { store, v6 } = await seededStore();
    const run = await persistDevelopmentEval({
      store: store,
      agentVersionId: v6.version.id,
      trialIndex: 0,
      arm: "relevant",
      responderKind: "fixture",
      casesPath: CHALLENGE_CASES_V0,
      evaluatorSecret: SECRET,
      maxCases: 1,
      maxItems: 12,
      sourceAllowlist: OWNER_ALLOW,
      responder: (input) => fixtureRespond(input),
    });
    const row = store.listCaseResults(run.run.id)[0];
    assert.ok(Object.prototype.hasOwnProperty.call(row, "failureAttribution"));
    if (row.failureAttribution != null) {
      assert.ok(ATTRIBUTION_STAGES.includes(row.failureAttribution));
    }
    const attr = attributeCaseResult({
      record: loadDevelopmentCases(CHALLENGE_CASES_V0)[0],
      result: { scoreStatus: "invalid", validationOk: false },
    });
    assert.equal(attr.stage, "schema_or_repair");
  });
});

describe("judge calibration expanded set", () => {
  test("v0 fixture still official=false and passes M03 bar", () => {
    const report = runFixtureCalibration();
    assert.equal(report.official, false);
    assert.ok(report.agreement >= 0.85);
    assert.equal(report.falseAcceptRate, 0);
  });

  test("expanded fixture has >=32 items and reports per-class metrics", () => {
    const report = runExpandedFixtureCalibration();
    assert.ok(report.n >= 32);
    assert.ok(report.perClass);
    assert.ok(report.confusion);
    assert.equal(typeof report.expandedPassed, "boolean");
    assert.equal(typeof report.criticalFalseAccept, "number");
  });
});

describe("latest-completed still works", () => {
  test("completed trio is preferred over a later blocked trio", async () => {
    const { store, v4, v6 } = await seededStore();
    const responder = (input) => fixtureRespond(input);
    const common = {
      store: store,
      responderKind: "fixture",
      casesPath: CHALLENGE_CASES_V0,
      evaluatorSecret: SECRET,
      maxCases: 1,
      responder: responder,
    };
    await persistDevelopmentEval({ ...common, agentVersionId: v4.version.id, trialIndex: 0, arm: "baseline" });
    await persistDevelopmentEval({ ...common, agentVersionId: v6.version.id, trialIndex: 0, arm: "relevant", maxItems: 12, sourceAllowlist: OWNER_ALLOW });
    await persistDevelopmentEval({ ...common, agentVersionId: v6.version.id, trialIndex: 0, arm: "placebo", maxItems: 12, sourceAllowlist: OWNER_ALLOW });
    const blocked = await persistDevelopmentEval({
      ...common,
      agentVersionId: v4.version.id,
      trialIndex: 1,
      arm: "baseline",
      responder: () => {
        throw new Error("Live session not verified");
      },
    });
    assert.equal(blocked.run.status, "blocked");
    const completed = latestCompletedExperimentTrio(store);
    const pointers = experimentPointers(store);
    assert.ok(completed);
    assert.equal(completed.trialIndex, 0);
    assert.equal(pointers.latestCompleted.trialIndex, 0);
  });
});
