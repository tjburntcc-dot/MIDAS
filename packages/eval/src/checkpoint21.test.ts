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
  productApprovals,
  productOverview,
  dispatchProductRequest,
  createNewBusiness,
  createExistingBusiness,
  generateOpportunities,
  compareOpportunities,
  createCompanyFromOpportunity,
  listProductOpportunities,
  inspectOpportunity,
} from "./product-shell.ts";
import {
  REQUIRED_OPPORTUNITY_FIELDS,
  OPPORTUNITY_CLAIM_CLASSES,
  OPPORTUNITY_GENERATOR,
  OPPORTUNITY_HONESTY,
  scanInventedMarket,
} from "./opportunity-scout.ts";

const HTML = readFileSync(new URL("../../../apps/api/src/product-app.html", import.meta.url), "utf8");
const SERVER = readFileSync(new URL("../../../apps/api/src/http-server.ts", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("./product-shell.ts", import.meta.url), "utf8");
const SCOUT = readFileSync(new URL("./opportunity-scout.ts", import.meta.url), "utf8");

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-cp21-"));
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

function assertRequiredAndClasses(opp) {
  for (const field of REQUIRED_OPPORTUNITY_FIELDS) {
    assert.ok(opp[field] != null, "missing field " + field);
  }
  assert.ok(opp.claimClasses);
  for (const key of ["verifiedSourcedFacts", "vendorOrMarketingClaims", "modelGeneratedHypotheses", "ownerProvidedInformation", "unknownInformation"]) {
    assert.ok(Array.isArray(opp.claimClasses[key]), "missing claim class bucket " + key);
  }
  assert.ok(opp.claimClasses.modelGeneratedHypotheses.length >= 1);
  assert.ok(opp.claimClasses.unknownInformation.length >= 1);
  assert.equal(opp.nameClaimClass, "model_generated_hypothesis");
  assert.equal(opp.monetizationModel.claimClass, "model_generated_hypothesis");
  for (const cls of OPPORTUNITY_CLAIM_CLASSES) assert.ok(cls);
}

describe("checkpoint 21 opportunity scout", () => {
  test("opportunities persist with required fields and claim-class distinctions", () => {
    assert.match(HTML, /Generate inspectable opportunities/);
    assert.match(HTML, /Create company from this opportunity/);
    assert.match(HTML, /Compare selected/);
    assert.match(SHELL, /\/app\/opportunities\/generate/);
    assert.match(SERVER, /dispatchProductRequest/);
    const overview = productOverview(new FileStore(mkdtempSync(join(tmpdir(), "midas-cp21-ov-"))), {});
    assert.ok(overview.importantActions.some((a) => a.id === "opportunities"));
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      ownerObjective: "Find a durable local services business I can operate with a small team.",
      budget: "15000",
      preferredIndustries: "home services, education",
      availableSkillsAndResources: "writing, spreadsheet modeling",
      geographicConstraints: "Great Lakes region",
      riskTolerance: "low",
    });
    const out = generateOpportunities(store, { workspaceId: created.workspace.id });
    assert.equal(out.ok, true);
    assert.equal(out.liveProviderCall, false);
    assert.equal(out.generator, OPPORTUNITY_GENERATOR);
    assert.ok(out.opportunities.length >= 3);
    for (const opp of out.opportunities) {
      assertRequiredAndClasses(opp);
      assert.equal(opp.workspaceId, created.workspace.id);
      assert.equal(opp.fixtureLabeledAsLive, false);
      assert.equal(opp.searchIntegrationExists, false);
      const persisted = store.getOpportunity(opp.id);
      assert.ok(persisted);
      assert.equal(persisted.name, opp.name);
    }
    const page = dispatchProductRequest(store, "GET", "/app/opportunities", {}, { workspaceId: created.workspace.id });
    assert.equal(page.built, true);
    assert.equal(page.searchIntegrationExists, false);
    assert.ok(page.opportunities.length >= 3);
    const company = inspectCompany(store, created.workspace.id);
    assert.equal(company.nextSteps.find((s) => s.id === "opportunities").built, true);
    assert.ok(company.opportunityCount >= 3);
  });

  test("unsupported model ideas are labeled hypotheses, not facts", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const out = generateOpportunities(store, {
      ownerObjective: "Start a small notebook business for tradespeople.",
    });
    for (const opp of out.opportunities) {
      assert.equal(opp.nameClaimClass, "model_generated_hypothesis");
      assert.equal(opp.proposedOffer.claimClass, "model_generated_hypothesis");
      assert.equal(opp.targetCustomer.claimClass === "verified_sourced_fact", false);
      assert.equal(opp.monetizationModel.claimClass, "model_generated_hypothesis");
      assert.match(String(opp.monetizationModel.text), /hypothesis/i);
      assert.equal(opp.claimClasses.verifiedSourcedFacts.length, 0);
      const one = inspectOpportunity(store, opp.id);
      assert.equal(one.opportunity.proposedOffer.label, "model-generated hypothesis");
    }
    assert.match(SCOUT, /model_generated_hypothesis/);
  });

  test("no invented TAM, demand, conversion, or expected revenue", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const out = generateOpportunities(store, {
      ownerObjective: "Find a durable local services business I can operate with a small team.",
      preferredIndustries: "home services",
      budget: "15000",
    });
    const blob = JSON.stringify(out);
    assert.equal(scanInventedMarket(blob).length, 0);
    assert.equal(/conversion rate of/i.test(blob), false);
    assert.equal(/expected revenue \$/i.test(blob), false);
    assert.equal(/proven demand|strong demand|high demand/i.test(blob), false);
    assert.equal(/\$\d[\d,]*\s*(million|billion)/i.test(blob), false);
    for (const opp of out.opportunities) {
      assert.equal(opp.invented.tam, false);
      assert.equal(opp.invented.demand, false);
      assert.equal(opp.invented.conversion, false);
      assert.equal(opp.invented.expectedRevenue, false);
      assert.equal(opp.invented.pricingEvidence, false);
      assert.ok(opp.missingInformation.some((m) => /demand/i.test(String(m.text)) && m.claimClass === "unknown"));
      assert.ok(opp.missingInformation.some((m) => /market size/i.test(String(m.text)) && m.claimClass === "unknown"));
    }
  });

  test("startup cost is unknown unless defensible from owner inputs", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const none = generateOpportunities(store, { ownerObjective: "Try a writing service." });
    for (const opp of none.opportunities) {
      assert.equal(opp.startupCostEstimate.claimClass, "unknown");
      assert.equal(opp.startupCostEstimate.value, null);
      assert.equal(opp.startupCostEstimate.defensibleFromOwnerBudget, false);
    }
    const withBudget = generateOpportunities(store, { ownerObjective: "Try a writing service.", budget: "500" });
    for (const opp of withBudget.opportunities) {
      assert.equal(opp.startupCostEstimate.defensibleFromOwnerBudget, true);
      assert.equal(opp.startupCostEstimate.claimClass, "owner_provided");
      assert.equal(opp.startupCostEstimate.value, "500");
      assert.match(String(opp.startupCostEstimate.note), /ceiling|owner-stated/i);
    }
  });

  test("compare works on persisted records", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const out = generateOpportunities(store, { ownerObjective: "Open a neighborhood repair desk." });
    const ids = out.opportunities.slice(0, 2).map((o) => o.id);
    const cmp = compareOpportunities(store, ids);
    assert.equal(cmp.opportunityIds.length, 2);
    assert.ok(cmp.rows.some((r) => r.field === "name"));
    assert.ok(cmp.rows.some((r) => r.field === "startupCostEstimate"));
    assert.ok(cmp.rows.every((r) => r.values.length === 2));
    assert.equal(cmp.searchIntegrationExists, false);
    const via = dispatchProductRequest(store, "POST", "/app/opportunities/compare", { ids: ids }, {});
    assert.deepEqual(via.opportunityIds, ids);
    assert.throws(() => compareOpportunities(store, [ids[0]]), /at least two/i);
  });

  test("create company from selected opportunity creates isolated workspace", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const pre = generateOpportunities(store, {
      ownerObjective: "Sell a simple field notebook to tradespeople.",
      geographicConstraints: "Great Lakes region",
      budget: "800",
    });
    assert.equal(pre.set.workspaceId, null);
    assert.ok(pre.opportunities.every((o) => o.workspaceId == null));
    const picked = pre.opportunities[0];
    const created = createCompanyFromOpportunity(store, picked.id, {});
    assert.equal(created.ok, true);
    assert.match(created.workspace.id, /^ws-own-\d+$/);
    assert.notEqual(created.workspace.id, "ws-ridgeline");
    assert.notEqual(created.workspace.name, "RidgeLine Estimator");
    assert.equal(created.workspace.applicationIsolation, true);
    assert.equal(created.workspace.fromOpportunityId, picked.id);
    assert.equal(created.teamGenerated, false);
    assert.equal(created.workspace.servingAtlasVersionId, null);
    const linked = store.getOpportunity(picked.id);
    assert.equal(linked.createdCompanyWorkspaceId, created.workspace.id);
    assert.equal(linked.workspaceId, created.workspace.id);
    const others = pre.opportunities.slice(1);
    for (const o of others) {
      assert.equal(store.getOpportunity(o.id).workspaceId, null);
    }
    const page = inspectCompany(store, created.workspace.id);
    assert.equal(page.employees.length, 0);
    assert.equal(page.isolation.kind, "application-level");
    assert.equal(page.teachingPackets.some((p) => p.id === "TPK-001"), false);
    const via = dispatchProductRequest(store, "POST", "/app/opportunities/" + picked.id + "/create-company", {}, {});
    assert.notEqual(via.workspace.id, created.workspace.id);
  });

  test("opportunities do not leak across workspaces", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = createExistingBusiness(store, { companyName: "Maple Street Bakery", goals: "Keep quality while adding one oven-day.", customerProfile: "Walk-in neighbors." });
    const b = createNewBusiness(store, { companyName: "Cedar Pilot", ownerObjective: "Pilot a cedar-care service." });
    const genA = generateOpportunities(store, { workspaceId: a.workspace.id });
    const genB = generateOpportunities(store, { workspaceId: b.workspace.id });
    const listA = listProductOpportunities(store, { workspaceId: a.workspace.id });
    const listB = listProductOpportunities(store, { workspaceId: b.workspace.id });
    const idsA = listA.opportunities.map((o) => o.id);
    const idsB = listB.opportunities.map((o) => o.id);
    for (const id of genA.opportunities.map((o) => o.id)) assert.ok(idsA.includes(id));
    for (const id of genB.opportunities.map((o) => o.id)) {
      assert.equal(idsA.includes(id), false);
      assert.ok(idsB.includes(id));
    }
    for (const id of genA.opportunities.map((o) => o.id)) assert.equal(idsB.includes(id), false);
    const pre = listProductOpportunities(store, {});
    assert.equal(pre.opportunities.some((o) => idsA.includes(o.id) || idsB.includes(o.id)), false);
    store.putKnowledge({
      id: "K-LEAK-A",
      workspaceId: a.workspace.id,
      statement: "Bakery closes cake orders Thursday noon.",
      accepted: true,
      reviewStatus: "approved",
      classification: "company_fact",
    });
    const again = generateOpportunities(store, { workspaceId: b.workspace.id });
    const blob = JSON.stringify(again);
    assert.equal(blob.includes("K-LEAK-A"), false);
    assert.equal(blob.includes("cake orders Thursday"), false);
  });

  test("restart preserves opportunities and the new company", () => {
    const { dir, store } = tmpStore();
    seedRidgelineBeside(store);
    const gen = generateOpportunities(store, { ownerObjective: "Survive a process restart.", budget: "500" });
    const created = createCompanyFromOpportunity(store, gen.opportunities[0].id, { companyName: "Restart Scout Co" });
    const second = new FileStore(dir);
    assert.ok(second.getOpportunity(gen.opportunities[0].id));
    assert.equal(second.getOpportunity(gen.opportunities[0].id).createdCompanyWorkspaceId, created.workspace.id);
    assert.ok(second.getOpportunitySet(gen.set.id));
    const ws = second.getWorkspace(created.workspace.id);
    assert.ok(ws);
    assert.equal(ws.name, "Restart Scout Co");
    assert.equal(ws.fromOpportunityId, gen.opportunities[0].id);
    const list = listCompanies(second);
    assert.ok(list.companies.some((c) => c.id === created.workspace.id));
    assert.ok(list.companies.some((c) => c.id === "ws-ridgeline"));
    assert.equal(second.getApprovalRequest("APR-005").status, "pending");
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

  test("search integration advertised as false and no fixture labeled as live research", () => {
    assert.equal(OPPORTUNITY_HONESTY.searchIntegrationExists, false);
    assert.equal(OPPORTUNITY_HONESTY.liveProviderCall, false);
    assert.equal(OPPORTUNITY_HONESTY.fixtureLabeledAsLive, false);
    assert.equal(OPPORTUNITY_HONESTY.thisSlice, "deterministic");
    assert.match(HTML, /search integration does not exist/i);
    assert.equal(/fixtureLabeledAsLive:\s*true/.test(SCOUT), false);
    assert.equal(/runScoutResearch|ensureLiveProvider|OpenAIResponsesProvider/.test(SCOUT), false);
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const out = generateOpportunities(store, { ownerObjective: "Stay offline and labeled." });
    assert.equal(out.liveProviderCall, false);
    assert.equal(out.fixtureLabeledAsLive, false);
    assert.equal(out.searchIntegrationExists, false);
    assert.equal(out.honesty.generator, OPPORTUNITY_GENERATOR);
    for (const opp of out.opportunities) {
      assert.equal(opp.fixtureLabeledAsLive, false);
      assert.equal(opp.liveProviderCall, false);
      assert.equal(opp.searchUsed, false);
    }
    const page = dispatchProductRequest(store, "GET", "/app/opportunities", {}, {});
    assert.equal(page.searchIntegrationExists, false);
    assert.equal(page.honesty.fixtureLabeledAsLive, false);
  });
});
