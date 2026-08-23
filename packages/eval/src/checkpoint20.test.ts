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
  knowledgeCatalog,
  productApprovals,
  productOverview,
  productSpending,
  dispatchProductRequest,
  createNewBusiness,
  createExistingBusiness,
  intakeForm,
} from "./product-shell.ts";
import {
  NEW_BUSINESS_FIELD_IDS,
  EXISTING_BUSINESS_FIELD_IDS,
  APPLICATION_ISOLATION,
} from "./company-intake.ts";

const HTML = readFileSync(new URL("../../../apps/api/src/product-app.html", import.meta.url), "utf8");
const SERVER = readFileSync(new URL("../../../apps/api/src/http-server.ts", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("./product-shell.ts", import.meta.url), "utf8");
const INTAKE = readFileSync(new URL("./company-intake.ts", import.meta.url), "utf8");

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-cp20-"));
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
  store.putAgent({
    id: "scout-ws-ridgeline",
    name: "Scout",
    roleId: "business_research",
    roleName: "Scout",
    workspaceId: "ws-ridgeline",
    status: "active",
    versionHistory: ["scout-ws-ridgeline-v0"],
  });
  store.putAgent({
    id: "offer_strategist-ws-ridgeline",
    name: "Offer Strategist",
    roleId: "offer_strategist",
    workspaceId: "ws-ridgeline",
    status: "development_verified",
    versionHistory: ["offer_strategist-ws-ridgeline-v0"],
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
  if (store.putSpendLedgerEntry) {
    store.putSpendLedgerEntry({
      id: "LED-RL-001",
      timestamp: "2026-08-21T21:00:00.000Z",
      workspaceId: "ws-ridgeline",
      agentId: "offer_strategist-ws-ridgeline",
      role: "offer_strategist",
      operation: "offer_strategist",
      kind: "fixture",
      costStatus: "unknown",
      costUsd: null,
    });
  }
}

describe("checkpoint 20 company intake", () => {
  test("entry points and intake routes exist on the product shell", () => {
    assert.match(HTML, /Start a new business/);
    assert.match(HTML, /Grow an existing business/);
    assert.match(HTML, /#\/companies\/new/);
    assert.match(HTML, /#\/companies\/existing/);
    assert.match(HTML, /submitIntake/);
    assert.match(SHELL, /\/app\/companies\/intake\/new/);
    assert.match(SHELL, /\/app\/companies\/intake\/existing/);
    assert.match(SERVER, /dispatchProductRequest/);
    const overview = productOverview(new FileStore(mkdtempSync(join(tmpdir(), "midas-cp20-empty-"))), {});
    const labels = overview.importantActions.map((a) => a.label);
    assert.ok(labels.includes("Start a new business"));
    assert.ok(labels.includes("Grow an existing business"));
    assert.equal(overview.entryPoints.length, 2);
    const oppPage = dispatchProductRequest(new FileStore(mkdtempSync(join(tmpdir(), "midas-cp20-nb-"))), "GET", "/app/opportunities", {}, {});
    assert.equal(oppPage.built, true);
    assert.equal(oppPage.searchIntegrationExists, false);
  });

  test("new-business intake creates a persisted workspace with captured fields", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    assert.throws(() => createNewBusiness(store, {}), /company name or an owner objective/i);
    assert.throws(() => dispatchProductRequest(store, "POST", "/app/companies/intake/new", {}, {}), /company name or an owner objective/i);
    const out = createNewBusiness(store, {
      ownerObjective: "Find a durable local services business I can operate with a small team.",
      revenueGoal: "100000 first-year owner-stated goal",
      budget: "15000",
      timeline: "90 days to first honest experiment",
      preferredIndustries: "home services, education",
      availableSkillsAndResources: "writing, spreadsheet modeling",
      geographicConstraints: "Great Lakes region",
      riskTolerance: "low",
      permittedResearchScope: "public pages the owner pastes later",
      ownerApprovalRequirements: "No spend without my click",
    });
    assert.equal(out.ok, true);
    assert.notEqual(out.workspace.id, "ws-ridgeline");
    assert.match(out.workspace.id, /^ws-own-\d+$/);
    assert.equal(out.workspace.origin, "owner_intake");
    assert.equal(out.workspace.intakeKind, "new_business");
    assert.equal(out.workspace.applicationIsolation, true);
    assert.equal(out.workspace.assignedAgentId, null);
    assert.equal(out.workspace.servingAtlasVersionId, null);
    assert.equal(out.workspace.teamGenerated, false);
    assert.equal(out.liveProviderCalls, false);
    assert.equal(out.scoutRan, false);
    assert.equal(out.strategistRan, false);
    const fields = out.intake.fields;
    for (const id of NEW_BUSINESS_FIELD_IDS) {
      assert.ok(fields[id], "missing field " + id);
    }
    assert.equal(fields.ownerObjective.value, "Find a durable local services business I can operate with a small team.");
    assert.equal(fields.ownerObjective.source, "owner_provided");
    assert.equal(fields.revenueGoal.notAForecast, true);
    assert.equal(fields.revenueGoal.epistemic, "owner_stated_goal");
    assert.equal(fields.companyName.source, "unknown");
    assert.equal(fields.companyName.value, null);
    assert.deepEqual(fields.preferredIndustries.value, ["home services", "education"]);
    const persisted = store.getWorkspace(out.workspace.id);
    assert.ok(persisted);
    assert.equal(persisted.intake.fields.budget.value, "15000");
    const page = inspectCompany(store, out.workspace.id);
    assert.equal(page.company.id, out.workspace.id);
    assert.equal(page.intake.fields.timeline.value, "90 days to first honest experiment");
    assert.equal(page.nextSteps.find((s) => s.id === "teams").built, true);
    assert.equal(page.nextSteps.find((s) => s.id === "opportunities").built, true);
    const via = dispatchProductRequest(store, "POST", "/app/companies/intake/new", {
      companyName: "Harbor Notebook",
      ownerObjective: "Sell a simple field notebook to tradespeople.",
    }, {});
    assert.equal(via.workspace.name, "Harbor Notebook");
    assert.equal(via.intake.fields.companyName.source, "owner_provided");
    assert.notEqual(via.workspace.id, out.workspace.id);
  });

  test("existing-business intake creates a persisted workspace from owner-supplied facts only", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    assert.throws(() => createExistingBusiness(store, { businessDescription: "A shop" }), /company name is required/i);
    const out = createExistingBusiness(store, {
      companyName: "Maple Street Bakery",
      businessDescription: "Neighborhood bakery selling bread and cakes.",
      existingOffer: "Sourdough loaves and custom cakes.",
      customerProfile: "Walk-in neighbors and weekend cake orders.",
      currentChallenges: "Morning rush outgrows the two-person staff.",
      goals: "Keep quality while adding one more oven-day.",
      existingDocuments: "We bake overnight.\n\nSaturday cake orders close Thursday at noon.",
      existingProcedures: "Wipe the bench before shaping. Never invent a wait-time promise.",
      ownerConstraints: "No delivery drivers this quarter.",
      availableResources: "One storefront lease and two bakers.",
    });
    assert.equal(out.ok, true);
    assert.notEqual(out.workspace.id, "ws-ridgeline");
    assert.equal(out.workspace.intakeKind, "existing_business");
    assert.equal(out.workspace.name, "Maple Street Bakery");
    const fields = out.intake.fields;
    for (const id of EXISTING_BUSINESS_FIELD_IDS) assert.ok(fields[id], "missing " + id);
    assert.equal(fields.companyName.source, "owner_provided");
    assert.equal(fields.businessDescription.value, "Neighborhood bakery selling bread and cakes.");
    assert.equal(fields.existingOffer.source, "owner_provided");
    assert.equal(out.workspace.industry, null);
    assert.equal(out.workspace.geography, null);
    assert.equal(out.workspace.type, null);
    assert.ok(out.documents.length >= 1);
    assert.ok(out.trainingStudioLink.href.includes("training"));
    const catalog = knowledgeCatalog(store, { workspaceId: out.workspace.id });
    assert.ok(catalog.items.length >= 1);
    assert.ok(catalog.items.every((k) => k.workspaceId === out.workspace.id));
    assert.equal(catalog.items.some((k) => k.id === "K-STUDIO-OWN-009"), false);
    const recs = store.listTrainingStudioRecords(out.workspace.id);
    assert.ok(recs.length >= 1);
    assert.ok(recs.every((r) => r.workspaceId === out.workspace.id));
    const page = inspectCompany(store, out.workspace.id);
    assert.equal(page.intake.fields.ownerConstraints.value, "No delivery drivers this quarter.");
    assert.equal(page.teamGenerated, false);
    assert.equal(page.opportunitiesInvented, false);
  });

  test("RidgeLine assumptions are not hardcoded into generic intake", () => {
    assert.equal(/ridgeline|roofing|roofr|apex roofing|construction_software|takeoff|ws-ridgeline/i.test(INTAKE), false);
    const neu = intakeForm("new_business");
    const exi = intakeForm("existing_business");
    assert.equal(neu.defaultsFromExistingCompany, false);
    assert.equal(neu.hardcodedCompany, false);
    assert.equal(exi.defaultsFromExistingCompany, false);
    assert.ok(neu.fields.every((f) => f.value == null && f.defaultValue == null));
    assert.ok(exi.fields.every((f) => f.value == null && f.defaultValue == null));
    const ids = neu.fields.map((f) => f.id);
    for (const id of NEW_BUSINESS_FIELD_IDS) assert.ok(ids.includes(id));
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const out = createNewBusiness(store, { ownerObjective: "Test a generic local shop idea." });
    const ws = store.getWorkspace(out.workspace.id);
    assert.notEqual(ws.industry, "construction_software");
    assert.notEqual(ws.name, "RidgeLine Estimator");
    assert.equal(ws.servingAtlasVersionId, null);
    assert.equal(JSON.stringify(ws.intake).includes("RidgeLine"), false);
    assert.equal(JSON.stringify(ws.intake).includes("roofing"), false);
  });

  test("new workspace does not inherit RidgeLine knowledge, employees, spend, or TPK-001", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const out = createNewBusiness(store, { companyName: "Cedar Pilot", ownerObjective: "Pilot a cedar-care service." });
    const id = out.workspace.id;
    const emps = listEmployees(store, { workspaceId: id }).employees;
    assert.equal(emps.some((e) => e.id === "EMP-001"), false);
    assert.equal(emps.some((e) => e.id === "scout-ws-ridgeline"), false);
    assert.equal(emps.some((e) => e.id === "atlas"), false);
    assert.equal(emps.length, 0);
    const catalog = knowledgeCatalog(store, { workspaceId: id });
    assert.equal(catalog.items.some((k) => k.id === "K-STUDIO-OWN-009"), false);
    assert.ok(catalog.items.every((k) => !k.workspaceId || k.workspaceId === id));
    const approvals = productApprovals(store, { workspaceId: id });
    assert.equal(approvals.pending.some((r) => r.id === "APR-005"), false);
    assert.equal((store.listTeachingPackets(id) || []).some((p) => p.id === "TPK-001"), false);
    const spend = productSpending(store, { workspaceId: id });
    assert.equal(spend.entries.some((e) => e.id === "LED-RL-001"), false);
    const page = inspectCompany(store, id);
    assert.equal(page.isolation.kind, "application-level");
    assert.equal(page.isolation.notIam, true);
    assert.equal(page.isolation.notEnterprise, true);
    assert.equal(page.isolation.inheritsOtherCompanyKnowledge, false);
    assert.equal(page.isolation.inheritsOtherCompanyEmployees, false);
    assert.equal(page.isolation.inheritsPendingTeachingPackets, false);
    assert.equal(page.approvals.includesApr005, false);
    assert.equal(page.teachingPackets.some((p) => p.id === "TPK-001"), false);
    assert.equal(page.employees.length, 0);
    assert.match(APPLICATION_ISOLATION.note, /Not IAM/);
    const ridgelineEmps = listEmployees(store, { workspaceId: "ws-ridgeline" }).employees;
    assert.ok(ridgelineEmps.some((e) => e.id === "EMP-001"));
  });

  test("Companies list includes both RidgeLine and the new workspace", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createExistingBusiness(store, { companyName: "North Lamp Co", goals: "Keep the shop open." });
    const list = listCompanies(store);
    assert.equal(list.hardcodedCompany, false);
    const ids = list.companies.map((c) => c.id);
    assert.ok(ids.includes("ws-ridgeline"));
    assert.ok(ids.includes(created.workspace.id));
    assert.ok(list.companies.some((c) => c.name === "RidgeLine Estimator"));
    assert.ok(list.companies.some((c) => c.name === "North Lamp Co"));
    const via = dispatchProductRequest(store, "GET", "/app/companies", {}, {});
    assert.ok(via.companies.length >= 2);
  });

  test("restart preserves the new workspace", () => {
    const { dir, store } = tmpStore();
    seedRidgelineBeside(store);
    const out = createNewBusiness(store, {
      companyName: "Restart Co",
      ownerObjective: "Survive a process restart.",
      budget: "500",
    });
    const second = new FileStore(dir);
    const ws = second.getWorkspace(out.workspace.id);
    assert.ok(ws);
    assert.equal(ws.name, "Restart Co");
    assert.equal(ws.intake.fields.ownerObjective.value, "Survive a process restart.");
    assert.equal(ws.intake.fields.budget.value, "500");
    const list = listCompanies(second);
    assert.ok(list.companies.some((c) => c.id === out.workspace.id));
    assert.ok(list.companies.some((c) => c.id === "ws-ridgeline"));
    assert.equal(second.getApprovalRequest("APR-005").status, "pending");
    const page = inspectCompany(second, out.workspace.id);
    assert.equal(page.company.id, out.workspace.id);
    assert.equal(page.intake.fields.companyName.value, "Restart Co");
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
    const companies = listCompanies(store);
    assert.ok(companies.companies.some((c) => c.id === "ws-ridgeline"));
    const live = productApprovals(store, {});
    assert.equal(live.apr005.status, "pending");
    assert.equal(live.apr005.decided, false);
  });

  test("no live provider calls in this slice", () => {
    assert.equal(/runScoutResearch|runOfferStrategist|ensureLiveProvider|OpenAIResponsesProvider/.test(INTAKE), false);
    assert.equal(/fetch\(/.test(INTAKE), false);
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const out = createNewBusiness(store, { ownerObjective: "Stay offline." });
    assert.equal(out.liveProviderCalls, false);
    assert.equal(out.liveApiSpend, false);
    assert.equal(out.scoutRan, false);
    assert.equal(out.strategistRan, false);
    assert.equal(out.honesty.thisSlice, "deterministic");
    const spend = productSpending(store, { workspaceId: out.workspace.id });
    assert.equal((spend.totals && spend.totals.liveCount) || 0, 0);
  });
});
