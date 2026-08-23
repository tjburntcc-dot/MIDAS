import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0 } from "@midas/db";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { validateNumericClaims } from "./numeric-normalize.ts";
import { classifyClaimScope } from "./claim-scope.ts";
import { recordContribution } from "./contribution.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import {
  submitObjective,
  planObjective,
  runUntilBlocked,
  canAssignEmployee,
  assertCanAssignEmployee,
  FOUNDER_BRIEF_CATEGORY,
  resolveServingAtlasVersion,
} from "./conductor.ts";
import {
  FOUNDER_BRIEF_OWNER_OBJECTIVE,
  assessKnowledgeSufficiency,
  buildFounderOpportunityBrief,
  assembleFounderOpportunityBrief,
  reviewCandidateFindingForFounderBrief,
  assertCitationAllowed,
  findingUsableForBrief,
  recordFounderBriefContributions,
  frozenHashCheck,
  latestFounderBrief,
} from "./founder-opportunity-brief.ts";
import { auditFounderOpportunityBrief } from "./watcher.ts";
import { mission17Review } from "./mission17-review.ts";
import { shouldCreateAtlasVersion } from "./usefulness.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m17-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  ensureAtlasV0(store);
  return { dir, store };
}

function putK(store, rec) {
  store.putKnowledge({
    accepted: true,
    reviewStatus: "approved",
    kind: rec.kind || "owner_policy",
    ...rec,
  });
}

function seedKnowledge(store, workspaceId) {
  putK(store, { id: "K-STUDIO-OWN-002", workspaceId, kind: "owner_policy", statement: "Only United States accounts are eligible. Non-US geography is a hard disqualifier.", excerpt: "Only United States accounts are eligible." });
  putK(store, { id: "K-STUDIO-OWN-005", workspaceId, kind: "owner_policy", statement: "A verified monthly budget at or above 2500 USD satisfies the budget requirement.", excerpt: "verified monthly budget at or above 2500 USD" });
  putK(store, { id: "K-STUDIO-OWN-009", workspaceId, kind: "owner_policy", statement: "When a US roofing contractor still estimates by hand or with spreadsheets, treat that as a positive buying signal for RidgeLine Estimator.", excerpt: "estimates by hand or with spreadsheets" });
  putK(store, { id: "K-SCOUT-FND-001", workspaceId, kind: "sourced_fact", statement: "US roofing contractors produce estimates from takeoffs of roof area, pitch, and materials.", excerpt: "takeoffs of roof area, pitch, and materials" });
  putK(store, { id: "K-SCOUT-FND-004", workspaceId, kind: "sourced_fact", statement: "US roofing contractors who still produce estimates by hand or with generic spreadsheets often take longer to issue proposals.", excerpt: "often take longer to issue proposals" });
  putK(store, { id: "K-SCOUT-FND-019", workspaceId, kind: "sourced_fact", statement: "Estimating software turns measurements into material lists and proposals.", excerpt: "Estimating software turns measurements into material lists and proposals." });
  putK(store, { id: "K-OWN-001-02", workspaceId, kind: "owner_policy", statement: "Require a minimum of eight employees. Headcount below eight is a hard exclusion.", excerpt: "minimum of eight employees" });
  putK(store, { id: "K-OWN-001-03", workspaceId, kind: "owner_policy", statement: "Require verified monthly spend of at least 2500 USD. Do not infer spend from employee count.", excerpt: "verified monthly spend of at least 2500 USD" });
  putK(store, { id: "K-OWN-004-01", workspaceId, kind: "owner_policy", statement: "Served regions are Southeast, Midwest, Northeast, and Southwest.", excerpt: "Served regions are Southeast, Midwest, Northeast, and Southwest" });
  putK(store, { id: "K-SCOUT-FND-013", workspaceId, kind: "sourced_fact", statement: "Median annual wage for roofers was 47390 USD in May 2023 according to BLS.", excerpt: "median annual wage for roofers" });
}

function seedNamed() {
  const { dir, store } = tmpStore();
  store.putWorkspace({ id: "ws-ridgeline", name: "RidgeLine", servingAtlasVersionId: "atlas-v15", createdAt: "2026-08-21T12:00:00.000Z" });
  seedKnowledge(store, "ws-ridgeline");
  store.putEmployeeRole({
    id: "EMP-001",
    workspaceId: "ws-ridgeline",
    agentId: "offer_strategist-ws-ridgeline",
    roleId: OFFER_STRATEGIST_ROLE_ID,
    status: "development_verified",
    authorizedAt: "2026-08-21T18:53:33.310Z",
    authorizedBy: "local_owner",
    spendLimitUsd: 0.5,
    promoted: false,
    versionId: "offer_strategist-ws-ridgeline-v0",
  });
  store.putOfferStrategistRun({
    id: "OSR-003",
    workspaceId: "ws-ridgeline",
    live: true,
    fixture: false,
    fixtureFallback: false,
    parseStatus: "ok",
    status: "hypothesis",
    spendUsd: 0.01062,
    contentHash: "e93a652d3022d9267a9aac7569678243490fcb54bdb42937557775b1cbebf54e",
    approvedKnowledgeIds: ["K-SCOUT-FND-001", "K-SCOUT-FND-004", "K-SCOUT-FND-019", "K-STUDIO-OWN-009", "K-OWN-001-02", "K-OWN-001-03", "K-OWN-004-01"],
    structured: {
      target_customer: "US-based roofing contractors with a minimum of eight employees, a verified monthly spend of at least $2,500, operating in the Southeast, Midwest, Northeast, or Southwest regions, who still estimate by hand or with spreadsheets.",
      customer_problem: "Roofing contractors estimating by hand or with spreadsheets take longer to issue proposals.",
      proposed_offer: "RidgeLine Estimator: A dedicated roofing estimation software designed to help US roofing contractors transition from manual or spreadsheet-based estimating processes to digital estimating.",
      approved_evidence: [{ id: "K-OWN-001-03", excerpt: "verified monthly spend of at least 2500 USD" }],
      assumptions: ["Approved operational notes still describe current contractor workflows."],
      missing_information: ["Willingness to pay unknown"],
      risks: ["Hypothesis may be wrong"],
      recommended_validation_step: "Interview a sample after owner approval.",
      labels: { hypothesisVersusFact: true, status: "hypothesis" },
    },
  });
  if (!store.getVersion("atlas-v15")) {
    store.putVersion({ id: "atlas-v15", agentId: "atlas", contentHash: FROZEN_HASHES["atlas-v15"], immutable: true, createdAt: "2026-08-21T12:00:00.000Z" });
  }
  if (!store.getVersion("atlas-v16")) {
    store.putVersion({ id: "atlas-v16", agentId: "atlas", contentHash: FROZEN_HASHES["atlas-v16"], immutable: true, versionRole: "candidate_version", createdAt: "2026-08-21T13:00:00.000Z" });
  }
  if (!store.getVersion("offer_strategist-ws-ridgeline-v0")) {
    store.putVersion({
      id: "offer_strategist-ws-ridgeline-v0",
      agentId: "offer_strategist-ws-ridgeline",
      contentHash: FROZEN_HASHES["offer_strategist-ws-ridgeline-v0"],
      immutable: true,
    });
  }
  store.putVersionReview({
    id: "VREV-001",
    versionId: "atlas-v16",
    parentVersionId: "atlas-v15",
    versionRole: "candidate_version",
    immutable: true,
    ineligibleForPromotion: true,
    ineligibleForServing: true,
  });
  return { dir, store, workspaceId: "ws-ridgeline" };
}

describe("mission 17 item 01 objective stays in workspace", () => {
  test("01 cannot assemble a brief across workspaces", () => {
    const { store, workspaceId } = seedNamed();
    store.putWorkspace({ id: "ws-other", name: "Other" });
    store.putObjective({ id: "OBJ-X", workspaceId: "ws-other", ownerText: FOUNDER_BRIEF_OWNER_OBJECTIVE, category: FOUNDER_BRIEF_CATEGORY });
    assert.throws(() => buildFounderOpportunityBrief(store, { workspaceId, objectiveId: "OBJ-X" }), /workspace/i);
    const assign = canAssignEmployee(store, { workspaceId, roleId: "offer_strategist", taskKind: "supervised_internal", targetWorkspaceId: "ws-other" });
    assert.equal(assign.ok, false);
    assert.equal(assign.code, "other_workspace");
  });
});

describe("mission 17 item 02 conductor cannot assign unauthorized employee", () => {
  test("02 marketing/sales assignment is forbidden", () => {
    const { store, workspaceId } = seedNamed();
    const r = canAssignEmployee(store, { workspaceId, roleId: "marketing", taskKind: "supervised_internal" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "unauthorized_employee");
    assert.throws(() => assertCanAssignEmployee(store, { workspaceId, roleId: "sales" }), /unauthorized/i);
  });
});

describe("mission 17 item 03 EMP-001 supervised internal only", () => {
  test("03 outreach tasks rejected; supervised internal allowed", () => {
    const { store, workspaceId } = seedNamed();
    const ok = canAssignEmployee(store, { workspaceId, roleId: "offer_strategist", taskKind: "supervised_internal" });
    assert.equal(ok.ok, true);
    assert.equal(ok.supervisedInternalOnly, true);
    const no = canAssignEmployee(store, { workspaceId, roleId: "offer_strategist", taskKind: "outreach" });
    assert.equal(no.ok, false);
    assert.equal(no.code, "supervised_internal_only");
  });
});

describe("mission 17 item 04 approved knowledge sufficient without fetch", () => {
  test("04 sufficiency is sufficient and fetchRecommended false", () => {
    const { store, workspaceId } = seedNamed();
    const s = assessKnowledgeSufficiency(store, { workspaceId, objectiveText: FOUNDER_BRIEF_OWNER_OBJECTIVE });
    assert.equal(s.decision, "sufficient");
    assert.equal(s.fetchRecommended, false);
    assert.equal(s.scoutRequired, false);
    assert.equal(s.atlasRequired, false);
    assert.equal(s.ownerApprovalRequired, false);
    assert.equal(s.sourcesFetched, 0);
    const brief = assembleFounderOpportunityBrief(store, { workspaceId });
    assert.equal(brief.assembly.sourcesFetched, 0);
    assert.equal(brief.assembly.providerCalls, 0);
    assert.equal(brief.assembly.freshLiveSpecialistTask, false);
  });
});

describe("mission 17 item 05-06 wage and boilerplate never reach owner", () => {
  test("05 irrelevant wage evidence cannot reach owner review", () => {
    const { store, workspaceId } = seedNamed();
    const out = reviewCandidateFindingForFounderBrief(store, {
      id: "FND-WAGE",
      workspaceId,
      claim: "Median annual wage for roofers was 47390 USD.",
      excerpt: "median annual wage for roofers was $47,390",
      kind: "source_backed_fact",
      sourceId: "SRC-BLS",
    }, { workspaceId, source: { fetchStatus: "ok", classification: "live_public_source" } });
    assert.equal(out.reachOwnerReview, false);
    assert.equal(out.reason, "irrelevant_wage_evidence");
  });

  test("06 boilerplate cannot reach owner review", () => {
    const { store, workspaceId } = seedNamed();
    const out = reviewCandidateFindingForFounderBrief(store, {
      id: "FND-COOKIE",
      workspaceId,
      claim: "We use cookies.",
      excerpt: "We use cookies. Accept all cookies to continue.",
      kind: "source_backed_fact",
      sourceId: "SRC-WEB",
    }, { workspaceId, source: { fetchStatus: "ok", classification: "live_public_source" } });
    assert.equal(out.reachOwnerReview, false);
    assert.equal(out.reason, "boilerplate_or_non_substantive");
  });
});

describe("mission 17 item 07-09 usefulness, duplicate, rejection", () => {
  test("07 material relevant finding gets a complete usefulness review", () => {
    const { store, workspaceId } = seedNamed();
    const out = reviewCandidateFindingForFounderBrief(store, {
      id: "FND-NEW",
      workspaceId,
      claim: "Some US roofing contractors still fax handwritten takeoff sheets to suppliers before writing a proposal.",
      excerpt: "Some US roofing contractors still fax handwritten takeoff sheets to suppliers before writing a proposal.",
      kind: "source_backed_fact",
      sourceId: "SRC-PASTE",
      applicableRole: "offer_strategist",
    }, { workspaceId, source: { fetchStatus: "ok", classification: "owner_provided_paste" } });
    assert.equal(out.completeUsefulnessReview, true);
    assert.ok(out.usefulness);
  });

  test("08 duplicate knowledge does not create a new Atlas version", () => {
    const { store, workspaceId } = seedNamed();
    const before = (store.listVersions("atlas") || []).map((v) => v.id);
    const out = reviewCandidateFindingForFounderBrief(store, {
      id: "FND-DUP",
      workspaceId,
      claim: "When a US roofing contractor still estimates by hand or with spreadsheets, treat that as a positive buying signal for RidgeLine Estimator.",
      excerpt: "estimates by hand or with spreadsheets",
      statement: "When a US roofing contractor still estimates by hand or with spreadsheets, treat that as a positive buying signal for RidgeLine Estimator.",
      kind: "source_backed_fact",
      sourceId: "SRC-DUP",
    }, { workspaceId, source: { fetchStatus: "ok", classification: "owner_provided_paste" } });
    assert.equal(out.shouldCreateAtlasVersion, false);
    if (out.usefulness) assert.equal(shouldCreateAtlasVersion(out.usefulness), false);
    assert.deepEqual((store.listVersions("atlas") || []).map((v) => v.id), before);
  });

  test("09 owner rejection prevents use or training", () => {
    const { store, workspaceId } = seedNamed();
    store.putKnowledge({
      id: "K-REJ-001",
      workspaceId,
      reviewStatus: "rejected",
      accepted: false,
      kind: "sourced_fact",
      statement: "Rejected finding.",
      excerpt: "Rejected finding.",
    });
    const cite = assertCitationAllowed(store, "K-REJ-001", workspaceId);
    assert.equal(cite.ok, false);
    assert.equal(cite.use, false);
    assert.equal(cite.train, false);
    store.putScoutFinding({ id: "FND-REJ", workspaceId, reviewStatus: "rejected", claim: "Rejected." });
    const f = findingUsableForBrief(store, "FND-REJ");
    assert.equal(f.allowed, false);
    assert.equal(f.use, false);
    assert.equal(f.train, false);
  });
});

describe("mission 17 item 10-13 TAM, refusal, currency, numeric change", () => {
  test("10 unsupported TAM is rejected", () => {
    const { store, workspaceId } = seedNamed();
    const brief = buildFounderOpportunityBrief(store, { workspaceId });
    brief.sections.proposedOffer.text = "The TAM is $10 million for roofing software.";
    const audit = auditFounderOpportunityBrief(store, { workspaceId, brief, runId: "OSR-003" });
    assert.equal(audit.report.status, "VIOLATION");
    const tam = audit.report.checks.find((c) => c.code === "tam_refusal_ok");
    assert.equal(tam.status, "VIOLATION");
  });

  test("11 refusing unsupported TAM is accepted", () => {
    const { store, workspaceId } = seedNamed();
    const brief = assembleFounderOpportunityBrief(store, { workspaceId });
    assert.equal(brief.sections.missingInformation.market_size.status, "unknown");
    const audit = auditFounderOpportunityBrief(store, { workspaceId, brief, runId: "OSR-003" });
    const check = audit.report.checks.find((c) => c.code === "tam_refusal_ok");
    assert.equal(check.status, "PASS");
  });

  test("12 supported equivalent currency formatting is accepted", () => {
    const evidence = [{ id: "K-OWN-001-03", statement: "Require verified monthly spend of at least 2500 USD.", excerpt: "verified monthly spend of at least 2500 USD" }];
    const v = validateNumericClaims("verified monthly spend of at least $2,500", evidence, {});
    assert.equal(v.unmatched.length, 0);
    assert.ok(v.supported.length >= 1);
  });

  test("13 unsupported numeric changes are rejected", () => {
    const evidence = [{ id: "K-OWN-001-03", statement: "Require verified monthly spend of at least 2500 USD.", excerpt: "verified monthly spend of at least 2500 USD" }];
    const v = validateNumericClaims("verified monthly spend of at least $2.5 million", evidence, {});
    assert.ok(v.unmatched.length >= 1);
  });
});

describe("mission 17 item 14-15 interviews vs outreach", () => {
  test("14 recommended future interviews are not executed outreach", () => {
    const { store, workspaceId } = seedNamed();
    const brief = assembleFounderOpportunityBrief(store, { workspaceId });
    assert.equal(brief.sections.recommendedNextStep.executed, false);
    assert.equal(brief.sections.recommendedNextStep.outreach, false);
    assert.equal(brief.sections.recommendedNextStep.claimClass, "proposed_future_validation");
    const scope = classifyClaimScope({
      structured: { recommended_validation_step: brief.sections.recommendedNextStep.text, labels: { status: "hypothesis" } },
    }, { status: "hypothesis" });
    assert.ok(!(scope.spans || []).some((s) => s.label === "claimed_execution"));
  });

  test("15 claimed completed outreach is blocked", () => {
    const { store, workspaceId } = seedNamed();
    const brief = buildFounderOpportunityBrief(store, { workspaceId });
    brief.sections.recommendedNextStep.text = "We contacted 12 contractors yesterday. Outreach completed.";
    brief.sections.recommendedNextStep.executed = true;
    brief.sections.recommendedNextStep.outreach = true;
    const audit = auditFounderOpportunityBrief(store, { workspaceId, brief, runId: "OSR-003" });
    const claimed = audit.report.checks.find((c) => c.code === "claimed_outreach_blocked");
    assert.equal(claimed.status, "VIOLATION");
    assert.equal(audit.report.status, "VIOLATION");
  });
});

describe("mission 17 item 16-18 citations, assumptions, missing info", () => {
  test("16 evidence citations must be approved and workspace-scoped", () => {
    const { store, workspaceId } = seedNamed();
    store.putKnowledge({ id: "K-OTHER", workspaceId: "ws-other", reviewStatus: "approved", accepted: true, statement: "other", excerpt: "other" });
    store.putKnowledge({ id: "K-UNAP", workspaceId, reviewStatus: "pending", accepted: false, statement: "pending", excerpt: "pending" });
    assert.equal(assertCitationAllowed(store, "K-OTHER", workspaceId).ok, false);
    assert.equal(assertCitationAllowed(store, "K-UNAP", workspaceId).ok, false);
    const brief = assembleFounderOpportunityBrief(store, { workspaceId, forcedCitationIds: ["K-OTHER", "K-UNAP"] });
    assert.ok(brief.rejectedCitations.length >= 2);
    const audit = auditFounderOpportunityBrief(store, { workspaceId, brief, runId: "OSR-003" });
    const cites = audit.report.checks.find((c) => c.code === "citations_approved_scoped");
    assert.equal(cites.status, "PASS");
  });

  test("17 assumptions are not represented as established facts", () => {
    const { store, workspaceId } = seedNamed();
    const brief = assembleFounderOpportunityBrief(store, { workspaceId });
    assert.ok(brief.sections.assumptions.length >= 1);
    assert.ok(brief.sections.assumptions.every((a) => a.claimClass === "assumption" && a.notEstablishedFact === true));
    const audit = auditFounderOpportunityBrief(store, { workspaceId, brief, runId: "OSR-003" });
    assert.equal(audit.report.checks.find((c) => c.code === "assumptions_not_facts").status, "PASS");
  });

  test("18 missing information remains visible", () => {
    const { store, workspaceId } = seedNamed();
    const brief = assembleFounderOpportunityBrief(store, { workspaceId });
    for (const k of ["want", "switch", "pay", "time_reduction", "integration", "competitors", "market_size"]) {
      assert.equal(brief.sections.missingInformation[k].status, "unknown");
    }
    const audit = auditFounderOpportunityBrief(store, { workspaceId, brief, runId: "OSR-003" });
    assert.equal(audit.report.checks.find((c) => c.code === "missing_information_visible").status, "PASS");
  });
});

describe("mission 17 item 19-21 watcher, self-award, provisional", () => {
  test("19 Watcher cannot modify the original output", () => {
    const { store, workspaceId } = seedNamed();
    const before = JSON.stringify(store.getOfferStrategistRun("OSR-003").structured);
    const brief = assembleFounderOpportunityBrief(store, { workspaceId });
    const hash = brief.contentHash;
    const audit = auditFounderOpportunityBrief(store, { workspaceId, brief, runId: "OSR-003" });
    assert.equal(audit.originalPreserved, true);
    assert.equal(JSON.stringify(store.getOfferStrategistRun("OSR-003").structured), before);
    assert.equal(store.getFounderOpportunityBrief(brief.id).contentHash, hash);
  });

  test("20 employee cannot award its own contribution", () => {
    const { store, workspaceId } = seedNamed();
    const brief = assembleFounderOpportunityBrief(store, { workspaceId });
    assert.throws(() => recordFounderBriefContributions(store, {
      workspaceId, brief, recorderRole: "offer_strategist", selfAwarded: true,
    }), /self-award/i);
    assert.throws(() => recordContribution(store, {
      kind: "founder_brief_completed",
      role: "offer_strategist",
      agentId: "offer_strategist-ws-ridgeline",
      awardedBy: "offer_strategist-ws-ridgeline",
      workspaceId,
      evidence: { briefId: brief.id },
      selfAwarded: true,
    }), /self-award/i);
  });

  test("21 provisional events remain ineffective", () => {
    const { store, workspaceId } = seedNamed();
    const brief = assembleFounderOpportunityBrief(store, { workspaceId });
    const events = recordFounderBriefContributions(store, {
      workspaceId,
      brief,
      conductorId: "conductor-ws-ridgeline",
      watcherId: "watcher-ws-ridgeline",
      provisionalId: "CE-PROV-M17",
    });
    const prov = events.find((e) => e.id === "CE-PROV-M17") || store.getContributionEvent("CE-PROV-M17");
    assert.ok(prov);
    assert.equal(prov.state, "provisional");
    assert.equal(prov.effective, false);
  });
});

describe("mission 17 item 22-24 frozen hashes and Atlas serving", () => {
  test("22 original employee version hash unchanged", () => {
    const { store } = seedNamed();
    const v = store.getVersion("offer_strategist-ws-ridgeline-v0");
    assert.equal(v.contentHash, FROZEN_HASHES["offer_strategist-ws-ridgeline-v0"]);
    const check = frozenHashCheck(store);
    assert.equal(check["offer_strategist-ws-ridgeline-v0"].match, true);
  });

  test("23 atlas-v15 remains serving", () => {
    const { store, workspaceId } = seedNamed();
    assert.equal(resolveServingAtlasVersion(store, workspaceId), "atlas-v15");
  });

  test("24 atlas-v16 remains ineligible", () => {
    const { store } = seedNamed();
    const r = store.listVersionReviews().find((x) => x.versionId === "atlas-v16");
    assert.equal(r.ineligibleForServing, true);
    assert.equal(r.ineligibleForPromotion, true);
    assert.notEqual(resolveServingAtlasVersion(store, "ws-ridgeline"), "atlas-v16");
  });
});

describe("mission 17 item 25-28 restart, live labels, control room, no interrupt", () => {
  test("25 restart preserves objective, brief, audit, and spend", async () => {
    const { store, workspaceId, dir } = seedNamed();
    const submitted = submitObjective(store, {
      workspaceId,
      ownerText: FOUNDER_BRIEF_OWNER_OBJECTIVE,
      category: FOUNDER_BRIEF_CATEGORY,
      maxSpendUsd: 0,
    });
    await planObjective(store, submitted.objective.id);
    await runUntilBlocked(store, submitted.objective.id, { live: false });
    const brief = latestFounderBrief(store, workspaceId);
    assert.ok(brief);
    const obj = store.getObjective(submitted.objective.id);
    const audits = (store.listWatcherAudits(workspaceId) || []).filter((a) => a.founderOpportunityBriefId === brief.id);
    assert.ok(audits.length >= 1);
    const second = new FileStore(dir);
    assert.equal(second.getObjective(obj.id).ownerText, FOUNDER_BRIEF_OWNER_OBJECTIVE);
    assert.equal(second.getFounderOpportunityBrief(brief.id).contentHash, brief.contentHash);
    assert.equal(second.getWatcherAudit(audits[0].id).status, audits[0].status);
    assert.equal(second.getFounderOpportunityBrief(brief.id).sections.spend.thisAssemblyUsd, 0);
    assert.equal(second.getOfferStrategistRun("OSR-003").spendUsd, 0.01062);
  });

  test("26 no provider call is reported as live unless it genuinely ran", async () => {
    const { store, workspaceId } = seedNamed();
    const submitted = submitObjective(store, {
      workspaceId,
      ownerText: FOUNDER_BRIEF_OWNER_OBJECTIVE,
      category: FOUNDER_BRIEF_CATEGORY,
      maxSpendUsd: 0,
    });
    await planObjective(store, submitted.objective.id);
    await runUntilBlocked(store, submitted.objective.id, { live: false });
    const brief = latestFounderBrief(store, workspaceId);
    assert.equal(brief.assembly.freshLiveSpecialistTask, false);
    assert.equal(brief.assembly.assemblyLive, false);
    assert.equal(brief.assembly.providerCalls, 0);
    assert.equal(brief.assembly.fixtureFallback, false);
    const tasks = store.listTasks(submitted.objective.id) || [];
    const os = tasks.find((t) => t.type === "offer_strategist");
    assert.equal(os.resultRefs.live, false);
    assert.equal(os.resultRefs.freshLiveSpecialistTask, false);
    assert.equal(os.resultRefs.deterministic, true);
  });

  test("27 control-room summary matches persisted records", async () => {
    const { store, workspaceId } = seedNamed();
    const submitted = submitObjective(store, {
      workspaceId,
      ownerText: FOUNDER_BRIEF_OWNER_OBJECTIVE,
      category: FOUNDER_BRIEF_CATEGORY,
      maxSpendUsd: 0,
    });
    await planObjective(store, submitted.objective.id);
    await runUntilBlocked(store, submitted.objective.id, { live: false });
    const brief = latestFounderBrief(store, workspaceId);
    const view = mission17Review(store, { workspaceId });
    assert.equal(view.briefId, brief.id);
    assert.equal(view.objectiveId, submitted.objective.id);
    assert.equal(view.offerHypothesis, brief.sections.proposedOffer.text);
    assert.equal(view.targetCustomer, brief.sections.targetCustomer.text);
    assert.equal(view.customerProblem, brief.sections.customerProblem.text);
    assert.equal(view.employeeStatus.status, "development_verified");
    assert.equal(view.liveVsDeterministic.freshLiveSpecialistTask, false);
    assert.equal(view.watcher.evaluatorRevisionId, "EVL-M16-001");
    assert.equal(view.ownerApprovalRequired, false);
  });

  test("28 owner is not interrupted when no new approval is needed", async () => {
    const { store, workspaceId } = seedNamed();
    const s = assessKnowledgeSufficiency(store, { workspaceId, objectiveText: FOUNDER_BRIEF_OWNER_OBJECTIVE });
    assert.equal(s.ownerApprovalRequired, false);
    const submitted = submitObjective(store, {
      workspaceId,
      ownerText: FOUNDER_BRIEF_OWNER_OBJECTIVE,
      category: FOUNDER_BRIEF_CATEGORY,
      maxSpendUsd: 0,
    });
    await planObjective(store, submitted.objective.id);
    await runUntilBlocked(store, submitted.objective.id, { live: false });
    const view = mission17Review(store, { workspaceId });
    assert.equal(view.ownerApprovalRequired, false);
    assert.equal((view.pendingApprovalsForThisObjective || []).length, 0);
    const obj = store.getObjective(submitted.objective.id);
    assert.notEqual(obj.status, "awaiting_owner_approval");
  });
});
