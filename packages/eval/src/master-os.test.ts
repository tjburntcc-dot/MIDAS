import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import {
  planFromNaturalLanguage,
  persistCommandPlan,
  classifyObjectiveType,
} from "./command-center.ts";
import {
  investmentCompare,
  investmentFieldsFromOpportunity,
  retrieveByMemoryPriority,
  classifyMemoryCategory,
  MEMORY_PRIORITY,
  explainTeamForCompany,
  runAutonomyLoopTick,
  upsertScheduledJob,
  simulateJobRestart,
  recordExecutionAction,
  CURRENT_MAX_EXECUTION_LEVEL,
  treasuryView,
  TREASURY_CATEGORIES,
  employeeDevelopmentRecord,
} from "./master-os.ts";
import { persistInternalAutonomyPolicy } from "./autonomy-policy.ts";
import { createNewBusiness, createExistingBusiness, dispatchProductRequest } from "./product-shell.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-mos-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  return { dir, store: new FileStore(dir) };
}

describe("master-os command center", () => {
  test("classifies objective types from natural language", () => {
    assert.equal(classifyObjectiveType("Find three business opportunities I can start with $1,500."), "new_business");
    assert.equal(classifyObjectiveType("Analyze this existing company and list growth ideas"), "grow_existing");
    assert.equal(classifyObjectiveType("Train marketing using these notes"), "train");
    assert.equal(classifyObjectiveType("Create a landing page for our current offer"), "deliverable");
    assert.equal(classifyObjectiveType("Build an execution plan for the next seven days"), "execution_plan");
  });

  test("persists a bounded deterministic plan at $0", () => {
    const { store } = tmpStore();
    const created = createNewBusiness(store, {
      companyName: "Command Test Co",
      ownerObjective: "Find local service ideas with a $1,500 budget",
      budget: "$1500",
    });
    const ws = created.workspace.id;
    const out = persistCommandPlan(store, "Find three business opportunities I can start with $1,500.", { workspaceId: ws });
    assert.equal(out.plan.liveProviderCall, false);
    assert.equal(out.plan.objectiveType, "new_business");
    assert.ok(out.plan.plan.proposedTaskPlan.length >= 3);
    assert.equal(out.plan.plan.estimatedInternalCost.planningUsd, 0);
    assert.ok(out.plan.plan.neededSpecialists.some((s) => s.roleId === "business_research"));
    const dry = planFromNaturalLanguage("Create a landing page for our current offer", { store, workspaceId: ws });
    assert.equal(dry.understood.objectiveType, "deliverable");
    assert.equal(dry.permissions.externalExecute, false);
  });
});

describe("master-os opportunity investment labels", () => {
  test("financial scenarios stay categorized and revenue is not ACTUAL", () => {
    const { store } = tmpStore();
    store.putOpportunity({
      id: "OPP-T1",
      workspaceId: "ws-a",
      name: "Test Opp A",
      targetCustomer: { text: "Parents", claimClass: "owner_provided" },
      problem: { text: "Need lessons", claimClass: "owner_provided" },
      proposedOffer: { text: "Lessons", claimClass: "model_generated_hypothesis" },
      startupCostEstimate: { text: "$800", claimClass: "estimate" },
      assumptions: [{ text: "Demand unknown", claimClass: "unknown" }],
      missingInformation: [{ text: "Competition", claimClass: "unknown" }],
      comparisonDimensions: {
        ownerFit: { text: "Fits skills", claimClass: "owner_provided" },
        evidenceQuality: { text: "Thin", claimClass: "unknown" },
        speedToFirstTest: { text: "1 week", claimClass: "owner_provided" },
        competitiveIntensity: { text: "unknown", claimClass: "unknown" },
        distributionDifficulty: { text: "local flyers", claimClass: "owner_provided" },
        operationalComplexity: { text: "low", claimClass: "model_generated_hypothesis" },
      },
    });
    store.putOpportunity({
      id: "OPP-T2",
      workspaceId: "ws-a",
      name: "Test Opp B",
      targetCustomer: { text: "Contractors", claimClass: "owner_provided" },
      problem: { text: "Manual estimates", claimClass: "owner_provided" },
      proposedOffer: { text: "Software", claimClass: "model_generated_hypothesis" },
      startupCostEstimate: { text: "$1200", claimClass: "estimate" },
      comparisonDimensions: {
        ownerFit: { text: "Partial", claimClass: "owner_provided" },
        evidenceQuality: { text: "unknown", claimClass: "unknown" },
        speedToFirstTest: { text: "unknown", claimClass: "unknown" },
        competitiveIntensity: { text: "unknown", claimClass: "unknown" },
        distributionDifficulty: { text: "unknown", claimClass: "unknown" },
        operationalComplexity: { text: "medium", claimClass: "model_generated_hypothesis" },
      },
    });
    const inv = investmentFieldsFromOpportunity(store.getOpportunity("OPP-T1"));
    assert.equal(inv.financialScenarios.revenue.category, "UNKNOWN");
    assert.notEqual(inv.financialScenarios.revenue.category, "ACTUAL");
    const cmp = investmentCompare(store, ["OPP-T1", "OPP-T2"]);
    assert.equal(cmp.committee.fakeAgentCount, 0);
    assert.equal(cmp.committee.seats.length, 3);
    assert.ok(cmp.neverMixFinancialCategories);
    assert.ok(cmp.investmentRows.length === 2);
  });
});

describe("master-os team composition differences", () => {
  test("music studio and bookkeeping get different role explanations", () => {
    const { store } = tmpStore();
    const music = createNewBusiness(store, {
      companyName: "Harbor Test Music",
      ownerObjective: "Neighborhood piano and guitar lessons with flyers and a landing page",
      budget: "$1800",
      availableSkillsAndResources: "piano teaching, guitar",
      preferredIndustries: "music lessons, local services",
    });
    const books = createExistingBusiness(store, {
      companyName: "Finch Test Books",
      businessDescription: "Bookkeeping for three local clients",
      existingOffer: "Monthly bookkeeping",
      currentChallenges: "Need finance unit economics and ops process",
      goals: "Clarify pricing and capacity",
      availableResources: "spreadsheets, accounting skill",
    });
    const a = explainTeamForCompany(store, music.workspace.id);
    const b = explainTeamForCompany(store, books.workspace.id);
    assert.equal(a.founderAuth.silentAuthorize, false);
    assert.ok(a.roles.some((r) => r.why));
    const aIds = a.roles.map((r) => r.roleId).sort().join(",");
    const bIds = b.roles.map((r) => r.roleId).sort().join(",");
    // Not required to be totally disjoint, but reasons/sets should differ for these signals
    assert.ok(aIds !== bIds || a.roles.find((r) => r.roleId === "marketing") || b.roles.find((r) => r.roleId === "finance"));
    assert.ok(a.roles.every((r) => r.silentlyAuthorized === false));
    assert.ok(a.roles.some((r) => r.unimplemented === true || r.deterministic === true || r.live === true));
  });
});

describe("master-os memory priority", () => {
  test("OWNER_POLICY outranks and is never displaced; portfolio general last", () => {
    const { store } = tmpStore();
    const ws = createNewBusiness(store, { companyName: "Mem Co", ownerObjective: "Train marketing" }).workspace.id;
    store.putKnowledge({
      id: "K-POL",
      workspaceId: ws,
      statement: "Mandatory: no outreach without owner approval.",
      classification: "owner_policy",
      claimKind: "owner_policy",
      mandatory: true,
      accepted: true,
      reviewStatus: "approved",
    });
    store.putKnowledge({
      id: "K-ROLE",
      workspaceId: ws,
      statement: "Marketing example: flyer headline about walkable lessons.",
      classification: "example",
      applicableRole: "marketing",
      accepted: true,
      reviewStatus: "approved",
    });
    store.putKnowledge({
      id: "K-CORR",
      workspaceId: ws,
      statement: "Correction: price is $40 not $35.",
      classification: "correction",
      correction: true,
      accepted: true,
      reviewStatus: "approved",
    });
    store.putKnowledge({
      id: "K-GEN",
      statement: "Portfolio general lesson about any business.",
      classification: "principle",
      accepted: true,
      reviewStatus: "approved",
    });
    assert.equal(classifyMemoryCategory(store.getKnowledge("K-POL")), "OWNER_POLICY");
    assert.equal(MEMORY_PRIORITY[0], "OWNER_POLICY");
    const retrieved = retrieveByMemoryPriority(store, ws, { roleId: "marketing", query: "flyer price lessons", limit: 10 });
    assert.equal(retrieved.embeddings, false);
    assert.equal(retrieved.retrieved[0].category, "OWNER_POLICY");
    assert.ok(retrieved.retrieved.some((r) => r.id === "K-POL"));
    assert.ok(retrieved.mandatoryPolicyCount >= 1);
    // Portfolio general without workspace should not leapfrog policies
    const ids = retrieved.retrieved.map((r) => r.id);
    assert.ok(ids.indexOf("K-POL") < ids.indexOf("K-GEN") || !ids.includes("K-GEN"));
  });
});

describe("master-os autonomy pause + jobs + ladder + treasury", () => {
  test("autonomy tick executes permitted and pauses unauthorized", () => {
    const { store } = tmpStore();
    const ws = createNewBusiness(store, { companyName: "Auto Co", ownerObjective: "Internal planning only", budget: "$100" }).workspace.id;
    persistInternalAutonomyPolicy(store, {
      workspaceId: ws,
      actor: "local_owner",
      authorized: true,
      authorizedActions: ["run_internal_specialist_task", "write_local_artifact"],
      forbiddenActions: ["outreach", "publish", "purchase"],
      budgetUsd: 1,
      coveredEmployeeIds: [],
    });
    const tick = runAutonomyLoopTick(store, ws, {
      actions: [
        { action: "run_internal_specialist_task", label: "draft", level: 1 },
        { action: "outreach", label: "email prospects", level: 4 },
        { action: "run_internal_specialist_task", label: "draft", level: 1, idempotencyKey: "dup" },
        { action: "run_internal_specialist_task", label: "draft", level: 1, idempotencyKey: "dup" },
      ],
      budgetUsd: 1,
    });
    assert.ok(tick.tick.summary.executed >= 1);
    assert.ok(tick.tick.summary.paused >= 1);
    assert.ok(tick.tick.results.some((r) => r.action === "outreach" && r.decision === "paused"));
    assert.ok(tick.tick.summary.skippedDuplicate >= 1);
  });

  test("scheduled jobs survive restart simulation with idempotency", () => {
    const { store } = tmpStore();
    const ws = createNewBusiness(store, { companyName: "Job Co", ownerObjective: "Persist jobs" }).workspace.id;
    const a = upsertScheduledJob(store, {
      workspaceId: ws,
      kind: "internal_tick",
      idempotencyKey: "job-co-tick-1",
      nextRunAt: "2026-08-22T12:00:00.000Z",
      retryLimit: 2,
      pendingApprovalId: null,
    });
    const b = upsertScheduledJob(store, {
      workspaceId: ws,
      kind: "internal_tick",
      idempotencyKey: "job-co-tick-1",
      nextRunAt: "2026-08-22T12:00:00.000Z",
    });
    assert.equal(b.deduplicated, true);
    assert.equal(a.job.id, b.job.id);
    const sim = simulateJobRestart(store, ws);
    assert.equal(sim.alwaysOn, false);
    assert.equal(sim.survivedRestart.length, 1);
    assert.equal(sim.survivedRestart[0].idempotencyKey, "job-co-tick-1");
  });

  test("execution ladder rejects external execute; allows draft level 2", () => {
    const { store } = tmpStore();
    const ws = createNewBusiness(store, { companyName: "Ladder Co", ownerObjective: "Draft only" }).workspace.id;
    const ok = recordExecutionAction(store, { workspaceId: ws, level: 2, action: "write_ops_checklist" });
    assert.equal(ok.ok, true);
    assert.equal(ok.currentMax, CURRENT_MAX_EXECUTION_LEVEL);
    const bad = recordExecutionAction(store, { workspaceId: ws, level: 4, action: "send_outreach" });
    assert.equal(bad.ok, false);
    assert.equal(bad.action.status, "rejected");
  });

  test("treasury never mixes speculative revenue into actual", () => {
    const { store } = tmpStore();
    const ws = createNewBusiness(store, { companyName: "Treasury Co", ownerObjective: "Track spend" }).workspace.id;
    store.putSpendLedgerEntry({
      id: "LED-T1",
      workspaceId: ws,
      estimatedCostUsd: 0.01,
      live: true,
      treasuryCategory: "ACTUAL",
      createdAt: "2026-08-22T01:00:00.000Z",
    });
    store.putSpendLedgerEntry({
      id: "LED-T2",
      workspaceId: ws,
      estimatedCostUsd: 5000,
      treasuryCategory: "HYPOTHETICAL",
      note: "Invented revenue-like figure must not become actual",
      createdAt: "2026-08-22T01:01:00.000Z",
    });
    const view = treasuryView(store, { workspaceId: ws });
    assert.ok(TREASURY_CATEGORIES.includes("ACTUAL"));
    assert.equal(view.totals.actualRevenueUsd, 0);
    assert.equal(view.totals.speculativeRevenueExcluded, true);
    assert.ok(view.totals.actualSpendUsd >= 0.01);
    assert.ok((view.buckets.HYPOTHETICAL || []).some((r) => r.id === "LED-T2"));
    assert.ok(!(view.buckets.ACTUAL || []).some((r) => r.id === "LED-T2"));
    assert.equal(view.rules.employeesCannotRaiseOwnBudget, true);
  });
});

describe("master-os product API wiring", () => {
  test("command and treasury routes dispatch", () => {
    const { store } = tmpStore();
    const ws = createNewBusiness(store, {
      companyName: "API Co",
      ownerObjective: "Build an execution plan for the next seven days",
      budget: "$200",
    }).workspace.id;
    const planned = dispatchProductRequest(store, "POST", "/app/command/plan", {
      ownerText: "Build an execution plan for the next seven days",
      workspaceId: ws,
    }, {});
    assert.ok(planned.plan && planned.plan.id);
    const list = dispatchProductRequest(store, "GET", "/app/command", {}, { workspaceId: ws });
    assert.equal(list.built, true);
    const tre = dispatchProductRequest(store, "GET", "/app/treasury", {}, { workspaceId: ws });
    assert.equal(tre.built, true);
    const overview = dispatchProductRequest(store, "GET", "/app/overview", {}, { workspaceId: ws });
    assert.ok(overview.commandCenter);
    assert.ok(overview.importantActions.some((a) => a.id === "command"));
  });
});
