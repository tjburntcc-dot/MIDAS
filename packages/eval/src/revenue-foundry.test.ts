import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import {
  validateProposedPlan,
  planDeterministicValidated,
  OPPORTUNITY_RUBRIC_V1,
  scoreOpportunityAgainstRubric,
  structureOpportunityRecord,
  investmentCommitteePerspectives,
  isBlockedFetchUrl,
  buildSourceProviderRegistry,
  compileCompanyRoleSpec,
  BRAIN_LAYERS,
  retrieveBrainLayers,
  trainingLabIngest,
  runEmbeddingsProofOrBoundary,
  TEACHING_PAIRS,
  buildCompetencyProgress,
  LAUNCH_READINESS_QUESTIONS,
  launchReadinessView,
  EXTERNAL_ADAPTERS,
  buildObjectiveTaskGraph,
  buildSection21Answers,
  assembleHarborLaunchPackHtml,
  assembleFinchClientCadenceHtml,
  improveHarborAndFinchArtifacts,
  HARBOR_LAUNCH_PACK_MIN_BYTES,
  FINCH_CADENCE_MIN_BYTES,
  HARBOR_LAUNCH_REQUIRED_SECTIONS,
  FINCH_CADENCE_REQUIRED_SECTIONS,
  readWorkspaceArtifactFile,
  artifactsPageView,
} from "./revenue-foundry.ts";
import { createNewBusiness, createExistingBusiness, dispatchProductRequest } from "./product-shell.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-rf-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  return { dir, store: new FileStore(dir) };
}

describe("revenue-foundry planner policy", () => {
  test("rejects income guarantees and converts large goals", () => {
    const v = validateProposedPlan({
      revenueGoalUsd: 10000,
      neededSpecialists: [{ roleId: "marketing" }],
      goalText: "guaranteed income of $10k",
    }, { fallback: true });
    assert.equal(v.ok, false);
    assert.ok(v.violations.some((x) => x.code === "INCOME_GUARANTEE"));
  });

  test("deterministic validated plan works at $0", () => {
    const { store } = tmpStore();
    const created = createNewBusiness(store, {
      companyName: "RF Plan Co",
      ownerObjective: "Find three business opportunities I can start with $2,000.",
      budget: "$2000",
    });
    const plan = planDeterministicValidated("Find three business opportunities I can start with $2,000.", {
      store,
      workspaceId: created.workspace.id,
    });
    assert.equal(plan.liveProviderCall, false);
    assert.equal(plan.plannerMode, "deterministic");
    assert.ok(plan.policyValidation);
  });
});

describe("revenue-foundry opportunity rubric", () => {
  test("rubric is frozen and scores are explainable", () => {
    assert.equal(OPPORTUNITY_RUBRIC_V1.id, "OPRUB-001");
    assert.ok(OPPORTUNITY_RUBRIC_V1.forbidInvented.includes("TAM"));
    const scored = scoreOpportunityAgainstRubric({
      name: "Test",
      comparisonDimensions: {
        ownerFit: { text: "strong owner fit", claimClass: "owner_provided" },
        evidenceQuality: { text: "thin", claimClass: "unknown" },
        speedToFirstTest: { text: "fast", claimClass: "owner_provided" },
      },
      automationViability: { text: "partial", claimClass: "MODEL_ESTIMATE" },
    });
    assert.ok(scored.explainableScore >= 1 && scored.explainableScore <= 100);
    assert.equal(scored.parts.length, OPPORTUNITY_RUBRIC_V1.dimensions.length);
    const structured = structureOpportunityRecord({ id: "OPP-T", name: "X", comparisonDimensions: { ownerFit: { text: "fits" } } });
    assert.equal(structured.inventedTamDemandWtpConversion, false);
    assert.ok(structured.costRangesLabeled.label.includes("ESTIMATED"));
    const ic = investmentCommitteePerspectives(structured);
    assert.equal(ic.perspectives.length, 5);
    assert.equal(ic.liveSynthesis, false);
  });
});

describe("revenue-foundry sources SSRF", () => {
  test("blocks localhost and metadata", () => {
    assert.equal(isBlockedFetchUrl("http://127.0.0.1/secret").blocked, true);
    assert.equal(isBlockedFetchUrl("http://169.254.169.254/latest/meta-data").blocked, true);
    assert.equal(isBlockedFetchUrl("https://example.com/ok").blocked, false);
  });

  test("registry has truthful statuses", () => {
    const { store } = tmpStore();
    const reg = buildSourceProviderRegistry(store, { stateDir: store.dir });
    assert.ok(reg.providers.some((p) => p.id === "web_search"));
    assert.ok(reg.providers.some((p) => p.id === "youtube_transcripts" && p.status === "NOT_CONFIGURED"));
    assert.equal(reg.ssrfProtection, true);
  });
});

describe("revenue-foundry teams and brain", () => {
  test("company role specs differ by company kind", () => {
    const harbor = { id: "ws-own-004", name: "Harbor Oak", kind: "local-service" };
    const finch = { id: "ws-own-005", name: "Finch & Copper", kind: "bookkeeping" };
    const saas = { id: "ws-hyp-saas", name: "SaaS Co", kind: "saas" };
    const h = compileCompanyRoleSpec(harbor, "marketing");
    const f = compileCompanyRoleSpec(finch, "finance");
    const s = compileCompanyRoleSpec(saas, "product");
    assert.notEqual(h.mission, f.mission);
    assert.ok(h.compiledPrompt.includes("Harbor"));
    assert.ok(f.compiledPrompt.includes("Finch"));
    assert.ok(s.compiledPrompt.includes("software-like") || s.companyKindHint === "saas");
    assert.equal(h.ownerAuthRequiredToCreateSeat, true);
    assert.equal(h.version.immutable, true);
  });

  test("brain has 9 layers and training lab accepts paste", () => {
    assert.equal(BRAIN_LAYERS.length, 9);
    const { store } = tmpStore();
    const created = createNewBusiness(store, {
      companyName: "Brain Co",
      ownerObjective: "Local music lessons",
      budget: "$500",
    });
    store.putAgent({
      id: "marketing-" + created.workspace.id,
      workspaceId: created.workspace.id,
      roleId: "marketing",
      name: "Marketing",
      status: "authorized_for_supervised_internal",
    });
    store.putKnowledge({
      id: "K-POL-1",
      workspaceId: created.workspace.id,
      kind: "owner_policy",
      text: "Never invent testimonials",
      mandatory: true,
      memoryCategory: "OWNER_POLICY",
    });
    const brain = retrieveBrainLayers(store, "marketing-" + created.workspace.id, "testimonials");
    assert.ok(brain.mandatoryPolicyCount >= 1);
    assert.ok(brain.traces.length >= 1);
    const train = trainingLabIngest(store, {
      workspaceId: created.workspace.id,
      sourceType: "owner_paste",
      text: "Use library bulletin citations.",
      roleId: "marketing",
    });
    assert.equal(train.accepted, true);
    assert.equal(train.videoIngested, false);
    const rejectVideo = trainingLabIngest(store, {
      workspaceId: created.workspace.id,
      sourceType: "owner_paste",
      text: "x",
      claimVideo: true,
    });
    assert.equal(rejectVideo.rejected, true);
  });
});

describe("revenue-foundry embeddings boundary", () => {
  test("without embedFn stays NOT_CONFIGURED", async () => {
    const { store } = tmpStore();
    const out = await runEmbeddingsProofOrBoundary(store, { stateDir: store.dir });
    assert.equal(out.embeddings, false);
    assert.ok(["NOT_CONFIGURED", "NOT_IMPLEMENTED", "TEMPORARILY_UNAVAILABLE"].includes(out.status) || out.status === "NOT_CONFIGURED");
  });
});

describe("revenue-foundry teaching launch adapters", () => {
  test("teaching pairs extend beyond scout-marketing", () => {
    assert.ok(TEACHING_PAIRS.some((p) => p.label === "Finance→Executive"));
    assert.ok(TEACHING_PAIRS.some((p) => p.label === "Scout→Strategist"));
  });

  test("launch readiness has 15 questions and adapters NOT_CONFIGURED", () => {
    assert.equal(LAUNCH_READINESS_QUESTIONS.length, 15);
    assert.ok(EXTERNAL_ADAPTERS.every((a) => a.status === "NOT_CONFIGURED"));
    const { store } = tmpStore();
    const created = createExistingBusiness(store, {
      companyName: "Launch Co",
      existingOffer: "Bookkeeping",
      customerProfile: "Local SMBs",
      currentChallenges: "Slow close",
      goals: "Faster close",
      budget: "$500",
    });
    // override id if needed — use created id
    const view = launchReadinessView(store, created.workspace.id);
    assert.equal(view.questions.length, 15);
    assert.equal(view.honesty.noFabricatedRevenue, true);
    const graph = buildObjectiveTaskGraph({ id: "OBJ-T" });
    assert.ok(graph.tasks.length >= 3);
    assert.ok(graph.tasks[1].deps.includes("T1"));
  });

  test("section 21 builder returns 26 answers", () => {
    const answers = buildSection21Answers({
      liveSpendUsd: 0,
      liveCalls: [],
      planner: { usedLive: false, liveSkippedReason: "test" },
      embeddings: { status: "NOT_CONFIGURED", embeddings: false },
      opps: { newBusiness: { count: 3 }, finchGrow: { count: 3 } },
      tests: "revenue-foundry self",
    });
    assert.equal(Object.keys(answers).length, 26);
    assert.match(answers[22], /pending/i);
    assert.match(answers[19], /No real revenue/i);
  });

  test("product routes for launch-readiness and research exist", () => {
    const { store } = tmpStore();
    const created = createNewBusiness(store, {
      companyName: "Route Co",
      ownerObjective: "Test routes",
      budget: "$100",
    });
    const lr = dispatchProductRequest(store, "GET", "/app/launch-readiness", {}, { workspaceId: created.workspace.id });
    assert.equal(lr.built, true);
    assert.equal(lr.questions.length, 15);
    const research = dispatchProductRequest(store, "GET", "/app/research", {}, {});
    assert.equal(research.built, true);
    assert.ok(research.providers.length >= 5);
  });
});


describe("revenue-foundry enriched draft artifacts", () => {
  test("Harbor launch pack meets min size, sections, draft banner", () => {
    const html = assembleHarborLaunchPackHtml(null, { stateDir: "/workspace/midas/var/state" });
    assert.ok(Buffer.byteLength(html, "utf8") >= HARBOR_LAUNCH_PACK_MIN_BYTES);
    assert.match(html, /DRAFT/i);
    assert.match(html, /Not deployed/i);
    assert.match(html, /\$40/);
    assert.doesNotMatch(html, /<\/body><\/html$/); // must not miss closing >
    assert.match(html, /<\/body>\s*<\/html>/);
    for (const id of HARBOR_LAUNCH_REQUIRED_SECTIONS) {
      assert.ok(html.includes('id="' + id + '"') || html.includes("id='" + id + "'") || (id === "draft-banner" && /draft-banner|DRAFT/.test(html)), "missing section " + id);
    }
    assert.ok(html.includes("ws-own-004"));
    assert.equal(html.includes("ws-own-005"), false);
    assert.equal(html.includes("/workspace/midas/var/artifacts/ws-own-005"), false);
  });

  test("Finch cadence meets min size, sections, draft banner, no invented profitability", () => {
    const html = assembleFinchClientCadenceHtml(null, { stateDir: "/workspace/midas/var/state" });
    assert.ok(Buffer.byteLength(html, "utf8") >= FINCH_CADENCE_MIN_BYTES);
    assert.match(html, /DRAFT/i);
    assert.match(html, /Not deployed/i);
    assert.match(html, /OWNER_REPORTED/);
    assert.match(html, /bottleneck/i);
    assert.match(html, /capacity/i);
    assert.match(html, /invented_profitability/i);
    assert.match(html, /<\/body>\s*<\/html>/);
    for (const id of FINCH_CADENCE_REQUIRED_SECTIONS) {
      assert.ok(html.includes('id="' + id + '"'), "missing section " + id);
    }
    assert.ok(html.includes("ws-own-005"));
    assert.equal(html.includes("ws-own-004"), false);
    assert.equal(html.includes("K-HARBOR-LIB"), false);
    assert.equal(html.includes("$40 / 30"), false);
  });

  test("persisted artifact files and workspace isolation of paths", () => {
    const harbor = "/workspace/midas/var/artifacts/ws-own-004/launch-pack.html";
    const finch = "/workspace/midas/var/artifacts/ws-own-005/client-cadence-draft.html";
    assert.equal(existsSync(harbor), true);
    assert.equal(existsSync(finch), true);
    assert.ok(statSync(harbor).size >= HARBOR_LAUNCH_PACK_MIN_BYTES);
    assert.ok(statSync(finch).size >= FINCH_CADENCE_MIN_BYTES);
    const h = readFileSync(harbor, "utf8");
    const f = readFileSync(finch, "utf8");
    assert.match(h, /DRAFT/);
    assert.match(f, /DRAFT/);
    assert.match(f, /<\/body>\s*<\/html>/);
    assert.ok(harbor.includes("ws-own-004"));
    assert.ok(finch.includes("ws-own-005"));
    assert.equal(harbor.includes("ws-own-005"), false);
    assert.equal(finch.includes("ws-own-004"), false);
    const opened = readWorkspaceArtifactFile("ws-own-004", "launch-pack.html");
    assert.equal(opened.ok, true);
    assert.ok(opened.relativePath.startsWith("var/artifacts/ws-own-004/"));
    const cross = readWorkspaceArtifactFile("ws-own-004", "../ws-own-005/client-cadence-draft.html");
    assert.equal(cross.ok, false);
    const { store } = tmpStore();
    const view = artifactsPageView(store, {});
    assert.equal(view.built, true);
    assert.ok((view.files || []).some((x) => x.name === "launch-pack.html" && x.workspaceId === "ws-own-004"));
    assert.ok((view.files || []).some((x) => x.name === "client-cadence-draft.html" && x.workspaceId === "ws-own-005"));
    const api = dispatchProductRequest(store, "GET", "/app/artifacts", {}, {});
    assert.equal(api.built, true);
    assert.ok(api.files && api.files.length >= 2);
  });

  test("improveHarborAndFinchArtifacts writes both drafts at $0", () => {
    const { store } = tmpStore();
    const out = improveHarborAndFinchArtifacts(store, { stateDir: "/workspace/midas/var/state" });
    assert.equal(out.costUsd, 0);
    assert.equal(out.deployed, false);
    assert.ok(out.harborBytes >= HARBOR_LAUNCH_PACK_MIN_BYTES);
    assert.ok(out.finchBytes >= FINCH_CADENCE_MIN_BYTES);
  });
});
