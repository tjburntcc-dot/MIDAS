import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0, FROZEN_ATLAS_IDS } from "@midas/db";
import { retrieveForCase } from "./retrieve-v2.ts";
import { addOwnerAuthoredRule, trainAtlas } from "./knowledge-studio.ts";
import {
  createWorkspace,
  runWorkbench,
  ownerDashboard,
  seedRidgelineDemo,
  seedIsolationWorkspaces,
  IMPLEMENTED_ROLE_IDS,
  RIDGELINE_FICTIONAL_PROSPECTS,
  HANDOFF_FICTIONAL_PROSPECTS,
  HANDOFF_OWNER_PASTE,
  HANDOFF_SCOUT_QUESTION,
  handoffQualificationPolicy,
} from "./workspace.ts";
import { recordUsage, LEDGER_OPERATIONS } from "./spend-ledger.ts";
import {
  ensureScout,
  runScoutResearch,
  reviewFinding,
  assignFindingToAtlas,
  authorPolicyFromSuggestion,
  trainAtlasFromScout,
  scoutAgentId,
  RIDGELINE_SCOUT_QUESTION,
  RIDGELINE_SCOUT_PASTE,
} from "./scout.ts";
import {
  ensureWatcher,
  auditCompletedWork,
  watcherPrompt,
  watcherAgentId,
  classifyOrigin,
  runDeterministicChecks,
  WATCHER_ROLE_ID,
  WATCHER_ROLE_NAME,
  WATCHER_MAY,
  WATCHER_MAY_NOT,
  WATCHER_CHECKS,
  WATCHER_JUDGE_NOTE,
} from "./watcher.ts";
import { CHALLENGE_CASES_V0, FROZEN_CHALLENGE_JSONL } from "./paths.ts";

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
const SCOUT_V0_LIVE = "129841f55a98a7bd0ab45650e4f44c185fd49deb0d2c3fbfc761b64a4c8a1ec5";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m10-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  ensureAtlasV0(store);
  const v0 = store.getVersion("atlas-v0");
  if (!store.getVersion("atlas-v11")) {
    store.putVersion({
      ...v0,
      id: "atlas-v11",
      parentVersionId: "atlas-v0",
      createdAt: new Date().toISOString(),
      declaredChange: "test stand-in parent; not the live atlas-v11 bytes",
      contentHash: "test-parent-atlas-v11",
    });
  }
  if (!store.getVersion("atlas-v12")) {
    store.putVersion({
      ...v0,
      id: "atlas-v12",
      parentVersionId: "atlas-v11",
      createdAt: new Date().toISOString(),
      declaredChange: "test stand-in atlas-v12; not the live bytes",
      contentHash: "test-parent-atlas-v12",
      workspaceId: "ws-ridgeline",
    });
  }
  return { dir, store };
}

async function seedHandoff(store) {
  const ws = createWorkspace(store, { name: "HandoffWS", description: "Handoff workspace business description for roofing software.", goal: "Qualify US roofing contractors. Research when budget is missing." }).workspace;
  addOwnerAuthoredRule(store, {
    statement: "Only United States accounts are eligible. Non-US geography is a hard disqualifier.",
    workspaceId: ws.id,
    competency: "territory",
    applicability: {
      scope: "US-only",
      requiredConditions: [{ id: "c-us", field: "country", op: "neq", value: "US", description: "Not US", evidenceRequired: true }],
      effect: "exclude",
      unknownBehavior: "research_first",
      exceptions: [],
      priority: 95,
    },
  });
  addOwnerAuthoredRule(store, {
    statement: "When verified monthly budget is missing or unknown, research is required. Do not invent a budget number.",
    workspaceId: ws.id,
    competency: "qualification_thresholds",
    applicability: {
      scope: "budget",
      requiredConditions: [{ id: "c-b", field: "monthly_budget_usd", op: "lt", value: 0, description: "unknown budget", evidenceRequired: true }],
      effect: "research_first",
      unknownBehavior: "research_first",
      exceptions: [],
      priority: 80,
    },
  });
  const research = await runScoutResearch(store, {
    workspaceId: ws.id,
    question: HANDOFF_SCOUT_QUESTION,
    paste: HANDOFF_OWNER_PASTE,
    fixture: true,
  });
  const material = research.findings.find((f) => /stronger candidate|estimate by hand|spreadsheet/i.test(f.claim) && f.kind !== "unresolved_question" && f.kind !== "owner_policy_suggestion")
    || research.findings.find((f) => f.kind === "inference" || f.kind === "source_backed_fact");
  assert.ok(material, "expected a material finding");
  reviewFinding(store, material.id, { actor: "owner", action: "approve", assignToAtlas: true });
  const kid = store.getScoutFinding(material.id).knowledgeItemId;
  return { ws, research, material, kid };
}

function handoffRuntime(prospects) {
  return {
    title: "handoff fictional",
    offer: { name: "RidgeLine Estimator", summary: "Roofing takeoff software" },
    qualification_policy: handoffQualificationPolicy(),
    constraints: ["US-only eligibility"],
    prospects: prospects,
  };
}

describe("mission 10 handoff diagnosis and retrieval", () => {
  test("1 handoff audit file exists and names the real gap", () => {
    const path = join(import.meta.dirname, "../../../var/state/mission10-handoff-audit.md");
    assert.equal(existsSync(path), true);
    const text = readFileSync(path, "utf8");
    assert.match(text, /K-SCOUT-FND-001/);
    assert.match(text, /WBRUN-eb696971/);
    assert.match(text, /smallest sufficient covering set|helpful-context|topic|signal/i);
    assert.match(text, /Scenario did not need it|did not need it for eligibility/);
    assert.equal(/must always retrieve K-SCOUT-FND-001/.test(text), false);
  });

  test("2 retrieval exposes dual budgets and inspectable omit reasons", async () => {
    const { store } = tmpStore();
    const { ws, kid } = await seedHandoff(store);
    const ret = retrieveForCase(store, handoffRuntime(HANDOFF_FICTIONAL_PROSPECTS), { workspaceId: ws.id, applicableRole: "atlas" });
    assert.ok(ret.omitted);
    assert.ok(ret.budgets);
    assert.ok("mandatoryPolicyMaxItems" in ret.budgets);
    assert.ok("helpfulContextMaxItems" in ret.budgets);
    assert.ok(ret.selected.every((s) => s.bucket && s.reason != null));
    assert.ok(ret.retrievedItemIds.includes(kid));
    const helpful = ret.selected.find((s) => s.id === kid);
    assert.ok(helpful);
    assert.equal(helpful.bucket, "helpful_context");
    assert.ok((helpful.signalHits || []).includes("manual_estimating") || (helpful.signals || []).includes("manual_estimating"));
  });

  test("3 mandatory owner policies still covered when Scout context is retrieved", async () => {
    const { store } = tmpStore();
    const { ws, kid } = await seedHandoff(store);
    const ret = retrieveForCase(store, handoffRuntime(HANDOFF_FICTIONAL_PROSPECTS), { workspaceId: ws.id, applicableRole: "atlas" });
    const owner = ret.selected.filter((s) => s.bucket === "mandatory_policy" || s.bucket === "coverage");
    assert.ok(owner.length >= 1);
    assert.ok(ret.retrievedItemIds.includes(kid));
    const items = ret.retrievedItemIds.map((id) => store.getKnowledge(id));
    assert.ok(items.some((k) => k && (k.kind === "owner_policy" || k.claimKind === "owner_policy") && /United States/.test(k.statement)));
  });

  test("4 correctly omits an approved Scout finding when the scenario has no matching signal", async () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "OmitWS", description: "Omit-irrelevant workspace business description text." }).workspace;
    addOwnerAuthoredRule(store, { statement: "Only United States accounts are eligible in the omit check.", workspaceId: ws.id, competency: "territory" });
    const research = await runScoutResearch(store, {
      workspaceId: ws.id,
      question: RIDGELINE_SCOUT_QUESTION,
      paste: RIDGELINE_SCOUT_PASTE,
      fixture: true,
    });
    const fact = research.findings.find((f) => f.kind === "source_backed_fact" || f.kind === "inference") || research.findings[0];
    reviewFinding(store, fact.id, { actor: "owner", action: "approve", assignToAtlas: true });
    const kid = store.getScoutFinding(fact.id).knowledgeItemId;
    const runtime = {
      title: "no signal",
      qualification_policy: { required: ["Apply Atlas Owner Policy: Territory"], preferred: [], disqualifiers: [] },
      prospects: [{ id: "P1", facts: { country: "US", monthly_budget_usd: 4000 }, evidence: [{ id: "E1", claim: "US HQ", source: "first_party", age_days: 1 }] }],
    };
    const ret = retrieveForCase(store, runtime, { workspaceId: ws.id, applicableRole: "atlas" });
    assert.equal(ret.retrievedItemIds.includes(kid), false);
    const omit = (ret.omitted || []).find((o) => o.id === kid);
    assert.ok(omit);
    assert.match(omit.reason, /no-topic|no-runtime-signal|principle-without|not-needed/);
  });

  test("5 Atlas workbench cites and ranks with the approved finding without changing hard classes", async () => {
    const { store } = tmpStore();
    const { ws, kid } = await seedHandoff(store);
    const out = await runWorkbench(store, {
      workspaceId: ws.id,
      prospects: HANDOFF_FICTIONAL_PROSPECTS,
      qualification_policy: handoffQualificationPolicy(),
      fixture: true,
    });
    assert.ok(out.run.retrievedItemIds.includes(kid));
    assert.ok((out.run.citedKnowledgeIds || []).includes(kid) || (out.run.handoff && out.run.handoff.cited.includes(kid)));
    assert.equal(out.run.handoff.changedClassification, false);
    assert.equal(out.run.rankedQualifiedIds[0], "P-HAND");
    assert.ok(out.run.rankedQualifiedIds.includes("P-SOFT"));
    const served = Object.fromEntries(out.run.servedAssessments.map((a) => [a.prospect_id, a.classification]));
    assert.equal(served["P-CA"], "disqualified");
    assert.equal(served["P-GAP"], "needs_research");
    assert.equal(served["P-HAND"], "qualified");
    assert.equal(served["P-SOFT"], "qualified");
  });
});

describe("mission 10 Watcher role", () => {
  test("6 Watcher is a real workspace-scoped agent with its own prompt", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "WatchWS", description: "Watcher agent workspace business description." }).workspace;
    const out = ensureWatcher(store, ws.id);
    assert.equal(out.agent.id, watcherAgentId(ws.id));
    assert.equal(out.agent.roleId, WATCHER_ROLE_ID);
    assert.equal(out.agent.roleName, WATCHER_ROLE_NAME);
    assert.ok(out.agent.promptBundle.system.includes("Watcher"));
    assert.equal(out.agent.promptBundle.system.includes("prospect-qualification"), false);
    assert.equal(out.agent.promptBundle.system.includes("Gather source-backed"), false);
    const atlas = store.getAgent("atlas");
    assert.notEqual(out.agent.promptBundle.system, atlas && atlas.promptBundle && atlas.promptBundle.system);
    assert.notEqual(watcherPrompt().system, store.getVersion("atlas-v0").promptBundle.system);
    assert.ok(IMPLEMENTED_ROLE_IDS.includes("independent_audit"));
    assert.equal(out.version.workspaceId, ws.id);
    assert.ok(out.version.declaredChange.includes("Not an Atlas"));
  });

  test("7 Watcher permissions are application-enforced", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "PermWS", description: "Watcher permission workspace description text." }).workspace;
    ensureWatcher(store, ws.id);
    assert.ok(WATCHER_MAY.includes("append_own_audit_reports"));
    assert.ok(WATCHER_MAY.includes("read_served_decisions"));
    for (const n of ["approve_reject_knowledge", "edit_policy", "create_modify_atlas_versions", "change_scout_findings", "promote", "outreach", "access_gold"]) {
      assert.ok(WATCHER_MAY_NOT.includes(n));
    }
    assert.match(WATCHER_JUDGE_NOTE, /not an independent semantic evidence judge/i);
  });

  test("8 Watcher cannot approve, edit policy, train, or mutate inspected records", async () => {
    const { store } = tmpStore();
    const { ws, material } = await seedHandoff(store);
    assert.throws(() => reviewFinding(store, material.id, { actor: "watcher", action: "approve" }), /Watcher cannot|WATCHER/);
    assert.throws(() => authorPolicyFromSuggestion(store, material.id, { actor: "watcher", statement: "Only United States accounts are eligible after watcher." }), /Watcher cannot|owner/);
    assert.throws(() => trainAtlasFromScout(store, { actor: "watcher", workspaceId: ws.id, parentVersionId: "atlas-v12" }), /Watcher cannot|owner/);
    assert.throws(() => trainAtlas(store, { actor: "watcher", workspaceId: ws.id, parentVersionId: "atlas-v12" }), /Watcher cannot/);
    const out = await runWorkbench(store, { workspaceId: ws.id, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy(), fixture: true });
    const before = JSON.stringify(out.run.servedAssessments);
    auditCompletedWork(store, { workspaceId: ws.id, workbenchRunId: out.run.id });
    const after = store.getWorkbenchRun(out.run.id);
    assert.equal(JSON.stringify(after.servedAssessments), before);
  });

  test("9 Watcher audits are append-only and versions are immutable", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "ImmWS", description: "Watcher immutability workspace description text." }).workspace;
    const w = ensureWatcher(store, ws.id);
    const first = auditCompletedWork(store, { workspaceId: ws.id, assessments: [], retrievedItemIds: [] });
    assert.throws(() => store.putWatcherAudit(first.report), /append-only|immutable/i);
    assert.throws(() => store.putVersion({ ...w.version, declaredChange: "rewrite" }), /immutable|already exists/i);
    const again = ensureWatcher(store, ws.id);
    assert.equal(again.version.contentHash, w.version.contentHash);
    assert.equal(again.version.id, w.version.id);
  });

  test("10 dashboard shows three specialists and the chain, no fake manager", async () => {
    const { store } = tmpStore();
    const { ws } = await seedHandoff(store);
    ensureWatcher(store, ws.id);
    await runWorkbench(store, { workspaceId: ws.id, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy(), fixture: true });
    const dash = ownerDashboard(store, ws.id);
    assert.ok(dash.roleResponsibilities.some((r) => r.roleId === "atlas" && r.implemented));
    assert.ok(dash.roleResponsibilities.some((r) => r.roleId === "business_research" && r.implemented));
    assert.ok(dash.roleResponsibilities.some((r) => r.roleId === WATCHER_ROLE_ID && r.implemented));
    assert.ok(dash.roleResponsibilities.some((r) => r.roleId === "watcher" && r.implemented === false && r.label === "unimplemented"));
    assert.ok(dash.chain);
    assert.equal(dash.chain.noFakeManager, true);
    assert.ok(dash.chain.objective);
    assert.match(dash.watcherJudgeNote, /not an independent semantic evidence judge/i);
  });
});

describe("mission 10 provenance and checks", () => {
  test("11 provenance does not flag owner rules for lacking Scout source", async () => {
    const { store } = tmpStore();
    const { ws, kid } = await seedHandoff(store);
    const out = await runWorkbench(store, { workspaceId: ws.id, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy(), fixture: true });
    const audit = auditCompletedWork(store, { workspaceId: ws.id, workbenchRunId: out.run.id, expectNeedsResearchIds: ["P-GAP"] });
    const c17 = audit.report.checks.find((c) => c.id === 17);
    assert.equal(c17.status, "PASS");
    const origins = audit.report.provenance.retrieved.map((r) => r.origin);
    assert.ok(origins.includes("owner_policy"));
    const scoutRow = audit.report.provenance.retrieved.find((r) => r.knowledgeItemId === kid);
    assert.ok(scoutRow);
    assert.ok(["approved_scout_owner_provided", "approved_inference", "approved_sourced_fact"].includes(scoutRow.origin));
    assert.equal(classifyOrigin({ kind: "owner_policy", writtenByOwner: true, reviewStatus: "approved" }), "owner_policy");
  });

  test("12 adversarial: fabricated owner policy, unapproved Scout, no excerpt, cross-workspace, invented fact, unsatisfied DQ, superseded, missing ledger, injection, mismatch", async () => {
    const { store } = tmpStore();
    const { ws } = await seedHandoff(store);
    const iso = seedIsolationWorkspaces(store);
    const out = await runWorkbench(store, { workspaceId: ws.id, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy(), fixture: true });
    const adv = auditCompletedWork(store, {
      workspaceId: ws.id,
      workbenchRunId: out.run.id,
      claimedOwnerPolicyIds: ["K-FAKE-OWNER"],
      claimedScoutIds: ["K-FAKE-SCOUT"],
      forceMissingExcerptIds: ["K-NO-EXCERPT"],
      forceClaimExcerptMismatch: ["K-MISMATCH"],
      contradictsSourceIds: ["K-CONTRA"],
      forceCrossWorkspaceIds: iso.workspaceB ? ["K-OTHER-WS"] : ["K-OTHER-WS"],
      inventedProspectFacts: [{ field: "secret_revenue", value: 999999 }],
      forceUnsatisfiedDq: [{ prospect_id: "P-HAND", knowledge_item_id: "K-DQ" }],
      forceSupersededIds: ["K-OLD"],
      forceMissingLedger: true,
      promptInjection: true,
      forceUnknownOriginIds: ["K-UNK"],
      forceCitedNotRetrieved: ["K-CITE"],
      goldLeak: true,
      invalidLockout: [{ prospect_id: "P-SOFT" }],
    });
    const byId = Object.fromEntries(adv.report.checks.map((c) => [c.id, c]));
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16]) {
      assert.equal(byId[id].status, "VIOLATION", "check " + id);
    }
    assert.equal(adv.report.status, "VIOLATION");
    assert.ok(adv.report.blocking.length >= 1);
    assert.equal(WATCHER_CHECKS.length, 20);
  });

  test("13 negative: valid owner policy, approved supported finding, labeled inference, omitted irrelevant, satisfied DQ, missing fact research, ranking remainder", async () => {
    const { store } = tmpStore();
    const { ws } = await seedHandoff(store);
    const out = await runWorkbench(store, { workspaceId: ws.id, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy(), fixture: true });
    const audit = auditCompletedWork(store, {
      workspaceId: ws.id,
      workbenchRunId: out.run.id,
      expectNeedsResearchIds: ["P-GAP"],
    });
    const byId = Object.fromEntries(audit.report.checks.map((c) => [c.id, c]));
    assert.equal(byId[1].status, "PASS");
    assert.equal(byId[2].status, "PASS");
    assert.equal(byId[17].status, "PASS");
    assert.equal(byId[18].status, "PASS");
    assert.equal(byId[19].status, "PASS");
    assert.equal(byId[20].status, "PASS");
    assert.notEqual(audit.report.status, "VIOLATION");
  });

  test("14 Watcher isolation, gold isolation, ledger integrity", async () => {
    const { store } = tmpStore();
    const iso = seedIsolationWorkspaces(store);
    ensureWatcher(store, iso.workspaceA.id);
    ensureWatcher(store, iso.workspaceB.id);
    const a = await runScoutResearch(store, { workspaceId: iso.workspaceA.id, question: "US", paste: HANDOFF_OWNER_PASTE, fixture: true });
    const fact = a.findings[0];
    reviewFinding(store, fact.id, { actor: "owner", action: "approve", assignToAtlas: true });
    assert.throws(() => auditCompletedWork(store, { workspaceId: iso.workspaceB.id, run: { workspaceId: iso.workspaceA.id, id: "WBRUN-x", servedAssessments: [] } }), /isolation|another workspace/i);
    const out = await runWorkbench(store, { workspaceId: iso.workspaceA.id, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy(), fixture: true });
    assert.equal(JSON.stringify(out.run.runtimeInput).includes("expectedClassification"), false);
    assert.equal(JSON.stringify(out.run.runtimeInput).includes("ranked_tiers"), false);
    const rows = store.listSpendLedger(iso.workspaceA.id);
    assert.ok(rows.some((e) => e.operation === "workbench"));
    auditCompletedWork(store, { workspaceId: iso.workspaceA.id, workbenchRunId: out.run.id });
    assert.ok(store.listSpendLedger(iso.workspaceA.id).some((e) => e.operation === "watcher_audit"));
    assert.ok(LEDGER_OPERATIONS.includes("watcher_audit"));
  });

  test("15 historical atlas-v0..v13 and scout-ws-ridgeline-v0 hashes unchanged; challenge jsonl frozen", () => {
    const historical = JSON.parse(readFileSync(join(import.meta.dirname, "../../../var/state/agent_versions.json"), "utf8"));
    const byId = Object.fromEntries(historical.map((v) => [v.id, v]));
    for (const [id, hash] of Object.entries(FROZEN_HASHES)) {
      assert.equal(byId[id].contentHash, hash, id);
    }
    assert.equal(byId["atlas-v12"].contentHash, ATLAS_V12_LIVE);
    assert.equal(byId["atlas-v13"].contentHash, ATLAS_V13_LIVE);
    assert.equal(byId["scout-ws-ridgeline-v0"].contentHash, SCOUT_V0_LIVE);
    assert.equal(sha256File(CHALLENGE_CASES_V0), FROZEN_CHALLENGE_JSONL);
    assert.ok(!FROZEN_ATLAS_IDS.includes("atlas-v13"));
    assert.ok(!FROZEN_ATLAS_IDS.includes("atlas-v14"));
  });

  test("16 restart keeps Watcher, audits, approvals, and does not rewrite v13", async () => {
    const { dir, store } = tmpStore();
    const { ws, kid } = await seedHandoff(store);
    const trained = trainAtlasFromScout(store, { actor: "owner", workspaceId: ws.id, parentVersionId: "atlas-v12" });
    assert.equal(trained.version.parentVersionId, "atlas-v12");
    const out = await runWorkbench(store, { workspaceId: ws.id, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy(), fixture: true, versionId: trained.version.id });
    auditCompletedWork(store, { workspaceId: ws.id, workbenchRunId: out.run.id });
    const again = new FileStore(dir);
    assert.ok(again.getAgent(watcherAgentId(ws.id)));
    assert.ok(again.getAgent(scoutAgentId(ws.id)));
    assert.ok((again.listWatcherAudits(ws.id) || []).length >= 1);
    assert.ok(again.getKnowledge(kid));
    assert.equal(again.getVersion("atlas-v12").contentHash, "test-parent-atlas-v12");
    assert.throws(() => trainAtlas(store, { workspaceId: ws.id, versionId: "atlas-v13", parentVersionId: "atlas-v12" }), /v13|rewrite|immutable/i);
  });
});
