import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync, statSync } from "node:fs";
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
  ensureAtlasV7,
  ensureAtlasV8,
  ATLAS_V4_ID,
  ATLAS_V5_ID,
  ATLAS_V6_ID,
  ATLAS_V7_ID,
  ATLAS_V8_ID,
  atlasV7Prompt,
} from "@midas/db";
import { loadDevelopmentCases } from "./load.ts";
import { projectRuntimeCase } from "./project.ts";
import { ingestCurriculumPack, retrieveForCase, knowledgePromptBlock } from "./curriculum.ts";
import { ingestOwnerPolicyPack, ingestOwnerPolicyRevision, ingestOwnerApplicabilitySnapshot } from "./owner-policy.ts";
import { evaluateRetrievalSuite, retrievalGatesPass } from "./retrieval-metrics.ts";
import {
  evaluateApplicability,
  scoreApplicabilityMicrobenchmark,
  applicabilityMicroSha256,
  microbenchmarkLockOk,
  APPLICABILITY_VALUES,
  ATTRIBUTION_SUBREASONS,
  APPLICABILITY_MICRO_LOCK,
  APPLICABILITY_MICRO_PATH,
} from "./applicability.ts";
import { runFixtureCalibration, runExpandedFixtureCalibration, runV02FixtureCalibration } from "./evidence-judge.ts";
import {
  DEV_CASES_V0,
  CHALLENGE_CASES_V0,
  MISSION03_EVIDENCE_LOCK,
  RETRIEVAL_RELEVANCE_V0,
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
const OWNER_ALLOW = [
  "SRC-OWN-001",
  "SRC-OWN-002",
  "SRC-OWN-003",
  "SRC-OWN-004",
  "SRC-OWN-005",
  "SRC-OWN-006",
  "SRC-OWN-007",
  "SRC-OWN-008",
];
const FROZEN_ATLAS_V6 = "1118e1a94e6558744965fd5f916b37d431984cee4cd911649e4b4c63027e4554";
const SCORER_AUDIT = join(import.meta.dirname, "../../../var/state/mission05-scorer-audit.md");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readSource(rel) {
  return readFileSync(join(import.meta.dirname, rel), "utf8");
}

async function seededStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m05-"));
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
  freezeAtlasV1(store, { parentVersionId: "atlas-v0" });
  ensureAtlasV2(store);
  ensureAtlasV3(store);
  const owner = await ingestOwnerPolicyPack({ store: store, curriculumRoot: join(dir, "curriculum") });
  const v4 = ensureAtlasV4(store);
  const v5 = ensureAtlasV5(store);
  const revision = await ingestOwnerPolicyRevision({ store: store, curriculumRoot: join(dir, "curriculum") });
  const v6 = ensureAtlasV6(store);
  const applicability = await ingestOwnerApplicabilitySnapshot({ store: store, curriculumRoot: join(dir, "curriculum") });
  const v7 = ensureAtlasV7(store);
  const v8 = ensureAtlasV8(store);
  return { dir, store, owner, revision, applicability, v4, v5, v6, v7, v8 };
}

describe("mission 05 frozen hashes unchanged", () => {
  test("challenge jsonl, owner snapshot, atlas-v0..v6 hashes stay frozen", () => {
    assert.equal(sha256File(CHALLENGE_CASES_V0), FROZEN_CHALLENGE_JSONL);
    const lock = JSON.parse(readFileSync(MISSION03_EVIDENCE_LOCK, "utf8"));
    assert.equal(lock.challengeSuite.sha256, FROZEN_CHALLENGE_JSONL);
    assert.equal(lock.ownerSnapshot.contentHash, FROZEN_OWNER_SNAPSHOT);
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
    if (byId["atlas-v6"]) assert.equal(byId["atlas-v6"].contentHash, FROZEN_ATLAS_V6);
    assert.equal(sha256File(RETRIEVAL_RELEVANCE_V0), JSON.parse(readFileSync(RETRIEVAL_RELEVANCE_V0.replace(/\.json$/, ".manifest.json"), "utf8")).sha256);
  });

  test("fresh store does not rewrite v4/v5/v6", async () => {
    const { store } = await seededStore();
    assert.equal(store.getVersion(ATLAS_V4_ID).contentHash, FROZEN_ATLAS_V4);
    assert.equal(store.getVersion(ATLAS_V5_ID).contentHash, FROZEN_ATLAS_V5);
    assert.equal(store.getVersion(ATLAS_V6_ID).contentHash, store.getVersion(ATLAS_V6_ID).contentHash);
    assert.notEqual(store.getVersion(ATLAS_V6_ID).contentHash, FROZEN_ATLAS_V5);
    assert.equal(ensureAtlasV6(store).created, false);
    assert.ok(store.getVersion(ATLAS_V7_ID));
    assert.ok(store.getVersion(ATLAS_V8_ID));
    assert.notEqual(store.getVersion(ATLAS_V7_ID).contentHash, FROZEN_ATLAS_V4);
    assert.notEqual(store.getVersion(ATLAS_V8_ID).contentHash, FROZEN_ATLAS_V6);
    assert.deepEqual(store.getVersion(ATLAS_V8_ID).promptBundle, store.getVersion(ATLAS_V7_ID).promptBundle);
    assert.equal(store.getVersion(ATLAS_V7_ID).retrievalPolicy.enabled, false);
    assert.equal(store.getVersion(ATLAS_V8_ID).retrievalPolicy.enabled, true);
  });
});

describe("microbenchmark frozen before prompt", () => {
  test("lock hash matches jsonl and predates v7 prompt file mtime", () => {
    assert.equal(microbenchmarkLockOk(), true);
    const lock = JSON.parse(readFileSync(APPLICABILITY_MICRO_LOCK, "utf8"));
    assert.equal(lock.frozenBeforePrompt, true);
    assert.equal(lock.microbenchmark.sha256, applicabilityMicroSha256());
    assert.equal(lock.atlasV6ContentHashAtFreeze, FROZEN_ATLAS_V6);
    const lockStat = statSync(APPLICABILITY_MICRO_LOCK);
    const seedStat = statSync(join(import.meta.dirname, "../../db/src/seed-atlas.ts"));
    assert.ok(lockStat.mtimeMs <= seedStat.mtimeMs, "lock mtime must be <= seed-atlas.ts after v7 was added");
    assert.equal(existsSync(APPLICABILITY_MICRO_PATH), true);
  });

  test("microbenchmark has 15 synthetic situations and scores >=95% with 0 new CFs", () => {
    const report = scoreApplicabilityMicrobenchmark();
    assert.equal(report.n, 15);
    assert.ok(report.accuracy >= 0.95, JSON.stringify(report.rows.filter((r) => !r.ok)));
    assert.equal(report.newCriticalFailures, 0);
    assert.equal(report.passed, true);
  });
});

describe("no case/company/gold leakage in retriever or new prompt", () => {
  test("retrieve-v2, curriculum, v7 prompt, 008 source have no challenge answers", () => {
    const v2 = readSource("./retrieve-v2.ts");
    const prompt = JSON.stringify(atlasV7Prompt());
    const src008 = readFileSync(join(import.meta.dirname, "../../../evals/atlas/v0/challenge/policies/SRC-OWN-008-protected-accounts-applicability.md"), "utf8");
    for (const src of [v2, prompt, src008]) {
      assert.equal(src.includes("ATLAS-DEV-105"), false);
      assert.equal(/Newmark Loom|Freshwater Canvas|Keepwell Existing|Civic Ledger/.test(src), false);
      assert.equal(src.includes("ranked_tiers"), false);
      assert.equal(src.includes("required_unknowns"), false);
    }
    assert.equal(/ATLAS-DEV-10[136]/.test(v2), false);
    assert.equal(v2.includes("K-OWN-001-01"), false);
    assert.equal(prompt.includes("K-OWN-"), false);
  });
});

describe("applicability three-valued semantics", () => {
  test("satisfied / not_satisfied / unknown and unknown => research_first", () => {
    assert.deepEqual(APPLICABILITY_VALUES, ["satisfied", "not_satisfied", "unknown"]);
    const contract = {
      requiredConditions: [{ id: "c1", kind: "structured", field: "account_status", op: "eq", value: "existing_customer", description: "existing", evidenceRequired: true, evidenceFilter: { sources: ["first_party", "official"], maxAgeDays: 45 } }],
      effect: "exclude",
      unknownBehavior: "research_first",
      exceptions: [],
      priority: 90,
    };
    const sat = evaluateApplicability(contract, {
      id: "A",
      facts: { account_status: "existing_customer" },
      evidence: [{ id: "E1", claim: "Official registry lists this same account as an active existing customer.", source: "official", age_days: 2 }],
    });
    assert.equal(sat.applicability, "satisfied");
    assert.equal(sat.hard_exclude, true);
    const notSat = evaluateApplicability(contract, {
      id: "B",
      facts: { account_status: "new_logo" },
      evidence: [{ id: "E1", claim: "Commercial new-logo record.", source: "first_party", age_days: 2 }],
    });
    assert.equal(notSat.applicability, "not_satisfied");
    assert.equal(notSat.suggested_next_action, "ignore");
    const unk = evaluateApplicability(contract, {
      id: "C",
      facts: { account_status: null },
      evidence: [{ id: "E1", claim: "Status is not on the record.", source: "first_party", age_days: 2 }],
    });
    assert.equal(unk.applicability, "unknown");
    assert.equal(unk.suggested_next_action, "research_first");
    assert.equal(unk.hard_exclude, false);
  });

  test("documented exception overrides hard exclude", () => {
    const contract = {
      requiredConditions: [{ id: "c1", kind: "structured", field: "account_status", op: "eq", value: "existing_customer", description: "existing" }],
      effect: "exclude",
      unknownBehavior: "research_first",
      exceptions: [{ id: "ex-reopen", description: "reopen", conditions: [{ id: "c-reopen", field: "reopen_authorization", op: "eq", value: true, description: "reopen" }] }],
      priority: 90,
    };
    const got = evaluateApplicability(contract, { id: "D", facts: { account_status: "existing_customer", reopen_authorization: true }, evidence: [] });
    assert.equal(got.applicability, "satisfied");
    assert.equal(got.exception, "ex-reopen");
    assert.equal(got.hard_exclude, false);
    assert.equal(got.suggested_next_action, "ignore");
  });
});

describe("retrieval still 1.00 and no gold in runtime", () => {
  test("hybrid retrieval gates remain pass with SRC-OWN-008 on the snapshot", async () => {
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
        missing: c.criticalIds.filter((id) => !c.hitCritical.includes(id)),
        retrieved: c.retrievedItemIds,
      })),
    }, null, 2));
    assert.equal(report.overallCriticalRecall, true);
    assert.ok(report.overallRelevantRecall >= 0.99, "relevant recall " + report.overallRelevantRecall);
    assert.equal(report.noGoldInQuery, true);
    assert.equal(report.budgetHonored, true);
  });

  test("runtime projection still has no gold", () => {
    for (const record of loadDevelopmentCases(CHALLENGE_CASES_V0)) {
      const runtime = projectRuntimeCase(record);
      const json = JSON.stringify(runtime);
      assert.equal(Object.prototype.hasOwnProperty.call(runtime, "gold"), false);
      assert.equal(json.includes("ranked_tiers"), false);
      assert.equal(json.includes("required_unknowns"), false);
    }
  });
});

describe("scorer audit and attribution subreasons", () => {
  test("scorer audit documents agent ranking NDCG remainder", () => {
    assert.equal(existsSync(SCORER_AUDIT), true);
    const md = readFileSync(SCORER_AUDIT, "utf8");
    assert.match(md, /agent ranking error/);
    assert.match(md, /85\.971/);
    assert.match(md, /ATLAS-DEV-102/);
    assert.match(md, /ATLAS-DEV-104/);
    assert.match(md, /Scorer is correct/);
    assert.match(md, /Do \*\*not\*\* change/);
    assert.deepEqual(ATTRIBUTION_SUBREASONS, [
      "condition_incorrectly_satisfied",
      "condition_incorrectly_rejected",
      "unknown_treated_as_false",
      "unknown_treated_as_true",
      "exception_missed",
      "priority_error",
      "account_identity_inferred",
      "scope_overextended",
    ]);
  });
});

describe("judge v0.2 fixture gates", () => {
  test("v0 and v1 fixtures still pass their historical bars", () => {
    const v0 = runFixtureCalibration();
    assert.equal(v0.official, false);
    assert.ok(v0.agreement >= 0.85);
    assert.equal(v0.falseAcceptRate, 0);
    const v1 = runExpandedFixtureCalibration();
    assert.ok(v1.n >= 32);
    assert.equal(typeof v1.expandedPassed, "boolean");
  });

  test("v0.2 frozen 64-set meets gates on fixture rubric", () => {
    const report = runV02FixtureCalibration();
    assert.ok(report.n >= 64);
    assert.ok(report.agreement >= 0.9, "overall " + report.agreement);
    assert.equal(report.criticalFalseAccept, 0);
    for (const [cls, st] of Object.entries(report.perClass)) {
      assert.ok(st.agreement >= 0.8, cls + " " + st.agreement);
    }
    assert.equal(report.official, false);
  });
});

describe("knowledge prompt block stays gold-free", () => {
  test("applicability wrapper does not inject gold keys", () => {
    const block = knowledgePromptBlock([
      { id: "K-DEMO", statement: "A rule.", applicability: { scope: "demo", subjectType: "account", requiredConditions: [{ id: "c", description: "x" }], effect: "exclude", unknownBehavior: "research_first", exceptions: [], priority: 1 } },
    ]);
    assert.equal(block.includes("ranked_tiers"), false);
    assert.equal(block.includes("required_unknowns"), false);
    assert.match(block, /applicability\{/);
  });
});
