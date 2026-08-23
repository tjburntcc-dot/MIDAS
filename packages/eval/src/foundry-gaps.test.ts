import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, createStore } from "@midas/db";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { frozenHashCheck } from "./founder-opportunity-brief.ts";
import {
  createNewBusiness,
  createExistingBusiness,
  generateOpportunities,
  compareOpportunities,
  saveOpportunity,
  rejectOpportunity,
  createCompanyFromOpportunity,
  proposeTeam,
  createTeam,
  runEmployeeTask,
  submitProductObjective,
  inspectProductWork,
  employeeBrain,
  dispatchProductRequest,
  teachPeerFromFinding,
  productApprovals,
} from "./product-shell.ts";
import {
  REQUIRED_OPPORTUNITY_FIELDS,
  COMPARISON_DIMENSIONS,
  GROWTH_OPPORTUNITY_TYPES,
  OPPORTUNITY_CLAIM_CLASSES,
} from "./opportunity-scout.ts";
import { TASK_STATES, interpretObjective, runProductWork } from "./generalized-conductor.ts";
import { KIND_TO_DELIVERABLE_TYPES, DELIVERABLE_TYPES } from "./deliverables.ts";
import { persistProductWatcherReview } from "./checkpoint26.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-gaps-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  return { dir, store: new FileStore(dir) };
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
  store.putTeachingPacket({
    id: "TPK-001",
    workspaceId: "ws-ridgeline",
    status: "awaiting_owner_approval",
    recipientEmployeeId: "EMP-001",
    recipientRoleId: "offer_strategist",
    title: "Roofr public copy",
  });
  store.putApprovalRequest({
    id: "APR-005",
    workspaceId: "ws-ridgeline",
    kind: "teaching_packet",
    objectType: "teaching_packet",
    objectId: "TPK-001",
    status: "pending",
    requireLocalOwner: true,
    actorRequired: ["local_owner"],
    createdAt: "2026-08-21T21:30:07.237Z",
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

function companyWithTeam(store, extra) {
  const created = createNewBusiness(store, {
    companyName: (extra && extra.companyName) || "Gap Shop",
    ownerObjective: (extra && extra.ownerObjective) || "Operate a neighborhood repair desk with a small team.",
    budget: "800",
    preferredIndustries: "home services",
    availableSkillsAndResources: "hand tools",
    geographicConstraints: "one neighborhood",
  });
  const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
  const team = authorize(store, proposed.proposal.id, extra && extra.create);
  return { workspace: created.workspace, team: team, proposed: proposed };
}

describe("foundry gap fill CP21-26", () => {
  test("opportunity extra fields, claim classes, comparison dimensions, save/reject", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const out = generateOpportunities(store, {
      ownerObjective: "Start a small neighborhood bicycle repair shop.",
      budget: "2500",
      preferredIndustries: "local bicycle repair",
      availableSkillsAndResources: "hand tools",
      geographicConstraints: "one Midwestern neighborhood",
    });
    assert.ok(out.opportunities.length >= 3);
    for (const cls of ["owner_provided_fact", "public_source_observation", "vendor_stated_claim", "independent_sourced_fact", "estimate", "unknown", "model_generated_hypothesis"]) {
      assert.ok(OPPORTUNITY_CLAIM_CLASSES.includes(cls), "missing claim class " + cls);
    }
    for (const opp of out.opportunities) {
      for (const field of REQUIRED_OPPORTUNITY_FIELDS) {
        assert.ok(opp[field] != null, "missing " + field);
      }
      assert.ok(opp.comparisonDimensions);
      for (const dim of COMPARISON_DIMENSIONS) {
        assert.ok(opp.comparisonDimensions[dim] != null, "missing dimension " + dim);
      }
      assert.equal(opp.comparisonDimensions.decisionAidOnly, true);
      assert.equal(opp.startupCostEstimate.estimateOrigin, "owner_provided");
      assert.ok(opp.startupCostEstimate.whatWouldValidate);
      assert.equal(opp.selected, false);
    }
    const saved = saveOpportunity(store, out.opportunities[0].id);
    assert.equal(saved.opportunity.saved, true);
    assert.equal(saved.opportunity.selected, true);
    assert.equal(store.getOpportunitySet(out.set.id).selectedOpportunityId, out.opportunities[0].id);
    const rejected = rejectOpportunity(store, out.opportunities[1].id);
    assert.equal(rejected.opportunity.rejected, true);
    const cmp = compareOpportunities(store, out.opportunities.slice(0, 2).map((o) => o.id));
    assert.ok(cmp.dimensions.some((d) => d.field === "ownerFit"));
    const via = dispatchProductRequest(store, "POST", "/app/opportunities/" + out.opportunities[2].id + "/save", {}, {});
    assert.equal(via.opportunity.saved, true);
  });

  test("existing-business growth types and insufficient-info honesty", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const enough = createExistingBusiness(store, {
      companyName: "Maple Street Bakery",
      businessDescription: "Neighborhood bakery selling bread and cakes.",
      existingOffer: "Sourdough loaves and custom cakes.",
      customerProfile: "Walk-in neighbors.",
      currentChallenges: "Morning rush outgrows the two-person staff.",
      goals: "Keep quality while adding one oven-day.",
    });
    const gen = generateOpportunities(store, { workspaceId: enough.workspace.id });
    assert.ok(gen.opportunities.length >= 3);
    const types = gen.opportunities.map((o) => o.growthType).filter(Boolean);
    for (const need of ["offer_improvements", "positioning", "ops_inefficiencies"]) {
      assert.ok(types.includes(need), "missing growth type " + need);
    }
    assert.ok(GROWTH_OPPORTUNITY_TYPES.every((x) => typeof x === "string"));
    const thin = createExistingBusiness(store, { companyName: "Thin Co", goals: "Stay open." });
    const thinGen = generateOpportunities(store, { workspaceId: thin.workspace.id });
    assert.ok(thinGen.sufficiency);
    assert.equal(thinGen.sufficiency.enough, false);
    assert.ok(thinGen.sufficiency.missing.length >= 1);
    assert.ok(thinGen.opportunities.length >= 3);
  });

  test("finance worksheet, deny individual roles, extra employee fields", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Harbor Notebook",
      ownerObjective: "Sell a simple field notebook to tradespeople.",
      budget: "800",
    });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    assert.ok(proposed.proposal.compositionHypothesis);
    assert.equal(proposed.proposal.compositionHypothesis.label, "initial team hypothesis");
    const denyId = proposed.proposal.selectedRoleIds.find((id) => id !== "workflow_manager" && id !== "independent_audit") || proposed.proposal.selectedRoleIds[0];
    const out = authorize(store, proposed.proposal.id, { deniedRoleIds: [denyId] });
    assert.equal(out.employees.some((e) => e.roleId === denyId), false);
    assert.ok(out.proposal.deniedRoleIds.includes(denyId));
    for (const emp of out.employees) {
      assert.ok(Array.isArray(emp.allowedTaskTypes));
      assert.ok(Array.isArray(emp.allowedSources));
      assert.equal(emp.approvalStatus, "owner_authorized");
      assert.equal(emp.developmentStatus, "implemented_basic");
      assert.equal(emp.selfHiring, false);
      const task = runEmployeeTask(store, emp.id, { input: "Write a labeled internal note.", taskKind: emp.roleId === "finance" ? "unit_economics" : "supervised_internal" });
      assert.equal(task.liveProviderCall, false);
      if (emp.roleId === "finance") {
        const ws = task.task.output;
        assert.ok(ws.knownCosts);
        assert.ok(ws.assumptions);
        assert.equal(ws.inventedProfitability, false);
      }
    }
  });

  test("work task states, resume does not duplicate, extra kinds, restricted publish", () => {
    for (const s of ["queued", "running", "awaiting_owner_approval", "completed", "failed", "blocked", "skipped", "canceled"]) {
      assert.ok(TASK_STATES.includes(s));
    }
    assert.equal(interpretObjective("Evaluate whether the selected opportunity fits the owner facts.").kind, "evaluate_fit");
    assert.equal(interpretObjective("Create a team for this company.").kind, "create_team");
    assert.equal(interpretObjective("Train marketing then draft positioning from the owner-pasted lesson.").kind, "train_then_position");
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const create = submitProductObjective(store, { workspaceId: a.workspace.id, ownerText: "Create a team for this company." });
    assert.equal(create.ok, false);
    assert.equal(create.code, "USE_TEAMS");
    const work = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Build an initial offer and positioning strategy for this company.",
    });
    const firstIds = work.tasks.map((t) => t.id).sort();
    const completed = work.tasks.filter((t) => t.status === "completed").length;
    assert.ok(completed >= 1);
    assert.ok(work.tasks.every((t) => TASK_STATES.includes(t.status)));
    const again = runProductWork(store, work.objective.id);
    const againIds = again.tasks.map((t) => t.id).sort();
    assert.deepEqual(againIds, firstIds);
    assert.equal(again.tasks.filter((t) => t.status === "completed").length, completed);
    const pub = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Publish this landing page and go live.",
    });
    assert.ok(pub.approvals && pub.approvals.length >= 1);
    assert.ok(pub.tasks.some((t) => t.status === "awaiting_owner_approval" || t.type === "publish"));
  });

  test("one objective produces at least 3 deliverable types including marketing and product when asked", () => {
    for (const [kind, types] of Object.entries(KIND_TO_DELIVERABLE_TYPES)) {
      assert.ok(types.length >= 3, kind + " has " + types.length);
    }
    assert.ok(DELIVERABLE_TYPES.includes("founder_opportunity_brief"));
    assert.ok(DELIVERABLE_TYPES.includes("risk_register"));
    assert.ok(DELIVERABLE_TYPES.includes("validation_plan"));
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store, {
      ownerObjective: "I want a software landing page for the shop I can operate with a small team.",
    });
    const work = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    });
    const types = work.deliverables.map((d) => d.type);
    assert.ok(new Set(types).size >= 3);
    assert.ok(work.deliverables.every((d) => d.draft !== false));
    const roles = work.deliverables.map((d) => d.createdByRoleId);
    assert.ok(roles.includes("marketing") || types.includes("marketing_copy_draft") || types.includes("landing_page_copy"));
    if (a.team.employees.some((e) => e.roleId === "product")) {
      assert.ok(roles.includes("product") || types.includes("product_requirements") || types.includes("feature_roadmap"));
    }
  });

  test("work retrieves owner-pasted material, brain shows it, peer teaching stays in workspace", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    const ops = a.team.employees.find((e) => e.roleId === "ops") || a.team.employees[0];
    store.putKnowledge({
      id: "K-PASTE-001",
      workspaceId: a.workspace.id,
      statement: "Always ask which bicycle the customer already owns before quoting.",
      classification: "procedure",
      sourceType: "owner_paste",
      accepted: true,
      reviewStatus: "approved",
    });
    const work = submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Build an initial offer and positioning strategy for this company.",
    });
    const withTrace = work.tasks.filter((t) => t.retrievalTrace);
    assert.ok(withTrace.length >= 1);
    const blob = JSON.stringify(withTrace);
    assert.equal(blob.includes("K-PASTE-001") || blob.includes("bicycle"), true);
    const brain = employeeBrain(store, ops.id);
    assert.ok(brain.retrievedOnRecentTask);
    assert.equal(brain.weightsFineTuneRl, false);
    store.putTeachingFinding({
      id: "TFN-GAP-001",
      workspaceId: a.workspace.id,
      type: "observed_product_feature",
      classification: "company_fact",
      claim: "Same-day flats are the owner's stated first offer.",
      excerpt: "Same-day flats are the owner's stated first offer.",
      sourceId: "K-PASTE-001",
    });
    const marketing = a.team.employees.find((e) => e.roleId === "marketing");
    const product = a.team.employees.find((e) => e.roleId === "product");
    const peer = teachPeerFromFinding(store, {
      workspaceId: a.workspace.id,
      findingId: "TFN-GAP-001",
      authorized: true,
      recipientRoleId: marketing ? "marketing" : (product ? "product" : ops.roleId),
    });
    assert.equal(peer.ok, true);
    assert.equal(peer.recipient.workspaceId, a.workspace.id);
    assert.notEqual(peer.packet.id, "TPK-001");
    const gaps = (store.listKnowledgeGaps && store.listKnowledgeGaps(a.workspace.id)) || [];
    assert.ok(Array.isArray(gaps));
  });

  test("Demo A watcher review can be persisted without inventing a better outcome", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const a = companyWithTeam(store);
    submitProductObjective(store, {
      workspaceId: a.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    });
    const review = persistProductWatcherReview(store, a.workspace.id, {});
    assert.equal(review.ok, true);
    assert.ok(store.getWatcherAudit && store.getWatcherAudit(review.audit.id));
    assert.equal(review.audit.workspaceId, a.workspace.id);
    assert.equal(review.audit.liveProviderCall, false);
    assert.match(String(review.audit.note), /not a better business outcome/i);
  });

  test("APR-005 still pending and frozen hashes unchanged", () => {
    const store = createStore();
    const apr = store.getApprovalRequest("APR-005");
    assert.ok(apr);
    assert.equal(apr.status, "pending");
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
    const live = productApprovals(store, {});
    assert.equal(live.apr005.status, "pending");
  });
});
