import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { createNewBusiness, createExistingBusiness } from "./product-shell.ts";
import { retrieveWorkspaceContext } from "./live-specialists.ts";
import { listApprovedWorkspaceKnowledge } from "./offer-strategist-live.ts";
import {
  requireWorkspaceId,
  listKnowledgeInWorkspace,
  listOpportunitiesInWorkspace,
  listTeachingPacketsInWorkspace,
  listSpendInWorkspace,
  listArtifactsInWorkspace,
  getKnowledgeInWorkspace,
  getTeachingPacketInWorkspace,
  historicalContaminationView,
  persistHistoricalContaminationLabels,
} from "./workspace-isolation.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-iso-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  return { dir, store: new FileStore(dir) };
}

function seedBoth(store) {
  store.putWorkspace({
    id: "ws-ridgeline",
    name: "RidgeLine Estimator",
    description: "Roofing software. Business description, not policy.",
    industry: "construction_software",
    servingAtlasVersionId: "atlas-v15",
    ownerStatus: "active",
    createdAt: "2026-08-21T12:00:00.000Z",
  });
  for (const [id, hash] of Object.entries(FROZEN_HASHES)) {
    if (!store.getVersion(id)) {
      store.putVersion({ id: id, agentId: id.split("-")[0] === "atlas" ? "atlas" : id.replace(/-v0$/, ""), contentHash: hash, immutable: true });
    }
  }
  store.putKnowledge({
    id: "K-RL-POLICY",
    workspaceId: "ws-ridgeline",
    statement: "RidgeLine mandatory: never contact a prospect without owner approval.",
    classification: "owner_policy",
    kind: "owner_policy",
    claimKind: "owner_policy",
    accepted: true,
    reviewStatus: "approved",
    mandatory: true,
  });
  store.putKnowledge({
    id: "K-001-01",
    statement: "Unscoped RidgeLine-era curriculum item.",
    accepted: true,
    reviewStatus: "approved",
  });
  store.putWorkspaceNote({
    id: "NOTE-RL-1",
    workspaceId: "ws-ridgeline",
    text: "RidgeLine private note: Pacific Northwest roofing contractors only.",
  });
  store.putTeachingPacket({
    id: "TPK-001",
    workspaceId: "ws-ridgeline",
    status: "awaiting_owner_approval",
    recipientEmployeeId: "EMP-001",
    recipientRoleId: "offer_strategist",
    title: "Roofr public copy",
  });
  store.putOpportunity({
    id: "OPP-RL-1",
    workspaceId: "ws-ridgeline",
    name: "RidgeLine contractor offer",
  });
  store.putSpendLedgerEntry({
    id: "LED-RL-1",
    workspaceId: "ws-ridgeline",
    kind: "live",
    costUsd: 0.01,
    costStatus: "estimated",
  });
}

describe("structural workspace isolation", () => {
  test("queries throw without workspaceId", () => {
    const { store } = tmpStore();
    assert.throws(() => requireWorkspaceId(null), /workspaceId is required/);
    assert.throws(() => listKnowledgeInWorkspace(store, null), /workspaceId is required/);
    assert.throws(() => listApprovedWorkspaceKnowledge(store, undefined), /workspaceId is required/);
    assert.throws(() => retrieveWorkspaceContext(store, "", {}), /workspaceId is required/);
    assert.throws(() => store.listKnowledgeForWorkspace(null), /workspaceId is required/);
  });

  test("Cedar Path cannot retrieve RidgeLine policies or notes; RidgeLine cannot retrieve Cedar Path notes", () => {
    const { store } = tmpStore();
    seedBoth(store);
    const cedar = createNewBusiness(store, {
      companyName: "Cedar Path Compost Club",
      ownerObjective: "Neighborhood kitchen-scrap pickup.",
    });
    store.putKnowledge({
      id: "K-CEDAR-NOTE",
      workspaceId: cedar.workspace.id,
      statement: "Kitchen scraps only. Thursday dawn Maple Court. Stoop not curb.",
      classification: "company_fact",
      accepted: true,
      reviewStatus: "approved",
    });
    store.putWorkspaceNote({
      id: "NOTE-CEDAR-1",
      workspaceId: cedar.workspace.id,
      text: "Twelve yellow CEDAR PATH pails. Owner-only note.",
    });

    const cedarCtx = retrieveWorkspaceContext(store, cedar.workspace.id, {});
    assert.ok(cedarCtx.retrievedIds.includes("K-CEDAR-NOTE"));
    assert.ok(!cedarCtx.retrievedIds.includes("K-RL-POLICY"));
    assert.ok(!cedarCtx.retrievedIds.includes("K-001-01"));

    const ridgeCtx = retrieveWorkspaceContext(store, "ws-ridgeline", {});
    assert.ok(ridgeCtx.retrievedIds.includes("K-RL-POLICY"));
    assert.ok(!ridgeCtx.retrievedIds.includes("K-CEDAR-NOTE"));

    const cedarNotes = (store.listWorkspaceNotes(cedar.workspace.id) || []);
    assert.ok(cedarNotes.every((n) => n.workspaceId === cedar.workspace.id));
    assert.ok(!cedarNotes.some((n) => /Pacific Northwest/.test(n.text || "")));

    const ridgeNotes = (store.listWorkspaceNotes("ws-ridgeline") || []);
    assert.ok(!ridgeNotes.some((n) => /CEDAR PATH/.test(n.text || "")));

    assert.throws(() => getKnowledgeInWorkspace(store, "K-RL-POLICY", cedar.workspace.id), /not visible/);
    assert.throws(() => getKnowledgeInWorkspace(store, "K-CEDAR-NOTE", "ws-ridgeline"), /not visible/);
  });

  test("packets, opportunities, spend, and artifacts cannot cross companies", () => {
    const { store } = tmpStore();
    seedBoth(store);
    const cedar = createNewBusiness(store, {
      companyName: "Cedar Isolation Co",
      ownerObjective: "Keep packets on this company.",
    });
    store.putTeachingPacket({
      id: "TPK-CEDAR",
      workspaceId: cedar.workspace.id,
      status: "approved_for_supervised_use",
      title: "Cedar lesson",
    });
    store.putOpportunity({
      id: "OPP-CEDAR",
      workspaceId: cedar.workspace.id,
      name: "Maple Court compost",
    });
    store.putSpendLedgerEntry({
      id: "LED-CEDAR",
      workspaceId: cedar.workspace.id,
      kind: "live",
      costUsd: 0.02,
      costStatus: "estimated",
    });

    const cedarPackets = listTeachingPacketsInWorkspace(store, cedar.workspace.id);
    assert.ok(cedarPackets.every((p) => p.workspaceId === cedar.workspace.id));
    assert.ok(!cedarPackets.some((p) => p.id === "TPK-001"));
    assert.throws(() => getTeachingPacketInWorkspace(store, "TPK-001", cedar.workspace.id), /not visible/);

    const ridgePackets = listTeachingPacketsInWorkspace(store, "ws-ridgeline");
    assert.ok(!ridgePackets.some((p) => p.id === "TPK-CEDAR"));

    const cedarOpps = listOpportunitiesInWorkspace(store, cedar.workspace.id);
    assert.ok(cedarOpps.every((o) => o.workspaceId === cedar.workspace.id));
    assert.ok(!cedarOpps.some((o) => o.id === "OPP-RL-1"));

    const ridgeOpps = listOpportunitiesInWorkspace(store, "ws-ridgeline");
    assert.ok(!ridgeOpps.some((o) => o.id === "OPP-CEDAR"));

    const cedarSpend = listSpendInWorkspace(store, cedar.workspace.id);
    assert.ok(cedarSpend.every((e) => e.workspaceId === cedar.workspace.id));
    assert.ok(!cedarSpend.some((e) => e.id === "LED-RL-1"));

    const artifacts = listArtifactsInWorkspace(cedar.workspace.id);
    assert.ok(artifacts.every((a) => a.workspaceId === cedar.workspace.id));
    assert.ok(!String(artifacts.map((a) => a.path).join(" ")).includes("ws-ridgeline"));
  });

  test("no cross-cite: Cedar retrieval ids cannot include RidgeLine knowledge", () => {
    const { store } = tmpStore();
    seedBoth(store);
    const cedar = createNewBusiness(store, {
      companyName: "No Cite Co",
      ownerObjective: "Cite only this company.",
    });
    store.putKnowledge({
      id: "K-LOCAL",
      workspaceId: cedar.workspace.id,
      statement: "Local fact only",
      accepted: true,
      reviewStatus: "approved",
    });
    const ids = listApprovedWorkspaceKnowledge(store, cedar.workspace.id).map((k) => k.id);
    assert.deepEqual(ids.sort(), ["K-LOCAL"]);
    assert.ok(!ids.includes("K-RL-POLICY"));
    assert.ok(!ids.includes("K-001-01"));
  });

  test("existing-business workspace stays isolated from new-business workspace", () => {
    const { store } = tmpStore();
    seedBoth(store);
    const existing = createExistingBusiness(store, {
      companyName: "Harbor Oven",
      businessDescription: "weekend sourdough",
      existingOffer: "weekend sourdough loaves",
      customerProfile: "walk-in neighbors",
      currentChallenges: "Friday leftover bread",
      goals: "use leftover loaves",
    });
    store.putKnowledge({
      id: "K-OVEN",
      workspaceId: existing.workspace.id,
      statement: "Friday leftover loaves become bread pudding.",
      accepted: true,
      reviewStatus: "approved",
    });
    const newBiz = createNewBusiness(store, {
      companyName: "Bike Lane Desk",
      ownerObjective: "Neighborhood bicycle repair.",
    });
    store.putKnowledge({
      id: "K-BIKE",
      workspaceId: newBiz.workspace.id,
      statement: "Hand tools only. No e-bike motors.",
      accepted: true,
      reviewStatus: "approved",
    });
    const oven = retrieveWorkspaceContext(store, existing.workspace.id, {});
    const bike = retrieveWorkspaceContext(store, newBiz.workspace.id, {});
    assert.ok(oven.retrievedIds.includes("K-OVEN"));
    assert.ok(!oven.retrievedIds.includes("K-BIKE"));
    assert.ok(bike.retrievedIds.includes("K-BIKE"));
    assert.ok(!bike.retrievedIds.includes("K-OVEN"));
  });

  test("historical LSE-001-004 contamination stays identifiable and is not rewritten", () => {
    const store = new FileStore(stateDir());
    const view = historicalContaminationView(store);
    const found = view.records.filter((r) => r.present);
    assert.ok(found.length >= 1, "expected historical LSE records in live FILE_STORE");
    for (const row of found) {
      assert.equal(row.label, "historical_contamination");
      assert.equal(row.rewritten, false);
      assert.ok(Array.isArray(row.retrievedIds));
      assert.ok(row.retrievedIdCount >= 1);
    }
    const labeled = persistHistoricalContaminationLabels(store);
    assert.equal(labeled.erased, false);
    assert.equal(labeled.rewritten, false);
    const again = store.getSpecialistExecution("LSE-001");
    if (again) {
      assert.ok((again.retrievedIds || []).includes("K-001-01") || (again.retrievedIds || []).length > 0);
    }
  });
});
