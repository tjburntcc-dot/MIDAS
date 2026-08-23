import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, createStore } from "@midas/db";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { frozenHashCheck } from "./founder-opportunity-brief.ts";
import { scanInventedMarket } from "./opportunity-scout.ts";
import { APPLICATION_ISOLATION } from "./company-intake.ts";
import {
  listCompanies,
  inspectCompany,
  productApprovals,
  productOverview,
  dispatchProductRequest,
} from "./product-shell.ts";
import {
  CHECKPOINT26_HONESTY,
  CHECKPOINT26_PROOF_ID,
  WORKFLOW_A,
  WORKFLOW_B,
  runNewBusinessWorkflow,
  runExistingBusinessWorkflow,
  runCheckpoint26Dual,
  reopenAndFindProofIds,
  assertCompanySeparation,
  assertNoRidgelineInheritance,
  collectWorkspaceRecordIds,
  frozenAndPendingStatus,
  workflowProofView,
} from "./checkpoint26.ts";

const HTML = readFileSync(new URL("../../../apps/api/src/product-app.html", import.meta.url), "utf8");
const SERVER = readFileSync(new URL("../../../apps/api/src/http-server.ts", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("./product-shell.ts", import.meta.url), "utf8");
const CP = readFileSync(new URL("./checkpoint26.ts", import.meta.url), "utf8");

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-cp26-"));
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
    objective: "Produce inspectable offer-positioning hypotheses.",
    knowledgeAccess: "owner_approved_same_workspace",
  });
  store.putAgent({
    id: "offer_strategist-ws-ridgeline",
    name: "Offer Strategist",
    roleId: "offer_strategist",
    workspaceId: "ws-ridgeline",
    status: "development_verified",
    versionHistory: ["offer_strategist-ws-ridgeline-v0"],
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

function assertDistinctChain(wf, requireSelectedOpportunity) {
  const ids = [
    wf.workspaceId,
    wf.opportunitySetId,
    wf.trainingRecordId,
    wf.trainingAssignmentId,
    wf.workObjectiveId,
  ];
  if (requireSelectedOpportunity) ids.push(wf.selectedOpportunityId);
  for (const id of ids) {
    assert.ok(id, "missing persisted id in " + wf.kind);
  }
  assert.ok(wf.employeeIds && wf.employeeIds.length >= 1, wf.kind + " needs team employees");
  assert.ok(wf.deliverableIds && wf.deliverableIds.length >= 1, wf.kind + " needs deliverables");
  assert.equal(new Set(ids.filter(Boolean)).size, ids.filter(Boolean).length, wf.kind + " ids must be distinct");
  assert.equal(wf.liveProviderCall, false);
}

describe("checkpoint 26 dual complete workflows", () => {
  test("routes, proof surface, and honest labels exist", () => {
    assert.match(HTML, /Workflow proof/);
    assert.match(HTML, /product-proof/);
    assert.match(HTML, /application-level/);
    assert.match(SHELL, /\/app\/workflow-proof/);
    assert.match(SERVER, /dispatchProductRequest/);
    assert.equal(CHECKPOINT26_HONESTY.liveProviderCall, false);
    assert.equal(CHECKPOINT26_HONESTY.searchIntegrationExists, false);
    assert.equal(CHECKPOINT26_HONESTY.isolation, "application-level");
    assert.equal(CHECKPOINT26_HONESTY.isolationNotIam, true);
    assert.equal(APPLICATION_ISOLATION.notIam, true);
    assert.match(CP, /TPK-001/);
    assert.match(CP, /APR-005/);
    assert.equal(/ensureLiveProvider|OpenAIResponsesProvider|runOfferStrategistLive/.test(CP), false);
    assert.equal(/roofing|RidgeLine Estimator|AutoShop/.test(WORKFLOW_A.ownerObjective + WORKFLOW_B.businessDescription), false);
  });

  test("new-business chain creates distinct persisted IDs", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const wf = runNewBusinessWorkflow(store);
    assertDistinctChain(wf, true);
    assert.equal(wf.kind, "new_business");
    assert.ok(store.getOpportunitySet(wf.opportunitySetId));
    assert.ok(store.getOpportunity(wf.selectedOpportunityId));
    assert.equal(store.getOpportunity(wf.selectedOpportunityId).nameClaimClass, "model_generated_hypothesis");
    assert.ok(store.getWorkspace(wf.workspaceId));
    assert.equal(store.getWorkspace(wf.workspaceId).fromOpportunityId, wf.selectedOpportunityId);
    assert.equal(store.getWorkspace(wf.workspaceId).productProof, true);
    for (const eid of wf.employeeIds) {
      const emp = store.getEmployeeRole(eid);
      assert.ok(emp);
      assert.equal(emp.workspaceId, wf.workspaceId);
      assert.notEqual(emp.id, "EMP-001");
    }
    assert.ok(store.getTrainingStudioRecord(wf.trainingRecordId));
    assert.ok(store.getKnowledgeAssignment(wf.trainingAssignmentId));
    assert.equal(store.getKnowledgeAssignment(wf.trainingAssignmentId).workspaceId, wf.workspaceId);
    assert.ok(store.getObjective(wf.workObjectiveId));
    assert.equal(store.getObjective(wf.workObjectiveId).workspaceId, wf.workspaceId);
    for (const did of wf.deliverableIds) {
      const d = store.getDeliverable(did);
      assert.ok(d);
      assert.equal(d.workspaceId, wf.workspaceId);
      assert.equal(d.objectiveId, wf.workObjectiveId);
    }
    assert.equal(wf.hypothesesLabeled, true);
    const product = store.listEmployeeRoles(wf.workspaceId).some((e) => e.roleId === "product");
    if (product) {
      assert.equal(wf.artifactGenerated, true);
      assert.ok(wf.artifactPath);
      assert.equal(existsSync(wf.artifactPath), true);
    } else {
      assert.equal(wf.artifactGenerated, false);
    }
    const via = dispatchProductRequest(store, "GET", "/app/work/" + wf.workObjectiveId, {}, {});
    assert.ok(via.deliverables.length >= 1);
    assert.equal(via.liveProviderCall, false);
  });

  test("existing-business chain starts from owner intake without an opportunity", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const wf = runExistingBusinessWorkflow(store);
    assertDistinctChain(wf, false);
    assert.equal(wf.kind, "existing_business");
    assert.equal(wf.createdWithoutOpportunity, true);
    assert.equal(wf.selectedOpportunityId, null);
    const ws = store.getWorkspace(wf.workspaceId);
    assert.equal(ws.intakeKind, "existing_business");
    assert.equal(ws.fromOpportunityId == null, true);
    assert.equal(ws.name, WORKFLOW_B.companyName);
    assert.equal(ws.productProof, true);
    assert.ok(wf.opportunitySetId, "growth opportunities still persist after the company exists");
    assert.ok(wf.opportunityIds.length >= 1);
    for (const oid of wf.opportunityIds) {
      const opp = store.getOpportunity(oid);
      assert.equal(opp.workspaceId, wf.workspaceId);
      assert.equal(opp.nameClaimClass, "model_generated_hypothesis");
    }
    assert.ok(store.getObjective(wf.workObjectiveId));
    assert.ok(wf.deliverableIds.length >= 1);
    assert.equal(wf.hypothesesLabeled, true);
  });

  test("the two companies do not share employees, knowledge, or deliverables", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const dual = runCheckpoint26Dual(store);
    assert.equal(dual.ok, true);
    assert.notEqual(dual.workflowA.workspaceId, dual.workflowB.workspaceId);
    const sep = assertCompanySeparation(store, dual.workflowA.workspaceId, dual.workflowB.workspaceId);
    assert.equal(sep.ok, true, sep.issues.join("; "));
    const a = collectWorkspaceRecordIds(store, dual.workflowA.workspaceId);
    const b = collectWorkspaceRecordIds(store, dual.workflowB.workspaceId);
    assert.equal(a.employeeIds.some((id) => b.employeeIds.includes(id)), false);
    assert.equal(a.knowledgeIds.some((id) => b.knowledgeIds.includes(id)), false);
    assert.equal(a.deliverableIds.some((id) => b.deliverableIds.includes(id)), false);
    const inspectA = inspectCompany(store, dual.workflowA.workspaceId);
    const inspectB = inspectCompany(store, dual.workflowB.workspaceId);
    assert.equal(inspectA.isolation.kind, "application-level");
    assert.equal(inspectA.isolation.notIam, true);
    assert.equal(inspectB.isolation.notIam, true);
    assert.equal(inspectA.isolation.inheritsOtherCompanyKnowledge, false);
    assert.equal(inspectB.isolation.inheritsOtherCompanyEmployees, false);
  });

  test("neither company inherits RidgeLine knowledge, EMP-001, or TPK-001", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const dual = runCheckpoint26Dual(store);
    const a = assertNoRidgelineInheritance(store, dual.workflowA.workspaceId);
    const b = assertNoRidgelineInheritance(store, dual.workflowB.workspaceId);
    assert.equal(a.ok, true, a.issues.join("; "));
    assert.equal(b.ok, true, b.issues.join("; "));
    for (const id of [dual.workflowA.workspaceId, dual.workflowB.workspaceId]) {
      const page = inspectCompany(store, id);
      assert.equal((page.employees || []).some((e) => e.id === "EMP-001"), false);
      assert.equal((page.knowledge || []).some((k) => k.id === "K-STUDIO-OWN-009"), false);
      assert.equal((page.teachingPackets || []).some((p) => p.id === "TPK-001"), false);
      assert.equal(page.approvals.includesApr005, false);
      assert.equal(page.company.servingAtlasVersionId == null || page.company.servingAtlasVersionId === "", true);
    }
    assert.equal(store.getEmployeeRole("EMP-001").workspaceId, "ws-ridgeline");
    assert.equal(store.getTeachingPacket("TPK-001").workspaceId, "ws-ridgeline");
    assert.equal(store.getKnowledge("K-STUDIO-OWN-009").workspaceId, "ws-ridgeline");
  });

  test("restart / FileStore reopen still finds all proof IDs", () => {
    const { dir, store } = tmpStore();
    seedRidgelineBeside(store);
    const dual = runCheckpoint26Dual(store);
    const reopened = reopenAndFindProofIds(dir, dual.proof);
    assert.equal(reopened.ok, true, reopened.missing.join("; "));
    const second = new FileStore(dir);
    assert.ok(second.getWorkspace(dual.workflowA.workspaceId));
    assert.ok(second.getWorkspace(dual.workflowB.workspaceId));
    assert.ok(second.getOpportunitySet(dual.workflowA.opportunitySetId));
    assert.ok(second.getOpportunity(dual.workflowA.selectedOpportunityId));
    assert.ok(second.getTrainingStudioRecord(dual.workflowA.trainingRecordId));
    assert.ok(second.getKnowledgeAssignment(dual.workflowA.trainingAssignmentId));
    assert.ok(second.getObjective(dual.workflowA.workObjectiveId));
    assert.ok(second.getDeliverable(dual.workflowA.deliverableIds[0]));
    assert.ok(second.getTrainingStudioRecord(dual.workflowB.trainingRecordId));
    assert.ok(second.getObjective(dual.workflowB.workObjectiveId));
    assert.ok(second.getDeliverable(dual.workflowB.deliverableIds[0]));
    for (const eid of dual.workflowA.employeeIds.concat(dual.workflowB.employeeIds)) {
      assert.ok(second.getEmployeeRole(eid));
    }
    const proof = second.getWorkflowProof(CHECKPOINT26_PROOF_ID);
    assert.ok(proof);
    assert.equal(proof.workflowA.workspaceId, dual.workflowA.workspaceId);
    assert.equal(proof.workflowB.workspaceId, dual.workflowB.workspaceId);
    const companies = listCompanies(second);
    assert.ok(companies.companies.some((c) => c.id === dual.workflowA.workspaceId));
    assert.ok(companies.companies.some((c) => c.id === dual.workflowB.workspaceId));
    assert.ok(companies.companies.some((c) => c.id === "ws-ridgeline"));
  });

  test("APR-005 stays pending and frozen hashes / FOB-001 are unchanged", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    runCheckpoint26Dual(store);
    const status = frozenAndPendingStatus(store);
    assert.equal(status.apr005.status, "pending");
    assert.equal(status.apr005.objectId, "TPK-001");
    assert.equal(status.apr005.decided, false);
    assert.equal(status.tpk001.status, "awaiting_owner_approval");
    assert.equal(status.tpk001.applied, false);
    assert.equal(status.emp001.status, "development_verified");
    assert.equal(status.emp001.versionId, "offer_strategist-ws-ridgeline-v0");
    assert.equal(status.emp001.workspaceId, "ws-ridgeline");
    assert.equal(status.fob001.contentHash, "8b5c64f980d333db712795d904c529f17c4baa8522a1d218e166a9a878f86218");
    assert.equal(status.servingAtlas, "atlas-v15");
    assert.equal(status.frozenHashesUnchanged, true);
    const hashes = frozenHashCheck(store);
    for (const [id, row] of Object.entries(hashes)) {
      assert.equal(row.mutated, false, "hash mutated: " + id);
      if (row.actual) assert.equal(row.actual, row.expected, "hash drift " + id);
    }
    assert.equal(hashes["offer_strategist-ws-ridgeline-v0"].expected, "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce");
    const approvals = productApprovals(store, {});
    assert.equal(approvals.apr005.status, "pending");
    assert.equal(approvals.apr005.decided, false);
  });

  test("no invented TAM/demand/customers and hypotheses stay labeled", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const dual = runCheckpoint26Dual(store);
    const blob = JSON.stringify(dual);
    assert.equal(scanInventedMarket(blob).length, 0);
    assert.equal(dual.inventedMarketHits, 0);
    assert.equal(/proven demand|strong demand|high demand/i.test(blob), false);
    assert.equal(/customers will pay/i.test(blob), false);
    assert.equal(/conversion rate of/i.test(blob), false);
    assert.equal(/expected revenue \$/i.test(blob), false);
    for (const oid of dual.workflowA.opportunityIds.concat(dual.workflowB.opportunityIds)) {
      const opp = store.getOpportunity(oid);
      assert.equal(opp.nameClaimClass, "model_generated_hypothesis");
      assert.equal(opp.invented.tam, false);
      assert.equal(opp.invented.demand, false);
      assert.equal(opp.invented.conversion, false);
      assert.equal(opp.invented.expectedRevenue, false);
    }
  });

  test("no live provider calls", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const dual = runCheckpoint26Dual(store);
    assert.equal(dual.liveProviderCalls, 0);
    assert.equal(dual.honesty.liveProviderCall, false);
    assert.equal(dual.workflowA.liveProviderCall, false);
    assert.equal(dual.workflowB.liveProviderCall, false);
    const workA = store.getObjective(dual.workflowA.workObjectiveId);
    const workB = store.getObjective(dual.workflowB.workObjectiveId);
    assert.equal(workA.liveProviderCall, false);
    assert.equal(workB.liveProviderCall, false);
    assert.equal(/ensureLiveProvider|OpenAIResponsesProvider/.test(CP), false);
  });

  test("owner can find both proof companies in Overview, Companies, and Workflow proof", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const dual = runCheckpoint26Dual(store);
    const companies = listCompanies(store);
    const a = companies.companies.find((c) => c.id === dual.workflowA.workspaceId);
    const b = companies.companies.find((c) => c.id === dual.workflowB.workspaceId);
    assert.ok(a);
    assert.ok(b);
    assert.equal(a.productProof, true);
    assert.equal(b.productProof, true);
    const overview = productOverview(store, {});
    assert.ok(overview.workflowProof);
    assert.ok(overview.workflowProof.companies.some((c) => c.id === dual.workflowA.workspaceId));
    assert.ok(overview.workflowProof.companies.some((c) => c.id === dual.workflowB.workspaceId));
    assert.match(String(overview.workflowProof.isolation.kind || overview.workflowProof.note), /application-level/);
    const page = dispatchProductRequest(store, "GET", "/app/workflow-proof", {}, {});
    assert.equal(page.built, true);
    assert.ok(page.proofs.some((p) => p.id === CHECKPOINT26_PROOF_ID));
    const inspectA = inspectCompany(store, dual.workflowA.workspaceId);
    assert.equal(inspectA.company.productProof, true);
    assert.ok(inspectA.deliverables.length >= 1);
    const inspectB = inspectCompany(store, dual.workflowB.workspaceId);
    assert.equal(inspectB.company.productProof, true);
    assert.ok(inspectB.deliverables.length >= 1);
    const view = workflowProofView(store);
    assert.equal(view.companies.length >= 2, true);
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
    const liveApprovals = productApprovals(store, {});
    assert.equal(liveApprovals.apr005.status, "pending");
    assert.equal(liveApprovals.apr005.decided, false);
  });
});
