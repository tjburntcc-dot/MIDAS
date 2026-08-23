import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import { createNewBusiness } from "./product-shell.ts";
import { persistInternalAutonomyPolicy } from "./autonomy-policy.ts";
import { upsertScheduledJob, CURRENT_MAX_EXECUTION_LEVEL } from "./master-os.ts";
import {
  runScheduledJobWorkerTick,
  recoverStaleJobLeases,
  proveJobTickIdempotencyAndRecovery,
  stageHarborLibraryFlyer,
  attemptExternalLadderLevel,
  persistActionCatalog,
  listActionCatalogBoundary,
  ACTION_CATALOG_TYPES,
  HARBOR_WORKSPACE_ID,
  JOBS_STAGE_HONESTY,
} from "./jobs-stage.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-jobs-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  mkdirSync(join(dir, "curriculum"), { recursive: true });
  mkdirSync(join(dir, "..", "artifacts", HARBOR_WORKSPACE_ID), { recursive: true });
  return { dir, store: new FileStore(dir) };
}

function seedHarborJob(store) {
  const created = createNewBusiness(store, {
    companyName: "Harbor Oak Music Lessons",
    ownerObjective: "Neighborhood piano guitar lessons near library",
    budget: "$1800",
  });
  const minted = created.workspace.id;
  const ws = store.getWorkspace(minted);
  store.putWorkspace({ ...ws, id: HARBOR_WORKSPACE_ID, name: "Harbor Oak Music Lessons" });
  persistInternalAutonomyPolicy(store, {
    workspaceId: HARBOR_WORKSPACE_ID,
    actor: "local_owner",
    authorized: true,
    authorizedActions: ["run_specialist_task", "retrieve_workspace_knowledge", "assemble_deliverables", "write_local_artifact", "plan_supervised_work"],
    forbiddenActions: ["outreach", "publish", "purchase"],
    budgetUsd: 1,
    coveredEmployeeIds: [],
  });
  store.putKnowledge({
    id: "K-TRAIN-005",
    workspaceId: HARBOR_WORKSPACE_ID,
    type: "constraint",
    statement: "Harbor Oak only teaches piano and guitar to ages 7 to 14 after school on Tuesdays and Thursdays. Flyers may mention West Asheville Library bulletin board only.",
    sourceId: "local",
    sourceSha256: "x",
    locator: { section: "owner", charStart: 0, charEnd: 10, text: "policy" },
    claimKind: "owner_policy",
    accepted: true,
    createdAt: new Date().toISOString(),
    runtimeEligible: true,
    classification: "owner_policy",
  });
  store.putKnowledge({
    id: "K-HARBOR-LIB-001",
    workspaceId: HARBOR_WORKSPACE_ID,
    type: "example",
    statement: "West Asheville Library serves the westside on Haywood Rd at 942 Haywood Road, Asheville, NC 28806 (phone 828-250-4750).",
    sourceId: "sbr",
    sourceSha256: "x",
    locator: { section: "a", charStart: 0, charEnd: 10, text: "addr" },
    claimKind: "product_behavior",
    accepted: true,
    createdAt: new Date().toISOString(),
    runtimeEligible: true,
  });
  store.putKnowledge({
    id: "K-HARBOR-LIB-002",
    workspaceId: HARBOR_WORKSPACE_ID,
    type: "example",
    statement: "West Asheville Library Hours: Tuesdays 9am–7pm; Wednesdays & Thursdays 9am–6pm; Fridays & Saturdays 9am–5pm; Sundays & Mondays closed.",
    sourceId: "sbr",
    sourceSha256: "x",
    locator: { section: "a", charStart: 0, charEnd: 10, text: "hours" },
    claimKind: "product_behavior",
    accepted: true,
    createdAt: new Date().toISOString(),
    runtimeEligible: true,
  });
  store.putKnowledge({
    id: "K-HARBOR-LIB-003",
    workspaceId: HARBOR_WORKSPACE_ID,
    type: "example",
    statement: "Buncombe County Public Libraries PROGRAMS – February 2025 calendar lists West Asheville Library programs at 942 Haywood Road (public program calendar fact, not demand).",
    sourceId: "sbr",
    sourceSha256: "x",
    locator: { section: "a", charStart: 0, charEnd: 10, text: "cal" },
    claimKind: "product_behavior",
    accepted: true,
    createdAt: new Date().toISOString(),
    runtimeEligible: true,
  });
  // Seed APR-005 pending untouched
  store.putApprovalRequest({
    id: "APR-005",
    workspaceId: "ws-ridgeline",
    status: "pending",
    objectId: "TPK-001",
    stepId: "TPK-001",
    createdAt: new Date().toISOString(),
  });
  store.putTeachingPacket({
    id: "TPK-001",
    packetId: "TPK-001",
    workspaceId: "ws-ridgeline",
    status: "awaiting_owner_approval",
    approvalRequestId: "APR-005",
  });
  const job = upsertScheduledJob(store, {
    id: "JOB-001",
    workspaceId: HARBOR_WORKSPACE_ID,
    kind: "autonomy_tick",
    idempotencyKey: "harbor-autonomy-tick-v1",
    nextRunAt: new Date(Date.now() - 1000).toISOString(),
    retryLimit: 3,
  });
  return { job: job.job };
}

describe("jobs-stage worker tick", () => {
  test("tick twice: second is no-op; mid-lease crash recovers", () => {
    const { store } = tmpStore();
    seedHarborJob(store);
    const proof = proveJobTickIdempotencyAndRecovery(store, { jobId: "JOB-001" });
    assert.equal(proof.first.outcome, "executed");
    assert.equal(proof.second.noop, true);
    assert.equal(proof.crash.outcome, "crashed_mid_lease");
    assert.equal(proof.crash.taskStateAfterCrash, "leased");
    assert.equal(proof.recovery.outcome, "executed");
    assert.equal(proof.finalJob.alwaysOnClaim, false);
    assert.equal(proof.honesty.alwaysOn, false);
    assert.ok(proof.finalJob.lastHeartbeatAt);
    assert.ok(proof.finalJob.nextRunAt);
    const hbs = store.listWorkerHeartbeats(HARBOR_WORKSPACE_ID);
    assert.ok(hbs.length >= 2);
  });

  test("recoverStaleJobLeases clears expired lease", () => {
    const { store } = tmpStore();
    seedHarborJob(store);
    const job = store.getScheduledJob("JOB-001");
    store.putScheduledJob({
      ...job,
      taskState: "leased",
      leaseOwner: "dead-worker",
      leaseToken: "x",
      leaseExpiresAt: new Date(Date.now() - 5000).toISOString(),
    });
    const rec = recoverStaleJobLeases(store, { workspaceId: HARBOR_WORKSPACE_ID });
    assert.ok(rec.recovered.some((r) => r.id === "JOB-001"));
    assert.equal(store.getScheduledJob("JOB-001").taskState, "pending");
  });
});

describe("jobs-stage LEVEL 3 flyer + ladder refusal + catalog", () => {
  test("stages flyer without publishing; refuses LEVEL 4/5; catalog NOT_INTEGRATED", () => {
    const { store, dir } = tmpStore();
    seedHarborJob(store);
    const artDir = join(dir, "artifacts", HARBOR_WORKSPACE_ID);
    mkdirSync(artDir, { recursive: true });
    const flyer = stageHarborLibraryFlyer(store, { stateDir: dir, artifactsDir: artDir, workspaceId: HARBOR_WORKSPACE_ID });
    assert.equal(flyer.level, 3);
    assert.equal(flyer.status, "staged_awaiting_owner_review");
    assert.equal(flyer.action.published, false);
    assert.equal(flyer.action.printed, false);
    assert.equal(flyer.action.sent, false);
    assert.ok(existsSync(flyer.artifactPath));
    const html = readFileSync(flyer.artifactPath, "utf8");
    assert.ok(/STAGED DRAFT/i.test(html));
    assert.ok(/not posted/i.test(html));
    assert.ok(/942 Haywood/i.test(html));
    assert.ok(/K-HARBOR-LIB-001/i.test(html));
    assert.equal(flyer.action.level4Fields.physicalPostingApproved, false);

    const r4 = attemptExternalLadderLevel(store, 4, { workspaceId: HARBOR_WORKSPACE_ID });
    const r5 = attemptExternalLadderLevel(store, 5, { workspaceId: HARBOR_WORKSPACE_ID });
    assert.equal(r4.refused, true);
    assert.equal(r5.refused, true);
    assert.equal(r4.action.status, "rejected");
    assert.equal(r5.action.status, "rejected");
    assert.equal(CURRENT_MAX_EXECUTION_LEVEL, 3);

    const cat = persistActionCatalog(store, { workspaceId: HARBOR_WORKSPACE_ID });
    assert.equal(cat.count, ACTION_CATALOG_TYPES.length);
    const view = listActionCatalogBoundary(store);
    assert.equal(view.allNotIntegrated, true);
    for (const e of view.entries) {
      assert.equal(e.status, "NOT_INTEGRATED");
      assert.equal(e.available, false);
      assert.equal(e.fakeReady, false);
    }

    // APR-005 untouched
    assert.equal(store.listApprovalRequests().find((a) => a.id === "APR-005").status, "pending");
    assert.ok(JOBS_STAGE_HONESTY.label.includes("NOT 24/7"));
  });

  test("immediate second tick is noop_not_due after successful bump", () => {
    const { store } = tmpStore();
    seedHarborJob(store);
    const now = new Date("2026-08-22T12:00:00.000Z");
    store.putScheduledJob({
      ...store.getScheduledJob("JOB-001"),
      nextRunAt: "2026-08-22T11:00:00.000Z",
      lastCompletedRunKey: null,
      taskState: "pending",
    });
    const a = runScheduledJobWorkerTick(store, { jobId: "JOB-001", now, forceDue: true, workerId: "w1", intervalMs: 3_600_000 });
    assert.equal(a.outcome, "executed");
    const b = runScheduledJobWorkerTick(store, { jobId: "JOB-001", now: new Date(now.getTime() + 1000), workerId: "w1" });
    assert.ok(b.outcome === "noop_not_due" || b.outcome === "noop_idempotent");
  });
});
