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
  inspectCompany,
  listEmployees,
  employeeBrain,
  productApprovals,
  productOverview,
  dispatchProductRequest,
  createNewBusiness,
  createExistingBusiness,
  proposeTeam,
  createTeam,
  runEmployeeTask,
} from "./product-shell.ts";
import {
  ROLE_CATALOG,
  TEAM_GENERATOR,
  TEAM_HONESTY,
  TEAM_EMPLOYEE_STATUS,
  REFERENCE_SPECIALIST_ROLE_SET,
  selectRoleIds,
  collectWorkspaceSignals,
} from "./team-generator.ts";

const HTML = readFileSync(new URL("../../../apps/api/src/product-app.html", import.meta.url), "utf8");
const SERVER = readFileSync(new URL("../../../apps/api/src/http-server.ts", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("./product-shell.ts", import.meta.url), "utf8");
const GEN = readFileSync(new URL("./team-generator.ts", import.meta.url), "utf8");

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-cp22-"));
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

function authorize(store, proposalId, extra) {
  return createTeam(store, {
    proposalId: proposalId,
    actor: "owner",
    confirm: "Create this team",
    authorized: true,
    createThisTeam: true,
    ...(extra || {}),
  });
}

function requiredEmployeeFields(emp) {
  const need = [
    "workspaceId", "roleId", "roleTitle", "jobDescription", "objective",
    "permissions", "executionProfile", "versionId", "allowedTools",
    "knowledgeScope", "budget", "taskHistory", "status",
  ];
  for (const k of need) assert.ok(emp[k] != null, "missing field " + k);
}

describe("checkpoint 22 generic team generator", () => {
  test("Teams surface exists and proposal is an objective-based subset, not a RidgeLine copy", () => {
    assert.match(HTML, /Generate team/);
    assert.match(HTML, /Create this team/);
    assert.match(HTML, /View Brain/);
    assert.match(SHELL, /\/app\/teams\/propose/);
    assert.match(SHELL, /\/app\/teams\/create/);
    assert.match(SERVER, /dispatchProductRequest/);
    assert.equal(/ridgeline|roofing|roofr|apex roofing|ws-ridgeline/i.test(GEN), false);
    const overview = productOverview(new FileStore(mkdtempSync(join(tmpdir(), "midas-cp22-ov-"))), {});
    assert.ok(overview.importantActions.some((a) => a.id === "teams"));
    const page = dispatchProductRequest(new FileStore(mkdtempSync(join(tmpdir(), "midas-cp22-tm-"))), "GET", "/app/teams", {}, {});
    assert.equal(page.built, true);

    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const bakery = createExistingBusiness(store, {
      companyName: "Maple Street Bakery",
      businessDescription: "Neighborhood bakery selling bread and cakes.",
      existingOffer: "Sourdough loaves and custom cakes.",
      customerProfile: "Walk-in neighbors.",
      currentChallenges: "Morning rush outgrows the two-person staff.",
      goals: "Keep quality while adding one oven-day.",
      existingProcedures: "Wipe the bench before shaping.",
    });
    const software = createNewBusiness(store, {
      ownerObjective: "Qualify fictional roofing contractors for estimating software sold as B2B SaaS.",
      preferredIndustries: "construction software",
    });
    const local = createNewBusiness(store, {
      ownerObjective: "Find a durable local services business I can operate with a small team.",
      budget: "15000",
      preferredIndustries: "home services",
    });
    const a = proposeTeam(store, { workspaceId: bakery.workspace.id });
    const b = proposeTeam(store, { workspaceId: software.workspace.id });
    const c = proposeTeam(store, { workspaceId: local.workspace.id });
    assert.equal(a.employeesCreated, false);
    assert.equal(a.proposal.generator, TEAM_GENERATOR);
    const setA = a.proposal.selectedRoleIds.slice().sort().join(",");
    const setB = b.proposal.selectedRoleIds.slice().sort().join(",");
    const setC = c.proposal.selectedRoleIds.slice().sort().join(",");
    assert.notEqual(setA, setB);
    const ridge = REFERENCE_SPECIALIST_ROLE_SET.slice().sort().join(",");
    assert.notEqual(setA, ridge);
    assert.equal(a.proposal.selectedRoleIds.includes("atlas"), false);
    assert.ok(b.proposal.selectedRoleIds.includes("atlas"));
    assert.ok(a.proposal.selectedRoleIds.includes("ops"));
    assert.ok(c.proposal.selectedRoleIds.includes("business_research"));
    assert.ok(a.proposal.proposedRoles.every((r) => r.reason));
    assert.equal(store.listEmployeeRoles(bakery.workspace.id).length, 0);
    const signals = collectWorkspaceSignals(store.getWorkspace(bakery.workspace.id));
    const picked = selectRoleIds(signals);
    assert.equal(picked.roleIds.includes("atlas"), false);
  });

  test("create requires owner authorization and does not silently create", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, { companyName: "Cedar Pilot", ownerObjective: "Pilot a cedar-care service for local homeowners." });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    assert.equal(proposed.employeesCreated, false);
    assert.equal(store.listEmployeeRoles(created.workspace.id).length, 0);
    assert.throws(() => createTeam(store, { proposalId: proposed.proposal.id }), /owner authorization|Create this team/i);
    assert.throws(() => createTeam(store, { proposalId: proposed.proposal.id, actor: "demo_operator", authorized: true, confirm: "Create this team" }), /demo_operator/i);
    assert.throws(() => createTeam(store, { proposalId: proposed.proposal.id, actor: "conductor", authorized: true, confirm: "Create this team" }), /Conductor/i);
    assert.equal(store.listEmployeeRoles(created.workspace.id).length, 0);
    assert.throws(() => dispatchProductRequest(store, "POST", "/app/teams/create", {}, {}), /owner authorization|Create this team|proposal/i);
    assert.equal(store.listEmployeeRoles(created.workspace.id).length, 0);
    const out = authorize(store, proposed.proposal.id);
    assert.equal(out.ok, true);
    assert.ok(out.createdEmployeeIds.length >= 3);
    const again = authorize(store, proposed.proposal.id);
    assert.equal(again.alreadyCreated, true);
    assert.deepEqual(again.createdEmployeeIds, out.createdEmployeeIds);
  });

  test("created employees are real records with required fields and workspace ownership", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Harbor Notebook",
      ownerObjective: "Sell a simple field notebook to tradespeople.",
      budget: "800",
    });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const out = authorize(store, proposed.proposal.id);
    assert.ok(out.employees.length >= 3);
    for (const emp of out.employees) {
      requiredEmployeeFields(emp);
      assert.equal(emp.workspaceId, created.workspace.id);
      assert.notEqual(emp.workspaceId, "ws-ridgeline");
      assert.equal(emp.status, TEAM_EMPLOYEE_STATUS);
      assert.equal(emp.promoted, false);
      assert.equal(emp.autonomous, false);
      assert.equal(emp.outreach, false);
      assert.equal(emp.permissions.outreach, false);
      assert.equal(emp.permissions.crossWorkspace, false);
      assert.equal(emp.permissions.policyRewrite, false);
      assert.equal(emp.permissions.budgetBounded, true);
      assert.equal(emp.knowledgeScope.workspaceId, created.workspace.id);
      assert.equal(emp.knowledgeScope.inheritOtherCompanyKnowledge, false);
      assert.equal(emp.executionProfile.liveModelWork, false);
      assert.equal(emp.executionProfile.kind, "deterministic");
      assert.equal(emp.implementationStatus, "implemented_basic");
      assert.ok(emp.versionId.endsWith("-" + created.workspace.id + "-v0") || emp.versionId.includes(created.workspace.id));
      assert.notEqual(emp.versionId, "offer_strategist-ws-ridgeline-v0");
      assert.ok(store.getVersion(emp.versionId));
      assert.equal(store.getVersion(emp.versionId).immutable, true);
      assert.equal(store.getVersion(emp.versionId).workspaceId, created.workspace.id);
      assert.ok(Array.isArray(emp.taskHistory));
      assert.ok(emp.taskHistory.length >= 1);
      const persisted = store.getEmployeeRole(emp.id);
      assert.ok(persisted);
      assert.equal(persisted.workspaceId, created.workspace.id);
    }
    const page = inspectCompany(store, created.workspace.id);
    assert.equal(page.teamGenerated, true);
    assert.equal(page.nextSteps.find((s) => s.id === "teams").built, true);
    assert.ok(page.employees.length >= 3);
  });

  test("new company employees do not inherit RidgeLine knowledge, versions, or TPK-001", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createExistingBusiness(store, { companyName: "North Lamp Co", goals: "Keep the shop open with a neighborhood process." });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const out = authorize(store, proposed.proposal.id);
    const emps = listEmployees(store, { workspaceId: created.workspace.id }).employees;
    assert.equal(emps.some((e) => e.id === "EMP-001"), false);
    assert.equal(emps.some((e) => e.versionId === "offer_strategist-ws-ridgeline-v0"), false);
    assert.ok(emps.every((e) => e.workspaceId === created.workspace.id));
    for (const emp of out.employees) {
      const brain = employeeBrain(store, emp.id);
      assert.equal(brain.employee.workspaceId, created.workspace.id);
      assert.equal((brain.whatItKnows || []).some((k) => k.id === "K-STUDIO-OWN-009"), false);
      assert.equal(JSON.stringify(brain).includes("K-STUDIO-OWN-009"), false);
      assert.equal(JSON.stringify(brain).includes("TPK-001"), false);
      assert.equal((brain.documentsAndLessons.pendingLessons || []).some((p) => p.id === "TPK-001"), false);
      assert.notEqual(brain.activeVersion.id, "offer_strategist-ws-ridgeline-v0");
      assert.equal(brain.activeVersion.frozenExpected, null);
    }
    const approvals = productApprovals(store, { workspaceId: created.workspace.id });
    assert.equal(approvals.pending.some((r) => r.id === "APR-005"), false);
  });

  test("RidgeLine EMP-001 and frozen hashes stay unchanged", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, { ownerObjective: "Open a neighborhood repair desk." });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    authorize(store, proposed.proposal.id);
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
    assert.equal(store.getVersion("offer_strategist-ws-ridgeline-v0").contentHash, "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce");
    const ridgelineEmps = listEmployees(store, { workspaceId: "ws-ridgeline" }).employees;
    assert.ok(ridgelineEmps.some((e) => e.id === "EMP-001"));
    assert.equal(ridgelineEmps.some((e) => e.workspaceId === created.workspace.id), false);
  });

  test("sales and executive are internal planning only, not outreach", () => {
    const sales = ROLE_CATALOG.find((r) => r.roleId === "sales");
    const executive = ROLE_CATALOG.find((r) => r.roleId === "executive");
    assert.equal(sales.implementationStatus, "implemented_basic");
    assert.equal(sales.handlerExists, true);
    assert.equal(sales.planningOnly, true);
    assert.equal(executive.implementationStatus, "implemented_basic");
    assert.ok(sales.prohibitedActions.includes("outreach"));
    assert.ok(executive.prohibitedActions.includes("hire"));
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, { ownerObjective: "Sell a writing service and grow a newsletter audience." });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    assert.equal(proposed.proposal.unimplementedRoles.some((r) => r.roleId === "sales"), false);
    const out = authorize(store, proposed.proposal.id);
    assert.equal(out.employees.some((e) => e.implementationStatus === "not_implemented"), false);
    for (const emp of out.employees) {
      assert.equal(emp.implementationStatus, "implemented_basic");
      assert.equal(emp.executionProfile.liveModelWork, false);
    }
    const task = runEmployeeTask(store, out.employees[0].id, { input: "Write a labeled internal note." });
    assert.equal(task.liveProviderCall, false);
    assert.equal(task.task.output.liveModelWork, false);
    assert.equal(task.task.output.label, "deterministic");
  });

  test("restart preserves new employees", () => {
    const { dir, store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, { companyName: "Restart Team Co", ownerObjective: "Survive a process restart with a small local shop." });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const out = authorize(store, proposed.proposal.id);
    const second = new FileStore(dir);
    for (const id of out.createdEmployeeIds) {
      const emp = second.getEmployeeRole(id);
      assert.ok(emp, "missing " + id);
      assert.equal(emp.workspaceId, created.workspace.id);
      assert.equal(emp.status, TEAM_EMPLOYEE_STATUS);
      assert.ok(second.getVersion(emp.versionId));
    }
    assert.ok(second.getTeamProposal(proposed.proposal.id));
    assert.equal(second.getTeamProposal(proposed.proposal.id).status, "authorized_created");
    const list = listCompanies(second);
    assert.ok(list.companies.some((c) => c.id === created.workspace.id));
    assert.ok(list.companies.some((c) => c.id === "ws-ridgeline"));
    const emps = listEmployees(second, { workspaceId: created.workspace.id }).employees;
    assert.ok(emps.length >= 3);
    assert.equal(second.getApprovalRequest("APR-005").status, "pending");
    assert.equal(second.getEmployeeRole("EMP-001").versionId, "offer_strategist-ws-ridgeline-v0");
  });

  test("no outreach and no autonomous flags on created employees", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, { ownerObjective: "Operate a neighborhood repair desk with a small team." });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const out = authorize(store, proposed.proposal.id);
    const blob = JSON.stringify(out.employees);
    assert.equal(/"outreach":\s*true/.test(blob), false);
    assert.equal(/"autonomous":\s*true/.test(blob), false);
    assert.equal(/"promoted":\s*true/.test(blob), false);
    for (const emp of out.employees) {
      assert.equal(emp.outreach, false);
      assert.equal(emp.autonomous, false);
      assert.equal(emp.promoted, false);
      assert.ok(emp.prohibitedActions.includes("outreach"));
      assert.ok(emp.allowedTools.includes("receive_task"));
      assert.equal(emp.allowedTools.includes("outreach"), false);
    }
  });

  test("APR-005 still pending and frozen hashes / FOB-001 unchanged", () => {
    const store = createStore();
    const apr = store.getApprovalRequest("APR-005");
    assert.ok(apr, "APR-005 must exist");
    assert.equal(apr.status, "pending");
    assert.equal(apr.objectId, "TPK-001");
    assert.equal(apr.requireLocalOwner, true);
    assert.equal(store.getTeachingPacket("TPK-001").status, "awaiting_owner_approval");
    const emp = store.getEmployeeRole("EMP-001");
    assert.equal(emp.status, "development_verified");
    assert.equal(emp.versionId, "offer_strategist-ws-ridgeline-v0");
    const hashes = frozenHashCheck(store);
    for (const [id, row] of Object.entries(hashes)) {
      assert.equal(row.mutated, false, "hash mutated: " + id);
      if (row.actual) assert.equal(row.actual, row.expected, "hash drift " + id);
    }
    assert.equal(hashes["offer_strategist-ws-ridgeline-v0"].expected, "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce");
    const fob = store.getFounderOpportunityBrief("FOB-001");
    assert.equal(fob.contentHash, "8b5c64f980d333db712795d904c529f17c4baa8522a1d218e166a9a878f86218");
    const ws = store.getWorkspace("ws-ridgeline");
    assert.equal(ws.servingAtlasVersionId, "atlas-v15");
    const live = productApprovals(store, {});
    assert.equal(live.apr005.status, "pending");
    assert.equal(live.apr005.decided, false);
  });

  test("Employees list and View Brain work for the new company", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createExistingBusiness(store, {
      companyName: "Cedar Care",
      goals: "Keep quality while adding one more service day.",
      currentChallenges: "Weekend staff is thin.",
      existingProcedures: "Wipe the bench. Never invent a wait-time promise.",
    });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const out = authorize(store, proposed.proposal.id);
    const list = dispatchProductRequest(store, "GET", "/app/employees", {}, { workspaceId: created.workspace.id });
    const ids = list.employees.map((e) => e.id);
    for (const id of out.createdEmployeeIds) assert.ok(ids.includes(id));
    assert.equal(ids.includes("EMP-001"), false);
    const one = dispatchProductRequest(store, "GET", "/app/employees/" + out.createdEmployeeIds[0], {}, {});
    assert.equal(one.employee.id, out.createdEmployeeIds[0]);
    assert.match(one.brainHref, /brain/);
    const brain = dispatchProductRequest(store, "GET", "/app/employees/" + out.createdEmployeeIds[0] + "/brain", {}, {});
    assert.equal(brain.employee.workspaceId, created.workspace.id);
    assert.ok(brain.whatItDoes);
    assert.ok(brain.recentWork.some((w) => w.kind === "employee_task"));
    assert.equal(brain.errorStatus, undefined);
  });

  test("no live provider calls in this slice", () => {
    assert.equal(TEAM_HONESTY.liveProviderCall, false);
    assert.equal(TEAM_HONESTY.thisSlice, "deterministic");
    assert.equal(/runScoutResearch|runOfferStrategist|ensureLiveProvider|OpenAIResponsesProvider/.test(GEN), false);
    assert.equal(/fetch\(/.test(GEN), false);
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, { ownerObjective: "Stay offline and labeled with a small local shop." });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    assert.equal(proposed.liveProviderCall, false);
    const out = authorize(store, proposed.proposal.id);
    assert.equal(out.liveProviderCall, false);
    const page = dispatchProductRequest(store, "GET", "/app/teams", {}, { workspaceId: created.workspace.id });
    assert.equal(page.honesty.liveProviderCall, false);
    assert.equal(page.honesty.fixtureLabeledAsLive, false);
  });
});
