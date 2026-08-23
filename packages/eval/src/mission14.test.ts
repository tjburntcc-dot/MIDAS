import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0 } from "@midas/db";
import { addOwnerAuthoredRule } from "./knowledge-studio.ts";
import { createWorkspace } from "./workspace.ts";
import { runScoutResearch, reviewFinding, trainAtlasFromScout } from "./scout.ts";
import { submitObjective, runUntilBlocked, decideApproval, objectiveView, OBJECTIVE_TERMINAL_STATUSES } from "./conductor.ts";
import { HANDOFF_FICTIONAL_PROSPECTS, handoffQualificationPolicy } from "./handoff-scenario.ts";
import { looksLikeVideoPlaceholder } from "./html-extract.ts";
import { recordContribution, contributionScorecard, correctProvisionalEffective } from "./contribution.ts";
import { shadowCompile } from "./shadow-compile.ts";
import { freezeFictionalScenario } from "./expected-utility.ts";
import { buildResearchBrief, detectQuestionFamily, RESEARCH_BRIEF_FIELDS, claimSupportsBrief } from "./research-brief.ts";
import { evaluateSourceFitness, FITNESS_DISPOSITIONS } from "./source-fitness.ts";
import { selectPassages } from "./passage-select.ts";
import { assessFindingRelevance, RELEVANCE_CHECKS } from "./finding-relevance.ts";
import { evaluateStageIGate, FROZEN_HASHES } from "./stage-i-gate.ts";
import { factoryAvailability } from "./employee-factory.ts";
import { WATCHER_SCOPES, auditCompletedWork } from "./watcher.ts";

const ATLAS_V14 = FROZEN_HASHES["atlas-v14"];
const ATLAS_V15 = FROZEN_HASHES["atlas-v15"];
const ATLAS_V16 = FROZEN_HASHES["atlas-v16"];

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m14-"));
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
  const ws = createWorkspace(store, {
    name: "M14WS",
    description: "Workspace business description for roofing software usefulness tests.",
    goal: "Qualify US roofing contractors.",
  }).workspace;
  addOwnerAuthoredRule(store, {
    statement: "Only United States accounts are eligible. Non-US geography is a hard disqualifier.",
    workspaceId: ws.id, competency: "territory",
    applicability: {
      scope: "US-only",
      requiredConditions: [{ id: "c-us", field: "country", op: "neq", value: "US", description: "Not US", evidenceRequired: true }],
      effect: "exclude", unknownBehavior: "research_first", exceptions: [], priority: 95,
    },
  });
  return ws;
}

const OPERATIONAL_BODY = [
  "US roofing contractors produce estimates from takeoffs of roof area, pitch, and materials.",
  "Estimating software turns measurements into material lists and proposals.",
  "Contractors who still estimate by hand or with generic spreadsheets may be candidates for dedicated takeoff tools.",
  "This page does not state a conversion rate, average revenue, or win-rate statistic.",
  "Geography in this source is the United States.",
].join("\n");

const WAGE_BODY = [
  "Roofers 2024 Median Pay $50,970 per year $24.51 per hour.",
  "Typical wages for this occupation are reported nationally.",
  "This occupational profile does not describe estimating software, takeoffs, or proposals.",
].join("\n");

const VIDEO_BODY = "Please enable javascript to play this video.\nYour browser does not support the video.";

const BUYING_Q = "What operational buying signals matter for estimating software candidacy?";
const LABOR_Q = "What is the typical labor cost and median wage for this occupation?";

describe("mission 14 stage A brief", () => {
  test("1 brief includes required structured fields", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const brief = buildResearchBrief(store, { workspace: ws, workspaceId: ws.id, question: BUYING_Q });
    for (const f of RESEARCH_BRIEF_FIELDS) assert.ok(f in brief, f);
    assert.equal(brief.questionFamily, "buying_signal");
  });

  test("2 salary is not globally forbidden", () => {
    const brief = buildResearchBrief(null, { question: LABOR_Q });
    assert.equal(brief.salaryGloballyForbidden, false);
    assert.equal(brief.salaryRelevant, true);
    assert.equal(detectQuestionFamily(LABOR_Q), "labor_cost");
    assert.equal(claimSupportsBrief("Median pay is $50,970 per year", brief), true);
  });

  test("3 buying-signal brief lists wages as non-relevant", () => {
    const brief = buildResearchBrief(null, { question: BUYING_Q });
    assert.ok(brief.nonRelevantEvidenceCategories.includes("occupational_wages"));
    assert.equal(claimSupportsBrief("Roofers earned a median pay of $50,970", brief), false);
    assert.equal(claimSupportsBrief("Contractors produce estimates from takeoffs of roof area", brief), true);
  });
});

describe("mission 14 stage B fitness", () => {
  test("4 operational source is strong_fit for buying-signal", () => {
    const { store } = tmpStore();
    const brief = buildResearchBrief(store, { question: BUYING_Q });
    const fit = evaluateSourceFitness(store, {
      source: { id: "S1", excerpt: OPERATIONAL_BODY, classification: "synthetic_fixture" },
      brief: brief,
    });
    assert.equal(fit.disposition, "strong_fit");
  });

  test("5 wage-only source is irrelevant for buying-signal", () => {
    const { store } = tmpStore();
    const brief = buildResearchBrief(store, { question: BUYING_Q });
    const fit = evaluateSourceFitness(store, {
      source: { id: "S2", url: "https://example.com/wages", excerpt: WAGE_BODY, classification: "live_public_source" },
      brief: brief,
    });
    assert.equal(fit.disposition, "irrelevant");
    assert.equal(fit.govIsNotUsefulness, true);
  });

  test("6 video-placeholder is insufficient_substantive_content", () => {
    const { store } = tmpStore();
    const brief = buildResearchBrief(store, { question: BUYING_Q });
    const fit = evaluateSourceFitness(store, {
      source: { id: "S3", excerpt: VIDEO_BODY, classification: "live_public_source" },
      brief: brief,
    });
    assert.equal(fit.disposition, "insufficient_substantive_content");
    assert.ok(FITNESS_DISPOSITIONS.includes(fit.disposition));
  });

  test("7 .gov host is not usefulness", () => {
    const { store } = tmpStore();
    const brief = buildResearchBrief(store, { question: BUYING_Q });
    const fit = evaluateSourceFitness(store, {
      source: { id: "S4", url: "https://example.gov/ooh/wages", title: "An official website", excerpt: WAGE_BODY, classification: "live_public_source" },
      brief: brief,
    });
    assert.equal(fit.disposition, "irrelevant");
    assert.equal(fit.inspection.govHost, true);
    assert.equal(fit.legitimateIsNotRelevant, true);
  });

  test("8 no owner approval request when source has no relevant evidence", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, {
      workspaceId: ws.id,
      ownerText: BUYING_Q + " Use only the permitted page.",
      seedUrls: ["https://example.com/wages-page"],
      livePublic: true,
      permittedFictionalScenario: { title: "fictional", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy() },
      maxSpendUsd: 1,
    });
    const waited = await runUntilBlocked(store, submitted.objective.id, {
      parentVersionId: "atlas-v12",
      urlFixtures: { "https://example.com/wages-page": WAGE_BODY },
    });
    assert.notEqual(waited.awaitingOwnerApproval, true);
    const tasks = store.listTasks(submitted.objective.id);
    const review = tasks.find((t) => t.type === "owner_review");
    assert.equal(review.resultRefs.ownerPrompt, false);
    assert.equal((store.listApprovalRequests(submitted.objective.id) || []).length, 0);
  });
});

describe("mission 14 stage C passages", () => {
  test("9 passages have heading, position, excerpt, checksum", () => {
    const { store } = tmpStore();
    const brief = buildResearchBrief(store, { question: BUYING_Q });
    const sel = selectPassages(store, {
      source: {
        id: "S5",
        extraction: {
          blocks: [
            { kind: "heading", text: "Estimating workflow" },
            { kind: "paragraph", text: OPERATIONAL_BODY.split("\n")[0] },
          ],
        },
      },
      brief: brief,
    });
    assert.ok(sel.passages.length >= 1);
    const p = sel.passages[0];
    assert.ok(p.heading);
    assert.equal(typeof p.position, "number");
    assert.ok(p.excerpt);
    assert.ok(p.checksum);
  });

  test("10 passages are ranked against the brief", () => {
    const { store } = tmpStore();
    const brief = buildResearchBrief(store, { question: BUYING_Q });
    const sel = selectPassages(store, {
      source: {
        id: "S6",
        extraction: {
          blocks: [
            { kind: "paragraph", text: WAGE_BODY.split("\n")[0] },
            { kind: "paragraph", text: OPERATIONAL_BODY.split("\n")[0] },
          ],
        },
      },
      brief: brief,
    });
    assert.ok(sel.passages[0].score >= sel.passages[sel.passages.length - 1].score);
    assert.ok(sel.relevant.some((p) => /takeoff|estimate/i.test(p.excerpt)));
  });

  test("11 video and wage passages are deprioritized on a buying-signal brief", () => {
    const { store } = tmpStore();
    const brief = buildResearchBrief(store, { question: BUYING_Q });
    const sel = selectPassages(store, {
      source: {
        id: "S7",
        extraction: {
          blocks: [
            { kind: "paragraph", text: VIDEO_BODY },
            { kind: "paragraph", text: WAGE_BODY.split("\n")[0] },
            { kind: "paragraph", text: OPERATIONAL_BODY.split("\n")[1] },
          ],
        },
      },
      brief: brief,
    });
    const video = sel.passages.find((p) => /javascript to play this video/i.test(p.excerpt));
    const wage = sel.passages.find((p) => /median pay/i.test(p.excerpt));
    assert.ok(video.deprioritizedReasons.includes("video_placeholder"));
    assert.equal(video.relevant, false);
    assert.equal(wage.relevant, false);
  });

  test("12 no relevant passage yields no_actionable_evidence and STOP", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id,
      question: BUYING_Q,
      seedUrls: ["https://example.com/wages-only"],
      urlFixtures: { "https://example.com/wages-only": WAGE_BODY },
    });
    assert.equal(research.noActionableEvidence, true);
    assert.equal(research.request.terminalStatus, "completed_no_actionable_evidence");
    assert.equal((research.eligibleFindings || []).length, 0);
  });
});

describe("mission 14 stage D relevance", () => {
  test("13 relevance checklist is complete", () => {
    const review = assessFindingRelevance({
      id: "F-x", workspaceId: "ws", claim: "Contractors produce estimates from takeoffs of roof area",
      excerpt: "US roofing contractors produce estimates from takeoffs of roof area, pitch, and materials.",
      kind: "source_backed_fact", sourceId: "S", flags: [], support: { valid: true },
    }, { brief: buildResearchBrief(null, { question: BUYING_Q, workspaceId: "ws" }), source: { id: "S", classification: "synthetic_fixture", fetchStatus: "ok" } });
    assert.deepEqual(review.checks.map((c) => c.name), RELEVANCE_CHECKS);
    assert.equal(review.approvalEligible, true);
  });

  test("14 usefulness is persisted before owner review", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id, question: BUYING_Q,
      seedUrls: ["https://example.com/ops"], urlFixtures: { "https://example.com/ops": OPERATIONAL_BODY },
    });
    const eligible = research.findings.filter((f) => f.approvalEligible);
    assert.ok(eligible.length >= 1);
    assert.ok(eligible.every((f) => f.usefulnessReviewId));
    assert.ok(store.getUsefulnessReview(eligible[0].usefulnessReviewId));
  });

  test("15 accurate-but-irrelevant wage facts are omitted", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id, question: BUYING_Q,
      seedUrls: ["https://example.com/wages-only"], urlFixtures: { "https://example.com/wages-only": WAGE_BODY },
    });
    const facts = research.findings.filter((f) => f.kind === "source_backed_fact" || /median pay|wage/i.test(f.claim));
    assert.ok(facts.length >= 1);
    assert.ok(facts.every((f) => f.approvalEligible === false));
    assert.ok((store.listFindingOmissions() || []).length >= 1);
  });

  test("16 omitted findings earn no performance credit", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    await runScoutResearch(store, {
      workspaceId: ws.id, question: BUYING_Q,
      seedUrls: ["https://example.com/wages-only"], urlFixtures: { "https://example.com/wages-only": WAGE_BODY },
    });
    const card = contributionScorecard(store, ws.id);
    assert.equal(card.byKind.supported_finding_proposed, 0);
    const omissions = store.listFindingOmissions();
    assert.ok(omissions.every((o) => o.performanceCredit === false && o.train === false && o.researchSuccess === false));
  });
});

describe("mission 14 stage E contributions", () => {
  test("17 new provisional events have effective=false", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const ev = recordContribution(store, { kind: "supported_finding_proposed", workspaceId: ws.id, evidence: { findingId: "F1", sourceId: "S1" } });
    assert.equal(ev.state, "provisional");
    assert.equal(ev.effective, false);
  });

  test("18 only verified and effective events count", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    recordContribution(store, { kind: "supported_finding_proposed", workspaceId: ws.id, evidence: { findingId: "F1", sourceId: "S1" }, state: "provisional" });
    recordContribution(store, { kind: "supported_finding_proposed", workspaceId: ws.id, evidence: { findingId: "F2", sourceId: "S1" }, state: "verified" });
    const card = contributionScorecard(store, ws.id);
    assert.equal(card.byKind.supported_finding_proposed, 1);
  });

  test("19 append-only correction of provisional+effective events", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    store.putContributionEvent({
      id: "CE-013", workspaceId: ws.id, kind: "relevant_source_fetched", state: "provisional", effective: true,
      evidence: { sourceId: "S", objectiveId: "OBJ-X" },
    });
    store.putContributionEvent({
      id: "CE-014", workspaceId: ws.id, kind: "supported_finding_proposed", state: "provisional", effective: true,
      evidence: { findingId: "F", objectiveId: "OBJ-X" },
    });
    store.putContributionEvent({
      id: "CE-015", workspaceId: ws.id, kind: "specialist_task_completed", state: "provisional", effective: true,
      evidence: { taskId: "T", objectiveId: "OBJ-X" },
    });
    const out = correctProvisionalEffective(store, ["CE-013", "CE-014", "CE-015"]);
    assert.equal(out.length, 3);
    assert.equal(store.getContributionEvent("CE-013").effective, false);
    assert.equal(store.getContributionEvent("CE-013").state, "provisional");
    assert.ok(store.getContributionEvent("CE-013"));
    assert.ok(out.every((r) => r.correction && r.correction.originalEventId));
  });
});

describe("mission 14 stage F terminal outcomes", () => {
  test("20 terminal statuses exist", () => {
    assert.ok(OBJECTIVE_TERMINAL_STATUSES.includes("completed_no_actionable_evidence"));
    assert.ok(OBJECTIVE_TERMINAL_STATUSES.includes("completed_with_actionable_finding"));
    assert.ok(OBJECTIVE_TERMINAL_STATUSES.includes("rejected_by_owner"));
  });

  test("21 wage-only buying-signal path has no owner prompt, train, or version", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, {
      workspaceId: ws.id,
      ownerText: BUYING_Q + " Use the permitted occupational page only.",
      seedUrls: ["https://example.com/wages-page"],
      livePublic: true,
      permittedFictionalScenario: { title: "fictional", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy() },
      maxSpendUsd: 1,
    });
    await runUntilBlocked(store, submitted.objective.id, {
      parentVersionId: "atlas-v12",
      urlFixtures: { "https://example.com/wages-page": WAGE_BODY },
    });
    const tasks = store.listTasks(submitted.objective.id);
    const review = tasks.find((t) => t.type === "owner_review");
    const train = tasks.find((t) => t.type === "atlas_train");
    assert.equal(review.status, "completed");
    assert.equal(review.resultRefs.ownerPrompt, false);
    assert.ok(train.status === "completed" || train.status === "canceled");
    assert.equal(train.resultRefs.skipped, true);
    assert.equal(Boolean(store.getVersion("atlas-v17")), false);
  });

  test("22 queued atlas_train and atlas_eval are cleaned instead of left forever", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, {
      workspaceId: ws.id,
      ownerText: BUYING_Q + " Use the permitted occupational page only.",
      seedUrls: ["https://example.com/wages-page"],
      livePublic: true,
      permittedFictionalScenario: { title: "fictional", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy() },
      maxSpendUsd: 1,
    });
    await runUntilBlocked(store, submitted.objective.id, {
      parentVersionId: "atlas-v12",
      urlFixtures: { "https://example.com/wages-page": WAGE_BODY },
    });
    const tasks = store.listTasks(submitted.objective.id);
    const train = tasks.find((t) => t.type === "atlas_train");
    const evalTask = tasks.find((t) => t.type === "atlas_eval");
    assert.notEqual(train.status, "queued");
    assert.notEqual(evalTask.status, "queued");
  });
});

describe("mission 14 stage G controls", () => {
  test("23 negative control: wages are accurate and off-objective", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id, question: BUYING_Q,
      seedUrls: ["https://example.com/wages-only"], urlFixtures: { "https://example.com/wages-only": WAGE_BODY },
    });
    const wage = research.findings.find((f) => /median pay|wage|\$50,970/i.test(f.claim + " " + f.excerpt));
    assert.ok(wage);
    assert.equal(wage.approvalEligible, false);
    assert.ok(wage.omissionReason === "accurate_but_irrelevant" || (wage.flags || []).includes("off_objective"));
  });

  test("24 positive synthetic control passes the pipeline", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id, question: BUYING_Q,
      seedUrls: ["https://example.com/ops"], urlFixtures: { "https://example.com/ops": OPERATIONAL_BODY },
      fixture: true,
    });
    const eligible = research.findings.filter((f) => f.approvalEligible === true);
    assert.ok(eligible.length >= 1);
    assert.ok(eligible.some((f) => /takeoff|estimate|spreadsheet|proposal/i.test(f.claim)));
    assert.equal(research.noActionableEvidence, false);
  });

  test("25 fact vs inference is labeled", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id, question: BUYING_Q,
      paste: OPERATIONAL_BODY, fixture: true,
    });
    assert.ok(research.findings.every((f) => f.kind));
    assert.ok(research.findings.some((f) => f.kind === "source_backed_fact" || f.kind === "inference" || f.kind === "unresolved_question"));
  });
});

describe("mission 14 stage H shadow and freeze", () => {
  test("26 shadow retrieval works for an approved relevant finding", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id, question: BUYING_Q,
      paste: OPERATIONAL_BODY, fixture: true,
    });
    const fact = research.findings.find((f) => f.approvalEligible && f.kind === "source_backed_fact") || research.findings.find((f) => f.approvalEligible);
    assert.ok(fact);
    reviewFinding(store, fact.id, { actor: "demo_operator", action: "approve", assignToAtlas: true });
    const scenario = freezeFictionalScenario({ title: "fictional", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS });
    const shadow = shadowCompile(store, {
      workspaceId: ws.id,
      parentVersionId: "atlas-v12",
      servingVersionId: "atlas-v12",
      findings: [store.getScoutFinding(fact.id)],
      fictionalScenario: scenario,
    });
    assert.ok(shadow);
    assert.ok(shadow.outcome);
  });

  test("27 mandatory owner policies are preserved in shadow", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const research = await runScoutResearch(store, {
      workspaceId: ws.id, question: BUYING_Q,
      paste: OPERATIONAL_BODY, fixture: true,
    });
    const fact = research.findings.find((f) => f.approvalEligible);
    reviewFinding(store, fact.id, { actor: "demo_operator", action: "approve", assignToAtlas: true });
    const shadow = shadowCompile(store, {
      workspaceId: ws.id,
      parentVersionId: "atlas-v12",
      findings: [store.getScoutFinding(fact.id)],
    });
    const policies = (store.listKnowledge() || []).filter((k) => k.claimKind === "owner_policy" || k.kind === "owner_policy");
    assert.ok(policies.length >= 1);
    assert.ok(shadow.outcome !== "skip_policy_displacement" || shadow.mandatoryPoliciesPreserved !== false);
  });

  test("28 frozen hashes unchanged", () => {
    const historical = JSON.parse(readFileSync(join(import.meta.dirname, "../../../var/state/agent_versions.json"), "utf8"));
    const byId = Object.fromEntries(historical.map((v) => [v.id, v]));
    assert.equal(byId["atlas-v14"].contentHash, ATLAS_V14);
    assert.equal(byId["atlas-v15"].contentHash, ATLAS_V15);
    assert.equal(byId["atlas-v16"].contentHash, ATLAS_V16);
    assert.equal(byId["scout-ws-ridgeline-v0"].contentHash, FROZEN_HASHES["scout-ws-ridgeline-v0"]);
    assert.equal(byId["watcher-ws-ridgeline-v0"].contentHash, FROZEN_HASHES["watcher-ws-ridgeline-v0"]);
    assert.equal(byId["conductor-ws-ridgeline-v0"].contentHash, FROZEN_HASHES["conductor-ws-ridgeline-v0"]);
  });
});

describe("mission 14 stage I and control room", () => {
  test("29 Stage I evaluates all nine conditions", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    await runScoutResearch(store, {
      workspaceId: ws.id, question: BUYING_Q,
      seedUrls: ["https://example.com/wages-only"], urlFixtures: { "https://example.com/wages-only": WAGE_BODY },
    });
    const pos = await runScoutResearch(store, {
      workspaceId: ws.id, question: BUYING_Q,
      paste: OPERATIONAL_BODY, fixture: true,
    });
    const fact = pos.findings.find((f) => f.approvalEligible);
    reviewFinding(store, fact.id, { actor: "demo_operator", action: "approve", assignToAtlas: true });
    shadowCompile(store, { workspaceId: ws.id, parentVersionId: "atlas-v12", findings: [store.getScoutFinding(fact.id)] });
    auditCompletedWork(store, { workspaceId: ws.id });
    const gate = evaluateStageIGate(store, {
      workspaceId: ws.id,
      proofs: {
        salaryRejected: true,
        videoRejected: looksLikeVideoPlaceholder(VIDEO_BODY),
        usefulnessPersisted: true,
        positiveControlPassed: true,
        shadowWorked: true,
        mandatoryPoliciesPreserved: true,
        watcherAudited: true,
      },
    });
    assert.equal(gate.conditions.length, 9);
    assert.ok(gate.conditions.every((c) => "pass" in c && "title" in c));
  });

  test("30 factory reports blocked when Stage I fails; does not invent Offer Strategist", () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const gate = evaluateStageIGate(store, { workspaceId: ws.id });
    const avail = factoryAvailability(store, { workspaceId: ws.id });
    if (!gate.pass) {
      assert.equal(avail.available, false);
      assert.equal((store.listEmployeeRoles(ws.id) || []).some((r) => r.roleId === "offer_strategist"), false);
    }
  });

  test("31 objectiveView exposes Mission 14 review fields", async () => {
    const { store } = tmpStore();
    const ws = seedWs(store);
    const submitted = submitObjective(store, {
      workspaceId: ws.id,
      ownerText: BUYING_Q + " Use the permitted page.",
      seedUrls: ["https://example.com/wages-page"],
      livePublic: true,
      permittedFictionalScenario: { title: "fictional", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy() },
      maxSpendUsd: 1,
    });
    await runUntilBlocked(store, submitted.objective.id, {
      parentVersionId: "atlas-v12",
      urlFixtures: { "https://example.com/wages-page": WAGE_BODY },
    });
    const view = objectiveView(store, submitted.objective.id);
    assert.ok("researchBrief" in view);
    assert.ok("sourceFitness" in view);
    assert.ok("passages" in view);
    assert.ok("omittedFindings" in view);
    assert.ok("whyReachedOwnerReview" in view);
    assert.ok("contributionSplit" in view);
    assert.ok("employeeCreation" in view);
    assert.equal(view.whyReachedOwnerReview.reachedOwnerReview, false);
  });

  test("32 pending-approval banner is generic, not OBJ-004-only", () => {
    const html = readFileSync(join(import.meta.dirname, "../../../apps/api/src/control-room.html"), "utf8");
    assert.match(html, /pendingOwnerBanner/);
    assert.match(html, /Pending local_owner approval/);
    assert.equal(html.includes("refreshPendingOwnerBanner"), true);
  });

  test("33 ranking and usefulness modules do not hardcode FND-013/015, BLS URL, or version ids", () => {
    const files = [
      readFileSync(join(import.meta.dirname, "research-brief.ts"), "utf8"),
      readFileSync(join(import.meta.dirname, "source-fitness.ts"), "utf8"),
      readFileSync(join(import.meta.dirname, "passage-select.ts"), "utf8"),
      readFileSync(join(import.meta.dirname, "finding-relevance.ts"), "utf8"),
      readFileSync(join(import.meta.dirname, "usefulness.ts"), "utf8"),
    ].join("\n");
    assert.equal(/FND-013/.test(files), false);
    assert.equal(/FND-015/.test(files), false);
    assert.equal(/bls\.gov/.test(files), false);
    assert.equal(/atlas-v16/.test(files), false);
  });
});
