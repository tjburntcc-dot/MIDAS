import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import { createNewBusiness, createTeam, proposeTeam, proposeAdditionalSeats } from "./product-shell.ts";
import {
  curatedHarborLibraryLessons,
  classifyEvidenceClass,
  ownerPolicyCheckFromWebpage,
  persistClassifiedHarborLessons,
  createHarborTeachingPackets,
  runHarborMarketingBeforeAfter,
  portfolioHarborFinchCedarCompare,
  runTeachRetrieveHarbor,
  HARBOR_WORKSPACE_ID,
  EVIDENCE_CLASSES,
} from "./teach-retrieve.ts";
import { runEmployeeTask } from "./team-generator.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-tr-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  mkdirSync(join(dir, "curriculum"), { recursive: true });
  return { dir, store: new FileStore(dir) };
}

function seedHarborWithMarketing(store) {
  const created = createNewBusiness(store, {
    companyName: "Harbor Oak Music Lessons",
    ownerObjective: "Start a neighborhood after-school piano and guitar studio near West Asheville library. Need marketing copy.",
    budget: "$1800",
    availableSkillsAndResources: "piano teaching, copywriting",
    preferredIndustries: "music lessons",
    geographicConstraints: "West Asheville NC",
  });
  const minted = created.workspace.id;
  const ws = store.getWorkspace(minted);
  store.putWorkspace({ ...ws, id: HARBOR_WORKSPACE_ID, name: "Harbor Oak Music Lessons", goal: ws.goal || created.workspace.goal });
  // Move any employees minted on the temporary workspace id onto Harbor id
  for (const e of (store.listEmployeeRoles && store.listEmployeeRoles(minted)) || []) {
    store.putEmployeeRole({ ...e, workspaceId: HARBOR_WORKSPACE_ID });
  }
  let proposal = null;
  if (created.teamProposalId && store.getTeamProposal(created.teamProposalId)) {
    proposal = store.getTeamProposal(created.teamProposalId);
    // rewrite proposal workspace
    store.putTeamProposal({ ...proposal, workspaceId: HARBOR_WORKSPACE_ID });
    proposal = store.getTeamProposal(created.teamProposalId);
  } else {
    proposal = proposeTeam(store, { workspaceId: HARBOR_WORKSPACE_ID }).proposal;
  }
  let team = createTeam(store, {
    proposalId: proposal.id,
    actor: "local_owner",
    confirm: "Create this team",
    authorized: true,
    createThisTeam: true,
  });
  let employees = ((store.listEmployeeRoles && store.listEmployeeRoles(HARBOR_WORKSPACE_ID)) || []).filter((e) => e.workspaceId === HARBOR_WORKSPACE_ID);
  let marketing = employees.find((e) => e.roleId === "marketing");
  if (!marketing) {
    const extra = proposeAdditionalSeats(store, { workspaceId: HARBOR_WORKSPACE_ID, roleIds: ["marketing", "product", "business_research"] });
    team = createTeam(store, {
      proposalId: extra.proposal.id,
      actor: "local_owner",
      confirm: "Create this team",
      authorized: true,
      createThisTeam: true,
    });
    employees = ((store.listEmployeeRoles && store.listEmployeeRoles(HARBOR_WORKSPACE_ID)) || []).filter((e) => e.workspaceId === HARBOR_WORKSPACE_ID);
    marketing = employees.find((e) => e.roleId === "marketing");
  }
  return { marketing, workspaceId: HARBOR_WORKSPACE_ID, team, employees };
}

describe("teach-retrieve evidence classes", () => {
  test("curated lessons separate vendor_says / independent_source / employee_inference", () => {
    const lessons = curatedHarborLibraryLessons();
    assert.ok(lessons.some((l) => l.evidenceClass === "independent_source"));
    assert.ok(lessons.some((l) => l.evidenceClass === "vendor_says"));
    assert.ok(lessons.some((l) => l.evidenceClass === "employee_inference"));
    assert.ok(!lessons.some((l) => l.evidenceClass === "owner_policy"));
    assert.equal(classifyEvidenceClass({ url: "https://www.trumba.com/calendars/x" }), "vendor_says");
    const check = ownerPolicyCheckFromWebpage({ evidenceClass: "independent_source" });
    assert.equal(check.becameOwnerPolicy, false);
    assert.equal(check.webpageCannotCreateOwnerPolicy, true);
    for (const c of EVIDENCE_CLASSES) assert.ok(typeof c === "string");
  });
});

describe("teach-retrieve Harbor chain", () => {
  test("persist lessons, packet, before/after cites Haywood, no RidgeLine leak", () => {
    const { store, dir } = tmpStore();
    // Seed APR-005 / TPK-001 pending untouched
    store.putWorkspace({ id: "ws-ridgeline", name: "RidgeLine Estimator", createdAt: new Date().toISOString() });
    store.putTeachingPacket({
      id: "TPK-001",
      workspaceId: "ws-ridgeline",
      status: "awaiting_owner_approval",
      recipientRoleId: "offer_strategist",
      approvalRequestId: "APR-005",
    });
    store.putApprovalRequest({
      id: "APR-005",
      workspaceId: "ws-ridgeline",
      status: "pending",
      kind: "teaching_packet",
      objectId: "TPK-001",
    });
    writeFileSync(join(dir, "historical_contamination.json"), JSON.stringify([{
      id: "HCL-001", rewritten: false, erased: false,
    }]));

    // Finch + Cedar shells for portfolio compare
    store.putWorkspace({ id: "ws-own-003", name: "Cedar Path Compost Club", goal: "compost pickup", createdAt: new Date().toISOString() });
    store.putWorkspace({ id: "ws-own-005", name: "Finch & Copper Bookkeeping", goal: "monthly close kit", createdAt: new Date().toISOString() });

    const seeded = seedHarborWithMarketing(store);
    assert.ok(seeded.marketing, "marketing employee required");

    const persisted = persistClassifiedHarborLessons(store, { workspaceId: HARBOR_WORKSPACE_ID });
    assert.equal(persisted.knowledge.length, 3);
    assert.ok(persisted.findings.every((f) => f.workspaceId === HARBOR_WORKSPACE_ID));
    assert.ok(persisted.policyChecks.every((c) => c.becameOwnerPolicy === false));

    // Override default EMP id by putting marketing as EMP-025 for packet recipient match OR pass through createHarborTeachingPackets after remapping
    const marketing = seeded.marketing;
    if (marketing.id !== "EMP-025") {
      store.putEmployeeRole({ ...marketing, id: "EMP-025" });
    }
    // product optional
    const product = (seeded.team.employees || []).find((e) => e.roleId === "product");
    if (product && product.id !== "EMP-026") store.putEmployeeRole({ ...product, id: "EMP-026" });
    const scout = (seeded.team.employees || []).find((e) => e.roleId === "business_research");
    if (scout && scout.id !== "EMP-019") store.putEmployeeRole({ ...scout, id: "EMP-019" });

    const packets = createHarborTeachingPackets(store, {});
    assert.ok(packets.marketingPacket);
    assert.notEqual(packets.marketingPacket.id, "TPK-001");
    assert.equal(packets.marketingPacket.status, "approved_for_supervised_use");
    assert.equal(packets.marketingPacket.workspaceId, HARBOR_WORKSPACE_ID);
    assert.equal(store.getTeachingPacket("TPK-001").status, "awaiting_owner_approval");
    assert.equal(store.getApprovalRequest("APR-005").status, "pending");

    const proof = runHarborMarketingBeforeAfter(store, {
      employeeId: "EMP-025",
      lessonItemIds: persisted.knowledge.map((k) => k.id),
      packetIds: [packets.marketingPacket.id],
    });
    assert.equal(proof.liveProviderCall, false);
    assert.equal(proof.modelSpendUsd, 0);
    assert.ok(proof.difference.citesWestAshevilleLibrary || proof.difference.citesHaywood);
    assert.ok(proof.difference.improved);
    assert.ok((proof.after.retrievedIds || []).some((id) => String(id).startsWith("K-HARBOR-LIB")));
    assert.equal(proof.leakCheck.ok, true);
    assert.ok(!(JSON.stringify(proof.after.output).includes("RidgeLine")));
    assert.ok(!(JSON.stringify(proof.after.output).includes("Cedar Path")));

    // Before should not cite when lessons excluded
    assert.ok(proof.before.markerHits.length < proof.after.markerHits.length);

    const compare = portfolioHarborFinchCedarCompare(store);
    assert.equal(compare.companies.length, 3);
    assert.ok(compare.companies.every((c) => c.spend.category === "ACTUAL"));
    assert.ok(compare.companies.every((c) => c.spend.actualRevenueUsd === 0));
    assert.ok(compare.neverAddSpeculativeRevenueToActual);

    void dir;
  });

  test("refuse non-Harbor workspace for lesson persist", () => {
    const { store } = tmpStore();
    store.putWorkspace({ id: "ws-ridgeline", name: "RidgeLine", createdAt: new Date().toISOString() });
    assert.throws(
      () => persistClassifiedHarborLessons(store, { workspaceId: "ws-ridgeline" }),
      /Harbor Oak|ws-own-004|Isolation/,
    );
  });

  test("marketing flyer task without lessons stays honest", () => {
    const { store } = tmpStore();
    const seeded = seedHarborWithMarketing(store);
    const out = runEmployeeTask(store, seeded.marketing.id, {
      taskKind: "flyer_planning_research",
      ownerText: "Draft flyer planning note. No invented demand.",
    });
    assert.equal(out.task.output.kind, "flyer_planning_research");
    assert.equal(out.task.output.inventedDemand, false);
    assert.ok(Array.isArray(out.task.output.usedLessons));
  });
});
