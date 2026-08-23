import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  dispatchProductRequest,
  createNewBusiness,
  createExistingBusiness,
  proposeTeam,
  createTeam,
} from "./product-shell.ts";
import {
  interpretObjective,
  submitProductObjective,
  inspectProductWork,
} from "./generalized-conductor.ts";
import {
  CLAIM_CLASSES,
  DELIVERABLE_TYPES,
  KIND_TO_DELIVERABLE_TYPES,
  deliverableTypesForKind,
  writeAuthorizedArtifact,
  NO_ARTIFACT_MESSAGE,
  ARTIFACT_NOT_DEPLOYED,
  DELIVERABLE_HONESTY,
} from "./deliverables.ts";

const HTML = readFileSync(new URL("../../../apps/api/src/product-app.html", import.meta.url), "utf8");
const SERVER = readFileSync(new URL("../../../apps/api/src/http-server.ts", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("./product-shell.ts", import.meta.url), "utf8");
const DEL = readFileSync(new URL("./deliverables.ts", import.meta.url), "utf8");
const GEN = readFileSync(new URL("./generalized-conductor.ts", import.meta.url), "utf8");

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-cp24-"));
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

function companyWithProductTeam(store, extras) {
  return companyWithTeam(store, {
    companyName: (extras && extras.companyName) || "Harbor Software",
    ownerObjective: (extras && extras.ownerObjective) || "Build a software landing page and a small internal tool application I can operate.",
    budget: "2000",
    preferredIndustries: "local software tools",
    skills: "writing and a small software press",
  });
}

const REQUIRED_FIELDS = [
  "workspaceId",
  "objectiveId",
  "type",
  "title",
  "body",
  "claimClasses",
  "sourceRefs",
  "createdByEmployeeId",
  "createdAt",
];

describe("checkpoint 24 deliverables and local artifacts", () => {
  test("Deliverable records persist with required fields and claim classes", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Find three promising business ideas within a $2,000 budget.",
    });
    assert.ok(out.deliverables && out.deliverables.length >= 1);
    const persisted = store.listDeliverables(a.workspace.id);
    assert.ok(persisted.length >= 1);
    for (const d of persisted) {
      for (const field of REQUIRED_FIELDS) {
        assert.ok(d[field] != null, "missing " + field + " on " + d.id);
      }
      assert.ok(d.body && String(d.body).length > 12);
      assert.ok(Array.isArray(d.claimClasses) && d.claimClasses.length >= 1);
      for (const c of d.claimClasses) {
        assert.ok(CLAIM_CLASSES.includes(c.claimClass), "bad claim class " + c.claimClass);
      }
      assert.equal(d.label, "deterministic");
      assert.equal(d.liveVsDeterministic, "deterministic");
      assert.equal(d.liveProviderCall, false);
      assert.equal(d.fixtureLabeledAsLive, false);
      assert.equal(d.workspaceId, a.workspace.id);
      assert.equal(d.objectiveId, out.objective.id);
      assert.ok(DELIVERABLE_TYPES.includes(d.type));
    }
    const via = dispatchProductRequest(store, "GET", "/app/work/" + out.objective.id, {}, {});
    assert.ok(via.deliverables.length >= 1);
    assert.equal(via.liveProviderCall, false);
  });

  test("Objective kind maps to the right deliverable types", () => {
    assert.deepEqual(deliverableTypesForKind("business_ideas"), KIND_TO_DELIVERABLE_TYPES.business_ideas);
    assert.deepEqual(deliverableTypesForKind("offer_positioning"), KIND_TO_DELIVERABLE_TYPES.offer_positioning);
    assert.deepEqual(deliverableTypesForKind("growth_analysis"), KIND_TO_DELIVERABLE_TYPES.growth_analysis);
    assert.deepEqual(deliverableTypesForKind("landing_outline"), KIND_TO_DELIVERABLE_TYPES.landing_outline);
    assert.deepEqual(deliverableTypesForKind("competitor_research"), KIND_TO_DELIVERABLE_TYPES.competitor_research);
    assert.deepEqual(deliverableTypesForKind("unit_economics"), KIND_TO_DELIVERABLE_TYPES.unit_economics);
    assert.ok(deliverableTypesForKind("landing_outline").includes("landing_page_copy"));
    assert.ok(deliverableTypesForKind("unit_economics").includes("unit_economics_worksheet"));
    assert.ok(deliverableTypesForKind("business_ideas").includes("opportunity_comparison"));
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Estimate the basic unit-economics assumptions we need to validate.",
    });
    const types = out.deliverables.map((d) => d.type);
    for (const t of KIND_TO_DELIVERABLE_TYPES.unit_economics) {
      assert.ok(types.includes(t), "missing mapped type " + t);
    }
    assert.equal(types.includes("landing_page_copy"), false);
  });

  test("Landing-page objective + product specialist writes a real HTML file", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithProductTeam(store);
    assert.ok(a.team.employees.some((e) => e.roleId === "product"), "expected a product specialist on this company");
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    });
    assert.equal(out.artifactGenerated, true);
    assert.ok(out.artifact);
    assert.ok(out.artifact.path);
    assert.equal(out.artifact.deployed, false);
    assert.equal(out.deployed, false);
    assert.ok(existsSync(out.artifact.path));
    const html = readFileSync(out.artifact.path, "utf8");
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /Local inspectable artifact/i);
    assert.match(html, /Not deployed/i);
    assert.equal(/deployed to production|https?:\/\/[a-z0-9.-]+\//i.test(html) && /live website/.test(html.toLowerCase()), false);
    const landing = out.deliverables.find((d) => d.type === "landing_page_copy");
    assert.ok(landing);
    assert.ok(landing.artifact && landing.artifact.path === out.artifact.path);
    const persisted = store.getDeliverable(landing.id);
    assert.equal(persisted.artifact.path, out.artifact.path);
    assert.ok(persisted.artifact.contentHash);
    assert.ok(persisted.artifact.preview);
    assert.match(out.artifactNote, /not deployed/i);
    const api = dispatchProductRequest(store, "GET", "/app/work/" + out.objective.id, {}, {});
    assert.equal(api.artifact.path, out.artifact.path);
    assert.equal(api.deployed, false);
  });

  test("No product specialist / no authorization is honest and writes no file", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    assert.equal(a.team.employees.some((e) => e.roleId === "product"), false);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    });
    assert.equal(out.artifactGenerated, false);
    assert.equal(out.artifact, null);
    assert.match(String(out.artifactNote || ""), /no local artifact/i);
    assert.ok(out.deliverables.some((d) => d.type === "landing_page_copy"));
    assert.ok(out.deliverables.every((d) => !d.artifact || !d.artifact.path));
    const attempted = writeAuthorizedArtifact(store, {
      workspaceId: a.workspace.id,
      objectiveId: out.objective.id,
    });
    assert.equal(attempted.ok, false);
    assert.equal(attempted.written, false);
    assert.equal(attempted.code, "NO_PRODUCT_SPECIALIST");
    assert.match(attempted.message, /no local artifact/i);
    const ideas = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Find three promising business ideas within a $2,000 budget.",
    });
    assert.equal(ideas.artifactGenerated, false);
    assert.match(String(ideas.artifactNote || ""), /no local artifact was requested|not requested/i);
  });

  test("Artifact cannot be written into another workspace", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithProductTeam(store, { companyName: "North Tool Co" });
    const b = createExistingBusiness(store, { companyName: "Other Co", goals: "Keep the shop open." });
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    });
    assert.equal(out.artifactGenerated, true);
    assert.ok(out.artifact.path.includes(a.workspace.id));
    assert.equal(out.artifact.path.includes(b.workspace.id), false);
    assert.equal(out.artifact.path.includes("ws-ridgeline"), false);
    const cross = writeAuthorizedArtifact(store, {
      workspaceId: a.workspace.id,
      objectiveId: out.objective.id,
      targetWorkspaceId: b.workspace.id,
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.written, false);
    assert.equal(cross.code, "OTHER_WORKSPACE");
    const ridge = writeAuthorizedArtifact(store, {
      workspaceId: a.workspace.id,
      objectiveId: out.objective.id,
      targetWorkspaceId: "ws-ridgeline",
    });
    assert.equal(ridge.ok, false);
    assert.equal(ridge.code, "OTHER_WORKSPACE");
    const stolen = writeAuthorizedArtifact(store, {
      workspaceId: b.workspace.id,
      objectiveId: out.objective.id,
    });
    assert.equal(stolen.ok, false);
    assert.equal(stolen.code, "OTHER_WORKSPACE");
    const bDir = join(store.dir, "artifacts", b.workspace.id);
    assert.equal(existsSync(join(bDir, "landing.html")), false);
    assert.equal(existsSync(join(store.dir, "artifacts", "ws-ridgeline", "landing.html")), false);
  });

  test("Restart preserves deliverables and the artifact file", () => {
    const { dir, store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithProductTeam(store, { companyName: "Restart Artifact Co" });
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    });
    const path = out.artifact.path;
    const hash = out.artifact.contentHash;
    const second = new FileStore(dir);
    const rows = second.listDeliverables(a.workspace.id);
    assert.ok(rows.length >= 1);
    const landing = rows.find((d) => d.type === "landing_page_copy");
    assert.ok(landing);
    assert.equal(landing.objectiveId, out.objective.id);
    assert.equal(landing.artifact.path, path);
    assert.ok(existsSync(path));
    const html = readFileSync(path, "utf8");
    assert.match(html, /<!doctype html>/i);
    const view = inspectProductWork(second, out.objective.id);
    assert.equal(view.artifact.path, path);
    assert.equal(view.artifact.contentHash, hash);
    assert.equal(second.getApprovalRequest("APR-005").status, "pending");
    const list = listCompanies(second);
    assert.ok(list.companies.some((c) => c.id === a.workspace.id));
    assert.ok(list.companies.some((c) => c.id === "ws-ridgeline"));
  });

  test("No invented customers, revenue, or TAM", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithProductTeam(store);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    });
    const blob = JSON.stringify(out.deliverables) + readFileSync(out.artifact.path, "utf8");
    assert.equal(/\bTAM\b[^.]{0,40}\$[\d,]{3,}/.test(blob), false);
    assert.equal(/expected revenue\s*[:=]\s*\$[\d,]{2,}/i.test(blob), false);
    assert.equal(/we have \d+ customers/i.test(blob), false);
    assert.match(blob, /unknown/i);
    for (const d of out.deliverables) {
      assert.equal(d.inventedTam === true, false);
      assert.equal(d.inventedRevenue === true, false);
      assert.equal(d.inventedCustomers === true, false);
    }
  });

  test("RidgeLine frozen hashes / FOB-001 / APR-005 unchanged", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithProductTeam(store);
    submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
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

  test("Deterministic assembly is labeled. No fixture-as-live", () => {
    assert.equal(DELIVERABLE_HONESTY.liveProviderCall, false);
    assert.equal(DELIVERABLE_HONESTY.thisSlice, "deterministic");
    assert.equal(DELIVERABLE_HONESTY.fixtureLabeledAsLive, false);
    assert.equal(DELIVERABLE_HONESTY.deployed, false);
    assert.equal(/ensureLiveProvider|OpenAIResponsesProvider|runOfferStrategistLive/.test(DEL), false);
    assert.equal(/fetch\(/.test(DEL), false);
    assert.equal(/ensureLiveProvider|OpenAIResponsesProvider|runOfferStrategistLive/.test(GEN), false);
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithProductTeam(store);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    });
    assert.equal(out.liveProviderCall, false);
    assert.equal(out.fixtureLabeledAsLive, false);
    assert.equal(out.orchestration, "deterministic");
    for (const d of out.deliverables) {
      assert.equal(d.liveVsDeterministic, "deterministic");
      assert.equal(d.label, "deterministic");
      assert.equal(d.liveProviderCall, false);
      assert.equal(d.fixtureLabeledAsLive, false);
    }
  });

  test("UI and API expose the artifact path when a file exists", () => {
    assert.match(HTML, /Deliverables/);
    assert.match(HTML, /Local artifact/);
    assert.match(HTML, /not deployed/i);
    assert.match(SHELL, /\/app\/deliverables/);
    assert.match(SERVER, /dispatchProductRequest/);
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithProductTeam(store);
    const out = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    });
    const work = dispatchProductRequest(store, "GET", "/app/work/" + out.objective.id, {}, {});
    assert.equal(work.artifact.path, out.artifact.path);
    assert.ok(work.deliverables.some((d) => d.artifact && d.artifact.path === out.artifact.path));
    const listed = dispatchProductRequest(store, "GET", "/app/deliverables", {}, { workspaceId: a.workspace.id });
    assert.ok(listed.records.some((d) => d.artifact && d.artifact.path === out.artifact.path));
    const company = inspectCompany(store, a.workspace.id);
    assert.ok(company.deliverables.some((d) => d.objectiveId === out.objective.id));
    const one = dispatchProductRequest(store, "GET", "/app/deliverables/" + out.deliverables[0].id, {}, {});
    assert.equal(one.deliverable.workspaceId, a.workspace.id);
  });
});
