import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0, freezeAtlasV1, ATLAS_V0_ID, ATLAS_V1_ID } from "@midas/db";
import { persistDevelopmentEval } from "./persist-run.ts";
import { ingestCurriculumPack, retrieveKnowledge } from "./curriculum.ts";
import { compareEvalRuns } from "./compare.ts";
import { fixtureRespond } from "@midas/model";

const CASES = join(import.meta.dirname, "../../../evals/atlas/v0/development/atlas_dev_cases_v0.jsonl");
const PHASE0 = join(import.meta.dirname, "../../../docs/phase0/ATLAS_CURRICULUM_SOURCES_V0.md");

test("FileStore restart keeps Atlas, v0, run, and 8 case results", async () => {
  const dir = mkdtempSync(join(tmpdir(), "midas-restart-"));
  const first = new FileStore(dir);
  const seeded = ensureAtlasV0(first);
  const out = await persistDevelopmentEval({
    store: first,
    agentVersionId: seeded.version.id,
    trialIndex: 0,
    responderKind: "fixture",
    casesPath: CASES,
    evaluatorSecret: "dev-local-only",
    responder: (input) => fixtureRespond(input),
  });
  assert.equal(out.results.length, 8);
  const second = new FileStore(dir);
  assert.equal(second.getAgent("atlas")?.name, "Atlas");
  assert.equal(second.getVersion("atlas-v0")?.id, "atlas-v0");
  assert.equal(second.getEvalRun(out.run.id)?.status, "completed");
  assert.equal(second.listCaseResults(out.run.id).length, 8);
});

test("restart keeps sources, knowledge, v0, v1, both runs, and decision", async () => {
  const prevSkip = process.env.MIDAS_SKIP_LIVE_FETCH;
  const prevCurr = process.env.MIDAS_CURRICULUM_DIR;
  const dir = mkdtempSync(join(tmpdir(), "midas-foundry-"));
  process.env.MIDAS_SKIP_LIVE_FETCH = "1";
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  try {
    const first = new FileStore(dir);
    const seeded = ensureAtlasV0(first);
    const v0Hash = seeded.version.contentHash;
    const ingested = await ingestCurriculumPack({
      store: first,
      curriculumRoot: join(dir, "curriculum"),
      phase0Path: PHASE0,
      casesPath: CASES,
    });
    assert.ok(ingested.knowledgeAccepted > 0, "expected accepted knowledge items");
    assert.equal(ingested.sources.length, 6);
    for (const s of ingested.sources) {
      assert.equal(s.captureStatus, "LOCAL_REFERENCE");
      assert.ok(s.sha256 && s.sha256.length === 64);
    }
    const frozen = freezeAtlasV1(first, {
      parentVersionId: "atlas-v0",
      declaredChange: "relevant frozen curriculum snapshot",
    });
    assert.equal(frozen.version.id, ATLAS_V1_ID);
    assert.equal(frozen.version.parentVersionId, ATLAS_V0_ID);
    assert.notEqual(frozen.version.contentHash, v0Hash);
    assert.equal(first.getVersion(ATLAS_V0_ID).contentHash, v0Hash);

    const retrieved = retrieveKnowledge(first);
    assert.ok(retrieved.retrievedItemIds.length > 0);
    assert.ok(retrieved.tokensUsed <= retrieved.budgetTokens);

    const v0run = await persistDevelopmentEval({
      store: first,
      agentVersionId: ATLAS_V0_ID,
      trialIndex: 0,
      arm: "baseline",
      responderKind: "fixture",
      casesPath: CASES,
      evaluatorSecret: "dev-local-only",
      retrievedItemIds: [],
      knowledgeBundle: [],
      responder: (input) => fixtureRespond(input),
    });
    const v1run = await persistDevelopmentEval({
      store: first,
      agentVersionId: ATLAS_V1_ID,
      trialIndex: 0,
      arm: "relevant",
      responderKind: "fixture",
      casesPath: CASES,
      evaluatorSecret: "dev-local-only",
      retrievedItemIds: retrieved.retrievedItemIds,
      knowledgeBundle: retrieved.items,
      responder: (input) => fixtureRespond(input),
    });
    first.putDecision({
      id: "dec-restart-1",
      evalRunId: v1run.run.id,
      kind: "reject",
      rationale: "Fixture delta is not proof of improvement.",
      createdAt: new Date().toISOString(),
    });
    const cmp = compareEvalRuns(first, v0run.run.id, v1run.run.id);
    assert.equal(cmp.sameTrial, true);
    assert.equal(cmp.semanticJudge, "not_implemented");
    assert.ok(cmp.cases.length >= 8);

    const second = new FileStore(dir);
    assert.equal(second.getVersion(ATLAS_V0_ID).contentHash, v0Hash);
    assert.equal(second.getVersion(ATLAS_V1_ID).contentHash, frozen.version.contentHash);
    assert.notEqual(second.getVersion(ATLAS_V0_ID).contentHash, second.getVersion(ATLAS_V1_ID).contentHash);
    assert.equal(second.listSources().length, 6);
    assert.ok(second.listKnowledge().length >= ingested.knowledgeAccepted);
    assert.equal(second.getEvalRun(v0run.run.id)?.status, "completed");
    assert.equal(second.getEvalRun(v1run.run.id)?.status, "completed");
    assert.ok((second.getEvalRun(v1run.run.id)?.retrievedItemIds || []).length > 0);
    assert.ok(second.getEvalRun(v1run.run.id)?.retrievedItemIds.length <= 17);
    assert.equal(second.getVersion(ATLAS_V0_ID).contentHash, v0Hash);
    assert.equal(second.listDecisions(v1run.run.id).length, 1);
    const cmp2 = compareEvalRuns(second, v0run.run.id, v1run.run.id);
    assert.equal(cmp2.v0RunId, cmp.v0RunId);
    assert.equal(cmp2.v1RunId, cmp.v1RunId);
    assert.ok(second.spendState);
    assert.equal(typeof second.daySpend(new Date().toISOString().slice(0, 10)).usd, "number");
    assert.equal(second.getEvalRun(v0run.run.id).cost.usdEstimate, 0);
    assert.equal(second.getEvalRun(v1run.run.id).cost.usdEstimate, 0);
  } finally {
    if (prevSkip === undefined) delete process.env.MIDAS_SKIP_LIVE_FETCH;
    else process.env.MIDAS_SKIP_LIVE_FETCH = prevSkip;
    if (prevCurr === undefined) delete process.env.MIDAS_CURRICULUM_DIR;
    else process.env.MIDAS_CURRICULUM_DIR = prevCurr;
  }
});
