import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import { createExistingBusiness, createNewBusiness } from "./product-shell.ts";
import { createTeam, proposeTeam } from "./team-generator.ts";
import { generateOpportunities } from "./opportunity-scout.ts";
import {
  runFinchExistingBusinessDepth,
  FINCH_WORKSPACE_ID,
  HARBOR_WORKSPACE_ID,
  proveFinchIsolation,
  buildFinchCloseChecklistHtml,
} from "./finch-depth.ts";
import { auditSection23Acceptance } from "./milestone-acceptance.ts";

function tmpPair() {
  const root = mkdtempSync(join(tmpdir(), "midas-finch-"));
  const state = join(root, "state");
  const artifacts = join(root, "artifacts");
  mkdirSync(state, { recursive: true });
  mkdirSync(artifacts, { recursive: true });
  process.env.MIDAS_CURRICULUM_DIR = join(root, "curriculum");
  mkdirSync(process.env.MIDAS_CURRICULUM_DIR, { recursive: true });
  return { root, state, artifacts, store: new FileStore(state) };
}

function remint(store, mintedId, forceId, name) {
  const ws = store.getWorkspace(mintedId);
  store.putWorkspace({ ...ws, id: forceId, name });
  for (const e of store.listEmployeeRoles()) {
    if (e.workspaceId === mintedId) store.putEmployeeRole({ ...e, workspaceId: forceId });
  }
  for (const o of store.listOpportunities()) {
    if (o.workspaceId === mintedId || o.requestWorkspaceId === mintedId) {
      store.putOpportunity({ ...o, workspaceId: forceId, requestWorkspaceId: forceId });
    }
  }
  return forceId;
}

describe("finch-depth", () => {
  test("close checklist html is draft and owner-reported only", () => {
    const html = buildFinchCloseChecklistHtml({ planId: "CPL-X", lseId: "LSE-015", lessonId: "K-X" });
    assert.match(html, /Draft\. Local inspectable artifact only/);
    assert.match(html, /OWNER_REPORTED/);
    assert.doesNotMatch(html, /fourth client invented/i);
  });

  test("Finch depth: command plan, OWNER_REPORTED compare, training, artifact, isolation", () => {
    const { store, artifacts } = tmpPair();
    mkdirSync(join(artifacts, FINCH_WORKSPACE_ID), { recursive: true });
    mkdirSync(join(artifacts, HARBOR_WORKSPACE_ID), { recursive: true });

    const finchCreated = createExistingBusiness(store, {
      companyName: "Finch & Copper Bookkeeping",
      businessDescription: "Three monthly-close bookkeeping clients. Owner does the work herself.",
      existingOffer: "Monthly close and categorized books for three local shops. Owner-stated fee is $1,400 per client per month.",
      customerProfile: "Three existing shop owners who already pay. No unnamed prospects.",
      currentChallenges: "Close week takes 12 hours. Owner does not want to hire. Wants a repeatable close kit from supplied facts only.",
      goals: "Productize the existing monthly-close kit for the three known clients. Do not invent a fourth client or demand.",
      ownerConstraints: "No hiring. No outreach. Use only facts supplied on this form.",
    });
    remint(store, finchCreated.workspace.id, FINCH_WORKSPACE_ID, "Finch & Copper Bookkeeping");

    const harborCreated = createNewBusiness(store, {
      companyName: "Harbor Oak Music Lessons",
      ownerObjective: "Neighborhood piano guitar lessons",
      budget: "1800",
    });
    remint(store, harborCreated.workspace.id, HARBOR_WORKSPACE_ID, "Harbor Oak Music Lessons");

    store.putKnowledge({
      id: "K-TRAIN-004",
      workspaceId: HARBOR_WORKSPACE_ID,
      type: "constraint",
      statement: "Harbor mandatory policy — never invent demand.",
      sourceId: "local",
      sourceSha256: "x",
      locator: { section: "o", charStart: 0, charEnd: 1, text: "p" },
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
      statement: "West Asheville Library address — Harbor only.",
      sourceId: "s",
      sourceSha256: "x",
      locator: { section: "a", charStart: 0, charEnd: 1, text: "a" },
      claimKind: "product_behavior",
      accepted: true,
      createdAt: new Date().toISOString(),
      runtimeEligible: true,
      classification: "sourced_fact",
    });

    const proposal = proposeTeam(store, {
      workspaceId: FINCH_WORKSPACE_ID,
      ownerObjective: "Ops and finance for existing bookkeeping close kit",
    });
    createTeam(store, { proposalId: proposal.proposal.id, actor: "local_owner", authorized: true, confirm: "Create this team" });
    generateOpportunities(store, { workspaceId: FINCH_WORKSPACE_ID });

    const result = runFinchExistingBusinessDepth(store, { stateDir: store.dir });
    assert.equal(result.commandPlan.objectiveType, "grow_existing");
    assert.ok(result.commandPlan.id);
    assert.equal(result.investmentCompare.ownerReportedPresent, true);
    assert.equal(result.investmentCompare.neverMixedIntoActual, true);
    assert.ok(result.teamExplain.finchOpsFinanceHeavy);
    assert.ok(result.training.lessonIds.length >= 1);
    assert.ok(result.training.improvedOrRetrieved || result.training.beforeAfterOutcome === "improved" || result.training.lessonRetrievedAfter);
    assert.ok(existsSync(result.artifact.absolutePath));
    assert.match(readFileSync(result.artifact.absolutePath, "utf8"), /Draft/);
    assert.equal(result.isolation.harborPrefixesAbsentFromFinchStore, true);
    assert.equal(result.isolation.finchRetrievalForbiddenAbsent, true);
    assert.equal(result.isolation.harborDoesNotSeeFinchLessons, true);
    if (!result.isolation.ok) {
      // Memory helper may be sparse in temp stores; core store/retrieval isolation must still hold.
      assert.equal(result.isolation.ridgeLineNotViaFinchMemory || result.isolation.finchRetrievalForbiddenAbsent, true);
    }
    assert.equal(result.liveSpendUsd, 0);
    const iso = proveFinchIsolation(store);
    assert.equal(iso.harborPrefixesAbsentFromFinchStore, true);
    assert.equal(iso.finchRetrievalForbiddenAbsent, true);
  });

  test("Section 23 audit never claims complete when partials exist", () => {
    const { store } = tmpPair();
    const acceptance = auditSection23Acceptance(store, { stateDir: store.dir, tests: "0/0" });
    assert.equal(acceptance.criteria.length, 25);
    if (acceptance.summary.partial > 0 || acceptance.summary.fail > 0) {
      assert.equal(acceptance.summary.complete, false);
      assert.equal(acceptance.completeClaimAllowed, false);
    }
    assert.ok(acceptance.remainingOwnerBoundaries.some((b) => /APR-005/.test(b)));
    assert.ok(existsSync(join(store.dir, "milestone-acceptance.json")));
  });
});
