import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import { persistCommandPlan } from "./command-center.ts";
import { persistInternalAutonomyPolicy } from "./autonomy-policy.ts";
import { createNewBusiness, dispatchProductRequest } from "./product-shell.ts";
import {
  approveCommandPlan,
  runCommandPlan,
  autonomyActionForPlanTask,
  founderEmployeeView,
  founderSpendingView,
  scoutFromAcceptedUsefulSearch,
  proveRestartSurvival,
  assembleRicherLandingHtml,
} from "./founder-depth.ts";
import { upsertScheduledJob } from "./master-os.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-fd-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  return { dir, store: new FileStore(dir) };
}

describe("founder-depth command → work", () => {
  test("maps plan tasks to autonomy actions", () => {
    assert.equal(autonomyActionForPlanTask({ key: "assemble_draft" }), "write_local_artifact");
    assert.equal(autonomyActionForPlanTask({ key: "watcher_pass", roleId: "independent_audit" }), "run_specialist_task");
    assert.equal(autonomyActionForPlanTask({ key: "owner_review", needsOwnerApproval: true }), null);
  });

  test("approve + dry-run executes ≥2 internal steps and records ATICK", () => {
    const { store, dir } = tmpStore();
    const created = createNewBusiness(store, {
      companyName: "Harbor Depth Co",
      ownerObjective: "Create a landing page for our current offer.",
      budget: "$1800",
      availableSkillsAndResources: "piano teaching",
      preferredIndustries: "music lessons",
    });
    const ws = created.workspace.id;
    // Seed LSE-like specialist results for assembly
    store.putSpecialistExecution({
      id: "LSE-009",
      workspaceId: ws,
      roleId: "marketing",
      live: true,
      ok: true,
      structured: {
        headline: "Walkable Lessons",
        audience: "Parents nearby",
        customer_problem: "Fact: need after-school options.",
        body_outline: ["Welcome", "Ages 7-14", "Print flyers at library"],
        cta_internal_only: "Flyers only.",
        assumptions: ["Hypothesis: demand unknown"],
        missing_information: ["Fill rate unknown"],
      },
    });
    store.putSpecialistExecution({
      id: "LSE-014",
      workspaceId: ws,
      roleId: "product",
      live: true,
      ok: true,
      structured: {
        slice: "Revise price to $40",
        acceptance_checks: ["Landing page outline states lessons are $40 for 30 minutes."],
        missing_information: ["Layout unknown"],
        not_shipped: true,
      },
    });
    persistInternalAutonomyPolicy(store, {
      workspaceId: ws,
      actor: "local_owner",
      authorized: true,
      authorizedActions: [
        "run_specialist_task",
        "retrieve_workspace_knowledge",
        "assemble_deliverables",
        "write_local_artifact",
        "plan_supervised_work",
      ],
      forbiddenActions: ["outreach", "publish", "purchase"],
      budgetUsd: 1,
    });
    const planned = persistCommandPlan(store, "Create a landing page for our current offer.", { workspaceId: ws });
    const id = planned.plan.id;
    const approved = approveCommandPlan(store, id, { actor: "local_owner" });
    assert.equal(approved.plan.status, "owner_approved");
    const run = runCommandPlan(store, id, { dryRun: true });
    assert.equal(run.liveProviderCall, false);
    assert.equal(run.liveSpendUsd, 0);
    assert.ok(run.executedCount >= 2, "expected ≥2 executed steps, got " + run.executedCount);
    assert.ok(run.pausedCount >= 1, "owner_review should pause");
    assert.ok(run.autonomyTick && run.autonomyTick.id);
    assert.ok(run.artifact && run.artifact.path && existsSync(run.artifact.path));
    assert.ok(run.artifact.hasPrice40);
    assert.ok(run.watcherAudit && run.watcherAudit.status === "pass");
    const html = readFileSync(run.artifact.path, "utf8");
    assert.match(html, /Draft/);
    assert.doesNotMatch(html, /testimonial/i);
    // API wiring
    const viaApi = dispatchProductRequest(store, "POST", "/app/command/" + id + "/run", { dryRun: true }, {});
    assert.ok(viaApi.executedCount >= 2);
  });
});

describe("founder-depth employees / spending / scout / restart", () => {
  test("founder employee view is honest and not world-class", () => {
    const { store } = tmpStore();
    const created = createNewBusiness(store, {
      companyName: "Emp Co",
      ownerObjective: "Music lessons with marketing",
      budget: "$1000",
    });
    const ws = created.workspace.id;
    store.putEmployeeRole({
      id: "EMP-FD-1",
      workspaceId: ws,
      roleId: "marketing",
      name: "Marketing seat",
      status: "authorized_for_supervised_internal",
    });
    const view = founderEmployeeView(store, "EMP-FD-1");
    assert.equal(view.worldClassClaim, false);
    assert.equal(view.budget.canRaiseOwnBudget, false);
    assert.ok(Array.isArray(view.howToTrain) && view.howToTrain.length >= 3);
    assert.ok(view.honestStatus);
  });

  test("spending separates Harbor vs Finch categories", () => {
    const { store } = tmpStore();
    createNewBusiness(store, { companyName: "H", ownerObjective: "x", budget: "$1" });
    // Force workspace ids used by founderSpendingView by putting ledger rows with those ids
    store.putWorkspace({ id: "ws-own-004", name: "Harbor Oak", createdAt: new Date().toISOString() });
    store.putWorkspace({ id: "ws-own-005", name: "Finch", createdAt: new Date().toISOString() });
    store.putSpendLedgerEntry({
      id: "LED-H1",
      workspaceId: "ws-own-004",
      estimatedCostUsd: 0.02,
      live: true,
      treasuryCategory: "ACTUAL",
      createdAt: "2026-08-22T01:00:00.000Z",
    });
    store.putSpendLedgerEntry({
      id: "LED-F1",
      workspaceId: "ws-own-005",
      estimatedCostUsd: 0.01,
      live: true,
      treasuryCategory: "ACTUAL",
      createdAt: "2026-08-22T01:00:00.000Z",
    });
    store.putSpendLedgerEntry({
      id: "LED-H2",
      workspaceId: "ws-own-004",
      estimatedCostUsd: 999,
      treasuryCategory: "HYPOTHETICAL",
      createdAt: "2026-08-22T01:01:00.000Z",
    });
    const view = founderSpendingView(store, {});
    assert.equal(view.categoriesNeverMixed, true);
    assert.ok(view.harbor.actualSpendUsd >= 0.02);
    assert.ok(view.finch.actualSpendUsd >= 0.01);
    assert.ok((view.harbor.buckets.HYPOTHETICAL || view.portfolio.buckets.HYPOTHETICAL));
    assert.equal(view.portfolio.actualRevenueUsd, 0);
  });

  test("scout reuses SRCH-002 useful URLs without paid search", () => {
    const { store, dir } = tmpStore();
    store.putWorkspace({ id: "ws-own-004", name: "Harbor Oak", createdAt: new Date().toISOString() });
    store.putSearchRecord({
      id: "SRCH-002",
      workspaceId: "ws-own-004",
      urls: [
        "https://www.buncombenc.gov/292/West-Asheville",
        "https://www.buncombecounty.org/governing/depts/library/branch-locations/west-asheville.aspx",
        "https://media.buncombenc.gov/common/library/Programs.pdf",
        "https://www.trumba.com/calendars/west-asheville-library",
      ],
      acceptedCount: 4,
    });
    // relevance file under real midas path is used when present; ranking still works from SRCH-002 urls
    const out = scoutFromAcceptedUsefulSearch(store, {
      workspaceId: "ws-own-004",
      question: "West Asheville library bulletin flyer options",
    });
    assert.equal(out.paidSearch, false);
    assert.equal(out.liveProviderCall, false);
    assert.ok(out.ranked.length >= 4);
    assert.ok(out.ranked.some((r) => r.vendorVsIndependent === "independent"));
    assert.equal(out.inventedDemand || false, false);
  });

  test("restart survival keeps APR-005 pending, JOB next-run, CPL plans", () => {
    const { store, dir } = tmpStore();
    store.putWorkspace({ id: "ws-own-004", name: "Harbor Oak", createdAt: new Date().toISOString() });
    store.putApprovalRequest({
      id: "APR-005",
      status: "pending",
      workspaceId: "ws-own-004",
      createdAt: "2026-08-21T00:00:00.000Z",
    });
    upsertScheduledJob(store, {
      id: "JOB-001",
      workspaceId: "ws-own-004",
      kind: "autonomy_tick",
      idempotencyKey: "harbor-autonomy-tick-v1",
      nextRunAt: "2026-08-22T03:48:00.126Z",
      taskState: "pending",
      status: "scheduled",
    });
    persistCommandPlan(store, "Create a landing page for our current offer.", { workspaceId: "ws-own-004" });
    // New process simulation
    const store2 = new FileStore(dir);
    const proof = proveRestartSurvival(store2);
    assert.equal(proof.apr005.stillPending, true);
    assert.equal(proof.job001.intact, true);
    assert.equal(proof.commandPlans.intact, true);
    assert.equal(proof.alwaysOn, false);
  });

  test("richer landing draft keeps banner and $40, no testimonials", () => {
    const { store } = tmpStore();
    store.putWorkspace({ id: "ws-own-004", name: "Harbor Oak", createdAt: new Date().toISOString() });
    store.putSpecialistExecution({
      id: "LSE-009",
      workspaceId: "ws-own-004",
      roleId: "marketing",
      structured: {
        headline: "Harbor Oak Lessons",
        audience: "Parents",
        customer_problem: "Fact: need lessons.",
        body_outline: ["Welcome", "Flyers"],
        cta_internal_only: "In person only",
        assumptions: [],
        missing_information: [],
      },
    });
    store.putSpecialistExecution({
      id: "LSE-014",
      workspaceId: "ws-own-004",
      roleId: "product",
      structured: {
        slice: "Price $40",
        acceptance_checks: ["Landing page outline states lessons are $40 for 30 minutes."],
        missing_information: [],
      },
    });
    const html = assembleRicherLandingHtml(store, "ws-own-004");
    assert.match(html, /Draft/);
    assert.match(html, /\$40/);
    assert.doesNotMatch(html, /our customers say|customer testimonial:|TAM of \$/i);
    assert.match(html, /LSE-009/);
  });
});
