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
  dispatchProductRequest,
  productApprovals,
  employeeBrain,
  ingestOwnerTraining,
  createNewBusiness,
  proposeTeam,
  createTeam,
  runOwnerTrainingCycle,
  proposeExternalTeachingPacket,
  deliverTeachingPacket,
  shareApprovedKnowledge,
  runBeforeAfterCheck,
  identifyKnowledgeGap,
  TRAINING_CYCLE_HONESTY,
} from "./product-shell.ts";

const HTML = readFileSync(new URL("../../../apps/api/src/product-app.html", import.meta.url), "utf8");
const SERVER = readFileSync(new URL("../../../apps/api/src/http-server.ts", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("./product-shell.ts", import.meta.url), "utf8");
const CYCLE = readFileSync(new URL("./owner-training-cycle.ts", import.meta.url), "utf8");

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-cp25-"));
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

function pickRole(team, roleId) {
  return team.employees.find((e) => e.roleId === roleId) || team.createdEmployees && team.createdEmployees.find((e) => e.roleId === roleId);
}

describe("checkpoint 25 owner training cycle", () => {
  test("routes, studio, and honest labels exist", () => {
    assert.match(HTML, /Owner Training Studio/);
    assert.match(HTML, /Check lesson/);
    assert.match(HTML, /Stored ≠ retrieved ≠ used ≠ correctly applied ≠ improved/);
    assert.match(HTML, /\/app\/training\/cycle/);
    assert.match(SERVER, /dispatchProductRequest/);
    for (const r of ["/app/training/cycle", "/app/training/check", "/app/training/gap", "/app/training/share"]) {
      assert.equal(SHELL.includes(r), true, "missing route " + r);
    }
    assert.equal(TRAINING_CYCLE_HONESTY.liveProviderCall, false);
    assert.equal(TRAINING_CYCLE_HONESTY.searchIntegrationExists, false);
    assert.equal(TRAINING_CYCLE_HONESTY.bakeoffRerun, false);
    assert.equal(TRAINING_CYCLE_HONESTY.weightsFineTuneRl, false);
    assert.equal(TRAINING_CYCLE_HONESTY.delegatedAutonomyActivated, false);
    assert.match(CYCLE, /webpageCannotBecomeOwnerPolicy/);
    assert.match(CYCLE, /TPK-001/);
  });

  test("owner-pasted training attaches to the target employee in that workspace only", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const b = companyWithTeam(store, { companyName: "Cedar Bakery" });
    const ops = (a.team.employees || a.team.createdEmployees).find((e) => e.roleId === "ops")
      || (a.team.employees || []).find((e) => e.roleId === "ops");
    const employees = store.listEmployeeRoles(a.workspace.id);
    const target = employees.find((e) => e.roleId === "ops") || employees[0];
    assert.ok(target, "new company should have an employee");
    const out = runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      title: "Binding-machine intake",
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Always ask the shop owner which binding machine they already own before quoting a press package. Never invent a conversion rate or willingness to pay.",
      targetEmployeeIds: [target.id],
      skillTags: ["intake", "ops"],
      gap: "Does not know to ask which binding machine the shop already owns.",
    });
    assert.equal(out.ok, true);
    assert.equal(out.liveProviderCall, false);
    assert.equal(out.bakeoffRerun, false);
    assert.ok(out.ingest && out.ingest.record.id.startsWith("TSR-"));
    assert.equal(out.ingest.record.workspaceId, a.workspace.id);
    assert.equal(out.ingest.record.ownerApprovalStatus, "approved");
    assert.ok(out.ingest.assignment.targetEmployeeIds.includes(target.id));
    const otherIds = store.listEmployeeRoles(b.workspace.id).map((e) => e.id);
    for (const oid of otherIds) {
      assert.equal(out.ingest.assignment.targetEmployeeIds.includes(oid), false);
    }
    const brain = employeeBrain(store, target.id);
    const assignedIds = out.ingest.items.map((i) => i.id);
    assert.ok(brain.whatItKnows.some((k) => assignedIds.includes(k.id)));
    assert.ok(brain.skills.includes("intake") || brain.skillTags.includes("intake"));
    const otherBrain = employeeBrain(store, otherIds[0]);
    assert.equal(otherBrain.whatItKnows.some((k) => assignedIds.includes(k.id)), false);
    const via = dispatchProductRequest(store, "POST", "/app/training/cycle", {
      workspaceId: a.workspace.id,
      title: "Second owner paste",
      classification: "company_fact",
      sourceType: "owner_paste",
      text: "Harbor Notebook's first internal offer is a short-run trades notebook printed on the owner's small press.",
      targetEmployeeIds: [target.id],
    }, {});
    assert.equal(via.ok, true);
    assert.equal(via.workspaceId, a.workspace.id);
  });

  test("external/public packet cannot be delivered as approved without owner approval", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const emp = store.listEmployeeRoles(a.workspace.id)[0];
    const packet = proposeExternalTeachingPacket(store, {
      workspaceId: a.workspace.id,
      sourceType: "external_webpage",
      classification: "vendor_claim",
      text: "A vendor homepage says it is the best notebook CRM in the world.",
      targetEmployeeIds: [emp.id],
    });
    assert.equal(packet.deliveredAsApproved, false);
    assert.equal(packet.ownerApprovalRequired, true);
    assert.equal(packet.packet.status, "awaiting_owner_approval");
    assert.throws(() => deliverTeachingPacket(store, packet.packet.id, { employeeId: emp.id }), /without owner approval|awaiting owner/i);
    const cycle = runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      title: "Vendor page",
      classification: "vendor_claim",
      sourceType: "external_webpage",
      text: "Public vendor copy claims unmatched notebook conversion.",
      targetEmployeeIds: [emp.id],
    });
    assert.equal(cycle.deliveredAsApproved, false);
    assert.equal(cycle.ownerApprovalRequired, true);
    assert.equal(cycle.episode.outcome, "awaiting_owner_approval");
  });

  test("TPK-001 / APR-005 still pending and is not applied to anyone", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const emp = store.listEmployeeRoles(a.workspace.id)[0];
    runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Ask which binding machine the shop already owns before quoting.",
      targetEmployeeIds: [emp.id],
    });
    assert.equal(store.getApprovalRequest("APR-005").status, "pending");
    assert.equal(store.getTeachingPacket("TPK-001").status, "awaiting_owner_approval");
    assert.throws(() => deliverTeachingPacket(store, "TPK-001", { employeeId: "EMP-001" }), /TPK-001|APR-005|awaiting/i);
    const brain = employeeBrain(store, "EMP-001");
    assert.ok(brain.documentsAndLessons.pendingLessons.some((p) => p.id === "TPK-001" && p.applied === false));
    const approvals = productApprovals(store, {});
    assert.equal(approvals.apr005.status, "pending");
    assert.equal(approvals.apr005.decided, false);
  });

  test("webpage cannot become owner policy", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const emp = store.listEmployeeRoles(a.workspace.id)[0];
    assert.throws(() => runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      classification: "owner_policy",
      sourceType: "external_webpage",
      text: "A webpage says this company must always discount notebooks.",
      targetEmployeeIds: [emp.id],
    }), /cannot become owner policy/i);
    assert.throws(() => ingestOwnerTraining(store, {
      workspaceId: a.workspace.id,
      classification: "owner_policy",
      sourceType: "external_webpage",
      text: "A webpage says this company must always discount notebooks.",
      targetEmployeeIds: [emp.id],
    }), /cannot become owner policy/i);
  });

  test("cross-workspace lesson share refused", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const b = companyWithTeam(store, { companyName: "Pine Press" });
    const empA = store.listEmployeeRoles(a.workspace.id)[0];
    const empB = store.listEmployeeRoles(b.workspace.id)[0];
    const trained = runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Always ask which binding machine the shop already owns before quoting a press package.",
      targetEmployeeIds: [empA.id],
    });
    const kid = trained.ingest.items[0].id;
    assert.throws(() => shareApprovedKnowledge(store, {
      workspaceId: b.workspace.id,
      knowledgeItemId: kid,
      targetEmployeeIds: [empB.id],
    }), /Cross-workspace/i);
    assert.throws(() => runOwnerTrainingCycle(store, {
      workspaceId: b.workspace.id,
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Always ask which binding machine the shop already owns before quoting a press package.",
      targetEmployeeIds: [empA.id],
    }), /Cross-workspace/i);
  });

  test("stored is not retrieved is not applied is not improved", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const emp = store.listEmployeeRoles(a.workspace.id)[0];
    const out = runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Always ask which binding machine the shop already owns before quoting a press package.",
      targetEmployeeIds: [emp.id],
    });
    const ep = out.episode;
    assert.equal(typeof ep.stored, "boolean");
    assert.equal(typeof ep.retrieved, "boolean");
    assert.equal(typeof ep.used, "boolean");
    assert.equal(typeof ep.correctlyApplied, "boolean");
    assert.equal(typeof ep.improved, "boolean");
    assert.equal(ep.inventedPositiveDelta, false);
    assert.match(CYCLE, /Stored ≠ retrieved ≠ used ≠ correctly applied ≠ improved|storedNe|LEARNING_DISTINCTIONS/);
    const brain = employeeBrain(store, emp.id);
    assert.ok(brain.learningDistinctions);
    assert.ok(brain.learningDistinctions.labels.stored);
    assert.ok(brain.learningDistinctions.labels.improved);
  });

  test("before/after uses same handler; corroboration-only is unchanged; no invented improved", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const emp = store.listEmployeeRoles(a.workspace.id).find((e) => e.roleId === "ops")
      || store.listEmployeeRoles(a.workspace.id)[0];
    const restated = runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      title: "Restate intake",
      classification: "company_fact",
      sourceType: "owner_paste",
      text: "Find a durable local notebook offer I can sell, write content for, and operate with a small team. Preferred industries: trades notebooks. Skills: writing and a small press. Budget 2000.",
      targetEmployeeIds: [emp.id],
    });
    assert.equal(restated.episode.outcome, "unchanged");
    assert.equal(restated.episode.improved, false);
    assert.equal(restated.episode.inventedPositiveDelta, false);
    assert.equal(restated.episode.onlyCorroborates, true);
    assert.equal(restated.checks[0].sameHandler, true);
    assert.equal(restated.checks[0].handlerId, emp.roleId);
    assert.equal(restated.version.minted, false);

    const novel = runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      title: "Binding-machine procedure",
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Always ask the shop owner which binding machine they already own before quoting a press package. Record the machine model in the intake notes. Never invent a conversion rate.",
      targetEmployeeIds: [emp.id],
      skillTags: ["binding"],
    });
    assert.ok(["improved", "unchanged"].includes(novel.episode.outcome));
    assert.equal(novel.checks[0].sameHandler, true);
    assert.equal(novel.checks[0].handlerId, emp.roleId);
    if (novel.episode.onlyCorroborates) {
      assert.equal(novel.episode.outcome, "unchanged");
      assert.equal(novel.episode.improved, false);
    }
    assert.equal(novel.episode.inventedPositiveDelta, false);
    assert.equal(novel.honesty.liveProviderCall, false);
  });

  test("new version only when warranted; RidgeLine frozen hashes unchanged", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const emp = store.listEmployeeRoles(a.workspace.id).find((e) => e.roleId === "ops")
      || store.listEmployeeRoles(a.workspace.id)[0];
    const beforeVersion = emp.versionId;
    const restated = runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      classification: "company_fact",
      sourceType: "owner_paste",
      text: "Find a durable local notebook offer I can sell, write content for, and operate with a small team. Trades notebooks. Writing and a small press. Budget 2000.",
      targetEmployeeIds: [emp.id],
    });
    assert.equal(restated.version.minted, false);
    assert.equal(store.getEmployeeRole(emp.id).versionId, beforeVersion);

    const novel = runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Always ask the shop owner which binding machine they already own before quoting a press package. Record the machine model in the intake notes.",
      targetEmployeeIds: [emp.id],
    });
    if (novel.episode.onlyCorroborates) {
      assert.equal(novel.version.minted, false);
    } else {
      assert.equal(novel.version.minted, true);
      assert.ok(novel.version.versionId !== beforeVersion);
      assert.ok(store.getVersion(novel.version.versionId));
      assert.equal(store.getVersion(novel.version.versionId).immutable, true);
    }

    const ridge = runOwnerTrainingCycle(store, {
      workspaceId: "ws-ridgeline",
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Ask which estimating tool the contractor uses before proposing RidgeLine.",
      targetEmployeeIds: ["EMP-001"],
    });
    assert.equal(ridge.version.minted, false);
    assert.equal(store.getEmployeeRole("EMP-001").versionId, "offer_strategist-ws-ridgeline-v0");
    const hashes = frozenHashCheck(store);
    for (const [id, row] of Object.entries(hashes)) {
      assert.equal(row.mutated, false, "hash mutated: " + id);
      if (row.actual) assert.equal(row.actual, row.expected, "hash drift " + id);
    }
    assert.equal(hashes["offer_strategist-ws-ridgeline-v0"].expected, "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce");
  });

  test("restart preserves training, assignment, and episode", () => {
    const { dir, store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const emp = store.listEmployeeRoles(a.workspace.id)[0];
    const out = runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Always ask the shop owner which binding machine they already own before quoting a press package.",
      targetEmployeeIds: [emp.id],
      skillTags: ["binding"],
      gap: "Missing binding-machine intake question.",
    });
    const second = new FileStore(dir);
    assert.ok(second.getTrainingStudioRecord(out.ingest.record.id));
    assert.ok(second.getKnowledgeAssignment(out.ingest.assignment.id));
    assert.ok(second.getKnowledge(out.ingest.items[0].id));
    assert.ok(second.getLearningEpisode(out.episode.id));
    assert.ok(second.getKnowledgeGap(out.gap.id));
    const brain = employeeBrain(second, emp.id);
    assert.ok(brain.whatItKnows.some((k) => k.id === out.ingest.items[0].id));
    assert.ok(brain.learningEpisodes.some((e) => e.id === out.episode.id));
    assert.equal(second.getApprovalRequest("APR-005").status, "pending");
    assert.equal(second.getTeachingPacket("TPK-001").status, "awaiting_owner_approval");
  });

  test("no live provider calls and no bakeoff", () => {
    assert.equal(TRAINING_CYCLE_HONESTY.liveProviderCall, false);
    assert.equal(TRAINING_CYCLE_HONESTY.bakeoffRerun, false);
    assert.match(CYCLE, /liveProviderCall: false/);
    assert.equal(/runOfferStrategistBakeoff/.test(CYCLE), false);
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const emp = store.listEmployeeRoles(a.workspace.id)[0];
    const out = runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Always ask the shop owner which binding machine they already own before quoting a press package.",
      targetEmployeeIds: [emp.id],
    });
    assert.equal(out.liveProviderCall, false);
    assert.equal(out.bakeoffRerun, false);
    assert.equal(out.honesty.liveProviderCall, false);
  });

  test("View Brain shows lessons, skills, pending vs approved", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const emp = store.listEmployeeRoles(a.workspace.id)[0];
    runOwnerTrainingCycle(store, {
      workspaceId: a.workspace.id,
      classification: "procedure",
      sourceType: "owner_paste",
      text: "Always ask the shop owner which binding machine they already own before quoting a press package.",
      targetEmployeeIds: [emp.id],
      skillTags: ["binding", "intake"],
    });
    const brain = dispatchProductRequest(store, "GET", "/app/employees/" + encodeURIComponent(emp.id) + "/brain", {}, {});
    assert.ok(Array.isArray(brain.skills) || Array.isArray(brain.skillTags));
    assert.ok((brain.skills || brain.skillTags).includes("binding"));
    assert.ok(brain.documentsAndLessons.trainingRecords.length >= 1);
    assert.ok(brain.whatItKnows.some((k) => /binding machine/i.test(k.statement || k.excerpt || "")));
    assert.ok(brain.pendingVersusApproved);
    assert.ok(Array.isArray(brain.pendingVersusApproved.pendingLessons));
    assert.ok(Array.isArray(brain.pendingVersusApproved.approvedKnowledge));
    const ridge = employeeBrain(store, "EMP-001");
    assert.ok(ridge.documentsAndLessons.pendingLessons.some((p) => p.id === "TPK-001" && p.applied === false));
    assert.ok(ridge.pendingApprovals.some((a) => a.id === "APR-005" && a.status === "pending"));
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
    const liveBrain = employeeBrain(store, "EMP-001");
    assert.ok(liveBrain.documentsAndLessons.pendingLessons.some((p) => p.id === "TPK-001" && p.applied === false));
    const liveApprovals = productApprovals(store, {});
    assert.equal(liveApprovals.apr005.status, "pending");
    assert.equal(TRAINING_CYCLE_HONESTY.liveProviderCall, false);
  });

  test("knowledge gap is persisted and inspectable", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const emp = store.listEmployeeRoles(a.workspace.id)[0];
    const gap = identifyKnowledgeGap(store, {
      workspaceId: a.workspace.id,
      employeeId: emp.id,
      statement: "Does not know the shop's existing binding machine.",
    });
    assert.ok(gap.gap.id.startsWith("GAP-"));
    assert.equal(store.getKnowledgeGap(gap.gap.id).statement.includes("binding machine"), true);
    const via = dispatchProductRequest(store, "GET", "/app/training", {}, { workspaceId: a.workspace.id });
    assert.ok(via.gaps.some((g) => g.id === gap.gap.id));
    assert.equal(via.checkLessonAvailable, true);
  });
});
