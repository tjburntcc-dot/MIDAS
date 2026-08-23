import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0 } from "@midas/db";
import { addOwnerAuthoredRule } from "./knowledge-studio.ts";
import { createWorkspace } from "./workspace.ts";
import { runScoutResearch, reviewFinding, trainAtlasFromScout, SOURCE_CLASSIFICATIONS } from "./scout.ts";
import { submitObjective, runUntilBlocked, decideApproval, resolveServingAtlasVersion } from "./conductor.ts";
import { HANDOFF_FICTIONAL_PROSPECTS, handoffQualificationPolicy } from "./handoff-scenario.ts";
import { evaluateKnowledgeUsefulness, reviewOneFinding, USEFULNESS_OUTCOMES, USEFULNESS_GATES } from "./usefulness.ts";
import { extractSubstantiveHtml, runExtractFixtures, HTML_EXTRACT_FIXTURES } from "./html-extract.ts";
import { checkSourceSupport } from "./source-support.ts";
import { freezeFictionalScenario, defineExpectedUtility, recordExpectedUtility } from "./expected-utility.ts";
import { shadowCompile, SHADOW_OUTCOMES } from "./shadow-compile.ts";
import { diagnoseFnd013, appendFindingDisposition, appendVersionReview, VERSION_ROLES } from "./finding-disposition.ts";
import { applyMission13History, HISTORICAL_WEBPAGE_POLICY_IDS } from "./mission13-history.ts";
import { recordContribution, invalidateContribution, contributionScorecard, CONTRIBUTION_STATES, scoutCreditEligible } from "./contribution.ts";
import { createLocalOwnerSession, resolveActorType } from "./approval-actors.ts";
import { runDeterministicChecks, WATCHER_SCOPES } from "./watcher.ts";
import { buildWorkspaceExport, importWorkspaceDryRun, exportWorkspace } from "./workspace-export.ts";
import { ownerCannotOverrideEvidence } from "./usefulness.ts";

const ATLAS_V14 = "91340b42e9cc084356cf3fe870d78aa3b8e9be60bc3efbe5e89348f8f68ff4fc";
const ATLAS_V15 = "0a1b77111582b76a4be3b873a09a4c2a73efec7103f6bb9dafdff7e8a4774a70";
const ATLAS_V16 = "64bb716d5aa030376a1e96194a30858bb3ad67093ede1c16b3146a1fd86321d1";
const SCOUT_V0 = "129841f55a98a7bd0ab45650e4f44c185fd49deb0d2c3fbfc761b64a4c8a1ec5";
const WATCHER_V0 = "a320bedf0b416080b7017aa4ee764825ccb16ecd3cceec2ddba2b51cb20e0061";
const CONDUCTOR_V0 = "5b7e2673fac69dab1603c19a9751bf375fd0bce7cb2802254f02b58b2b947102";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m13-"));
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
  const ws = createWorkspace(store, { name: "M13WS", description: "Workspace business description for roofing software usefulness tests.", goal: "Qualify US roofing contractors." }).workspace;
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

describe("mission 13 part A disposition", () => {
  test("1 FND-013 disposition is insufficiently supported and non-substantive", () => {
    const { store } = tmpStore();
    store.putScoutFinding({
      id: "FND-013", workspaceId: "ws-ridgeline", claim: "Skip to Content An official website", excerpt: "Skip to Content An official website of the United States government",
      sourceId: "SRC-STUDIO-URL-004", kind: "source_backed_fact", reviewStatus: "approved",
    });
    store.putSource({ id: "SRC-STUDIO-URL-004", url: "https://www.bls.gov/ooh/construction-and-extraction/roofers.htm", excerpt: "Roofers Skip to Content", sha256: "x", captureStatus: "LIVE_WEB", live: true });
    const d = diagnoseFnd013(store);
    assert.match(d.disposition.verdict, /insufficiently_supported|non_substantive/);
    assert.equal(d.disposition.rewritten, false);
    assert.equal(store.getScoutFinding("FND-013").reviewStatus, "approved");
  });

  test("2 genuinely_new without relevance and support is not useful", () => {
    const review = reviewOneFinding({
      claim: "Skip to Content An official website of the United States government",
      excerpt: "Skip to Content An official website of the United States government Here is how you know",
      kind: "source_backed_fact",
    }, [], "Research operational buying signals relevant to US roofing companies");
    assert.equal(review.outcome, "boilerplate_or_non_substantive");
    assert.notEqual(review.outcome, "genuinely_new");
  });

  test("3 atlas-v16 review is ineligible candidate, not serving or promoted", () => {
    const { store } = tmpStore();
    const v = appendVersionReview(store, {
      versionId: "atlas-v16", parentVersionId: "atlas-v15", versionRole: "candidate_version",
      ineligibleForPromotion: true, ineligibleForServing: true, findingRetrievedOrCited: false,
      reason: "unnecessarily created from chrome finding",
    });
    assert.equal(v.versionRole, "candidate_version");
    assert.equal(v.ineligibleForPromotion, true);
    assert.equal(v.improvementClaim, false);
    assert.deepEqual(VERSION_ROLES, ["candidate_version", "selected_workbench_version", "serving_version", "promoted_version"]);
  });

  test("4 creating a candidate does not auto-serve or promote", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putWorkspace({ ...store.getWorkspace(ws.id), servingAtlasVersionId: "atlas-v12" });
    const research = await runScoutResearch(store, {
      workspaceId: ws.id, question: "What operational buying signals matter for US roofing contractors?",
      seedUrls: ["https://example.com/roofing-signals"], urlFixtures: { "https://example.com/roofing-signals": URL_FIXTURE_BODY },
    });
    const fact = research.findings.find((f) => f.kind === "source_backed_fact") || research.findings[0];
    reviewFinding(store, fact.id, { actor: "demo_operator", action: "approve", assignToAtlas: true });
    const trained = trainAtlasFromScout(store, { actor: "demo_operator", workspaceId: ws.id, parentVersionId: "atlas-v12", skipUsefulness: true, skipShadow: true, forceTrain: true });
    assert.equal(trained.promotion, false);
    assert.notEqual(trained.version.id, "atlas-v12");
    assert.equal(resolveServingAtlasVersion(store, ws.id), "atlas-v12");
  });
});

describe("mission 13 part B attribution", () => {
  test("5 FND-013 primary cause is extraction, Scout not punished if it never received the body", () => {
    const { store } = tmpStore();
    store.putScoutFinding({ id: "FND-013", claim: "Skip to Content", excerpt: "Skip to Content", sourceId: "SRC-STUDIO-URL-004", kind: "source_backed_fact" });
    store.putSource({ id: "SRC-STUDIO-URL-004", excerpt: "Skip to Content", sha256: "x" });
    const d = diagnoseFnd013(store);
    assert.equal(d.attribution.primaryCause, "extraction");
    assert.equal(d.attribution.scoutBlamed, false);
    assert.equal(d.attribution.extractorBlamed, true);
    assert.ok(d.attribution.stagesInspected.includes("text_supplied_to_scout"));
  });
});

describe("mission 13 part C extraction", () => {
  test("6 extractor prefers main/article content", () => {
    const out = extractSubstantiveHtml(HTML_EXTRACT_FIXTURES.article_main.html);
    assert.match(out.substantiveText, /Contractors produce estimates/);
    assert.equal(out.substantiveText.includes("Skip to Content"), false);
  });

  test("7 extractor deprioritizes nav, cookie, and a11y chrome", () => {
    const cookie = extractSubstantiveHtml(HTML_EXTRACT_FIXTURES.cookie_and_banner.html);
    assert.match(cookie.substantiveText, /Apprentices complete classroom/);
    assert.equal(/Accept all cookies/.test(cookie.substantiveText), false);
    assert.equal(/The \.gov means/.test(cookie.substantiveText), false);
  });

  test("8 quality checks cover sentences, domain terms, nav ratio, title-only, a11y, cookie, empty main", () => {
    const empty = extractSubstantiveHtml(HTML_EXTRACT_FIXTURES.empty_main.html);
    assert.ok(empty.quality.flags.includes("empty_main") || empty.quality.pass === false);
    const src = readFileSync(new URL("./html-extract.ts", import.meta.url), "utf8");
    assert.equal(src.includes("occupational outlook"), false);
    assert.equal(src.includes("bls.gov"), false);
  });

  test("9 fixtures cover multiple generic page structures", () => {
    const rows = runExtractFixtures();
    assert.equal(rows.length >= 4, true);
    assert.equal(rows.filter((r) => r.name !== "empty_main").every((r) => r.ok), true);
  });

  test("10 extractor does not claim to be a universal production parser", () => {
    const out = extractSubstantiveHtml("<main><p>Hello contractors produce estimates from takeoffs of roof area and materials today.</p><p>Software turns measurements into material lists and proposals for crews.</p></main>");
    assert.equal(out.notUniversalParser, true);
  });
});

describe("mission 13 part D source support", () => {
  test("11 excerpt must exist in the fetched source", () => {
    const ok = checkSourceSupport({
      sourceId: "SRC-1", claim: "Contractors produce estimates from takeoffs.", excerpt: "Contractors produce estimates from takeoffs of roof area, pitch, and materials.",
      sourceText: URL_FIXTURE_BODY, kind: "source_backed_fact",
    });
    assert.equal(ok.valid, true);
    assert.equal(ok.eligibleAsSourceBackedFact, true);
    const miss = checkSourceSupport({
      sourceId: "SRC-1", claim: "Invented", excerpt: "This excerpt is not on the page at all.", sourceText: URL_FIXTURE_BODY,
    });
    assert.equal(miss.valid, false);
  });

  test("12 nav/boilerplate excerpt is not support", () => {
    const r = checkSourceSupport({
      sourceId: "SRC-1", claim: "The site is official", excerpt: "Skip to Content An official website of the United States government Here is how you know",
      sourceText: "Skip to Content An official website of the United States government Here is how you know. Roofers do work.",
      kind: "source_backed_fact",
    });
    assert.equal(r.supportStatus, "excerpt_boilerplate");
  });

  test("13 unsupported numbers and business conclusions fail", () => {
    const r = checkSourceSupport({
      sourceId: "SRC-1", claim: "Roofers have a 42% conversion rate and $4M average revenue.", excerpt: "Roofers install roofs.",
      sourceText: "Roofers install roofs on houses.", kind: "source_backed_fact",
    });
    assert.ok(["claim_introduces_unsupported_detail", "excerpt_missing"].includes(r.supportStatus) || r.valid === false);
  });

  test("14 inference is not presented as what the source said", () => {
    const r = checkSourceSupport({
      sourceId: "SRC-1", claim: "Contractors who estimate by hand may be candidates for software.", excerpt: "Contractors who still estimate by hand or with generic spreadsheets may be candidates for dedicated takeoff tools.",
      sourceText: URL_FIXTURE_BODY, kind: "source_backed_fact", presentAsFact: true,
    });
    assert.equal(r.factClass, "inference");
    assert.equal(r.eligibleAsSourceBackedFact, false);
  });
});

describe("mission 13 part E gates", () => {
  test("15 distinct stored gates exist", () => {
    assert.deepEqual(USEFULNESS_GATES, [
      "provenance_valid", "source_content_substantive", "source_support_valid", "objective_relevant",
      "workspace_relevant", "role_relevant", "knowledge_type_allowed", "novelty_or_material_refinement",
      "expected_utility_defined", "owner_authorized",
    ]);
  });

  test("16 overall outcomes include the Mission 13 set and keep Mission 12 names", () => {
    for (const o of ["eligible_new_knowledge", "duplicate_existing", "corroborates_existing", "materially_refines_existing", "conflicts_with_existing", "irrelevant_to_objective", "insufficient_source_support", "boilerplate_or_non_substantive", "unsupported_inference", "owner_review_required", "genuinely_new"]) {
      assert.ok(USEFULNESS_OUTCOMES.includes(o), o);
    }
  });

  test("17 low similarity is not usefulness; Skip to Content stays useless", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const review = evaluateKnowledgeUsefulness(store, {
      workspaceId: ws.id,
      objectiveText: "Research operational buying signals relevant to US roofing companies",
      findings: [{ id: "F-CHROME", kind: "source_backed_fact", claim: "Skip to Content official website", excerpt: "Skip to Content An official website of the United States government", sourceId: "SRC-X" }],
    });
    assert.equal(review.shouldTrain, false);
    assert.ok(review.reviews.some((r) => r.outcome === "boilerplate_or_non_substantive"));
  });

  test("18 cannot train solely because unique", () => {
    const review = reviewOneFinding({
      claim: "Unique chrome phrase xyzzy-plugh official website",
      excerpt: "Skip to Content xyzzy-plugh official website of the agency",
    }, [], "Research operational buying signals");
    assert.notEqual(review.outcome, "genuinely_new");
  });
});

describe("mission 13 part F expected utility", () => {
  test("19 utility record has consuming role, task, signal, affects, mandatory, why", () => {
    const u = defineExpectedUtility({
      consumingRole: "atlas",
      workspaceObjective: "Qualify US roofing contractors",
      expectedTaskType: "fictional_qualification",
      signalFamily: "estimating_workflow",
      affects: ["classification", "explanation"],
      mandatory: false,
      whyExistingInsufficient: "Existing rules do not mention handbook occupational facts.",
    });
    assert.equal(u.defined, true);
    assert.equal(u.hypothesis, true);
    assert.equal(u.proof, false);
  });

  test("20 no train when no plausible consuming task", () => {
    const u = defineExpectedUtility({ consumingRole: "atlas" });
    assert.equal(u.defined, false);
  });

  test("21 fictional scenario is hashed before Scout", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const scenario = { title: "frozen", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy() };
    const frozen = freezeFictionalScenario(scenario);
    const submitted = submitObjective(store, {
      workspaceId: ws.id,
      ownerText: "Research operational buying signals relevant to US roofing companies using permitted public sources.",
      seedUrls: ["https://example.com/roofing-signals"],
      livePublic: true,
      permittedFictionalScenario: scenario,
      maxSpendUsd: 2,
    });
    assert.equal(submitted.objective.fictionalScenarioHash, frozen.hash);
    await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12", urlFixtures: { "https://example.com/roofing-signals": URL_FIXTURE_BODY } });
    assert.equal(store.getObjective(submitted.objective.id).fictionalScenarioHash, frozen.hash);
  });
});

describe("mission 13 part G shadow compile", () => {
  test("22 shadow compile does not create a version", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const before = store.listVersions("atlas").length;
    const sh = shadowCompile(store, {
      workspaceId: ws.id, parentVersionId: "atlas-v12",
      findings: [{ id: "F-1", claim: "US roofing contractors produce estimates from takeoffs.", excerpt: "produce estimates from takeoffs" }],
      usefulness: { shouldTrain: true, warranted: true },
      fictionalScenario: { title: "t", prospects: HANDOFF_FICTIONAL_PROSPECTS },
    });
    assert.ok(SHADOW_OUTCOMES.includes(sh.outcome));
    assert.equal(store.listVersions("atlas").length, before);
    assert.equal(sh.currentVersionPreserved, true);
    assert.equal(sh.sealedEval, false);
  });

  test("23 skip_not_useful and skip_duplicate outcomes exist", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const skip = shadowCompile(store, {
      workspaceId: ws.id, parentVersionId: "atlas-v12",
      findings: [{ id: "F-1", claim: "x", excerpt: "x" }],
      usefulness: { shouldTrain: false, warranted: false, skipReason: "duplicate_or_corroboration_only" },
    });
    assert.equal(skip.outcome, "skip_duplicate");
    assert.equal(skip.produceVersion, false);
  });

  test("24 do not freeze a version merely to discover knowledge is unusable", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id, question: "Research operational buying signals",
      seedUrls: ["https://example.com/x"], urlFixtures: { "https://example.com/x": "Skip to Content An official website of the United States government Here is how you know. The .gov means it's official." },
    });
    const fact = research.findings.find((f) => f.kind === "source_backed_fact") || research.findings[0];
    if (fact && fact.kind !== "unresolved_question") {
      reviewFinding(store, fact.id, { actor: "demo_operator", action: "approve", assignToAtlas: true });
    }
    const trained = trainAtlasFromScout(store, { actor: "demo_operator", workspaceId: ws.id, parentVersionId: "atlas-v12", objectiveText: "Research operational buying signals" });
    assert.equal(trained.skipped, true);
    assert.equal(trained.version.id, "atlas-v12");
  });
});

describe("mission 13 part H owner cannot override evidence", () => {
  test("25 approve cannot convert unsupported webpage text into a supported fact", () => {
    const blocked = ownerCannotOverrideEvidence({ valid: false, eligibleAsSourceBackedFact: false, supportStatus: "excerpt_boilerplate" });
    assert.equal(blocked.allowed, false);
  });

  test("26 reviewFinding refuses source-backed approval on boilerplate", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putSource({ id: "SRC-B", workspaceId: ws.id, excerpt: "Skip to Content An official website", substantiveText: "Skip to Content An official website of the United States government Here is how you know", sha256: "a", captureStatus: "LIVE_WEB" });
    store.putScoutFinding({
      id: "FND-B", workspaceId: ws.id, sourceId: "SRC-B", kind: "source_backed_fact", reviewStatus: "proposed",
      claim: "Skip to Content official", excerpt: "Skip to Content An official website of the United States government Here is how you know",
    });
    const out = reviewFinding(store, "FND-B", { actor: "demo_operator", action: "approve", assignToAtlas: true });
    assert.equal(out.blockedEvidence, true);
    assert.notEqual(store.getScoutFinding("FND-B").reviewStatus, "approved");
  });

  test("27 owner may still reject or author a separate policy", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id, question: "What operational buying signals matter?",
      seedUrls: ["https://example.com/roofing-signals"], urlFixtures: { "https://example.com/roofing-signals": URL_FIXTURE_BODY },
    });
    const suggestion = research.findings.find((f) => f.kind === "owner_policy_suggestion") || research.findings[0];
    const rejected = reviewFinding(store, suggestion.id, { actor: "demo_operator", action: "reject" });
    assert.equal(rejected.finding.reviewStatus, "rejected");
  });
});

describe("mission 13 part I local_owner", () => {
  test("28 demo_operator cannot masquerade as local_owner", () => {
    const claimed = resolveActorType({ actor: "local_owner", actorType: "local_owner" }, null);
    assert.equal(claimed.actorType, "demo_operator");
  });

  test("29 live requireLocalOwner approval stays pending for demo_operator", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, {
      workspaceId: ws.id,
      ownerText: "Research operational buying signals relevant to US roofing companies using permitted public sources.",
      seedUrls: ["https://example.com/roofing-signals"], livePublic: true, requireLocalOwner: true,
      permittedFictionalScenario: { title: "fictional", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy() },
      maxSpendUsd: 2,
    });
    const waited = await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12", urlFixtures: { "https://example.com/roofing-signals": URL_FIXTURE_BODY } });
    assert.equal(waited.awaitingOwnerApproval, true);
    assert.throws(() => decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve" }), /local_owner/);
    assert.equal(store.getObjective(submitted.objective.id).status, "awaiting_owner_approval");
  });

  test("30 scripted demo_operator still works when requireLocalOwner is false", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, {
      workspaceId: ws.id,
      ownerText: "Research operational buying signals relevant to US roofing companies using permitted public sources.",
      seedUrls: ["https://example.com/roofing-signals"], livePublic: true,
      permittedFictionalScenario: { title: "fictional", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy() },
      maxSpendUsd: 2,
    });
    const waited = await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v12", urlFixtures: { "https://example.com/roofing-signals": URL_FIXTURE_BODY } });
    const dec = decideApproval(store, waited.pendingApprovalId, { actor: "demo_operator", action: "approve", authorizeAtlasTrain: false, assignToAtlas: true });
    assert.equal(dec.decision.actorType, "demo_operator");
  });

  test("31 local_owner session is not IAM and does not record Mason", () => {
    const { store } = tmpStore();
    const sess = createLocalOwnerSession(store, {});
    const real = resolveActorType({ actor: "local_owner" }, sess);
    assert.equal(real.actorType, "local_owner");
    assert.notEqual(real.actorIdentity, "Mason Hemmer");
    assert.match(real.securityClaim, /not enterprise IAM/);
  });
});

describe("mission 13 part J watcher scopes", () => {
  test("32 Watcher has three scopes", () => {
    assert.deepEqual(WATCHER_SCOPES, ["current_decision_chain", "candidate_version_integrity", "workspace_catalog_hygiene"]);
  });

  test("33 unused historical webpage policy does not block the current chain", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putSource({ id: "SRC-004", url: "https://example.com/x", captureStatus: "LIVE_WEB", live: true, classification: "live_public_source" });
    store.putKnowledge({ id: "K-004-03", claimKind: "owner_policy", statement: "Interest does not establish authority.", sourceId: "SRC-004", accepted: true, workspaceId: ws.id });
    const inspected = runDeterministicChecks(store, { workspaceId: ws.id, run: { id: "R1", servedAssessments: [], retrievedItemIds: [] } });
    const web = inspected.checks.find((c) => c.code === "webpage_not_policy");
    assert.notEqual(web.status, "VIOLATION");
    assert.equal(web.blocking, false);
    assert.ok(web.scopes.workspace_catalog_hygiene.ids.includes("K-004-03"));
  });

  test("34 active unauthorized policy in the decision chain still blocks", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putSource({ id: "SRC-004", url: "https://example.com/x", captureStatus: "LIVE_WEB", live: true, classification: "live_public_source" });
    store.putKnowledge({ id: "K-004-03", claimKind: "owner_policy", statement: "Interest does not establish authority.", sourceId: "SRC-004", accepted: true, workspaceId: ws.id });
    const inspected = runDeterministicChecks(store, { workspaceId: ws.id, run: { id: "R1", servedAssessments: [{ prospect_id: "P1", cited_knowledge_ids: ["K-004-03"] }], retrievedItemIds: ["K-004-03"] } });
    const web = inspected.checks.find((c) => c.code === "webpage_not_policy");
    assert.equal(web.status, "VIOLATION");
    assert.equal(web.blocking, true);
  });

  test("35 remediations do not silently relabel the three historical items", () => {
    const { store } = tmpStore();
    store.putKnowledge({ id: "K-004-03", claimKind: "owner_policy", statement: "Interest does not establish authority.", sourceId: "SRC-004", accepted: true });
    store.putKnowledge({ id: "K-005-02", claimKind: "owner_policy", statement: "Treat timing as ranking.", sourceId: "SRC-005", accepted: true });
    store.putKnowledge({ id: "K-005-04", claimKind: "owner_policy", statement: "A profile view signals curiosity.", sourceId: "SRC-005", accepted: true });
    store.putSource({ id: "SRC-004", captureStatus: "LIVE_WEB", live: true });
    store.putSource({ id: "SRC-005", captureStatus: "LIVE_WEB", live: true });
    const hist = applyMission13History(store);
    assert.equal(store.getKnowledge("K-004-03").claimKind, "owner_policy");
    assert.ok(hist.remediations.length >= 3);
    assert.equal(hist.remediations.every((r) => r.silentlyRelabeled === false), true);
  });
});

describe("mission 13 part K contributions", () => {
  test("36 invalidation appends and does not delete the original event", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const ev = recordContribution(store, { kind: "supported_finding_proposed", workspaceId: ws.id, evidence: { findingId: "FND-013", sourceId: "SRC-X" } });
    const inv = invalidateContribution(store, ev.id, { reason: "chrome", failureStage: "extraction", responsibleComponent: "html_extractor" });
    assert.ok(store.getContributionEvent(ev.id));
    assert.equal(store.getContributionEvent(ev.id).effective, false);
    assert.equal(inv.review.effective, false);
    assert.equal(inv.review.originalEventId, ev.id);
  });

  test("37 only verified events count toward progression", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    recordContribution(store, { kind: "supported_finding_proposed", workspaceId: ws.id, evidence: { findingId: "F1", sourceId: "S1" }, state: "provisional" });
    const card = contributionScorecard(store, ws.id);
    assert.equal(card.byKind.supported_finding_proposed, 0);
    assert.deepEqual(CONTRIBUTION_STATES, ["provisional", "verified", "invalidated", "disputed", "superseded"]);
  });

  test("38 Scout credit requires substance, support, owner approval, and use or Watcher verify", () => {
    assert.equal(scoutCreditEligible({}, { sourceSubstantive: true, findingSupported: true, ownerApproved: true, retrievedOrUsed: false }), false);
    assert.equal(scoutCreditEligible({}, { sourceSubstantive: true, findingSupported: true, ownerApproved: true, retrievedOrUsed: true }), true);
  });
});

describe("mission 13 part N export", () => {
  test("39 export requires local_owner session", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    assert.throws(() => exportWorkspace(store, { workspaceId: ws.id, actor: "demo_operator" }, null), /local_owner/);
  });

  test("40 export generates and excludes keys", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const body = buildWorkspaceExport(store, ws.id);
    assert.equal(body.schemaVersion.startsWith("midas-workspace-export"), true);
    assert.ok(body.checksums.payload);
    assert.ok(body.excluded.includes("keys"));
    assert.equal(JSON.stringify(body).includes("sk-"), false);
  });

  test("41 import dry-run parses into an isolated FILE_STORE", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const body = buildWorkspaceExport(store, ws.id);
    const dir = mkdtempSync(join(tmpdir(), "midas-import-"));
    const dry = importWorkspaceDryRun(body, dir);
    assert.equal(dry.dryRun, true);
    assert.equal(dry.silentOverwrite, false);
    assert.equal(dry.parsed, true);
    const isolated = new FileStore(dir);
    assert.ok(isolated.getWorkspace(ws.id));
  });
});

describe("mission 13 hashes and product outcomes", () => {
  test("42 frozen hashes for v14 v15 v16 scout watcher conductor stay identical", () => {
    const historical = JSON.parse(readFileSync(join(import.meta.dirname, "../../../var/state/agent_versions.json"), "utf8"));
    const byId = Object.fromEntries(historical.map((v) => [v.id, v]));
    assert.equal(byId["atlas-v14"].contentHash, ATLAS_V14);
    assert.equal(byId["atlas-v15"].contentHash, ATLAS_V15);
    assert.equal(byId["atlas-v16"].contentHash, ATLAS_V16);
    assert.equal(byId["scout-ws-ridgeline-v0"].contentHash, SCOUT_V0);
    assert.equal(byId["watcher-ws-ridgeline-v0"].contentHash, WATCHER_V0);
    assert.equal(byId["conductor-ws-ridgeline-v0"].contentHash, CONDUCTOR_V0);
  });

  test("43 live history helper does not delete FND-013 or v16", () => {
    const { store } = tmpStore();
    store.putScoutFinding({ id: "FND-013", claim: "chrome", excerpt: "Skip to Content", sourceId: "SRC-STUDIO-URL-004", reviewStatus: "approved" });
    store.putSource({ id: "SRC-STUDIO-URL-004", excerpt: "Skip to Content" });
    store.putVersion({
      ...store.getVersion("atlas-v0"), id: "atlas-v16", parentVersionId: "atlas-v15",
      createdAt: new Date().toISOString(), declaredChange: "hist", contentHash: ATLAS_V16,
    });
    applyMission13History(store);
    assert.ok(store.getScoutFinding("FND-013"));
    assert.ok(store.getVersion("atlas-v16"));
    assert.equal(store.getVersion("atlas-v16").contentHash, ATLAS_V16);
  });

  test("44 no_useful_knowledge_found is a successful product outcome", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const review = evaluateKnowledgeUsefulness(store, {
      workspaceId: ws.id, objectiveText: "Research operational buying signals",
      findings: [{ id: "F-1", kind: "source_backed_fact", claim: "Skip to Content", excerpt: "Skip to Content An official website of the United States government" }],
    });
    assert.equal(review.shouldTrain, false);
    assert.ok(["boilerplate_or_non_substantive", "no_meaningful_change"].includes(review.skipReason));
  });

  test("45 SOURCE_CLASSIFICATIONS unchanged and honest", () => {
    assert.ok(SOURCE_CLASSIFICATIONS.includes("live_public_source"));
    assert.ok(SOURCE_CLASSIFICATIONS.includes("synthetic_fixture"));
  });

  test("46 owner-authored note / policy needs new provenance, not webpage pretence", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const rule = addOwnerAuthoredRule(store, { statement: "Treat handbook chrome as irrelevant to qualification.", workspaceId: ws.id });
    assert.equal(rule.item.writtenByOwner, true);
    assert.notEqual(rule.source.captureStatus, "LIVE_WEB");
  });
});
