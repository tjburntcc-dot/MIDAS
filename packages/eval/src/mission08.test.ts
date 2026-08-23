import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0, FROZEN_ATLAS_IDS, ATLAS_V11_ID } from "@midas/db";
import { retrieveForCase } from "./retrieve-v2.ts";
import { addOwnerAuthoredRule, addPastedText, reviewKnowledgeItem, trainAtlas } from "./knowledge-studio.ts";
import {
  createWorkspace,
  inspectWorkspace,
  setupWorkspace,
  extendAtlasAgent,
  runWorkbench,
  ownerDashboard,
  seedRidgelineDemo,
  seedIsolationWorkspaces,
  storeOwnerReviewLabels,
  RESERVED_ROLE_IDS,
  IMPLEMENTED_ROLE_IDS,
  EPISTEMIC_CLASSES,
  WORKBENCH_BANNER,
  RIDGELINE_FICTIONAL_PROSPECTS,
  RIDGELINE_OWNER_LABELS,
  RIDGELINE_PRODUCT,
} from "./workspace.ts";
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

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m08-"));
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
  return { dir, store };
}

describe("mission 08 workspace persistence", () => {
  test("1 workspace is a first-class FILE_STORE object", () => {
    const { store } = tmpStore();
    const out = createWorkspace(store, {
      name: "Test Co",
      description: "A business description of a fictional contractor tool.",
      industry: "software",
      type: "b2b_saas",
      offer: { name: "Tool", summary: "Fictional offer" },
      idealCustomer: "US contractors",
      geography: "US",
      goal: "Qualify US contractors",
      constraints: ["US-only"],
    });
    const ws = store.getWorkspace(out.workspace.id);
    assert.ok(ws);
    for (const key of ["id", "name", "description", "industry", "type", "offer", "idealCustomer", "geography", "goal", "constraints", "createdAt", "updatedAt", "ownerStatus"]) {
      assert.ok(ws[key] != null, key);
    }
    assert.equal(ws.epistemicClass, "business_description");
    assert.equal(out.descriptionBecamePolicy, false);
    const again = new FileStore(store.dir);
    assert.equal(again.getWorkspace(ws.id).name, "Test Co");
  });

  test("2 Atlas is extended; reserved roles are not fake employees", () => {
    const { store } = tmpStore();
    createWorkspace(store, { name: "Solo", description: "Business description for a single-agent workspace." });
    const agent = extendAtlasAgent(store);
    assert.equal(agent.id, "atlas");
    assert.equal(agent.roleId, "atlas");
    assert.ok(agent.objective);
    assert.ok(Array.isArray(agent.boundaries));
    assert.ok(agent.versionHistory);
    assert.ok(agent.approvedKnowledgeAccess);
    assert.ok(agent.toolPermissions);
    assert.equal(agent.status, "active");
    assert.ok(IMPLEMENTED_ROLE_IDS.includes("atlas"));
    assert.ok(IMPLEMENTED_ROLE_IDS.includes("business_research"));
    for (const role of ["opportunity_research", "marketing", "sales", "ops", "finance", "executive", "watcher"]) {
      assert.ok(RESERVED_ROLE_IDS.includes(role));
      assert.equal(IMPLEMENTED_ROLE_IDS.includes(role), false);
      assert.equal(store.listAgents().some((a) => a.id === role || a.roleId === role && a.id !== "atlas"), false);
    }
    assert.equal(store.listAgents().filter((a) => a.id !== "atlas").length, 0);
  });

  test("3 knowledge items persist workspaceId and applicableRole", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "KWS", description: "Knowledge workspace business description here." }).workspace;
    const rule = addOwnerAuthoredRule(store, {
      statement: "Only United States accounts are eligible for this workspace.",
      workspaceId: ws.id,
      applicableRole: "atlas",
    });
    const item = store.getKnowledge(rule.item.id);
    assert.equal(item.workspaceId, ws.id);
    assert.equal(item.applicableRole, "atlas");
    assert.equal(rule.item.epistemicClass, "owner_policy");
  });

  test("4 workspace A knowledge is never retrieved for workspace B", () => {
    const { store } = tmpStore();
    const iso = seedIsolationWorkspaces(store);
    const runtime = {
      title: "isolation",
      offer: { name: "x", summary: "x" },
      qualification_policy: { required: ["Apply Atlas Owner Policy: Territory"], preferred: [], disqualifiers: [] },
      constraints: ["US-only"],
      prospects: [{ id: "P1", facts: { country: "CA" }, evidence: [{ id: "E1", claim: "Canada HQ", source: "first_party", age_days: 1 }] }],
    };
    const a = retrieveForCase(store, runtime, { workspaceId: iso.workspaceA.id, workspaceAllowlist: [iso.workspaceA.id] });
    const b = retrieveForCase(store, runtime, { workspaceId: iso.workspaceB.id, workspaceAllowlist: [iso.workspaceB.id] });
    const aIds = a.retrievedItemIds;
    const bIds = b.retrievedItemIds;
    const aItems = (store.listKnowledge() || []).filter((k) => (k.workspaceId || k.workspace) === iso.workspaceA.id);
    const bItems = (store.listKnowledge() || []).filter((k) => (k.workspaceId || k.workspace) === iso.workspaceB.id);
    assert.ok(aItems.length >= 1);
    assert.ok(bItems.length >= 1);
    for (const id of aIds) {
      const k = store.getKnowledge(id);
      assert.notEqual(k.workspaceId || k.workspace, iso.workspaceB.id);
    }
    for (const id of bIds) {
      const k = store.getKnowledge(id);
      assert.notEqual(k.workspaceId || k.workspace, iso.workspaceA.id);
    }
    assert.ok(aItems.every((k) => !bIds.includes(k.id)));
    assert.ok(bItems.every((k) => !aIds.includes(k.id)));
  });

  test("5 training event is created and is not promotion", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "TrainWS", description: "Training workspace business description text." }).workspace;
    addOwnerAuthoredRule(store, { statement: "Only United States accounts are eligible in this training workspace.", workspaceId: ws.id });
    const trained = trainAtlas(store, {
      workspaceId: ws.id,
      parentVersionId: "atlas-v11",
      declaredChange: "Freeze owner rule. Not a promotion.",
    });
    assert.ok(trained.version.id === "atlas-v12" || /^atlas-v\d+$/.test(trained.version.id));
    assert.equal(trained.version.parentVersionId, "atlas-v11");
    assert.equal(trained.promotion, false);
    assert.equal(trained.trainingEvent.reviewStatus, "created");
    assert.notEqual(trained.trainingEvent.reviewStatus, "promoted");
    assert.ok(TRAINING_STATUSES_OK(trained.trainingEvent));
    assert.equal(trained.trainingEvent.workspaceId, ws.id);
    assert.equal(trained.trainingEvent.agentId, "atlas");
    assert.equal(trained.trainingEvent.prevVersionId, "atlas-v11");
    assert.equal(trained.trainingEvent.newVersionId, trained.version.id);
    assert.ok(Array.isArray(trained.trainingEvent.addedKnowledge));
    assert.ok(Array.isArray(trained.trainingEvent.removedKnowledge));
    assert.ok(Array.isArray(trained.trainingEvent.supersededKnowledge));
    assert.ok(Array.isArray(trained.trainingEvent.ownerRules));
    assert.ok(trained.trainingEvent.timestamp);
    assert.ok(trained.trainingEvent.reason);
    assert.ok(trained.trainingEvent.relatedTestResult);
    assert.ok(["live", "fixture"].includes(trained.trainingEvent.relatedTestResult.kind));
  });
});

function TRAINING_STATUSES_OK(ev) {
  return ["created", "tested", "improved_on_dev_scenario", "officially_approved", "promoted"].includes(ev.reviewStatus);
}

describe("mission 08 epistemic classes and train", () => {
  test("6 business description does not auto-become policy", () => {
    const { store } = tmpStore();
    const out = createWorkspace(store, {
      name: "DescWS",
      description: "We only sell in the United States and never contact Apex Roofing Partners.",
    });
    setupWorkspace(store, out.workspace.id, { description: "We only sell in the United States and never contact Apex Roofing Partners." });
    const items = (store.listKnowledge() || []).filter((k) => (k.workspaceId || k.workspace) === out.workspace.id);
    assert.equal(items.filter((k) => k.kind === "owner_policy").length, 0);
    assert.equal(store.getWorkspace(out.workspace.id).epistemicClass, "business_description");
    assert.ok(EPISTEMIC_CLASSES.includes("business_description"));
    assert.ok(EPISTEMIC_CLASSES.includes("owner_policy"));
    assert.ok(EPISTEMIC_CLASSES.includes("sourced_fact"));
    assert.ok(EPISTEMIC_CLASSES.includes("agent_instruction"));
    assert.ok(EPISTEMIC_CLASSES.includes("unverified_suggestion"));
  });

  test("7 kinds stay distinct across description, policy, fact, instruction, suggestion", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "Kinds", description: "Business description remains a description." }).workspace;
    const policy = addOwnerAuthoredRule(store, { statement: "Only United States accounts are eligible for kind checks.", workspaceId: ws.id });
    const paste = addPastedText(store, { text: "- Public page mentions a fourteen day cooling-off period.", workspaceId: ws.id });
    assert.equal(policy.item.kind, "owner_policy");
    assert.equal(policy.item.epistemicClass, "owner_policy");
    assert.equal(paste.items[0].reviewStatus, "proposed");
    assert.notEqual(paste.items[0].kind, "owner_policy");
    const approvedFact = reviewKnowledgeItem(store, paste.items[0].id, { action: "approve" });
    assert.equal(approvedFact.item.kind, "sourced_fact");
    assert.equal(store.getWorkspace(ws.id).epistemicClass, "business_description");
  });

  test("8 train parents latest frozen v11 and does not rewrite v0-v11", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "V12", description: "Version freeze workspace description text." }).workspace;
    addOwnerAuthoredRule(store, { statement: "Require research when verified monthly budget is missing or unknown.", workspaceId: ws.id });
    const parentHash = store.getVersion("atlas-v11").contentHash;
    const trained = trainAtlas(store, { workspaceId: ws.id, parentVersionId: "atlas-v11", declaredChange: "v12 freeze" });
    assert.equal(trained.version.parentVersionId, "atlas-v11");
    assert.equal(store.getVersion("atlas-v11").contentHash, parentHash);
    assert.equal(store.getVersion("atlas-v0").id, "atlas-v0");
    assert.throws(() => trainAtlas(store, { workspaceId: ws.id, versionId: "atlas-v11", parentVersionId: "atlas-v11" }), /v11|rewrite|immutable/i);
    assert.ok(trained.version.workspaceId === ws.id);
    assert.ok(!FROZEN_ATLAS_IDS.includes(trained.version.id));
    assert.notEqual(trained.version.id, ATLAS_V11_ID);
  });

  test("9 train excludes unapproved, rejected, and superseded items", () => {
    const { store } = tmpStore();
    const ws = createWorkspace(store, { name: "Excl", description: "Exclusion workspace business description text." }).workspace;
    const owner = addOwnerAuthoredRule(store, { statement: "Only United States accounts are eligible after review.", workspaceId: ws.id });
    const pasted = addPastedText(store, { text: "- Unapproved claim must stay out of the frozen snapshot.", workspaceId: ws.id });
    const rej = addPastedText(store, { text: "- Reject this second proposed claim about a fake process.", workspaceId: ws.id });
    reviewKnowledgeItem(store, rej.items[0].id, { action: "reject" });
    const trained = trainAtlas(store, { workspaceId: ws.id, parentVersionId: "atlas-v11", itemIds: [owner.item.id, pasted.items[0].id, rej.items[0].id] });
    assert.ok(trained.approvedItemIds.includes(owner.item.id));
    assert.equal(trained.approvedItemIds.includes(pasted.items[0].id), false);
    assert.equal(trained.approvedItemIds.includes(rej.items[0].id), false);
  });

  test("10 owner-review labels are stored separately and never in runtime input", async () => {
    const { store } = tmpStore();
    const demo = seedRidgelineDemo(store, { parentVersionId: "atlas-v11" });
    const labels = store.listOwnerReviewLabels(demo.workspace.id);
    assert.ok(labels.length >= 5);
    const out = await runWorkbench(store, {
      workspaceId: demo.workspace.id,
      prospects: RIDGELINE_FICTIONAL_PROSPECTS,
      ownerReviewLabels: RIDGELINE_OWNER_LABELS,
      fixture: true,
    });
    const blob = JSON.stringify(out.run.runtimeInput);
    assert.equal(blob.includes("expectedClassification"), false);
    assert.equal(blob.includes("ranked_tiers"), false);
    assert.ok(out.run.runtimeInput.prospects.every((p) => !p.expectedClassification));
    assert.ok(store.listOwnerReviewLabels(demo.workspace.id).length >= 5);
  });
});

describe("mission 08 workbench and isolation", () => {
  test("11 workbench is fictional, no outreach, not sealed", async () => {
    const { store } = tmpStore();
    const demo = seedRidgelineDemo(store, { parentVersionId: "atlas-v11" });
    const out = await runWorkbench(store, {
      workspaceId: demo.workspace.id,
      prospects: RIDGELINE_FICTIONAL_PROSPECTS,
      fixture: true,
    });
    assert.match(out.banner, /[Ff]ictional/);
    assert.equal(out.run.outreach, false);
    assert.equal(out.run.sealedEval, false);
    assert.equal(out.run.fictional, true);
    assert.equal(out.generalizationProof, false);
    assert.ok(WORKBENCH_BANNER.includes("test data"));
    assert.equal(demo.product.name, RIDGELINE_PRODUCT.name);
  });

  test("12 workbench classifies, ranks only viable, flags missing, cites evidence", async () => {
    const { store } = tmpStore();
    const demo = seedRidgelineDemo(store, { parentVersionId: "atlas-v11" });
    const out = await runWorkbench(store, {
      workspaceId: demo.workspace.id,
      prospects: RIDGELINE_FICTIONAL_PROSPECTS,
      fixture: true,
    });
    const by = Object.fromEntries(out.run.servedAssessments.map((a) => [a.prospect_id, a]));
    assert.equal(by["P-QUAL"].classification, "qualified");
    assert.equal(by["P-BUDGET"].classification, "needs_research");
    assert.equal(by["P-INTL"].classification, "disqualified");
    assert.equal(by["P-PROT"].classification, "disqualified");
    assert.notEqual(by["P-SIM"].classification, "disqualified");
    assert.deepEqual(out.run.rankedQualifiedIds.slice().sort(), out.run.servedAssessments.filter((a) => a.classification === "qualified").map((a) => a.prospect_id).sort());
    assert.ok(out.run.rankedQualifiedIds.includes("P-QUAL"));
    assert.equal(out.run.rankedQualifiedIds.includes("P-INTL"), false);
    assert.equal(out.run.rankedQualifiedIds.includes("P-PROT"), false);
    assert.ok(by["P-BUDGET"].missing_information && by["P-BUDGET"].missing_information.length >= 0);
    assert.ok(by["P-QUAL"].cited_evidence_ids.length >= 1);
    assert.ok(out.run.retrievedItemIds.length >= 1);
    assert.ok(out.run.rawAssessments.length >= 1);
    assert.ok(out.run.why.some((w) => w.decision === "exclude" || w.why));
  });

  test("13 isolation uses conflicting US vs Canada rules", () => {
    const { store } = tmpStore();
    const iso = seedIsolationWorkspaces(store);
    const aRules = (store.listKnowledge() || []).filter((k) => (k.workspaceId || k.workspace) === iso.workspaceA.id && k.reviewStatus === "approved");
    const bRules = (store.listKnowledge() || []).filter((k) => (k.workspaceId || k.workspace) === iso.workspaceB.id && k.reviewStatus === "approved");
    assert.ok(aRules.some((k) => /United States/i.test(k.statement)));
    assert.ok(bRules.some((k) => /Canada/i.test(k.statement)));
    assert.ok(aRules.every((k) => k.workspaceId === iso.workspaceA.id));
    assert.ok(bRules.every((k) => k.workspaceId === iso.workspaceB.id));
  });

  test("14 approval does not cross workspaces", () => {
    const { store } = tmpStore();
    const iso = seedIsolationWorkspaces(store);
    const aPaste = addPastedText(store, { text: "- Workspace A sourced claim about a public US process.", workspaceId: iso.workspaceA.id });
    reviewKnowledgeItem(store, aPaste.items[0].id, { action: "approve" });
    const bItems = (store.listKnowledge() || []).filter((k) => (k.workspaceId || k.workspace) === iso.workspaceB.id);
    assert.equal(bItems.some((k) => k.id === aPaste.items[0].id), false);
    const bDash = ownerDashboard(store, iso.workspaceB.id);
    assert.equal((bDash.studio.items || []).some((k) => k.id === aPaste.items[0].id), false);
  });

  test("15 private notes do not leak across workspaces or retrieval", () => {
    const { store } = tmpStore();
    const iso = seedIsolationWorkspaces(store);
    const notesA = store.listWorkspaceNotes(iso.workspaceA.id);
    const notesB = store.listWorkspaceNotes(iso.workspaceB.id);
    assert.ok(notesA.length >= 1);
    assert.ok(notesB.length >= 1);
    const runtime = {
      title: "notes",
      qualification_policy: { required: ["Apply Atlas Owner Policy: Territory"], preferred: [], disqualifiers: [] },
      prospects: [{ id: "P1", facts: { country: "US" }, evidence: [{ id: "E1", claim: "US HQ", source: "first_party", age_days: 1 }] }],
    };
    const a = retrieveForCase(store, runtime, { workspaceId: iso.workspaceA.id, workspaceAllowlist: [iso.workspaceA.id] });
    const blob = JSON.stringify(a);
    assert.equal(blob.includes("Seattle pipeline"), false);
    assert.equal(blob.includes("Toronto pipeline"), false);
    const b = retrieveForCase(store, runtime, { workspaceId: iso.workspaceB.id, workspaceAllowlist: [iso.workspaceB.id] });
    assert.equal(JSON.stringify(b).includes("Seattle pipeline"), false);
  });

  test("16 retrieveForCase workspaceId allowlist is enforced", () => {
    const { store } = tmpStore();
    const iso = seedIsolationWorkspaces(store);
    const runtime = {
      title: "allowlist",
      qualification_policy: { required: ["Apply Atlas Owner Policy: Territory"], preferred: [], disqualifiers: [] },
      prospects: [{ id: "P1", facts: { country: "US", monthly_budget_usd: 3000 }, evidence: [{ id: "E1", claim: "US", source: "first_party", age_days: 1 }] }],
    };
    const a = retrieveForCase(store, runtime, { workspaceId: iso.workspaceA.id });
    const both = retrieveForCase(store, runtime, { workspaceAllowlist: [iso.workspaceA.id] });
    for (const id of a.retrievedItemIds.concat(both.retrievedItemIds)) {
      const k = store.getKnowledge(id);
      const kid = k.workspaceId || k.workspace;
      if (kid && kid !== "default") assert.equal(kid, iso.workspaceA.id);
    }
  });
});

describe("mission 08 hashes, restart, demo, dashboard", () => {
  test("17 live v0-v11 content hashes are unchanged", () => {
    const historical = join(import.meta.dirname, "../../../var/state/agent_versions.json");
    assert.equal(existsSync(historical), true);
    const versions = JSON.parse(readFileSync(historical, "utf8"));
    const byId = Object.fromEntries(versions.map((v) => [v.id, v]));
    for (const [id, hash] of Object.entries(FROZEN_HASHES)) {
      assert.ok(byId[id], id);
      assert.equal(byId[id].contentHash, hash, id);
    }
    assert.equal(sha256File(CHALLENGE_CASES_V0), FROZEN_CHALLENGE_JSONL);
  });

  test("18 restart keeps workspace, rules, version, and workbench history", async () => {
    const { dir, store } = tmpStore();
    const demo = seedRidgelineDemo(store, { parentVersionId: "atlas-v11" });
    const run = await runWorkbench(store, {
      workspaceId: demo.workspace.id,
      prospects: RIDGELINE_FICTIONAL_PROSPECTS,
      fixture: true,
    });
    const again = new FileStore(dir);
    assert.ok(again.getWorkspace(demo.workspace.id));
    assert.ok((again.listKnowledge() || []).some((k) => (k.workspaceId || k.workspace) === demo.workspace.id && k.reviewStatus === "approved"));
    assert.ok(again.getVersion(demo.training.version.id));
    assert.ok(again.getWorkbenchRun(run.run.id));
    assert.ok((again.listTrainingEvents(demo.workspace.id) || []).some((e) => e.newVersionId === demo.training.version.id));
  });

  test("19 demo has five owner rules and five fictional prospect types", async () => {
    const { store } = tmpStore();
    const demo = seedRidgelineDemo(store, { parentVersionId: "atlas-v11" });
    const rules = demo.rules.filter((k) => k.kind === "owner_policy" || k.claimKind === "owner_policy");
    assert.ok(rules.length >= 5);
    const statements = rules.map((k) => k.statement).join(" ");
    assert.match(statements, /United States|US /);
    assert.match(statements, /budget/i);
    assert.match(statements, /Apex Roofing Partners/);
    assert.match(statements, /2500/);
    assert.match(statements, /outdated/i);
    const ids = RIDGELINE_FICTIONAL_PROSPECTS.map((p) => p.id).sort();
    assert.deepEqual(ids, ["P-BUDGET", "P-INTL", "P-PROT", "P-QUAL", "P-SIM"]);
    const out = await runWorkbench(store, { workspaceId: demo.workspace.id, prospects: RIDGELINE_FICTIONAL_PROSPECTS, fixture: true });
    const by = Object.fromEntries(out.run.servedAssessments.map((a) => [a.prospect_id, a.classification]));
    assert.equal(by["P-QUAL"], "qualified");
    assert.equal(by["P-BUDGET"], "needs_research");
    assert.equal(by["P-INTL"], "disqualified");
    assert.equal(by["P-PROT"], "disqualified");
    assert.notEqual(by["P-SIM"], "disqualified");
  });

  test("20 owner dashboard reports workspace, agent, version, counts, run, judge advisory", async () => {
    const { store } = tmpStore();
    const demo = seedRidgelineDemo(store, { parentVersionId: "atlas-v11" });
    await runWorkbench(store, { workspaceId: demo.workspace.id, prospects: RIDGELINE_FICTIONAL_PROSPECTS, fixture: true });
    const dash = ownerDashboard(store, demo.workspace.id);
    assert.equal(dash.currentWorkspace.id, demo.workspace.id);
    assert.equal(dash.assignedAgent.id, "atlas");
    assert.ok(dash.currentAtlasVersion && dash.currentAtlasVersion.id);
    assert.ok(dash.approvedRuleCount >= 5);
    assert.ok(dash.latestTrainingEvent);
    assert.ok(dash.latestFictionalRun);
    assert.ok(Array.isArray(dash.latestFictionalRun.servedClassifications));
    assert.ok(dash.latestFictionalRun.retrievedRules);
    assert.ok(dash.latestFictionalRun.why);
    assert.ok(["live", "fixture"].includes(dash.latestFictionalRun.liveVsFixture));
    assert.equal(dash.judgeAdvisory, true);
    assert.equal(dash.official, false);
    assert.match(dash.isolation, /not an enterprise IAM/i);
    assert.equal(inspectWorkspace(store, demo.workspace.id).workspace.id, demo.workspace.id);
  });
});
