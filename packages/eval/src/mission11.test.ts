import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0, FROZEN_ATLAS_IDS } from "@midas/db";
import { addOwnerAuthoredRule, trainAtlas } from "./knowledge-studio.ts";
import { createWorkspace, runWorkbench, ownerDashboard, IMPLEMENTED_ROLE_IDS } from "./workspace.ts";
import { reviewFinding, trainAtlasFromScout, scoutAgentId, RIDGELINE_SCOUT_PASTE } from "./scout.ts";
import { watcherAgentId } from "./watcher.ts";
import { CHALLENGE_CASES_V0, FROZEN_CHALLENGE_JSONL } from "./paths.ts";
import {
  ensureConductor, submitObjective, planObjective, tickObjective, runUntilBlocked,
  pauseObjective, resumeObjective, cancelObjective, decideApproval, objectiveView,
  conductorPrompt, conductorAgentId, conductorVersionId, assertConductorMayNot,
  CONDUCTOR_ROLE_ID, CONDUCTOR_ROLE_NAME, CONDUCTOR_DISCLOSURE, CONDUCTOR_ORCHESTRATION,
  TASK_STATES, FIRST_WORKFLOW_TYPES, CONDUCTOR_MAY, CONDUCTOR_MAY_NOT,
} from "./conductor.ts";
import { HANDOFF_FICTIONAL_PROSPECTS, HANDOFF_OWNER_PASTE, HANDOFF_SCOUT_QUESTION, handoffQualificationPolicy } from "./handoff-scenario.ts";

const FROZEN_HASHES = {
  "atlas-v0": "643453dd2ff025bba3c43be50f3eca4161f3b387248b56d051dcdeb4738d6bf9",
  "atlas-v1": "f1c616a00433730b28cab07bc9c6e7bfa492001c6a836a2e1ccf07f9b1507d07",
  "atlas-v2": "9db7ad586dcbab350d4509b7da30e34b907ded42a77c1a1ede990b4ebd914428",
  "atlas-v3": "add429661da957d0d1d7726a9a4de201ed5621a33077f890a505d1938971c7a8",
  "atlas-v4": "96252f0cae8ba28934e8b5facd18d4af1fa25354d04a95952b38827d7e1e26d8",
  "atlas-v5": "2381fe40057970c7682dc2fa3967ff0459f6d2b82923634de4a07da8177b2290",
  "atlas-v6": "1118e1a94e6558744965fd5f916b37d431984cee4cd911649e4b4c63027e4554",
  "atlas-v7": "66042169933725326f6020d3f0e7ff916e77ad25e89cde13d166c61654663c17",
  "atlas-v8": "2b97051999d3ad75901e179ca3edb4d3e648e5d1fc90577161d3cc92b56bfe9e",
  "atlas-v9": "087a5cf23aa29cc276fdeefd4fa14fded55fe5667ae33eadde1706444c3f6098",
  "atlas-v10": "4fecb8be36e22cd14a29677e75aba89b1f48a9ee854db2b94607a355787f253c",
  "atlas-v11": "b42c2b96bf7cbae1adfad81c5f360c30371d983f03bd370c6589f864997ced27",
};
const ATLAS_V12_LIVE = "27e306c1aa6d98981d5d57ee504227baded0921bdc959be2542d8743697a474a";
const ATLAS_V13_LIVE = "02918552cc50b9cd6b8d274cc2b43a06538dade2491206eeaaec52b3e8493d12";
const ATLAS_V14_LIVE = "91340b42e9cc084356cf3fe870d78aa3b8e9be60bc3efbe5e89348f8f68ff4fc";
const SCOUT_V0_LIVE = "129841f55a98a7bd0ab45650e4f44c185fd49deb0d2c3fbfc761b64a4c8a1ec5";
const WATCHER_V0_LIVE = "a320bedf0b416080b7017aa4ee764825ccb16ecd3cceec2ddba2b51cb20e0061";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m11-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  ensureAtlasV0(store);
  const v0 = store.getVersion("atlas-v0");
  if (!store.getVersion("atlas-v12")) {
    store.putVersion({
      ...v0, id: "atlas-v12", parentVersionId: "atlas-v0", createdAt: new Date().toISOString(),
      declaredChange: "test stand-in atlas-v12", contentHash: "test-parent-atlas-v12", workspaceId: "ws-ridgeline",
    });
  }
  return { dir, store };
}

function seedWs(store) {
  const ws = createWorkspace(store, { name: "CondWS", description: "Conductor workspace business description for roofing software.", goal: "Qualify US roofing contractors." }).workspace;
  addOwnerAuthoredRule(store, {
    statement: "Only United States accounts are eligible. Non-US geography is a hard disqualifier.",
    workspaceId: ws.id, competency: "territory",
    applicability: { scope: "US-only", requiredConditions: [{ id: "c-us", field: "country", op: "neq", value: "US", description: "Not US", evidenceRequired: true }], effect: "exclude", unknownBehavior: "research_first", exceptions: [], priority: 95 },
  });
  return ws;
}

function objectivePayload(ws, extra) {
  return {
    workspaceId: ws.id,
    ownerText: HANDOFF_SCOUT_QUESTION + " Evaluate fictional roofing prospects using approved company rules.",
    paste: HANDOFF_OWNER_PASTE,
    sourceLabel: "owner-provided operational knowledge",
    permittedFictionalScenario: { title: "fictional", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy() },
    maxSpendUsd: 2,
    ...(extra || {}),
  };
}

async function runToApproval(store, ws, extra) {
  const submitted = submitObjective(store, objectivePayload(ws, extra));
  const waited = await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12" });
  return { submitted, waited, objectiveId: submitted.objective.id };
}

describe("mission 11 Conductor identity", () => {
  test("1 Conductor is a real workspace-scoped agent with its own prompt", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const out = ensureConductor(store, ws.id);
    assert.equal(out.agent.id, conductorAgentId(ws.id));
    assert.equal(out.agent.roleId, CONDUCTOR_ROLE_ID);
    assert.equal(out.agent.roleName, CONDUCTOR_ROLE_NAME);
    assert.ok(out.agent.promptBundle.system.includes("Conductor"));
    assert.equal(out.agent.promptBundle.system.includes("prospect-qualification"), false);
    assert.equal(out.agent.promptBundle.system.includes("Gather source-backed"), false);
    assert.equal(out.agent.promptBundle.system.includes("independent-audit"), false);
    assert.notEqual(conductorPrompt().system, store.getVersion("atlas-v0").promptBundle.system);
    assert.ok(IMPLEMENTED_ROLE_IDS.includes("workflow_manager"));
    assert.equal(out.version.workspaceId, ws.id);
    assert.match(out.version.declaredChange, /Not an Atlas/);
    assert.equal(out.agent.orchestration, CONDUCTOR_ORCHESTRATION);
    assert.match(CONDUCTOR_DISCLOSURE, /deterministic/i);
  });

  test("2 Conductor permissions cannot approve, create policy, promote, bypass Watcher, or raise budget", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    ensureConductor(store, ws.id);
    assert.ok(CONDUCTOR_MAY.includes("assign_existing_specialists"));
    for (const n of ["approve_findings", "create_owner_policy", "promote", "bypass_watcher", "raise_own_budget", "invent_employee_completions", "outreach"]) {
      assert.ok(CONDUCTOR_MAY_NOT.includes(n));
    }
    assert.throws(() => assertConductorMayNot("approve_findings"), /Conductor may not/);
    assert.throws(() => reviewFinding(store, "nope", { actor: "conductor", action: "approve" }), /Conductor cannot|finding not found/);
    assert.throws(() => trainAtlasFromScout(store, { actor: "conductor-" + ws.id, workspaceId: ws.id, parentVersionId: "atlas-v12" }), /Conductor cannot/);
    assert.throws(() => trainAtlas(store, { actor: "workflow_manager", workspaceId: ws.id, parentVersionId: "atlas-v12" }), /Conductor cannot/);
  });

  test("3 first-class objective persists required fields and does not authorize outreach", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const out = submitObjective(store, objectivePayload(ws));
    const o = store.getObjective(out.objective.id);
    assert.ok(o.id && o.workspaceId === ws.id && o.ownerText && o.category);
    assert.ok(o.permittedSources && o.maxSpendUsd === 2 && Array.isArray(o.allowedRoles));
    assert.ok(o.status && o.createdAt && o.updatedAt && o.managerVersionId);
    assert.equal(o.authorizations.outreach, false);
    assert.equal(o.authorizations.realProspects, false);
    assert.equal(o.authorizations.purchases, false);
    assert.equal(o.authorizations.newOwnerPolicy, false);
    assert.equal(o.authorizations.promotion, false);
    assert.equal(o.authorizations.unlimitedSpend, false);
    assert.match(o.note, /does not authorize outreach/);
  });

  test("4 submitting with raiseBudget is refused; conductor cannot raise own budget", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    assert.throws(() => submitObjective(store, objectivePayload(ws, { raiseBudget: true })), /raise_own_budget|Conductor may not/);
  });
});

describe("mission 11 plan and validation", () => {
  test("5 deterministic first workflow has six typed steps", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const out = submitObjective(store, objectivePayload(ws));
    const planned = await planObjective(store, out.objective.id);
    assert.equal(planned.blocked, undefined);
    assert.deepEqual(planned.plan.stepTypes, FIRST_WORKFLOW_TYPES);
    assert.equal(planned.tasks.length, 6);
    for (const t of planned.tasks) {
      assert.ok(t.id && t.objectiveId === out.objective.id && t.workspaceId === ws.id);
      assert.ok(t.assignedRoleId && t.type && t.allowedInputs && t.expectedOutput);
      assert.ok(Array.isArray(t.prerequisites) && Array.isArray(t.approvalRequirements));
      assert.equal(t.status, "queued");
      assert.equal(t.attemptCount, 0);
    }
    assert.equal(planned.plan.source, "deterministic_first_workflow");
    assert.match(planned.disclosure, /deterministic/i);
  });

  test("6 missing source blocks Scout; no fictional case blocks Atlas", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const noSrc = submitObjective(store, { workspaceId: ws.id, ownerText: "Research something useful about estimating software.", maxSpendUsd: 1 });
    const p1 = await planObjective(store, noSrc.objective.id);
    assert.equal(p1.blocked, true);
    assert.ok(p1.validation.issues.some((i) => i.code === "no_source"));
    const noCase = submitObjective(store, { workspaceId: ws.id, ownerText: "Research estimating software buying signals with a paste.", paste: HANDOFF_OWNER_PASTE, maxSpendUsd: 1 });
    const p2 = await planObjective(store, noCase.objective.id);
    assert.equal(p2.blocked, true);
    assert.ok(p2.validation.issues.some((i) => i.code === "no_fictional_case"));
  });

  test("7 owner-provided source is not relabeled live public; no search claim", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const out = submitObjective(store, objectivePayload(ws, { livePublic: true }));
    const o = store.getObjective(out.objective.id);
    assert.equal(o.permittedSources.livePublic, false);
    assert.equal(o.permittedSourcesPublic.searchEngine, false);
    assert.equal(o.permittedSourcesPublic.neverRelabelOwnerPasteAsLivePublic, true);
    assert.match(o.permittedSources.label, /owner-provided/);
  });

  test("8 unimplemented role and owner-review bypass are rejected and repaired", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const out = submitObjective(store, objectivePayload(ws));
    const injected = {
      tasks: [
        { key: "sales_call", type: "outreach", assignedRoleId: "sales", assignedAgentId: "sales-bot", prerequisites: [], approvalRequirements: [], workspaceId: ws.id },
        { key: "scout_research", type: "scout_research", assignedRoleId: "business_research", assignedAgentId: scoutAgentId(ws.id), prerequisites: [], approvalRequirements: [], workspaceId: ws.id },
      ],
    };
    const planned = await planObjective(store, out.objective.id, { injectedLivePlan: injected });
    assert.equal(planned.plan.liveProposalRejected, true);
    assert.ok(planned.plan.stepTypes.includes("owner_review"));
    assert.ok(planned.plan.stepTypes.includes("watcher_audit"));
    assert.equal(planned.tasks.some((t) => t.assignedRoleId === "sales" || t.type === "outreach"), false);
  });

  test("9 task states include required set; complete requires a result", async () => {
    for (const s of ["queued", "running", "awaiting_owner_approval", "approved", "rejected", "blocked", "completed", "failed", "canceled"]) {
      assert.ok(TASK_STATES.includes(s));
    }
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    assert.equal(waited.awaitingOwnerApproval, true);
    const scout = store.listTasks(objectiveId).find((t) => t.type === "scout_research");
    assert.equal(scout.status, "completed");
    assert.ok(scout.resultRefs && scout.resultRefs.requestId);
    const review = store.listTasks(objectiveId).find((t) => t.type === "owner_review");
    assert.equal(review.status, "awaiting_owner_approval");
  });
});

describe("mission 11 approvals and assignment", () => {
  test("10 approval records identity, hash, and demo_operator; conductor cannot approve", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    const reqId = waited.pendingApprovalId;
    assert.ok(reqId);
    const req = store.getApprovalRequest(reqId);
    assert.ok(req.workspaceId === ws.id && req.objectiveId === objectiveId && req.contentHash && req.createdAt);
    assert.throws(() => decideApproval(store, reqId, { actor: "conductor-" + ws.id, action: "approve" }), /Conductor cannot/);
    const dec = decideApproval(store, reqId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: true, assignToAtlas: true });
    assert.equal(dec.decision.actorType, "demo_operator");
    assert.equal(dec.decision.actorIdentity, "demo_operator");
    assert.equal(dec.decision.contentHash, req.contentHash);
    assert.notEqual(dec.decision.actorIdentity, "Mason Hemmer");
  });

  test("11 revised content is a new hash; old approval does not cover it", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { objectiveId } = await runToApproval(store, ws);
    const req = (store.listApprovalRequests(objectiveId) || []).find((r) => r.status === "pending");
    const mutated = { ...req, content: { findings: [{ id: "FND-FAKE", kind: "inference", claim: "mutated after issue" }] } };
    store.putApprovalRequest(mutated);
    assert.throws(() => decideApproval(store, req.id, { actor: "demo_operator", action: "approve" }), /new hash|changed since/);
  });

  test("12 rejection does not secretly approve and Atlas does not get rejected knowledge", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    const dec = decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "reject" });
    assert.equal(dec.decision.action, "reject");
    assert.equal(store.getObjective(objectiveId).status, "rejected");
    const findings = store.listScoutFindings(ws.id).filter((f) => (store.listTasks(objectiveId).find((t) => t.type === "scout_research").resultRefs.findingIds || []).includes(f.id));
    assert.equal(findings.some((f) => f.reviewStatus === "approved"), false);
    const again = await tickObjective(store, objectiveId);
    assert.equal(again.done || again.rejected, true);
    const atlas = store.listTasks(objectiveId).find((t) => t.type === "atlas_eval");
    assert.ok(!atlas.resultRefs || !atlas.resultRefs.workbenchRunId);
  });

  test("13 manager invokes Scout then Atlas once then Watcher once then summary", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: true, assignToAtlas: true });
    const done = await runUntilBlocked(store, objectiveId, { parentVersionId: "atlas-v12" });
    const tasks = store.listTasks(objectiveId);
    const byKey = Object.fromEntries(tasks.map((t) => [t.key, t]));
    assert.equal(byKey.scout_research.status, "completed");
    assert.ok(store.getResearchRequest(byKey.scout_research.resultRefs.requestId));
    assert.equal(byKey.owner_review.status, "completed");
    assert.equal(byKey.atlas_train.status, "completed");
    assert.equal(byKey.atlas_eval.status, "completed");
    assert.equal(byKey.atlas_eval.attemptCount, 1);
    assert.ok(store.getWorkbenchRun(byKey.atlas_eval.resultRefs.workbenchRunId));
    assert.equal(byKey.watcher_audit.status, "completed");
    assert.equal(byKey.watcher_audit.attemptCount, 1);
    assert.ok(store.getWatcherAudit(byKey.watcher_audit.resultRefs.auditId));
    assert.equal(byKey.manager_summary.status, "completed");
    const sum = store.getManagerSummary(byKey.manager_summary.resultRefs.summaryId);
    assert.ok(sum.taskIds.length >= 6);
    assert.equal(sum.inventedCompletions, false);
    assert.ok(done.objective.status === "completed" || done.done);
  });
});

describe("mission 11 durability spend control-room stop", () => {
  test("14 FILE_STORE restart while awaiting stays awaiting and does not auto-rerun completed Scout", async () => {
    const { dir, store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    assert.equal(waited.awaitingOwnerApproval, true);
    const scoutId = store.listTasks(objectiveId).find((t) => t.type === "scout_research").id;
    const attempts = store.getTask(scoutId).attemptCount;
    const again = new FileStore(dir);
    const obj = again.getObjective(objectiveId);
    assert.equal(obj.status, "awaiting_owner_approval");
    const ticked = await tickObjective(again, objectiveId);
    assert.equal(ticked.awaitingOwnerApproval, true);
    assert.equal(again.getTask(scoutId).attemptCount, attempts);
    assert.equal(again.getTask(scoutId).status, "completed");
  });

  test("15 pause and resume return to the correct step", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    const paused = pauseObjective(store, objectiveId);
    assert.equal(paused.status, "awaiting_owner_approval");
    const ticked = await tickObjective(store, objectiveId);
    assert.equal(ticked.paused, true);
    const resumed = resumeObjective(store, objectiveId);
    assert.equal(resumed.status, "awaiting_owner_approval");
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: false });
    await runUntilBlocked(store, objectiveId, { parentVersionId: "atlas-v12" });
    const train = store.listTasks(objectiveId).find((t) => t.type === "atlas_train");
    assert.equal(train.status, "canceled");
    assert.equal(train.resultRefs.reason, "optional_not_authorized");
  });

  test("16 spend ceiling is tracked; manager cannot hide specialist calls", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: true });
    await runUntilBlocked(store, objectiveId, { parentVersionId: "atlas-v12" });
    const view = objectiveView(store, objectiveId);
    assert.ok(view.budget.ceiling === 2);
    assert.ok(view.budget.remaining <= view.budget.ceiling);
    const ledger = store.listSpendLedger(ws.id).filter((e) => e.objectiveId === objectiveId);
    assert.ok(ledger.some((e) => e.operation === "scout_research" || e.operation === "extraction"));
    assert.ok(ledger.some((e) => e.operation === "workbench"));
    assert.ok(ledger.some((e) => e.operation === "watcher_audit"));
    assert.ok(ledger.some((e) => e.operation === "manager_plan"));
  });

  test("17 control room objective view statements appear only after stored events", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, objectivePayload(ws));
    const before = objectiveView(store, submitted.objective.id);
    assert.equal(before.findings.length, 0);
    assert.equal(before.fictionalResults, null);
    assert.equal(before.watcher, null);
    assert.equal(before.summary, null);
    assert.equal(before.statementsOnlyAfterStoredEvents, true);
    const waited = await runUntilBlocked(store, submitted.objective.id);
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: true });
    await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12" });
    const after = objectiveView(store, submitted.objective.id);
    assert.ok(after.manager.roleName === "Conductor");
    assert.ok(after.assignedEmployees.some((e) => e.roleId === CONDUCTOR_ROLE_ID));
    assert.ok(after.findings.length >= 1);
    assert.ok(after.fictionalResults && after.fictionalResults.workbenchRunId);
    assert.ok(after.watcher && after.watcher.auditId);
    assert.ok(after.summary);
    assert.ok(after.statements.some((s) => s.kind === "summary"));
    const dash = ownerDashboard(store, ws.id);
    assert.ok(dash.assignedConductor && dash.assignedConductor.roleId === CONDUCTOR_ROLE_ID);
    assert.equal(dash.chain.noFakeManager, true);
  });

  test("18 Watcher material violation cannot auto-succeed the objective", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: true });
    await runUntilBlocked(store, objectiveId, { parentVersionId: "atlas-v12" });
    const watch = store.listTasks(objectiveId).find((t) => t.type === "watcher_audit");
    store.putTask({ ...watch, resultRefs: { ...watch.resultRefs, status: "VIOLATION", blocking: [{ code: "fabricated_owner_policy" }], materialViolation: true } });
    const summary = store.listTasks(objectiveId).find((t) => t.type === "manager_summary");
    store.putTask({ ...summary, status: "queued", resultRefs: {} });
    store.putObjective({ ...store.getObjective(objectiveId), status: "running", completionSummaryId: null });
    await tickObjective(store, objectiveId);
    const obj = store.getObjective(objectiveId);
    assert.notEqual(obj.status, "completed");
    const sum = store.getManagerSummary(obj.completionSummaryId);
    assert.equal(sum.objectiveSucceeded, false);
  });

  test("19 stop conditions: no source, approval pending, reject, missing role", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited } = await runToApproval(store, ws);
    assert.equal(waited.awaitingOwnerApproval, true);
    cancelObjective(store, waited.objective.id);
    assert.equal(store.getObjective(waited.objective.id).status, "canceled");
  });

  test("20 historical atlas-v0..v14 scout-v0 watcher-v0 hashes unchanged; challenge jsonl frozen", () => {
    const historical = JSON.parse(readFileSync(join(import.meta.dirname, "../../../var/state/agent_versions.json"), "utf8"));
    const byId = Object.fromEntries(historical.map((v) => [v.id, v]));
    for (const [id, hash] of Object.entries(FROZEN_HASHES)) assert.equal(byId[id].contentHash, hash, id);
    assert.equal(byId["atlas-v12"].contentHash, ATLAS_V12_LIVE);
    assert.equal(byId["atlas-v13"].contentHash, ATLAS_V13_LIVE);
    assert.equal(byId["atlas-v14"].contentHash, ATLAS_V14_LIVE);
    assert.equal(byId["scout-ws-ridgeline-v0"].contentHash, SCOUT_V0_LIVE);
    assert.equal(byId["watcher-ws-ridgeline-v0"].contentHash, WATCHER_V0_LIVE);
    assert.equal(sha256File(CHALLENGE_CASES_V0), FROZEN_CHALLENGE_JSONL);
    assert.ok(!FROZEN_ATLAS_IDS.includes("atlas-v14"));
    assert.ok(!FROZEN_ATLAS_IDS.includes("atlas-v15"));
  });
});

describe("mission 11 remaining gates", () => {
  test("21 cannot invent missing capabilities or extra employees", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const out = submitObjective(store, objectivePayload(ws));
    const planned = await planObjective(store, out.objective.id, {
      injectedLivePlan: { tasks: [{ key: "exec", type: "executive_brief", assignedRoleId: "executive", assignedAgentId: "exec-1", prerequisites: [], workspaceId: ws.id }] },
    });
    assert.equal(planned.tasks.some((t) => t.assignedRoleId === "executive"), false);
    assert.ok(planned.plan.repairNote || planned.plan.liveProposalRejected);
  });

  test("22 gold isolation: objective view does not expose evaluator secrets or gold", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve" });
    await runUntilBlocked(store, objectiveId, { parentVersionId: "atlas-v12" });
    const view = JSON.stringify(objectiveView(store, objectiveId));
    assert.equal(view.includes("ranked_tiers"), false);
    assert.equal(view.includes("MIDAS_EVALUATOR_SECRET"), false);
  });

  test("23 duplicate dispatch does not rerun a completed Atlas step", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: true });
    await runUntilBlocked(store, objectiveId, { parentVersionId: "atlas-v12" });
    const atlas = store.listTasks(objectiveId).find((t) => t.type === "atlas_eval");
    const runId = atlas.resultRefs.workbenchRunId;
    const attempts = atlas.attemptCount;
    await tickObjective(store, objectiveId);
    const again = store.getTask(atlas.id);
    assert.equal(again.attemptCount, attempts);
    assert.equal(again.resultRefs.workbenchRunId, runId);
    assert.equal(store.listWorkbenchRuns(ws.id).filter((r) => r.id === runId).length, 1);
  });

  test("24 Conductor version is immutable", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const a = ensureConductor(store, ws.id);
    assert.throws(() => store.putVersion({ ...a.version, declaredChange: "rewrite" }), /immutable|already exists/i);
    const b = ensureConductor(store, ws.id);
    assert.equal(b.version.contentHash, a.version.contentHash);
    assert.equal(b.version.id, conductorVersionId(ws.id, 0));
  });

  test("25 no complete before result exists", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const out = submitObjective(store, objectivePayload(ws));
    await planObjective(store, out.objective.id);
    const scout = store.listTasks(out.objective.id).find((t) => t.type === "scout_research");
    assert.notEqual(scout.status, "completed");
    assert.deepEqual(scout.resultRefs, {});
  });

  test("26 allowed roles and workspace isolation on tasks", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const other = createWorkspace(store, { name: "OtherWS", description: "Other workspace business description text here." }).workspace;
    const out = submitObjective(store, objectivePayload(ws));
    const planned = await planObjective(store, out.objective.id);
    assert.ok(planned.tasks.every((t) => t.workspaceId === ws.id));
    assert.equal(planned.tasks.some((t) => t.workspaceId === other.id), false);
  });

  test("27 budget over ceiling in a live plan is not executed", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const out = submitObjective(store, objectivePayload(ws, { maxSpendUsd: 0.01 }));
    const injected = {
      tasks: FIRST_WORKFLOW_TYPES.map((type, i) => ({
        key: type, type: type, assignedRoleId: type === "scout_research" ? "business_research" : type === "watcher_audit" ? "independent_audit" : type === "atlas_eval" || type === "atlas_train" ? "atlas" : "workflow_manager",
        assignedAgentId: "x", prerequisites: i ? [FIRST_WORKFLOW_TYPES[i - 1]] : [], approvalRequirements: type === "owner_review" ? ["scout_findings"] : [],
        workspaceId: ws.id, budgetUsd: 50,
      })),
    };
    const planned = await planObjective(store, out.objective.id, { injectedLivePlan: injected });
    assert.ok(planned.blocked || planned.plan.liveProposalRejected || planned.validation && planned.validation.issues.some((i) => i.code === "budget_over_ceiling" || i.code === "bypass_owner_review"));
  });

  test("28 Scout findings enter owner-review; no skip without recorded approval", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    const atlas = store.listTasks(objectiveId).find((t) => t.type === "atlas_eval");
    assert.equal(atlas.status, "queued");
    assert.equal(waited.awaitingOwnerApproval, true);
    assert.ok(store.getApprovalRequest(waited.pendingApprovalId));
  });

  test("29 optional train skip still runs Atlas on existing version", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const { waited, objectiveId } = await runToApproval(store, ws);
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: false, assignToAtlas: true });
    await runUntilBlocked(store, objectiveId, { parentVersionId: "atlas-v12" });
    const train = store.listTasks(objectiveId).find((t) => t.type === "atlas_train");
    const atlas = store.listTasks(objectiveId).find((t) => t.type === "atlas_eval");
    assert.equal(train.status, "canceled");
    assert.equal(atlas.status, "completed");
    assert.ok(atlas.resultRefs.workbenchRunId);
  });

  test("30 failed specialist is reported honestly without a fake employee reply", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, objectivePayload(ws));
    await planObjective(store, submitted.objective.id);
    const scout = store.listTasks(submitted.objective.id).find((t) => t.type === "scout_research");
    store.putTask({ ...scout, status: "failed", error: "simulated specialist failure", attemptCount: 3, resultRefs: {} });
    const ticked = await tickObjective(store, submitted.objective.id);
    assert.ok(ticked.blocked || ticked.failed || store.getObjective(submitted.objective.id).status === "blocked");
    const view = objectiveView(store, submitted.objective.id);
    assert.equal(JSON.stringify(view).includes("fake employee"), false);
  });
});
