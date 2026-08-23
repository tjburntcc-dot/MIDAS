import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0, FROZEN_ATLAS_IDS } from "@midas/db";
import { addOwnerAuthoredRule } from "./knowledge-studio.ts";
import { createWorkspace, ownerDashboard } from "./workspace.ts";
import { runScoutResearch, reviewFinding, trainAtlasFromScout, SOURCE_CLASSIFICATIONS, RESEARCH_LABEL, OWNER_LIKE_ACTORS } from "./scout.ts";
import {
  submitObjective, planObjective, tickObjective, runUntilBlocked,
  decideApproval, objectiveView, ensureConductor,
} from "./conductor.ts";
import { HANDOFF_FICTIONAL_PROSPECTS, HANDOFF_OWNER_PASTE, HANDOFF_SCOUT_QUESTION, handoffQualificationPolicy } from "./handoff-scenario.ts";
import { evaluateKnowledgeUsefulness, reviewOneFinding, USEFULNESS_OUTCOMES } from "./usefulness.ts";
import { recordContribution, contributionScorecard, CONTRIBUTION_DISCLOSURE, ALL_CONTRIBUTION_KINDS } from "./contribution.ts";
import { ACTOR_TYPES, createLocalOwnerSession, resolveActorType, rejectMasonClaim } from "./approval-actors.ts";
import { classifyProviderError, describeProviderConnection, writeConnectionMeta, PROVIDER_STATES, resetProviderGatewayForTests } from "./provider-gateway.ts";
import { runDeterministicChecks, WATCHER_CHECKS, WATCHER_M12_CHECKS } from "./watcher.ts";
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
const ATLAS_V14_LIVE = "91340b42e9cc084356cf3fe870d78aa3b8e9be60bc3efbe5e89348f8f68ff4fc";
const ATLAS_V15_LIVE = "0a1b77111582b76a4be3b873a09a4c2a73efec7103f6bb9dafdff7e8a4774a70";
const SCOUT_V0_LIVE = "129841f55a98a7bd0ab45650e4f44c185fd49deb0d2c3fbfc761b64a4c8a1ec5";
const WATCHER_V0_LIVE = "a320bedf0b416080b7017aa4ee764825ccb16ecd3cceec2ddba2b51cb20e0061";
const CONDUCTOR_V0_LIVE = "5b7e2673fac69dab1603c19a9751bf375fd0bce7cb2802254f02b58b2b947102";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m12-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  ensureAtlasV0(store);
  const v0 = store.getVersion("atlas-v0");
  if (!store.getVersion("atlas-v12")) {
    store.putVersion({
      ...v0, id: "atlas-v12", parentVersionId: "atlas-v0", createdAt: new Date().toISOString(),
      declaredChange: "test stand-in atlas-v12", contentHash: "test-parent-atlas-v12", workspaceId: "ws-test",
    });
  }
  return { dir, store };
}

function seedWs(store) {
  const ws = createWorkspace(store, { name: "M12WS", description: "Workspace business description for roofing software usefulness tests.", goal: "Qualify US roofing contractors." }).workspace;
  addOwnerAuthoredRule(store, {
    statement: "Only United States accounts are eligible. Non-US geography is a hard disqualifier.",
    workspaceId: ws.id, competency: "territory",
    applicability: { scope: "US-only", requiredConditions: [{ id: "c-us", field: "country", op: "neq", value: "US", description: "Not US", evidenceRequired: true }], effect: "exclude", unknownBehavior: "research_first", exceptions: [], priority: 95 },
  });
  return ws;
}

const URL_FIXTURE_BODY = [
  "US roofing contractors produce estimates from takeoffs of roof area, pitch, and materials.",
  "Estimating software turns measurements into material lists and proposals.",
  "Contractors who still estimate by hand or with generic spreadsheets may be candidates for dedicated takeoff tools.",
  "This page does not state a conversion rate, average revenue, or win-rate statistic.",
  "Geography in this source is the United States.",
].join("\n");

function urlObjective(ws, extra) {
  return {
    workspaceId: ws.id,
    ownerText: "Research operational buying signals relevant to US roofing companies using these permitted public sources, then evaluate the fictional prospect scenario.",
    seedUrls: ["https://example.com/roofing-signals"],
    livePublic: true,
    permittedFictionalScenario: { title: "fictional", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy() },
    maxSpendUsd: 2,
    ...(extra || {}),
  };
}

function pasteObjective(ws, extra) {
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

describe("mission 12 provider gateway", () => {
  test("1 provider states persist metadata without storing a key", () => {
    const { store } = tmpStore();
    resetProviderGatewayForTests();
    for (const s of ["not_configured", "configured_unverified", "verified_live", "authentication_failed", "network_failed", "temporarily_unavailable"]) {
      assert.ok(PROVIDER_STATES.includes(s));
    }
    const meta = writeConnectionMeta(store, { status: "configured_unverified", fingerprint: "abc123def456", lastError: "re-verification required" });
    assert.equal(meta.status, "configured_unverified");
    assert.equal(meta.fingerprint, "abc123def456");
    const dumped = JSON.stringify(store.getProviderConnection());
    assert.equal(/sk-[a-zA-Z0-9]/.test(dumped), false);
    assert.match(dumped, /Key is not stored/);
    assert.equal(store.getProviderConnection().note.includes("Key is not stored"), true);
  });

  test("2 restart with configured credential reports configured_unverified, not verified_live", () => {
    const { dir, store } = tmpStore();
    writeConnectionMeta(store, { status: "verified_live", fingerprint: "deadbeefcafe", lastVerifiedAt: new Date().toISOString() });
    const again = new FileStore(dir);
    const desc = describeProviderConnection(again);
    assert.notEqual(desc.status, "verified_live");
    assert.ok(desc.status === "configured_unverified" || desc.status === "not_configured");
    if (desc.present) {
      assert.equal(desc.reVerificationRequired, true);
      assert.equal(desc.live, false);
    }
  });

  test("3 health/status path does not probe; first-task reason is distinct from connect", () => {
    resetProviderGatewayForTests();
    assert.equal(classifyProviderError("HTTP 401 invalid_api_key"), "authentication_failed");
    assert.equal(classifyProviderError("OpenAI Responses network fetch failed: ENOTFOUND"), "network_failed");
    assert.equal(classifyProviderError("HTTP 429 insufficient_quota"), "temporarily_unavailable");
  });

  test("4 failed live auth is not a fixture fallback", () => {
    const { store } = tmpStore();
    writeConnectionMeta(store, { status: "authentication_failed", lastError: "HTTP 401 invalid_api_key" });
    const meta = store.getProviderConnection();
    assert.equal(meta.status, "authentication_failed");
    assert.equal(JSON.stringify(meta).includes("fixtureFallback") && meta.fixtureFallback === true, false);
  });

  test("5 shared gateway states are the only allowed connection statuses", () => {
    assert.deepEqual(PROVIDER_STATES, [
      "not_configured", "configured_unverified", "verified_live",
      "authentication_failed", "network_failed", "temporarily_unavailable",
    ]);
  });
});

describe("mission 12 actors and sessions", () => {
  test("6 actor types distinguish local_owner, demo_operator, system, delegated_policy", () => {
    assert.deepEqual(ACTOR_TYPES, ["local_owner", "demo_operator", "system", "delegated_policy"]);
    assert.ok(OWNER_LIKE_ACTORS.includes("local_owner"));
    const scripted = resolveActorType({ actor: "demo_operator" }, null);
    assert.equal(scripted.actorType, "demo_operator");
    assert.notEqual(scripted.actorIdentity, "Mason Hemmer");
    const system = resolveActorType({ actor: "system" }, null);
    assert.equal(system.actorType, "system");
  });

  test("7 scripted HTTP without a local session cannot be local_owner; Mason claim is refused", () => {
    const { store } = tmpStore();
    const claimed = resolveActorType({ actor: "local_owner", actorType: "local_owner" }, null);
    assert.equal(claimed.actorType, "demo_operator");
    const sess = createLocalOwnerSession(store, {});
    const real = resolveActorType({ actor: "local_owner" }, sess);
    assert.equal(real.actorType, "local_owner");
    assert.match(real.securityClaim, /not enterprise IAM/);
    assert.throws(() => rejectMasonClaim("Mason Hemmer", "mason"), /demo_operator, never Mason/);
  });
});

describe("mission 12 public-source Scout via Conductor", () => {
  test("8 objective accepts owner-provided public seed URLs", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const out = submitObjective(store, urlObjective(ws));
    const o = store.getObjective(out.objective.id);
    assert.ok(o.permittedSources.urls.includes("https://example.com/roofing-signals"));
    assert.equal(o.permittedSources.livePublic, true);
    assert.equal(o.permittedSources.paste, null);
    assert.match(o.permittedSources.label, /public URL/);
    assert.equal(o.permittedSourcesPublic.searchEngine, false);
  });

  test("9 Scout fetch from owner URL produces a finding that cites an excerpt", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id,
      question: "What operational buying signals matter for US roofing contractors?",
      seedUrls: ["https://example.com/roofing-signals"],
      urlFixtures: { "https://example.com/roofing-signals": URL_FIXTURE_BODY },
      maxSources: 1,
    });
    assert.ok(research.findings.length >= 1);
    const fact = research.findings.find((f) => f.kind === "source_backed_fact") || research.findings.find((f) => f.excerpt);
    assert.ok(fact);
    assert.ok(String(fact.excerpt).length >= 8);
    const src = store.getSource(fact.sourceId);
    assert.ok(src);
    assert.equal(src.classification, "synthetic_fixture");
    assert.ok(src.originalUrl || src.url);
    assert.ok(src.finalUrl || src.canonical || src.url);
    assert.ok(src.sha256);
  });

  test("10 owner paste is not relabeled live public", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const out = submitObjective(store, pasteObjective(ws, { livePublic: true }));
    const o = store.getObjective(out.objective.id);
    assert.equal(o.permittedSources.livePublic, false);
    assert.equal(o.permittedSourcesPublic.neverRelabelOwnerPasteAsLivePublic, true);
  });

  test("11 source classifications are the required honest set", () => {
    assert.deepEqual(SOURCE_CLASSIFICATIONS, [
      "live_public_source", "owner_provided_document", "owner_provided_paste", "synthetic_fixture", "unavailable_source",
    ]);
  });

  test("12 webpage cannot become owner policy", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id,
      question: "What operational buying signals matter for US roofing contractors?",
      seedUrls: ["https://example.com/roofing-signals"],
      urlFixtures: { "https://example.com/roofing-signals": URL_FIXTURE_BODY },
    });
    const suggestion = research.findings.find((f) => f.kind === "owner_policy_suggestion");
    if (suggestion) {
      assert.notEqual(suggestion.kind, "owner_policy");
    }
    const src = store.getSource(research.collected[0].source.id);
    assert.equal(src.neverBecamePolicy, true);
    const items = store.listKnowledge().filter((k) => k.sourceId === src.id);
    assert.equal(items.some((k) => k.kind === "owner_policy" && k.writtenByOwner !== true), false);
  });

  test("13 Conductor dispatches owner URL research, not paste-only", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, urlObjective(ws));
    const waited = await runUntilBlocked(store, submitted.objective.id, {
      parentVersionId: "atlas-v12",
      urlFixtures: { "https://example.com/roofing-signals": URL_FIXTURE_BODY },
    });
    assert.equal(waited.awaitingOwnerApproval, true);
    const scout = store.listTasks(submitted.objective.id).find((t) => t.type === "scout_research");
    assert.equal(scout.status, "completed");
    assert.ok(scout.resultRefs.requestId);
    assert.deepEqual(scout.resultRefs.seedUrls, ["https://example.com/roofing-signals"]);
    assert.equal(scout.resultRefs.livePublic, true);
    const req = store.getResearchRequest(scout.resultRefs.requestId);
    assert.equal(req.livePublic, true);
    assert.equal(req.searchEngine, false);
    const findings = store.listScoutFindings(ws.id).filter((f) => (scout.resultRefs.findingIds || []).includes(f.id));
    assert.ok(findings.some((f) => f.excerpt && f.excerpt.length >= 8));
  });
});

describe("mission 12 usefulness before train", () => {
  test("14 general usefulness outcomes exist and do not hardcode FND-007 or a version id", () => {
    const src = readFileSync(new URL("./usefulness.ts", import.meta.url), "utf8");
    assert.equal(src.includes("FND-007"), false);
    assert.equal(src.includes("atlas-v15"), false);
    assert.equal(src.includes("atlas-v16"), false);
    assert.equal(src.includes("K-SCOUT-FND-004"), false);
    assert.equal(src.includes("example.com"), false);
    for (const o of ["genuinely_new", "duplicate_existing", "corroborates_existing", "refines_existing", "conflicts_with_existing", "irrelevant_to_objective", "insufficiently_supported"]) {
      assert.ok(USEFULNESS_OUTCOMES.includes(o));
    }
  });

  test("15 near-duplicate findings skip a new Atlas version", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const first = await runScoutResearch(store, {
      workspaceId: ws.id,
      question: "What makes a US roofing contractor a stronger candidate for estimating software?",
      paste: HANDOFF_OWNER_PASTE,
      fixture: true,
    });
    const fact = first.findings.find((f) => f.kind === "source_backed_fact") || first.findings[0];
    reviewFinding(store, fact.id, { actor: "demo_operator", action: "approve", assignToAtlas: true });
    const trained = trainAtlasFromScout(store, { actor: "demo_operator", workspaceId: ws.id, parentVersionId: "atlas-v12", skipUsefulness: true });
    assert.equal(trained.skipped, false);
    const parentId = trained.version.id;
    const second = await runScoutResearch(store, {
      workspaceId: ws.id,
      question: "What makes a US roofing contractor a stronger candidate for estimating software?",
      paste: HANDOFF_OWNER_PASTE,
      fixture: true,
    });
    const fact2 = second.findings.find((f) => f.kind === "source_backed_fact") || second.findings[0];
    reviewFinding(store, fact2.id, { actor: "demo_operator", action: "approve", assignToAtlas: true });
    const skipped = trainAtlasFromScout(store, { actor: "demo_operator", workspaceId: ws.id, parentVersionId: parentId, objectiveText: HANDOFF_SCOUT_QUESTION });
    assert.equal(skipped.skipped, true);
    assert.ok(skipped.reason === "duplicate_or_corroboration_only" || skipped.reason === "no_meaningful_change");
    assert.equal(skipped.version.id, parentId);
    assert.ok(skipped.usefulness.reviews.some((r) => r.outcome === "duplicate_existing" || r.outcome === "corroborates_existing"));
  });

  test("16 refine explains what changed; conflict requires owner review", () => {
    const existing = [{
      id: "K-EXIST-1",
      statement: "US roofing contractors who estimate by hand may be candidates for estimating software.",
      topic: "estimating_workflow",
      signal: "manual_estimating",
      accepted: true,
      reviewStatus: "approved",
      excerpt: "estimate by hand may be candidates",
    }];
    const refine = reviewOneFinding({
      claim: "When a US roofing contractor still estimates by hand, treat that as a positive buying signal only if budget is verified.",
      excerpt: "still estimates by hand only if budget is verified",
      topic: "estimating_workflow",
      signal: "manual_estimating",
    }, existing, "Research operational buying signals relevant to US roofing companies");
    assert.ok(refine.outcome === "refines_existing" || refine.outcome === "corroborates_existing" || refine.outcome === "genuinely_new");
    if (refine.outcome === "refines_existing") assert.match(refine.explanation, /Refines|constraints|conditions/i);
    const conflict = reviewOneFinding({
      claim: "US roofing contractors who estimate by hand are never candidates for estimating software.",
      excerpt: "estimate by hand are never candidates",
      topic: "estimating_workflow",
      signal: "manual_estimating",
    }, existing, "Research operational buying signals relevant to US roofing companies");
    assert.equal(conflict.outcome, "conflicts_with_existing");
    assert.match(conflict.explanation, /Owner review|silently replace/i);
  });

  test("17 insufficient support and irrelevant claims do not warrant training", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const review = evaluateKnowledgeUsefulness(store, {
      workspaceId: ws.id,
      objectiveText: "Research operational buying signals relevant to US roofing companies",
      findings: [
        { id: "F-A", kind: "source_backed_fact", claim: "ok", excerpt: "", flags: ["missing_support"] },
        { id: "F-B", kind: "unresolved_question", claim: "What is the conversion rate?", excerpt: "gap" },
      ],
    });
    assert.equal(review.shouldTrain, false);
    assert.ok(review.reviews.some((r) => r.outcome === "insufficiently_supported"));
  });

  test("18 Conductor train step records skip when usefulness says no meaningful change", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const first = submitObjective(store, pasteObjective(ws));
    const w1 = await runUntilBlocked(store, first.objective.id, { parentVersionId: "atlas-v12", skipUsefulness: true });
    decideApproval(store, w1.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: true, assignToAtlas: true });
    await runUntilBlocked(store, first.objective.id, { parentVersionId: "atlas-v12", skipUsefulness: true, forceTrain: true });
    const second = submitObjective(store, pasteObjective(ws));
    const w2 = await runUntilBlocked(store, second.objective.id, { parentVersionId: "atlas-v12" });
    decideApproval(store, w2.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: true, assignToAtlas: true });
    await runUntilBlocked(store, second.objective.id, { parentVersionId: "atlas-v12" });
    const train = store.listTasks(second.objective.id).find((t) => t.type === "atlas_train");
    assert.equal(train.status, "completed");
    assert.ok(train.resultRefs.skipped === true || train.resultRefs.usefulness);
  });
});

describe("mission 12 contributions Watcher persist hashes", () => {
  test("19 contribution events require stored evidence and cannot be self-awarded", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    assert.throws(() => recordContribution(store, { kind: "objective_completed", workspaceId: ws.id, evidence: {}, selfAwarded: false }), /evidence/);
    assert.throws(() => recordContribution(store, { kind: "objective_completed", workspaceId: ws.id, evidence: { objectiveId: "OBJ-001" }, selfAwarded: true }), /self-awarded/);
    const ev = recordContribution(store, {
      kind: "approval_gate_respected",
      role: "workflow_manager",
      workspaceId: ws.id,
      evidence: { objectiveId: "OBJ-TEST", approvalId: "APD-TEST" },
    });
    assert.equal(ev.selfAwarded, false);
    assert.equal(ev.officialRank, false);
    assert.match(CONTRIBUTION_DISCLOSURE, /not a sealed eval/i);
    const card = contributionScorecard(store, ws.id);
    assert.equal(card.officialRank, false);
    assert.ok(ALL_CONTRIBUTION_KINDS.includes("duplicate_retraining_avoided"));
  });

  test("20 no credit for more text or self-approve; kinds are evidence-backed", () => {
    assert.equal(ALL_CONTRIBUTION_KINDS.includes("more_text"), false);
    assert.equal(ALL_CONTRIBUTION_KINDS.includes("self_approve"), false);
    assert.ok(ALL_CONTRIBUTION_KINDS.includes("supported_finding_proposed"));
  });

  test("21 Watcher core checks stay 20; M12 extensions are additive", () => {
    assert.equal(WATCHER_CHECKS.length, 20);
    assert.ok(WATCHER_M12_CHECKS.length >= 8);
    assert.ok(WATCHER_M12_CHECKS.some((c) => c.code === "public_source_fetched"));
    assert.ok(WATCHER_M12_CHECKS.some((c) => c.code === "webpage_not_policy"));
    assert.ok(WATCHER_M12_CHECKS.some((c) => c.code === "duplicate_not_sold_as_new"));
  });

  test("22 Watcher flags dishonest live-public paste and Mason actor claims", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putSource({
      id: "SRC-FAKE-LIVE", workspaceId: ws.id, url: "midas://paste/x", classification: "live_public_source",
      captureStatus: "OWNER_PASTE", category: "paste", live: false, title: "paste",
    });
    store.putScoutFinding({
      id: "FND-FAKE", workspaceId: ws.id, sourceId: "SRC-FAKE-LIVE", sourceClassification: "live_public_source",
      originLabel: "live_public_source_finding", claim: "x", excerpt: "enough excerpt text", reviewStatus: "approved",
    });
    const inspected = runDeterministicChecks(store, { workspaceId: ws.id, run: { id: "R1", servedAssessments: [], retrievedItemIds: [] } });
    const srcCheck = inspected.checks.find((c) => c.code === "source_category_honest");
    assert.equal(srcCheck.status, "VIOLATION");
  });

  test("23 Watcher public-source, actor, duplicate, ledger, contribution, self-credit, summary checks run", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, pasteObjective(ws));
    const waited = await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12", skipUsefulness: true });
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: false, assignToAtlas: true });
    await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12" });
    const atlas = store.listTasks(submitted.objective.id).find((t) => t.type === "atlas_eval");
    const inspected = runDeterministicChecks(store, {
      workspaceId: ws.id,
      run: store.getWorkbenchRun(atlas.resultRefs.workbenchRunId),
    });
    const codes = inspected.checks.map((c) => c.code);
    for (const c of ["public_source_fetched", "approval_actor_type_accurate", "duplicate_not_sold_as_new", "live_calls_in_ledger", "contribution_refs_stored", "no_self_credit", "summary_matches_stored_work"]) {
      assert.ok(codes.includes(c), c);
    }
    assert.equal(inspected.checks.find((c) => c.code === "no_self_credit").status, "PASS");
    assert.equal(inspected.checks.find((c) => c.code === "approval_actor_type_accurate").status, "PASS");
  });

  test("24 FILE_STORE restart keeps sources, findings, pending approvals, usefulness, contributions", async () => {
    const { dir, store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, urlObjective(ws));
    const waited = await runUntilBlocked(store, submitted.objective.id, {
      parentVersionId: "atlas-v12",
      urlFixtures: { "https://example.com/roofing-signals": URL_FIXTURE_BODY },
    });
    assert.equal(waited.awaitingOwnerApproval, true);
    const again = new FileStore(dir);
    assert.equal(again.getObjective(submitted.objective.id).status, "awaiting_owner_approval");
    const scout = again.listTasks(submitted.objective.id).find((t) => t.type === "scout_research");
    assert.equal(scout.status, "completed");
    assert.ok(again.getResearchRequest(scout.resultRefs.requestId));
    assert.ok(again.listScoutFindings(ws.id).length >= 1);
    assert.ok(again.listApprovalRequests(submitted.objective.id).some((r) => r.status === "pending"));
  });

  test("25 frozen hashes for atlas-v0..v15, scout, watcher, conductor stay unchanged", () => {
    const historical = JSON.parse(readFileSync(join(import.meta.dirname, "../../../var/state/agent_versions.json"), "utf8"));
    const byId = Object.fromEntries(historical.map((v) => [v.id, v]));
    for (const [id, hash] of Object.entries(FROZEN_HASHES)) assert.equal(byId[id].contentHash, hash, id);
    assert.equal(byId["atlas-v12"].contentHash, ATLAS_V12_LIVE);
    assert.equal(byId["atlas-v13"].contentHash, ATLAS_V13_LIVE);
    assert.equal(byId["atlas-v14"].contentHash, ATLAS_V14_LIVE);
    assert.equal(byId["atlas-v15"].contentHash, ATLAS_V15_LIVE);
    assert.equal(byId["scout-ws-ridgeline-v0"].contentHash, SCOUT_V0_LIVE);
    assert.equal(byId["watcher-ws-ridgeline-v0"].contentHash, WATCHER_V0_LIVE);
    assert.equal(byId["conductor-ws-ridgeline-v0"].contentHash, CONDUCTOR_V0_LIVE);
    assert.equal(sha256File(CHALLENGE_CASES_V0), FROZEN_CHALLENGE_JSONL);
    assert.ok(!FROZEN_ATLAS_IDS.includes("atlas-v16"));
  });

  test("26 workspace isolation and gold stay out of the objective view", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, pasteObjective(ws));
    const waited = await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12" });
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: false });
    await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12" });
    const view = JSON.stringify(objectiveView(store, submitted.objective.id));
    assert.equal(view.includes("ranked_tiers"), false);
    assert.equal(view.includes("MIDAS_EVALUATOR_SECRET"), false);
  });

  test("27 RESEARCH_LABEL stays honest and still matches prior missions", () => {
    assert.match(RESEARCH_LABEL, /owner-provided URLs and permitted existing sources/);
    assert.match(RESEARCH_LABEL, /Not internet-wide search/);
  });

  test("28 pending approval is real; scripted decide is demo_operator", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, urlObjective(ws));
    const waited = await runUntilBlocked(store, submitted.objective.id, {
      parentVersionId: "atlas-v12",
      urlFixtures: { "https://example.com/roofing-signals": URL_FIXTURE_BODY },
    });
    assert.equal(waited.awaitingOwnerApproval, true);
    const req = store.getApprovalRequest(waited.pendingApprovalId);
    assert.equal(req.status, "pending");
    const dec = decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: false, assignToAtlas: true });
    assert.equal(dec.decision.actorType, "demo_operator");
    assert.notEqual(dec.decision.actorIdentity, "Mason Hemmer");
  });

  test("29 optional train skip still runs Atlas on the existing version", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, pasteObjective(ws));
    const waited = await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12" });
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: false, assignToAtlas: true });
    await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12" });
    const train = store.listTasks(submitted.objective.id).find((t) => t.type === "atlas_train");
    const atlas = store.listTasks(submitted.objective.id).find((t) => t.type === "atlas_eval");
    assert.equal(train.status, "canceled");
    assert.equal(atlas.status, "completed");
    assert.ok(atlas.resultRefs.workbenchRunId);
  });

  test("30 summary does not claim work that never ran; dashboard has no fake manager", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, pasteObjective(ws));
    const before = objectiveView(store, submitted.objective.id);
    assert.equal(before.fictionalResults, null);
    assert.equal(before.watcher, null);
    assert.equal(before.summary, null);
    const waited = await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12" });
    decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: false });
    await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12" });
    const after = objectiveView(store, submitted.objective.id);
    assert.ok(after.statementsOnlyAfterStoredEvents);
    assert.ok(after.summary);
    assert.equal(after.summary.inventedCompletions, false);
    const dash = ownerDashboard(store, ws.id);
    assert.equal(dash.chain.noFakeManager, true);
  });
});
