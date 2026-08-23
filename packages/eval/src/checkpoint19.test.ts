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
  PRODUCT_NAV,
  CLASSIFICATIONS,
  PRODUCT_HONESTY,
  leakScanProduct,
  extractClaimsFromText,
  listCompanies,
  inspectCompany,
  listEmployees,
  employeeBrain,
  ingestOwnerTraining,
  assignKnowledge,
  knowledgeCatalog,
  productApprovals,
  productOverview,
  dispatchProductRequest,
} from "./product-shell.ts";

const HTML = readFileSync(new URL("../../../apps/api/src/product-app.html", import.meta.url), "utf8");
const CONTROL = readFileSync(new URL("../../../apps/api/src/control-room.html", import.meta.url), "utf8");
const SERVER = readFileSync(new URL("../../../apps/api/src/http-server.ts", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("./product-shell.ts", import.meta.url), "utf8");

const NAV_LABELS = [
  "Overview", "Companies", "Opportunities", "Teams", "Employees", "Training",
  "Knowledge", "Objectives", "Work", "Approvals", "Activity", "Spending",
];

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-cp19-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  return { dir, store };
}

function seedProduct(store) {
  store.putWorkspace({
    id: "ws-alpha",
    name: "Alpha Roofing Co",
    description: "A second company so RidgeLine is not hardcoded.",
    industry: "construction",
    geography: "US",
    ownerStatus: "active",
    createdAt: "2026-08-21T12:00:00.000Z",
  });
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
    objective: "Gather source-backed information.",
    permissions: { may: ["produce_proposed_findings"], mayNot: ["self_approve"] },
  });
  store.putAgent({
    id: "watcher-ws-ridgeline",
    name: "Watcher",
    roleId: "independent_audit",
    roleName: "Watcher",
    workspaceId: "ws-ridgeline",
    status: "active",
    versionHistory: ["watcher-ws-ridgeline-v0"],
    objective: "Inspect completed work.",
  });
  store.putAgent({
    id: "conductor-ws-ridgeline",
    name: "Conductor",
    roleId: "workflow_manager",
    roleName: "Conductor",
    workspaceId: "ws-ridgeline",
    status: "active",
    versionHistory: ["conductor-ws-ridgeline-v0"],
    objective: "Translate owner objectives into a plan.",
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
    objective: "Produce inspectable offer-positioning hypotheses.",
    knowledgeAccess: "owner_approved_same_workspace",
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

describe("checkpoint 19 product shell", () => {
  test("nav labels and routes exist in module, HTML, and server", () => {
    assert.equal(PRODUCT_NAV.length, 12);
    for (const label of NAV_LABELS) {
      assert.ok(PRODUCT_NAV.some((n) => n.label === label), "nav missing " + label);
      assert.match(HTML, new RegExp(label));
    }
    assert.match(HTML, /#\/overview/);
    assert.match(HTML, /#\/employees/);
    assert.match(HTML, /View Brain/);
    assert.match(HTML, /Owner Training Studio/);
    assert.match(SERVER, /dispatchProductRequest/);
    assert.match(SERVER, /product-app\.html/);
    assert.match(SERVER, /\/diagnostics/);
    assert.match(SERVER, /path === "\/" \|\| path === "\/app"/);
    const routes = [
      "/app/overview", "/app/companies", "/app/employees", "/app/training",
      "/app/knowledge", "/app/approvals", "/app/spending", "/app/activity",
      "/app/objectives", "/app/work", "/app/teams", "/app/opportunities",
      "/app/training/ingest", "/app/knowledge/assign",
    ];
    for (const r of routes) assert.equal(SHELL.includes(r), true, "missing route "+r);
    assert.match(SERVER, /path === "\/app" \|\| path.startsWith\("\/app\/"\)/);
    assert.equal(PRODUCT_HONESTY.persistence, "FILE_STORE");
    assert.equal(PRODUCT_HONESTY.searchIntegrationExists, false);
    assert.equal(PRODUCT_HONESTY.retrieval, "lexical_deterministic");
    assert.match(CONTROL, /EMPLOYEE LEARNING AND TEACHING/);
    assert.match(CONTROL, /pendingOwnerBanner/);
    assert.match(CONTROL, /productShellLink/);
  });

  test("later slices are honest not-built destinations", () => {
    const { store } = tmpStore();
    const work = dispatchProductRequest(store, "GET", "/app/work", {}, {});
    assert.equal(work.built, true);
    const teams = dispatchProductRequest(store, "GET", "/app/teams", {}, {});
    assert.equal(teams.built, true);
  });

  test("companies list comes from FILE_STORE and is not RidgeLine-only", () => {
    const { store } = tmpStore();
    seedProduct(store);
    const list = listCompanies(store);
    assert.equal(list.hardcodedCompany, false);
    assert.equal(list.persistence, "FILE_STORE");
    const ids = list.companies.map((c) => c.id).sort();
    assert.deepEqual(ids, ["ws-alpha", "ws-ridgeline"]);
    assert.ok(list.companies.some((c) => c.name === "Alpha Roofing Co"));
    const alpha = inspectCompany(store, "ws-alpha");
    assert.equal(alpha.company.id, "ws-alpha");
    const via = dispatchProductRequest(store, "GET", "/app/companies", {}, {});
    assert.equal(via.companies.length, 2);
  });

  test("employees include EMP-001 plus Scout Watcher Conductor Atlas", () => {
    const { store } = tmpStore();
    seedProduct(store);
    const list = listEmployees(store, { workspaceId: "ws-ridgeline" });
    const ids = list.employees.map((e) => e.id);
    assert.ok(ids.includes("EMP-001"));
    assert.ok(ids.includes("scout-ws-ridgeline"));
    assert.ok(ids.includes("watcher-ws-ridgeline"));
    assert.ok(ids.includes("conductor-ws-ridgeline"));
    assert.ok(ids.includes("atlas"));
    const one = dispatchProductRequest(store, "GET", "/app/employees/EMP-001", {}, {});
    assert.equal(one.employee.id, "EMP-001");
    assert.match(one.brainHref, /brain/);
  });

  test("employee brain reads store and keeps TPK-001 pending not applied", () => {
    const { store } = tmpStore();
    seedProduct(store);
    const brain = employeeBrain(store, "EMP-001");
    assert.equal(brain.employee.id, "EMP-001");
    assert.equal(brain.persistence, "FILE_STORE");
    assert.ok(brain.whatItDoes.summary);
    assert.ok(brain.policies.some((p) => p.id === "K-STUDIO-OWN-009"));
    const pending = brain.documentsAndLessons.pendingLessons;
    assert.ok(pending.some((p) => p.id === "TPK-001"));
    assert.equal(pending.find((p) => p.id === "TPK-001").applied, false);
    assert.ok(brain.whatItDoesNotKnow.some((x) => /TPK-001|pending/i.test(x)));
    assert.equal(brain.honesty.searchIntegrationExists, false);
    assert.equal(brain.activeVersion.id, "offer_strategist-ws-ridgeline-v0");
    assert.ok(brain.pendingApprovals.some((a) => a.id === "APR-005" && a.status === "pending"));
  });

  test("training studio persists assignment and knowledge is visible on brain", () => {
    const { store } = tmpStore();
    seedProduct(store);
    const out = ingestOwnerTraining(store, {
      workspaceId: "ws-ridgeline",
      title: "Hand-estimate procedure",
      classification: "procedure",
      sourceType: "owner_markdown",
      text: "When a contractor still estimates by hand, ask what tool they use today.\n\nNever invent a conversion rate or willingness to pay.",
      targetEmployeeIds: ["EMP-001"],
      skillTags: ["estimating"],
      guidance: "Use as a procedure, not a market claim.",
    });
    assert.equal(out.ok, true);
    assert.ok(out.record.id.startsWith("TSR-"));
    assert.equal(out.record.workspaceId, "ws-ridgeline");
    assert.equal(out.record.classification, "procedure");
    assert.equal(out.record.ownerApprovalStatus, "approved");
    assert.equal(out.record.enteredVersion, false);
    assert.equal(out.record.entireDocumentDumpedIntoPrompt, false);
    assert.ok(out.record.extractedClaims.length >= 1);
    assert.ok(out.assignment.targetEmployeeIds.includes("EMP-001"));
    const catalog = knowledgeCatalog(store, { workspaceId: "ws-ridgeline" });
    assert.ok(catalog.trainingRecords.some((t) => t.id === out.record.id));
    assert.ok(catalog.assignments.some((a) => a.id === out.assignment.id));
    const assignedIds = out.items.map((i) => i.id);
    assert.ok(catalog.items.some((k) => assignedIds.includes(k.id) && k.assignedToEmployees.includes("EMP-001")));
    const brain = employeeBrain(store, "EMP-001");
    assert.ok(brain.whatItKnows.some((k) => assignedIds.includes(k.id)));
    assert.ok(brain.documentsAndLessons.trainingRecords.some((t) => t.id === out.record.id));
  });

  test("assigning existing knowledge is visible on receiving brain", () => {
    const { store } = tmpStore();
    seedProduct(store);
    const out = assignKnowledge(store, {
      workspaceId: "ws-ridgeline",
      knowledgeItemId: "K-STUDIO-OWN-009",
      targetEmployeeIds: ["scout-ws-ridgeline"],
    });
    assert.equal(out.ok, true);
    const brain = employeeBrain(store, "scout-ws-ridgeline");
    assert.ok(brain.whatItKnows.some((k) => k.id === "K-STUDIO-OWN-009"));
    const catalog = knowledgeCatalog(store, { workspaceId: "ws-ridgeline" });
    const item = catalog.items.find((k) => k.id === "K-STUDIO-OWN-009");
    assert.ok(item.assignedToEmployees.includes("scout-ws-ridgeline"));
  });

  test("webpage cannot become owner policy", () => {
    const { store } = tmpStore();
    seedProduct(store);
    assert.throws(() => ingestOwnerTraining(store, {
      workspaceId: "ws-ridgeline",
      classification: "owner_policy",
      sourceType: "external_webpage",
      text: "Roofr is the best roofing CRM in the world according to this page.",
      targetEmployeeIds: ["EMP-001"],
    }), /cannot become owner policy/i);
  });

  test("APR-005 stays pending and is not auto-approved by product work", () => {
    const { store } = tmpStore();
    seedProduct(store);
    ingestOwnerTraining(store, {
      workspaceId: "ws-ridgeline",
      classification: "company_fact",
      sourceType: "owner_paste",
      text: "RidgeLine sells takeoff software to US roofing contractors who still estimate manually.",
      targetEmployeeIds: ["EMP-001"],
    });
    const approvals = productApprovals(store, { workspaceId: "ws-ridgeline" });
    assert.equal(approvals.apr005.status, "pending");
    assert.equal(approvals.apr005.pending, true);
    assert.equal(approvals.apr005.decided, false);
    assert.equal(store.getApprovalRequest("APR-005").status, "pending");
    assert.equal(store.getTeachingPacket("TPK-001").status, "awaiting_owner_approval");
  });

  test("restart preserves new training and knowledge assignment records", () => {
    const { dir, store } = tmpStore();
    seedProduct(store);
    const out = ingestOwnerTraining(store, {
      workspaceId: "ws-ridgeline",
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Ask which estimating tool the contractor uses before proposing RidgeLine.",
      targetEmployeeIds: ["EMP-001"],
      skillTags: ["intake"],
    });
    const second = new FileStore(dir);
    assert.ok(second.getTrainingStudioRecord(out.record.id));
    assert.ok(second.getKnowledgeAssignment(out.assignment.id));
    assert.ok(second.getKnowledge(out.items[0].id));
    const brain = employeeBrain(second, "EMP-001");
    assert.ok(brain.whatItKnows.some((k) => k.id === out.items[0].id));
    assert.equal(second.getApprovalRequest("APR-005").status, "pending");
  });

  test("no secrets leaked by ingest or public views", () => {
    const { store } = tmpStore();
    seedProduct(store);
    assert.ok(leakScanProduct("OPENAI_API_KEY=sk-abcdefghijklmnopqrstuv").includes("api-key"));
    assert.throws(() => ingestOwnerTraining(store, {
      workspaceId: "ws-ridgeline",
      classification: "company_fact",
      sourceType: "owner_paste",
      text: "Here is a key sk-abcdefghijklmnopqrstuv do not store this.",
      targetEmployeeIds: ["EMP-001"],
    }), /leak scan/i);
    const overview = JSON.stringify(productOverview(store, { workspaceId: "ws-ridgeline" }));
    assert.equal(/sk-[a-zA-Z0-9]{10,}/.test(overview), false);
    assert.equal(/OPENAI_API_KEY/.test(overview), false);
    assert.equal(/MIDAS_EVALUATOR_SECRET/.test(HTML), false);
    assert.equal(/sk-/.test(HTML), false);
  });

  test("claims are extracted, not the entire document", () => {
    const claims = extractClaimsFromText("First useful sentence about estimating tools.\n\nSecond useful sentence about proposals.\n\nThird useful sentence about material lists.");
    assert.ok(claims.length >= 2);
    assert.ok(claims.length <= 8);
    assert.ok(claims.every((c) => c.statement.length <= 600));
  });

  test("classifications cover the required epistemic set", () => {
    for (const c of ["owner_policy", "company_fact", "external_sourced_fact", "vendor_claim", "hypothesis", "example", "procedure", "correction"]) {
      assert.ok(CLASSIFICATIONS.includes(c));
    }
  });

  test("production FILE_STORE keeps APR-005 pending and frozen hashes / FOB-001", () => {
    const store = createStore();
    const apr = store.getApprovalRequest("APR-005");
    assert.ok(apr, "APR-005 must exist");
    assert.equal(apr.status, "pending");
    assert.equal(apr.objectId, "TPK-001");
    assert.equal(apr.requireLocalOwner, true);
    const packet = store.getTeachingPacket("TPK-001");
    assert.equal(packet.status, "awaiting_owner_approval");
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
    assert.ok(companies.companies.length >= 1);
    const liveBrain = employeeBrain(store, "EMP-001");
    assert.ok(liveBrain.documentsAndLessons.pendingLessons.some((p) => p.id === "TPK-001" && p.applied === false));
    const liveApprovals = productApprovals(store, {});
    assert.equal(liveApprovals.apr005.status, "pending");
  });
});
