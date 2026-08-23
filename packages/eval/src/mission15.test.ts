import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0, contentHash } from "@midas/db";
import { createWorkspace } from "./workspace.ts";
import { submitObjective, planObjective, runUntilBlocked, OFFER_STRATEGIST_WORKFLOW_TYPES, isOfferStrategistObjective } from "./conductor.ts";
import { listPendingApprovals, reconcileStaleApprovals } from "./approval-reconciliation.ts";
import { freezeOfferStrategistContract, loadOfferStrategistDevCases, presentOfferStrategistCase, OFFER_STRATEGIST_REQUIRED_FIELDS, OFFER_STRATEGIST_FROZEN_CONTRACT, OFFER_STRATEGIST_LIVE_SCHEMA } from "./offer-strategist-contract.ts";
import { runOfferStrategistLive, parseOfferStrategistOutput, employeeSpendUsd } from "./offer-strategist-live.ts";
import { scoreOfferStrategistDeterministic, scoreFixtureOutputs, runOfferStrategistBakeoff, loadOfferStrategistGold } from "./offer-strategist-bakeoff.ts";
import { evaluateStrategistGates, recordStrategistContributions, applyDevelopmentVerification } from "./offer-strategist-progression.ts";
import { runOfferStrategist, OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import { auditOfferStrategistResult } from "./watcher.ts";
import { recordContribution, contributionScorecard } from "./contribution.ts";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { implementOfferStrategistIfGatePasses, authorizeSpecialist } from "./employee-factory.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m15-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  ensureAtlasV0(store);
  return { dir, store };
}

function seedWs(store) {
  return createWorkspace(store, {
    name: "M15WS",
    description: "Roofing software workspace for Offer Strategist interview tests.",
    goal: "Qualify US roofing contractors.",
  }).workspace;
}

function putApprovedKnowledge(store, workspaceId) {
  store.putKnowledge({
    id: "K-M15-001",
    workspaceId: workspaceId,
    reviewStatus: "approved",
    accepted: true,
    kind: "sourced_fact",
    statement: "US roofing contractors who still produce estimates by hand or with generic spreadsheets often take longer to issue proposals.",
    excerpt: "US roofing contractors who still produce estimates by hand or with generic spreadsheets often take longer to issue proposals.",
    locator: { section: "ops", charStart: 0, charEnd: 80, text: "US roofing contractors who still produce estimates by hand or with generic spreadsheets often take longer to issue proposals." },
  });
}

describe("mission 15 stale-approval reconciliation", () => {
  test("reconciliation is not an owner approve/reject and drops canceled OBJ from pending", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putObjective({
      id: "OBJ-002", workspaceId: ws.id, ownerText: "canceled leftover", status: "canceled",
      createdAt: "2026-08-21T15:00:00.000Z", updatedAt: "2026-08-21T15:10:00.000Z",
    });
    store.putApprovalRequest({
      id: "APR-002", workspaceId: ws.id, objectiveId: "OBJ-002", status: "pending",
      kind: "scout_findings", createdAt: "2026-08-21T15:05:00.000Z",
    });
    store.putObjective({
      id: "OBJ-LIVE", workspaceId: ws.id, ownerText: "still running", status: "awaiting_owner_approval",
      createdAt: "2026-08-21T16:00:00.000Z",
    });
    store.putApprovalRequest({
      id: "APR-LIVE", workspaceId: ws.id, objectiveId: "OBJ-LIVE", status: "pending", kind: "scout_findings",
    });
    const beforeObj = store.getObjective("OBJ-002");
    const out = reconcileStaleApprovals(store, {});
    assert.equal(out.actorType, "system");
    assert.equal(out.actor, "reconciliation");
    assert.equal(out.ownerDecision, false);
    assert.ok(out.records.length >= 1);
    assert.equal(out.records[0].notOwnerApproveReject, true);
    const apr = store.getApprovalRequest("APR-002");
    assert.equal(apr.status, "reconciled_canceled");
    assert.equal(apr.reconciledBy.actorType, "system");
    assert.notEqual(apr.status, "approved");
    assert.notEqual(apr.status, "rejected");
    const afterObj = store.getObjective("OBJ-002");
    assert.equal(afterObj.status, "canceled");
    assert.equal(afterObj.createdAt, beforeObj.createdAt);
    assert.equal(afterObj.ownerText, beforeObj.ownerText);
    const pending = listPendingApprovals(store);
    assert.equal(pending.some((p) => p.objectiveId === "OBJ-002"), false);
    assert.equal(pending.some((p) => p.approvalId === "APR-002"), false);
    assert.equal(pending.some((p) => p.approvalId === "APR-LIVE"), true);
    assert.equal((store.listApprovalDecisions() || []).some((d) => d.requestId === "APR-002"), false);
  });
});

describe("mission 15 contract freeze", () => {
  test("freezes contract and cases with hashes; gold not in runtime cases", () => {
    const { store } = tmpStore();
    const frozen = freezeOfferStrategistContract(store, { workspaceId: "ws-x" });
    assert.ok(frozen.contractHash);
    assert.ok(frozen.caseHash);
    assert.equal(frozen.contract.contentHash, frozen.contractHash);
    assert.equal(OFFER_STRATEGIST_FROZEN_CONTRACT.spendCapUsd, 0.5);
    assert.equal(OFFER_STRATEGIST_FROZEN_CONTRACT.knowledgeScope, "owner_approved_same_workspace");
    for (const f of OFFER_STRATEGIST_REQUIRED_FIELDS) {
      assert.ok(OFFER_STRATEGIST_FROZEN_CONTRACT.requiredOutputFields.includes(f), f);
    }
    const cases = loadOfferStrategistDevCases();
    const blob = JSON.stringify(cases);
    assert.equal(blob.includes("mustCiteApproved"), false);
    assert.equal(blob.includes("\"gold\""), false);
    const src = readFileSync(join(import.meta.dirname, "offer-strategist-live.ts"), "utf8");
    assert.equal(src.includes("offer-strategist-m15-gold"), false);
    const contractSrc = readFileSync(join(import.meta.dirname, "offer-strategist.ts"), "utf8");
    assert.equal(contractSrc.includes("offer-strategist-m15-gold"), false);
  });

  test("presentation shuffle does not leak gold", () => {
    const cases = loadOfferStrategistDevCases();
    const presented = presentOfferStrategistCase(cases.cases[0], {
      evaluatorSecret: "dev-local-only",
      approvedKnowledge: [
        { id: "K-B", excerpt: "b" },
        { id: "K-A", excerpt: "a" },
        { id: "K-C", excerpt: "c" },
      ],
    });
    const blob = JSON.stringify(presented.runtimeInput);
    assert.equal(blob.includes("mustCiteApproved"), false);
    assert.equal(blob.includes("requiredFields"), false);
    assert.ok(presented.runtimeInput.approved_knowledge.length === 3);
  });
});

describe("mission 15 HTTP assignment path", () => {
  test("conductor assigns offer_strategist through the objective/tick path", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putStageIGate({ id: "GATE-I-001", pass: true, workspaceId: ws.id, failedIds: [] });
    const created = implementOfferStrategistIfGatePasses(store, { workspaceId: ws.id, actor: "owner" });
    authorizeSpecialist(store, created.role.id, { actor: "local_owner" });
    putApprovedKnowledge(store, ws.id);
    const submitted = submitObjective(store, {
      workspaceId: ws.id,
      ownerText: "Using RidgeLine's approved customer information, operating rules, and existing evidence about manual estimating workflows, propose one credible offer for roofing contractors and explain what would need to be validated.",
      category: "offer_strategist",
      assignedRoleId: "offer_strategist",
      allowedRoles: ["offer_strategist", "independent_audit", "workflow_manager"],
      maxSpendUsd: 0.5,
    });
    assert.equal(isOfferStrategistObjective(submitted.objective), true);
    const planned = await planObjective(store, submitted.objective.id);
    assert.deepEqual(planned.plan.stepTypes, OFFER_STRATEGIST_WORKFLOW_TYPES);
    const liveText = JSON.stringify({
      target_customer: "US roofing contractors still estimating by hand",
      customer_problem: "Manual takeoffs take longer to become proposals.",
      proposed_offer: "Hypothesis: a takeoff helper for hand estimators.",
      approved_evidence: [{ id: "K-M15-001", excerpt: "US roofing contractors who still produce estimates by hand or with generic spreadsheets often take longer to issue proposals." }],
      assumptions: ["Approved ops note still holds"],
      missing_information: ["Willingness to pay unknown"],
      risks: ["Hypothesis may be wrong"],
      recommended_validation_step: "Interview three owners about estimating workflow.",
      labels: { hypothesisVersusFact: true, status: "hypothesis" },
    });
    const out = await runUntilBlocked(store, submitted.objective.id, {
      live: true,
      offerStrategistResponder: async () => ({
        text: liveText,
        kind: "live",
        usage: { inputTokens: 100, outputTokens: 50 },
        model: "gpt-4.1",
        providerRequestId: "resp-test-m15",
      }),
    });
    const tasks = store.listTasks(submitted.objective.id);
    const os = tasks.find((t) => t.type === "offer_strategist");
    assert.ok(os);
    assert.equal(os.status, "completed");
    assert.equal(os.resultRefs.live, true);
    assert.equal(os.resultRefs.fixtureFallback, false);
    assert.equal(os.resultRefs.parseStatus, "ok");
    assert.ok(os.resultRefs.runId);
    const run = store.getOfferStrategistRun(os.resultRefs.runId);
    assert.equal(run.live, true);
    assert.ok(run.rawText);
    assert.equal(run.structured.proposed_offer.includes("takeoff"), true);
  });
});

describe("mission 15 live-vs-fixture labeling", () => {
  test("non-live responder is labeled failed, not fixture-fallback success", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putStageIGate({ id: "GATE-I-001", pass: true, workspaceId: ws.id, failedIds: [] });
    const created = implementOfferStrategistIfGatePasses(store, { workspaceId: ws.id, actor: "owner" });
    authorizeSpecialist(store, created.role.id, { actor: "local_owner" });
    const out = await runOfferStrategistLive(store, {
      workspaceId: ws.id,
      task: "Draft an offer from approved knowledge.",
      approvedStatements: ["hand estimating"],
    }, {
      live: true,
      offerStrategistResponder: async () => ({ text: "{}", kind: "fixture" }),
    });
    assert.equal(out.fixtureFallback, false);
    assert.equal(out.ok, false);
    assert.equal(out.live, false);
  });

  test("parse failure keeps raw and does not invent fields", () => {
    const parsed = parseOfferStrategistOutput("not json at all");
    assert.equal(parsed.ok, false);
    assert.equal(parsed.parseStatus, "failed");
    assert.equal(parsed.structured, null);
    assert.ok(parsed.missing.includes("proposed_offer"));
  });
});

describe("mission 15 output schema and prohibitions", () => {
  test("live schema is OpenAI-strict: every object property is required", () => {
    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (node["type"] === "object" && node.properties) {
        const keys = Object.keys(node.properties);
        for (const k of keys) assert.ok((node.required || []).includes(k), "missing required " + k);
        for (const k of keys) walk(node.properties[k]);
      }
      if (node.items) walk(node.items);
    }
    walk(OFFER_STRATEGIST_LIVE_SCHEMA);
    assert.ok(OFFER_STRATEGIST_LIVE_SCHEMA.properties.labels.required.includes("status"));
  });

  test("hypothesis output includes required contract fields", () => {
    const out = runOfferStrategist(null, {
      workspaceId: "ws-dev",
      development: true,
      task: "Draft an offer-positioning hypothesis from the approved finding.",
      approvedFindingIds: ["FND-DEV-OS"],
      findings: [{ id: "FND-DEV-OS", workspaceId: "ws-dev", reviewStatus: "approved", claim: "US roofing contractors produce estimates from takeoffs." }],
    });
    assert.equal(out.status, "hypothesis");
    for (const f of OFFER_STRATEGIST_REQUIRED_FIELDS) assert.ok(f in out, f);
  });

  test("prohibition enforcement still refuses TAM and outreach", () => {
    const tam = runOfferStrategist(null, { development: true, task: "What is the TAM / total addressable market size?", approvedStatements: ["x"] });
    assert.equal(tam.status, "refused");
    assert.equal(tam.refusals[0].code, "invent_tam");
    const outreach = runOfferStrategist(null, { development: true, task: "Write outreach email the prospect and call the contractor.", approvedStatements: ["x"] });
    assert.equal(outreach.status, "refused");
    assert.equal(outreach.refusals[0].code, "outreach");
  });
});

describe("mission 15 watcher preserve-original", () => {
  test("audit does not mutate the original strategist run", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    putApprovedKnowledge(store, ws.id);
    const run = {
      id: "OSR-001",
      workspaceId: ws.id,
      rawText: "{\"proposed_offer\":\"Hypothesis offer\"}",
      structured: {
        target_customer: "US roofing contractors",
        customer_problem: "manual estimating",
        proposed_offer: "Hypothesis offer",
        approved_evidence: [{ id: "K-M15-001", excerpt: "US roofing contractors who still produce estimates by hand or with generic spreadsheets often take longer to issue proposals." }],
        assumptions: [],
        missing_information: [],
        risks: [],
        recommended_validation_step: "ask owners",
        labels: { hypothesisVersusFact: true },
      },
      contentHash: "abc",
      approvedKnowledgeIds: ["K-M15-001"],
      live: false,
    };
    store.putOfferStrategistRun(run);
    const before = JSON.stringify(store.getOfferStrategistRun("OSR-001"));
    const out = auditOfferStrategistResult(store, { workspaceId: ws.id, runId: "OSR-001" });
    assert.equal(out.mutated, false);
    assert.equal(out.originalPreserved, true);
    assert.equal(JSON.stringify(store.getOfferStrategistRun("OSR-001")), before);
    assert.ok(out.report.checks.some((c) => c.code === "original_output_preserved" && c.status === "PASS"));
  });
});

describe("mission 15 bakeoff isolation and scorer", () => {
  test("gold is isolated and scorer is deterministic vs advisory", () => {
    const gold = loadOfferStrategistGold();
    assert.equal(gold.sealedEval, false);
    const src = readFileSync(join(import.meta.dirname, "offer-strategist-live.ts"), "utf8")
      + readFileSync(join(import.meta.dirname, "offer-strategist.ts"), "utf8")
      + readFileSync(join(import.meta.dirname, "offer-strategist-contract.ts"), "utf8");
    assert.equal(src.includes("offer-strategist-m15-gold"), false);
    const fixtures = scoreFixtureOutputs();
    assert.ok(fixtures.length >= 4);
    for (const row of fixtures) {
      assert.equal(row.score.kind, "deterministic");
      assert.equal(row.score.advisory, false);
      assert.equal(row.score.sealedEval, false);
    }
    const det = scoreOfferStrategistDeterministic({
      structured: { labels: { hypothesisVersusFact: true, status: "refused" }, proposed_offer: "Refused TAM", target_customer: "", customer_problem: "", approved_evidence: [], assumptions: [], missing_information: [], risks: [], recommended_validation_step: "" },
      status: "refused",
      refusals: [{ code: "invent_tam" }],
    }, gold.cases.find((c) => c.id === "OS-M15-02"), { approvedKnowledge: [] });
    assert.ok(det.score > 0);
  });
});

describe("mission 15 contributions and hashes", () => {
  test("provisional events stay ineffective; only verified count", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const prov = recordContribution(store, {
      kind: "live_task_completed",
      role: OFFER_STRATEGIST_ROLE_ID,
      workspaceId: ws.id,
      evidence: { runId: "OSR-X", taskId: "TSK-X" },
      state: "provisional",
    });
    assert.equal(prov.effective, false);
    const card = contributionScorecard(store, ws.id);
    assert.equal(card.effectiveEvents.some((e) => e.id === prov.id), false);
  });

  test("frozen version hashes match the freeze list", () => {
    assert.equal(FROZEN_HASHES["atlas-v15"], "0a1b77111582b76a4be3b873a09a4c2a73efec7103f6bb9dafdff7e8a4774a70");
    assert.equal(FROZEN_HASHES["atlas-v16"], "64bb716d5aa030376a1e96194a30858bb3ad67093ede1c16b3146a1fd86321d1");
    assert.equal(FROZEN_HASHES["offer_strategist-ws-ridgeline-v0"], "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce");
    assert.equal(FROZEN_HASHES["scout-ws-ridgeline-v0"], "129841f55a98a7bd0ab45650e4f44c185fd49deb0d2c3fbfc761b64a4c8a1ec5");
    assert.equal(FROZEN_HASHES["watcher-ws-ridgeline-v0"], "a320bedf0b416080b7017aa4ee764825ccb16ecd3cceec2ddba2b51cb20e0061");
    assert.equal(FROZEN_HASHES["conductor-ws-ridgeline-v0"], "5b7e2673fac69dab1603c19a9751bf375fd0bce7cb2802254f02b58b2b947102");
  });

  test("spend cap stops a live call when remaining is 0", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putStageIGate({ id: "GATE-I-001", pass: true, workspaceId: ws.id, failedIds: [] });
    const created = implementOfferStrategistIfGatePasses(store, { workspaceId: ws.id, actor: "owner" });
    authorizeSpecialist(store, created.role.id, { actor: "local_owner" });
    store.putSpendLedgerEntry({
      id: "LED-CAP",
      workspaceId: ws.id,
      role: "offer_strategist",
      kind: "live",
      costUsd: 0.5,
      costStatus: "estimated",
      timestamp: new Date().toISOString(),
    });
    assert.ok(employeeSpendUsd(store, ws.id, "offer_strategist") >= 0.5);
    const out = await runOfferStrategistLive(store, {
      workspaceId: ws.id,
      task: "Draft an offer.",
      spendLimitUsd: 0.5,
    }, { live: true, offerStrategistResponder: async () => ({ text: "{}", kind: "live" }) });
    assert.equal(out.status, "refused");
    assert.equal(out.refusals[0].code, "overspend");
    assert.equal(out.live, false);
  });

  test("verified strategist credits require evidence refs and do not self-award", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    putApprovedKnowledge(store, ws.id);
    const run = {
      id: "OSR-002",
      workspaceId: ws.id,
      taskId: "TSK-100",
      objectiveId: "OBJ-100",
      live: true,
      fixture: false,
      structured: {
        approved_evidence: [{ id: "K-M15-001", excerpt: "x" }],
        labels: { hypothesisVersusFact: true },
      },
      approvedKnowledgeIds: ["K-M15-001"],
    };
    const events = recordStrategistContributions(store, {
      workspaceId: ws.id,
      run: run,
      audit: { id: "AUD-1", originalPreserved: true, mutatedInspectedRecords: false },
    });
    const kinds = events.map((e) => e.kind);
    assert.ok(kinds.includes("live_task_completed"));
    assert.ok(kinds.includes("approved_evidence_cited"));
    assert.ok(kinds.includes("hypothesis_labeled"));
    assert.ok(kinds.includes("watcher_chain_verified"));
    assert.ok(events.every((e) => e.selfAwarded === false));
    assert.ok(events.every((e) => e.state === "verified"));
    const evaln = evaluateStrategistGates(store, {
      workspaceId: ws.id,
      run: { ...run, parseStatus: "ok", fixtureFallback: false },
      audit: { id: "AUD-1", originalPreserved: true, mutatedInspectedRecords: false, status: "PASS", blocking: [] },
      contract: { contentHash: "abc" },
      bakeoff: { id: "BO-1" },
    });
    assert.equal(evaln.notPromoted, true);
    const applied = applyDevelopmentVerification(store, {
      workspaceId: ws.id,
      evaluation: { ...evaln, pass: false, failedIds: ["G1"] },
    });
    assert.equal(applied.promoted, false);
  });
});

describe("mission 15 banner canceled OBJ-002", () => {
  test("listPendingApprovals never includes canceled OBJ-002 even before reconcile", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putObjective({ id: "OBJ-002", workspaceId: ws.id, status: "canceled", ownerText: "old" });
    store.putApprovalRequest({ id: "APR-002", workspaceId: ws.id, objectiveId: "OBJ-002", status: "pending" });
    const pending = listPendingApprovals(store);
    assert.equal(pending.some((p) => p.objectiveId === "OBJ-002"), false);
  });
});
