import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, createStore } from "@midas/db";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { frozenHashCheck } from "./founder-opportunity-brief.ts";
import {
  listCompanies,
  listEmployees,
  productApprovals,
  productOverview,
  dispatchProductRequest,
  createNewBusiness,
  createExistingBusiness,
  proposeTeam,
  createTeam,
} from "./product-shell.ts";
import {
  interpretObjective,
  canAssignWorkspaceEmployee,
  assertCanAssignWorkspaceEmployee,
  submitProductObjective,
  inspectProductWork,
  listProductWork,
  requestWorkSpend,
  requestRestrictedAction,
  WORK_HONESTY,
  WORK_ORCHESTRATION,
  WORK_PLAN_SOURCE,
} from "./generalized-conductor.ts";

const HTML = readFileSync(new URL("../../../apps/api/src/product-app.html", import.meta.url), "utf8");
const SERVER = readFileSync(new URL("../../../apps/api/src/http-server.ts", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("./product-shell.ts", import.meta.url), "utf8");
const GEN = readFileSync(new URL("./generalized-conductor.ts", import.meta.url), "utf8");

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-cp23-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  return { dir, store };
}

function seedRidgelineBeside(store) {
  store.putWorkspace({
    id: "ws-ridgeline",
    name: "RidgeLine Estimator",
    description: "Roofing software. Business description, not policy.",
    industry: "construction_software",
    servingAtlasVersionId: "atlas-v15",
    ownerStatus: "active",
    createdAt: "2026-08-21T12:00:00.000Z",
  });
  store.putAgent({
    id: "atlas",
    name: "Atlas",
    roleId: "atlas",
    roleName: "Atlas",
    status: "active",
    versionHistory: ["atlas-v15"],
    objective: "Qualify fictional prospects.",
    approvedKnowledgeAccess: "owner_approved_only",
  });
  store.putEmployeeRole({
    id: "EMP-001",
    workspaceId: "ws-ridgeline",
    agentId: "offer_strategist-ws-ridgeline",
    roleId: "offer_strategist",
    name: "Offer Strategist",
    roleTitle: "Offer Strategist",
    status: "development_verified",
    versionId: "offer_strategist-ws-ridgeline-v0",
    promoted: false,
    spendLimitUsd: 0.5,
    implementationStatus: "implemented_basic",
  });
  for (const [id, hash] of Object.entries(FROZEN_HASHES)) {
    if (!store.getVersion(id)) {
      store.putVersion({ id: id, agentId: id.split("-")[0] === "atlas" ? "atlas" : id.replace(/-v0$/, ""), contentHash: hash, immutable: true });
    }
  }
  store.putKnowledge({
    id: "K-STUDIO-OWN-009",
    workspaceId: "ws-ridgeline",
    kind: "owner_policy",
    claimKind: "owner_policy",
    statement: "When a US roofing contractor still estimates by hand, treat that as a positive buying signal.",
    excerpt: "estimates by hand",
    accepted: true,
    reviewStatus: "approved",
    createdAt: "2026-08-21T12:00:00.000Z",
  });
  store.putTeachingPacket({
    id: "TPK-001",
    workspaceId: "ws-ridgeline",
    status: "awaiting_owner_approval",
    recipientEmployeeId: "EMP-001",
    recipientRoleId: "offer_strategist",
    title: "Roofr public copy",
  });
  store.putObjective({
    id: "OBJ-008",
    workspaceId: "ws-ridgeline",
    status: "awaiting_owner_approval",
    ownerText: "Review permitted public roofing-software information.",
    createdAt: "2026-08-21T21:00:00.000Z",
    requireLocalOwner: true,
  });
  store.putApprovalRequest({
    id: "APR-005",
    workspaceId: "ws-ridgeline",
    objectiveId: "OBJ-008",
    kind: "teaching_packet",
    objectType: "teaching_packet",
    objectId: "TPK-001",
    status: "pending",
    requireLocalOwner: true,
    actorRequired: ["local_owner"],
    content: { packetId: "TPK-001", recipientEmployeeId: "EMP-001", excerpts: ["Roofr CRM"] },
    createdAt: "2026-08-21T21:30:07.237Z",
    note: "Teaching packet awaiting local_owner.",
  });
  store.putFounderOpportunityBrief({
    id: "FOB-001",
    workspaceId: "ws-ridgeline",
    immutable: true,
    status: "completed",
    contentHash: "8b5c64f980d333db712795d904c529f17c4baa8522a1d218e166a9a878f86218",
  });
}

function authorize(store, proposalId) {
  return createTeam(store, {
    proposalId: proposalId,
    actor: "owner",
    confirm: "Create this team",
    authorized: true,
    createThisTeam: true,
  });
}

function companyWithTeam(store, extras) {
  const created = createNewBusiness(store, {
    companyName: (extras && extras.companyName) || "Harbor Notebook",
    ownerObjective: (extras && extras.ownerObjective) || "Find a durable local notebook offer I can sell, write content for, and operate with a small team.",
    budget: (extras && extras.budget) || "2000",
    preferredIndustries: (extras && extras.preferredIndustries) || "trades notebooks",
    availableSkillsAndResources: (extras && extras.skills) || "writing and a small press",
  });
  const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
  const team = authorize(store, proposed.proposal.id);
  return { workspace: created.workspace, proposed: proposed, team: team };
}

describe("checkpoint 23 generalized conductor", () => {
  test("Work surface exists and objective stays in its workspace", () => {
    assert.match(HTML, /Submit objective/);
    assert.match(HTML, /Assigned employees/);
    assert.match(SHELL, /\/app\/work\/submit/);
    assert.match(SERVER, /dispatchProductRequest/);
    const overview = productOverview(new FileStore(mkdtempSync(join(tmpdir(), "midas-cp23-ov-"))), {});
    assert.ok(overview.importantActions.some((a) => a.id === "work"));
    const page = dispatchProductRequest(new FileStore(mkdtempSync(join(tmpdir(), "midas-cp23-wk-"))), "GET", "/app/work", {}, {});
    assert.equal(page.built, true);
    assert.equal(page.honesty.liveProviderCall, false);

    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store, { companyName: "North Lamp Co" });
    const b = createExistingBusiness(store, { companyName: "Other Co", goals: "Keep the shop open." });
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Find three promising business ideas within a $2,000 budget.",
    });
    assert.equal(out.ok, true);
    assert.equal(out.workspaceId, a.workspace.id);
    assert.equal(out.objective.workspaceId, a.workspace.id);
    assert.notEqual(out.objective.workspaceId, "ws-ridgeline");
    assert.notEqual(out.objective.workspaceId, b.workspace.id);
    assert.ok(out.tasks.every((t) => t.workspaceId === a.workspace.id || out.objective.workspaceId === a.workspace.id));
    for (const emp of out.assignedEmployees) {
      assert.equal(emp.workspaceId, a.workspace.id);
    }
    const blob = JSON.stringify(out);
    assert.equal(blob.includes("K-STUDIO-OWN-009"), false);
    assert.equal(blob.includes("TPK-001"), false);
    assert.equal(out.assignedEmployees.some((e) => e.id === "EMP-001"), false);
    const other = listProductWork(store, { workspaceId: b.workspace.id });
    assert.equal(other.records.some((r) => r.id === out.objective.id), false);
    const ridge = listProductWork(store, { workspaceId: "ws-ridgeline" });
    assert.equal(ridge.records.some((r) => r.id === out.objective.id), false);
  });

  test("Conductor cannot assign unauthorized / other-workspace / not_implemented employees", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store, { companyName: "Cedar Pilot" });
    const otherWs = canAssignWorkspaceEmployee(store, {
      workspaceId: a.workspace.id,
      employeeId: "EMP-001",
      roleId: "offer_strategist",
    });
    assert.equal(otherWs.ok, false);
    assert.equal(otherWs.code, "other_workspace");
    const sales = canAssignWorkspaceEmployee(store, {
      workspaceId: a.workspace.id,
      roleId: "sales",
      taskKind: "supervised_internal",
    });
    assert.equal(sales.ok, false);
    assert.ok(sales.code === "not_implemented" || sales.code === "unauthorized_employee");
    const exec = canAssignWorkspaceEmployee(store, {
      workspaceId: a.workspace.id,
      roleId: "executive",
    });
    assert.equal(exec.ok, false);
    const cross = canAssignWorkspaceEmployee(store, {
      workspaceId: a.workspace.id,
      roleId: "offer_strategist",
      targetWorkspaceId: "ws-ridgeline",
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.code, "other_workspace");
    assert.throws(() => assertCanAssignWorkspaceEmployee(store, {
      workspaceId: a.workspace.id,
      employeeId: "EMP-001",
    }), /cannot assign/i);
    assert.throws(() => submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Build an initial offer and positioning strategy for this company.",
      assignEmployeeId: "EMP-001",
    }), /cannot assign/i);
    const local = a.team.employees[0];
    const ok = canAssignWorkspaceEmployee(store, {
      workspaceId: a.workspace.id,
      employeeId: local.id,
      taskKind: "supervised_internal",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.workspaceId, a.workspace.id);
  });

  test("Plan has real task IDs and dependencies", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Build an initial offer and positioning strategy for this company.",
    });
    assert.ok(out.plan);
    assert.match(out.plan.id, /^PLAN-/);
    assert.ok(out.plan.taskIds.length >= 2);
    assert.ok(out.tasks.length >= 2);
    for (const t of out.tasks) {
      assert.match(t.id, /^TSK-/);
      assert.ok(out.plan.taskIds.includes(t.id));
      assert.ok(Array.isArray(t.dependencies));
    }
    const withDeps = out.tasks.filter((t) => (t.dependencies || []).length);
    assert.ok(withDeps.length >= 1, "expected at least one task with dependencies");
    for (const t of withDeps) {
      for (const dep of t.dependencies) {
        assert.ok(out.plan.taskIds.includes(dep), "dependency " + dep + " is not a real task id");
      }
    }
    assert.equal(out.plan.source, WORK_PLAN_SOURCE);
    assert.equal(out.plan.liveDraft, false);
  });

  test("Specialists persist actual results, not empty labels", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Find three promising business ideas within a $2,000 budget.",
    });
    const completed = out.tasks.filter((t) => t.status === "completed" && t.assignedEmployeeId);
    assert.ok(completed.length >= 1);
    for (const t of completed) {
      assert.ok(t.result, "missing result on " + t.id);
      assert.ok(t.result.summary && String(t.result.summary).length > 12, "empty summary " + t.id);
      assert.equal(t.result.label, "deterministic");
      assert.equal(t.result.liveProviderCall, false);
      assert.equal(t.result.liveModelWork, false);
      assert.ok(t.employeeTaskId);
      const et = store.getEmployeeTask(t.employeeTaskId);
      assert.ok(et);
      assert.equal(et.workspaceId, a.workspace.id);
      assert.ok(et.output && et.output.summary);
      assert.notEqual(et.output.summary, t.id);
    }
    const research = completed.find((t) => t.assignedRoleId === "business_research");
    if (research) {
      assert.ok(research.result.ideas || research.result.questions || research.result.summary);
    }
  });

  test("Budget is enforced and Conductor cannot raise it", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Find three promising business ideas within a $2,000 budget.",
    });
    assert.equal(out.objective.maxSpendUsd, 2000);
    assert.equal(out.spend.maxSpendUsd, 2000);
    const over = requestWorkSpend(store, { objectiveId: out.objective.id, usd: 2500 });
    assert.equal(over.ok, false);
    assert.equal(over.code, "BUDGET_EXCEEDED");
    assert.equal(over.blocked, true);
    assert.ok(over.approval);
    assert.equal(over.approval.status, "pending");
    assert.throws(() => requestWorkSpend(store, { objectiveId: out.objective.id, raiseBudget: true, usd: 1 }), /may not|budget/i);
    const viaSubmit = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Estimate the basic unit-economics assumptions we need to validate.",
      maxSpendUsd: 10,
      requestedSpendUsd: 50,
    });
    assert.equal(viaSubmit.ok, false);
    assert.equal(viaSubmit.code, "BUDGET_EXCEEDED");
  });

  test("Outreach and policy rewrite are blocked without approval", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const outreach = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Email these prospects and run outreach for the notebook.",
    });
    assert.ok(outreach.approvals && outreach.approvals.length >= 1);
    assert.ok(outreach.approvals.every((r) => r.status === "pending" && r.decided === false && r.fabricated === false));
    assert.ok(outreach.tasks.some((t) => t.status === "awaiting_owner_approval" || t.type === "outreach"));
    assert.equal(outreach.objective.authorizations && outreach.objective.authorizations.outreach, false);
    const policy = requestRestrictedAction(store, {
      workspaceId: a.workspace.id,
      objectiveId: outreach.objective.id,
      kind: "policy_rewrite",
    });
    assert.equal(policy.ok, false);
    assert.equal(policy.fabricated, false);
    assert.equal(policy.decided, false);
    assert.equal(policy.approval.status, "pending");
    assert.equal(store.getApprovalRequest("APR-005").status, "pending");
  });

  test("No team is an honest block and invents no employees", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Empty Desk Co",
      ownerObjective: "Operate a neighborhood repair desk with a small team.",
    });
    assert.equal(store.listEmployeeRoles(created.workspace.id).length, 0);
    const out = submitProductObjective(store, {
      workspaceId: created.workspace.id,
      ownerText: "Analyze this existing business and identify its biggest growth opportunities.",
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, "NO_TEAM");
    assert.equal(out.inventedEmployees, false);
    assert.match(out.teamsHref, /#\/teams/);
    assert.match(String(out.message), /no team/i);
    assert.equal(store.listEmployeeRoles(created.workspace.id).length, 0);
    const via = dispatchProductRequest(store, "POST", "/app/work/submit", {
      workspaceId: created.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    }, {});
    assert.equal(via.code, "NO_TEAM");
    assert.equal(via.inventedEmployees, false);
  });

  test("Restart preserves work records", () => {
    const { dir, store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store, { companyName: "Restart Work Co" });
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Research competitors and summarize their actual product features.",
    });
    const second = new FileStore(dir);
    const obj = second.getObjective(out.objective.id);
    assert.ok(obj);
    assert.equal(obj.workspaceId, a.workspace.id);
    assert.equal(obj.ownerText, out.objective.ownerText);
    assert.ok(second.getPlan(obj.planId));
    const tasks = second.listTasks(obj.id);
    assert.ok(tasks.length >= 1);
    for (const t of tasks) {
      assert.equal(t.workspaceId, a.workspace.id);
      assert.ok(t.id);
    }
    const view = inspectProductWork(second, out.objective.id);
    assert.equal(view.objective.id, out.objective.id);
    assert.ok(view.tasks.length >= 1);
    assert.equal(second.getApprovalRequest("APR-005").status, "pending");
    assert.equal(second.getEmployeeRole("EMP-001").versionId, "offer_strategist-ws-ridgeline-v0");
    const list = listCompanies(second);
    assert.ok(list.companies.some((c) => c.id === a.workspace.id));
    assert.ok(list.companies.some((c) => c.id === "ws-ridgeline"));
  });

  test("RidgeLine frozen hashes / EMP-001 / APR-005 unchanged", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Estimate the basic unit-economics assumptions we need to validate.",
    });
    const emp = store.getEmployeeRole("EMP-001");
    assert.equal(emp.status, "development_verified");
    assert.equal(emp.versionId, "offer_strategist-ws-ridgeline-v0");
    assert.equal(emp.workspaceId, "ws-ridgeline");
    const hashes = frozenHashCheck(store);
    for (const [id, row] of Object.entries(hashes)) {
      assert.equal(row.mutated, false, "hash mutated: " + id);
      if (row.actual) assert.equal(row.actual, row.expected, "hash drift " + id);
    }
    assert.equal(hashes["offer_strategist-ws-ridgeline-v0"].expected, "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce");
    assert.equal(store.getApprovalRequest("APR-005").status, "pending");
    assert.equal(store.getFounderOpportunityBrief("FOB-001").contentHash, "8b5c64f980d333db712795d904c529f17c4baa8522a1d218e166a9a878f86218");
    const live = createStore();
    const apr = live.getApprovalRequest("APR-005");
    assert.ok(apr);
    assert.equal(apr.status, "pending");
    assert.equal(apr.objectId, "TPK-001");
    assert.equal(apr.requireLocalOwner, true);
    assert.equal(live.getEmployeeRole("EMP-001").status, "development_verified");
    const liveApprovals = productApprovals(live, {});
    assert.equal(liveApprovals.apr005.status, "pending");
    assert.equal(liveApprovals.apr005.decided, false);
    const ws = live.getWorkspace("ws-ridgeline");
    assert.equal(ws.servingAtlasVersionId, "atlas-v15");
  });

  test("Deterministic orchestration is labeled. No fixture-as-live", () => {
    assert.equal(WORK_HONESTY.liveProviderCall, false);
    assert.equal(WORK_HONESTY.thisSlice, "deterministic");
    assert.equal(WORK_HONESTY.fixtureLabeledAsLive, false);
    assert.equal(WORK_ORCHESTRATION, "deterministic");
    assert.equal(/ensureLiveProvider|OpenAIResponsesProvider|runOfferStrategistLive/.test(GEN), false);
    assert.equal(/fetch\(/.test(GEN), false);
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    });
    assert.equal(out.liveProviderCall, false);
    assert.equal(out.fixtureLabeledAsLive, false);
    assert.equal(out.orchestration, "deterministic");
    assert.equal(out.artifactGenerated, false);
    assert.ok(out.honesty.note.includes("deterministic"));
    for (const t of out.tasks.filter((x) => x.result)) {
      assert.equal(t.result.liveProviderCall, false);
      assert.equal(t.result.label, "deterministic");
    }
    const landing = out.tasks.find((t) => t.result && t.result.kind === "landing_outline");
    if (landing) {
      assert.equal(landing.result.landingPageFile, null);
      assert.equal(landing.result.artifactGenerated, false);
    }
  });

  test("Owner summary matches persisted records", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Analyze this existing business and identify its biggest growth opportunities.",
    });
    const summary = out.summary;
    assert.ok(summary);
    assert.deepEqual(summary.taskIds, out.plan.taskIds);
    assert.equal(summary.objectiveId, out.objective.id);
    assert.equal(summary.workspaceId, a.workspace.id);
    assert.equal(summary.liveProviderCall, false);
    for (const row of summary.results) {
      const task = store.getTask(row.taskId);
      assert.ok(task, "summary references missing task " + row.taskId);
      assert.equal(row.summary, (task.result && task.result.summary) || task.resultSummary);
      assert.equal(row.label, task.result && task.result.label);
    }
    const persisted = inspectProductWork(store, out.objective.id);
    assert.deepEqual(persisted.summary.taskIds, summary.taskIds);
    assert.equal(persisted.summary.results.length, summary.results.length);
    const via = dispatchProductRequest(store, "GET", "/app/work/" + out.objective.id, {}, {});
    assert.equal(via.summary.objectiveId, out.objective.id);
  });

  test("Interpretation covers the owner example objectives", () => {
    assert.equal(interpretObjective("Find three promising business ideas within a $2,000 budget.").kind, "business_ideas");
    assert.equal(interpretObjective("Find three promising business ideas within a $2,000 budget.").budgetUsd, 2000);
    assert.equal(interpretObjective("Build an initial offer and positioning strategy for this company.").kind, "offer_positioning");
    assert.equal(interpretObjective("Analyze this existing business and identify its biggest growth opportunities.").kind, "growth_analysis");
    assert.equal(interpretObjective("Create a landing-page draft and explain the customer problem.").kind, "landing_outline");
    assert.equal(interpretObjective("Research competitors and summarize their actual product features.").kind, "competitor_research");
    assert.equal(interpretObjective("Estimate the basic unit-economics assumptions we need to validate.").kind, "unit_economics");
  });
});
