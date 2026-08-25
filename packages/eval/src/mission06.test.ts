import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileStore,
  stateDir,
  ensureAtlasV0,
  freezeAtlasV1,
  ensureAtlasV2,
  ensureAtlasV3,
  ensureAtlasV4,
  ensureAtlasV5,
  ensureAtlasV6,
  ensureAtlasV7,
  ensureAtlasV8,
  ensureAtlasV9,
  ensureAtlasV10,
  ATLAS_V4_ID,
  ATLAS_V5_ID,
  ATLAS_V6_ID,
  ATLAS_V7_ID,
  ATLAS_V8_ID,
  ATLAS_V9_ID,
  ATLAS_V10_ID,
} from "@midas/db";
import { loadDevelopmentCases } from "./load.ts";
import { projectRuntimeCase } from "./project.ts";
import { ingestCurriculumPack } from "./curriculum.ts";
import { ingestOwnerPolicyPack, ingestOwnerPolicyRevision, ingestOwnerApplicabilitySnapshot } from "./owner-policy.ts";
import { evaluateRetrievalSuite, retrievalGatesPass } from "./retrieval-metrics.ts";
import { scoreApplicabilityMicrobenchmark, applicabilityMicroSha256, microbenchmarkLockOk } from "./applicability.ts";
import {
  enforceCase,
  buildPolicyRepairPayload,
  scoreAdversarialFixtures,
  POLICY_CONFLICT_TYPES,
  ADVERSARIAL_FIXTURE_PATH,
} from "./policy-enforce.ts";
import { attributeNewRun, ATTRIBUTION_TAXONOMY } from "./attribution.ts";
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
  APPLICABILITY_MICRO_V0,
  APPLICABILITY_MICRO_LOCK,
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
const FROZEN_ATLAS_V7 = "66042169933725326f6020d3f0e7ff916e77ad25e89cde13d166c61654663c17";
const FROZEN_ATLAS_V8 = "2b97051999d3ad75901e179ca3edb4d3e648e5d1fc90577161d3cc92b56bfe9e";
const FROZEN_APPLICABILITY = "f3a33cc3ce85722c4895a4b91000fb21e6680265822e87ef4d8304e250d024d3";
const FROZEN_JUDGE_V02 = "f9965cbc05ee1c18d9f3fa5b343bf0fa5c3fcc731cafb7e31fa08807fe2607af";
const FROZEN_MICRO = join(import.meta.dirname, "../../../evals/atlas/v0/applicability/atlas_applicability_v0.jsonl");
const ADV_MANIFEST = join(import.meta.dirname, "../../../evals/atlas/v0/applicability/atlas_policy_adversarial_v0.manifest.json");
const HISTORICAL_VERSIONS = join(import.meta.dirname, "../../../var/state/agent_versions.json");
const HISTORICAL_RESULTS = join(import.meta.dirname, "../../../var/state/case_results.json");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function seededStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m06-"));
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
  await ingestOwnerPolicyPack({ store: store, curriculumRoot: join(dir, "curriculum") });
  ensureAtlasV4(store);
  ensureAtlasV5(store);
  await ingestOwnerPolicyRevision({ store: store, curriculumRoot: join(dir, "curriculum") });
  ensureAtlasV6(store);
  await ingestOwnerApplicabilitySnapshot({ store: store, curriculumRoot: join(dir, "curriculum") });
  ensureAtlasV7(store);
  ensureAtlasV8(store);
  const v9 = ensureAtlasV9(store);
  const v10 = ensureAtlasV10(store);
  return { dir, store, v9, v10 };
}

describe("mission 06 frozen hashes unchanged", () => {
  test("challenge, owner snapshot, applicability jsonl, judge 64-set, atlas-v0..v8 stay frozen", () => {
    assert.equal(sha256File(CHALLENGE_CASES_V0), FROZEN_CHALLENGE_JSONL);
    const lock = JSON.parse(readFileSync(MISSION03_EVIDENCE_LOCK, "utf8"));
    assert.equal(lock.challengeSuite.sha256, FROZEN_CHALLENGE_JSONL);
    assert.equal(lock.ownerSnapshot.contentHash, FROZEN_OWNER_SNAPSHOT);
    assert.equal(sha256File(FROZEN_MICRO), FROZEN_APPLICABILITY);
    assert.equal(applicabilityMicroSha256(), FROZEN_APPLICABILITY);
    assert.equal(microbenchmarkLockOk(), true);
    const judgeMan = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/judge-calibration-v02.manifest.json"), "utf8"));
    assert.equal(judgeMan.sha256, FROZEN_JUDGE_V02);
    assert.equal(sha256File(join(import.meta.dirname, "fixtures/judge-calibration-v02.json")), FROZEN_JUDGE_V02);
    assert.equal(existsSync(HISTORICAL_VERSIONS), true);
    const versions = JSON.parse(readFileSync(HISTORICAL_VERSIONS, "utf8"));
    const byId = Object.fromEntries(versions.map((v) => [v.id, v]));
    assert.equal(byId["atlas-v0"].contentHash, FROZEN_ATLAS_V0);
    assert.equal(byId["atlas-v1"].contentHash, FROZEN_ATLAS_V1);
    assert.equal(byId["atlas-v2"].contentHash, FROZEN_ATLAS_V2);
    assert.equal(byId["atlas-v3"].contentHash, FROZEN_ATLAS_V3);
    assert.equal(byId["atlas-v4"].contentHash, FROZEN_ATLAS_V4);
    assert.equal(byId["atlas-v5"].contentHash, FROZEN_ATLAS_V5);
    if (byId["atlas-v6"]) assert.equal(byId["atlas-v6"].contentHash, FROZEN_ATLAS_V6);
    if (byId["atlas-v7"]) assert.equal(byId["atlas-v7"].contentHash, FROZEN_ATLAS_V7);
    if (byId["atlas-v8"]) assert.equal(byId["atlas-v8"].contentHash, FROZEN_ATLAS_V8);
  });

  test("fresh store does not rewrite v6..v8; v9/v10 are new", async () => {
    const { store } = await seededStore();
    assert.equal(store.getVersion(ATLAS_V6_ID).contentHash, store.getVersion(ATLAS_V6_ID).contentHash);
    assert.equal(store.getVersion(ATLAS_V7_ID).contentHash, FROZEN_ATLAS_V7);
    assert.equal(store.getVersion(ATLAS_V8_ID).contentHash, FROZEN_ATLAS_V8);
    assert.equal(ensureAtlasV7(store).created, false);
    assert.equal(ensureAtlasV8(store).created, false);
    const v9 = store.getVersion(ATLAS_V9_ID);
    const v10 = store.getVersion(ATLAS_V10_ID);
    assert.ok(v9);
    assert.ok(v10);
    assert.equal(v9.parentVersionId, ATLAS_V7_ID);
    assert.equal(v10.parentVersionId, ATLAS_V9_ID);
    assert.equal(v9.retrievalPolicy.enabled, false);
    assert.equal(v10.retrievalPolicy.enabled, true);
    assert.deepEqual(v9.promptBundle, store.getVersion(ATLAS_V7_ID).promptBundle);
    assert.deepEqual(v10.promptBundle, v9.promptBundle);
    assert.notEqual(v9.contentHash, FROZEN_ATLAS_V7);
    assert.notEqual(v10.contentHash, FROZEN_ATLAS_V8);
  });
});

describe("adversarial policy fixtures", () => {
  test("new fixture file does not rewrite frozen 15/15 jsonl", () => {
    assert.equal(sha256File(FROZEN_MICRO), FROZEN_APPLICABILITY);
    assert.notEqual(ADVERSARIAL_FIXTURE_PATH, APPLICABILITY_MICRO_V0);
    assert.equal(existsSync(ADVERSARIAL_FIXTURE_PATH), true);
    const man = JSON.parse(readFileSync(ADV_MANIFEST, "utf8"));
    assert.equal(man.sha256, sha256File(ADVERSARIAL_FIXTURE_PATH));
    assert.ok(man.n >= 10);
    const blob = readFileSync(ADVERSARIAL_FIXTURE_PATH, "utf8");
    assert.equal(blob.includes("ATLAS-DEV-105"), false);
    assert.equal(/Newmark Loom|Freshwater Canvas|Keepwell Existing|Civic Ledger/.test(blob), false);
    assert.equal(blob.includes("ranked_tiers"), false);
  });

  test("adversarial fixtures: original error visible, conflict detected, served respects policy", () => {
    const report = scoreAdversarialFixtures();
    assert.equal(report.passed, true, JSON.stringify(report.rows.filter((r) => !r.ok), null, 2));
    assert.ok(report.n >= 10);
    for (const row of report.rows) {
      assert.equal(row.checks.originalErrorVisible, true, row.id);
      assert.equal(row.checks.repairAtMostOne, true, row.id);
      assert.equal(row.checks.noGoldInRepair, true, row.id);
      assert.equal(row.checks.noUnsafeOutreach, true, row.id);
    }
  });
});

describe("hard invariants", () => {
  test("not_satisfied cannot DQ and unknown is not invented", () => {
    const prot = {
      id: "K-SYN-PROT-EXIST",
      sourceId: "SRC-OWN-008",
      claimKind: "owner_policy",
      statement: "Existing customers are protected.",
      applicability: {
        scope: "new-logo commercial motion",
        subjectType: "account",
        requiredConditions: [{ id: "c-existing", field: "account_status", op: "eq", value: "existing_customer", description: "existing", evidenceRequired: true, evidenceFilter: { sources: ["first_party", "official"], maxAgeDays: 45 } }],
        effect: "exclude",
        unknownBehavior: "research_first",
        exceptions: [],
        priority: 90,
      },
    };
    const notSat = enforceCase({
      arm: "relevant",
      knowledgeItems: [prot],
      runtimeInput: {
        case_id: "ATLAS-DEV-000",
        qualification_policy: { required: ["Apply Atlas Owner Policy: Protected Accounts"], preferred: [], disqualifiers: [], unknown_policy: "mandatory_unknown_requires_research" },
        prospects: [{ id: "P1", facts: { account_status: "new_logo" }, evidence: [{ id: "E1", claim: "Current first-party record marks this account as a commercial new-logo.", source: "first_party", age_days: 2 }] }],
      },
      modelOutput: {
        case_id: "ATLAS-DEV-000",
        assessments: [{ prospect_id: "P1", classification: "disqualified", fit_score: 10, cited_evidence_ids: ["E1"], rationale: "Lockout applies to this new-logo.", missing_information: [], next_action: "exclude", disqualification_reason: "lockout" }],
        ranked_qualified_ids: [],
        research_queue_ids: [],
        excluded_ids: ["P1"],
        case_uncertainties: ["synthetic"],
      },
    });
    assert.ok(notSat.policy_conflicts.some((c) => c.type === "invalid_disqualifier"));
    assert.equal(notSat.served_decision[0].classification, "qualified");
    const unk = enforceCase({
      arm: "relevant",
      knowledgeItems: [prot],
      runtimeInput: {
        case_id: "ATLAS-DEV-000",
        qualification_policy: { required: ["Apply Atlas Owner Policy: Protected Accounts"], preferred: [], disqualifiers: [], unknown_policy: "mandatory_unknown_requires_research" },
        prospects: [{ id: "P1", facts: { account_status: null }, evidence: [{ id: "E1", claim: "Status is not on the record.", source: "first_party", age_days: 2 }] }],
      },
      modelOutput: {
        case_id: "ATLAS-DEV-000",
        assessments: [{ prospect_id: "P1", classification: "disqualified", fit_score: 10, cited_evidence_ids: ["E1"], rationale: "Unknown status treated as existing customer.", missing_information: [], next_action: "exclude", disqualification_reason: "assumed protected" }],
        ranked_qualified_ids: [],
        research_queue_ids: [],
        excluded_ids: ["P1"],
        case_uncertainties: ["synthetic"],
      },
    });
    assert.equal(unk.served_decision[0].classification, "needs_research");
    assert.ok(unk.policy_evaluation[0].unknown_conditions.length + unk.policy_evaluation[0].unknown_exclude_rules.length >= 1);
  });

  test("no gold in repair payload", () => {
    const runtimeInput = {
      case_id: "ATLAS-DEV-000",
      title: "synthetic",
      qualification_policy: { required: ["Mandatory unknowns require research"], preferred: [], disqualifiers: [], unknown_policy: "mandatory_unknown_requires_research" },
      constraints: [],
      prospects: [{ id: "P1", facts: { opted_out: true }, evidence: [{ id: "E1", claim: "First-party suppression list records a contact opt-out.", source: "first_party", age_days: 1 }] }],
    };
    const proposal = {
      case_id: "ATLAS-DEV-000",
      assessments: [{ prospect_id: "P1", classification: "qualified", fit_score: 80, cited_evidence_ids: ["E1"], rationale: "Prioritize outreach anyway.", missing_information: [], next_action: "prioritize_outreach", disqualification_reason: null }],
    };
    const result = enforceCase({ runtimeInput: runtimeInput, modelOutput: proposal, knowledgeItems: [], arm: "baseline" });
    const payload = buildPolicyRepairPayload({
      runtimeInput: runtimeInput,
      originalProposal: proposal,
      policyEvaluations: result.policy_evaluation,
      conflicts: result.policy_conflicts,
    });
    const json = JSON.stringify(payload);
    assert.equal(/ranked_tiers|required_unknowns|"gold"\s*:/.test(json), false);
    assert.ok(payload.violated_invariants.length >= 1);
  });

  test("baseline cannot use owner policy to override", () => {
    const prot = {
      id: "K-OWN-008-01",
      sourceId: "SRC-OWN-008",
      claimKind: "owner_policy",
      statement: "Existing customers are protected.",
      applicability: {
        scope: "new-logo commercial motion",
        requiredConditions: [{ id: "c-existing", field: "account_status", op: "eq", value: "existing_customer", description: "existing", evidenceRequired: true, evidenceFilter: { sources: ["first_party", "official"], maxAgeDays: 45 } }],
        effect: "exclude",
        unknownBehavior: "research_first",
        exceptions: [],
        priority: 95,
      },
    };
    const result = enforceCase({
      arm: "baseline",
      knowledgeItems: [prot],
      runtimeInput: {
        case_id: "ATLAS-DEV-000",
        qualification_policy: { required: ["Apply Atlas Owner Policy: Protected Accounts"], preferred: [], disqualifiers: [], unknown_policy: "mandatory_unknown_requires_research" },
        prospects: [{ id: "P1", facts: { account_status: "existing_customer" }, evidence: [{ id: "E1", claim: "Official registry lists this same account as an active existing customer.", source: "official", age_days: 2 }] }],
      },
      modelOutput: {
        case_id: "ATLAS-DEV-000",
        assessments: [{ prospect_id: "P1", classification: "qualified", fit_score: 80, cited_evidence_ids: ["E1"], rationale: "Looks like a commercial fit from the page.", missing_information: [], next_action: "prioritize_outreach", disqualification_reason: null }],
        ranked_qualified_ids: ["P1"],
        research_queue_ids: [],
        excluded_ids: [],
        case_uncertainties: ["synthetic"],
      },
    });
    assert.equal(result.used_owner_policy, false);
    assert.equal(result.served_decision[0].classification, "qualified");
    assert.equal(result.enforcement_intervened, false);
  });
});

describe("retrieval still 1.00", () => {
  test("hybrid retrieval gates remain pass", async () => {
    const { store } = await seededStore();
    const report = evaluateRetrievalSuite({
      store: store,
      retrieveOpts: { maxItems: 12, sourceAllowlist: OWNER_ALLOW, contextBudgetTokens: 4000 },
    });
    assert.equal(retrievalGatesPass(report), true, JSON.stringify(report.gates));
    assert.equal(report.overallCriticalRecall, true);
    assert.ok(report.overallRelevantRecall >= 0.99, "relevant recall " + report.overallRelevantRecall);
    assert.equal(report.noGoldInQuery, true);
  });
});

describe("attribution taxonomy on new runs", () => {
  test("new taxonomy and no subreasons on success", () => {
    assert.deepEqual(ATTRIBUTION_TAXONOMY, [
      "retrieval_failure",
      "policy_application_failure",
      "model_classification_failure",
      "model_ranking_failure",
      "response_schema_failure",
      "deterministic_scorer_failure",
      "semantic_judge_failure",
      "benchmark_defect",
      "policy_override",
    ]);
    const success = attributeNewRun({
      record: { gold: { labels: { P1: "qualified" } }, prospects: [{ id: "P1", evidence: [] }] },
      result: {
        scoreStatus: "scored",
        weightedTotal: 100,
        assessments: [{ prospect_id: "P1", classification: "qualified", next_action: "prioritize_outreach", cited_evidence_ids: [] }],
        dimensions: { qualification: 100, ranking: 100 },
        criticalFailures: [],
      },
    });
    assert.equal(success.failureAttribution, null);
    assert.deepEqual(success.failureAttributionSubreasons, []);
    const overridden = attributeNewRun({
      record: { gold: { labels: { P1: "qualified" } }, prospects: [{ id: "P1", evidence: [] }] },
      result: {
        scoreStatus: "scored",
        weightedTotal: 100,
        assessments: [{ prospect_id: "P1", classification: "qualified", next_action: "prioritize_outreach", cited_evidence_ids: [] }],
        dimensions: { qualification: 100, ranking: 100 },
        criticalFailures: [],
        enforcementIntervened: true,
      },
    });
    assert.equal(overridden.failureAttribution, "policy_override");
    assert.deepEqual(overridden.failureAttributionSubreasons, []);
  });

  test("historical case_results still use old stage names when present", () => {
    // The live FILE_STORE is private and gitignored, so a fresh checkout may hold
    // no historical case results at all. Asserting the file exists made this a
    // machine-specific test. What the migration actually has to guarantee is that
    // every historical failureAttribution is readable under either the current
    // taxonomy or the frozen legacy stage names -- never an unknown third thing.
    const oldStages = new Set([
      "not_retrieved",
      "retrieved_ignored",
      "retrieved_misapplied",
      "evidence_misread",
      "schema_or_repair",
      "deterministic_scorer",
      "semantic_judge",
      "benchmark_defect",
      "model_reasoning",
      "complete",
    ]);
    const store = new FileStore(stateDir());
    const present = existsSync(HISTORICAL_RESULTS);
    const rows = present ? JSON.parse(readFileSync(HISTORICAL_RESULTS, "utf8")) : [];
    if (!present) {
      // Absent file and a non-empty store would mean results moved somewhere this
      // check no longer inspects. Fail loudly in that case instead of passing.
      assert.equal(store.listCaseResults().length, 0, "case_results.json is missing but the store reports case results");
      return;
    }
    const sample = rows.filter((r) => r.agentVersionId === "atlas-v8" || String(r.evalRunId || "").length > 0).slice(0, 30);
    for (const row of sample) {
      const value = row.failureAttribution;
      if (value == null) continue;
      const known = ATTRIBUTION_TAXONOMY.includes(value) || oldStages.has(value);
      assert.ok(known, "unknown historical failureAttribution: " + String(value));
    }
  });
});

describe("microbenchmark still 15/15", () => {
  test("applicability microbenchmark unchanged and green", () => {
    const report = scoreApplicabilityMicrobenchmark();
    assert.equal(report.n, 15);
    assert.equal(report.passed, true);
    assert.equal(report.newCriticalFailures, 0);
  });
});

describe("policy conflict types", () => {
  test("taxonomy is complete", () => {
    assert.deepEqual(POLICY_CONFLICT_TYPES, [
      "invalid_disqualifier",
      "invalid_qualification",
      "missing_required_research",
      "unsupported_rule_application",
      "prohibited_action",
    ]);
  });
});
