import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { frozenHashCheck } from "./founder-opportunity-brief.ts";
import {
  createNewBusiness,
  createExistingBusiness,
  generateOpportunities,
  generateOpportunitiesLive,
  proposeTeam,
  proposeAdditionalSeats,
  createTeam,
  runEmployeeTask,
  runEmployeeTaskLive,
  submitProductObjective,
  submitProductObjectiveLive,
  dispatchProductRequest,
  productApprovals,
  assembleWorkFeed,
} from "./product-shell.ts";
import { runLiveSpecialist, retrieveWorkspaceContext } from "./live-specialists.ts";
import { roleClassificationTable, classifyRole, isLiveReasoningRole, isDeterministicAppropriateRole } from "./role-classification.ts";
import { searchProviderStatus, querySearchProvider, SEARCH_PROVIDER_STATUS, extractSearchResults, persistAcceptedFromExistingRecord, hydrateSearchConnection, resetSearchConnectionForTests, classifyOnTopicRelevance, classifyExistingSearchRecords } from "./search-provider.ts";
import { buildLandingHtml } from "./deliverables.ts";
import { persistInternalAutonomyPolicy, evaluateInternalAutonomy, autonomyPolicyView } from "./autonomy-policy.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-live-foundry-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  return { dir, store: new FileStore(dir) };
}

function seedRidgelineBeside(store) {
  store.putWorkspace({
    id: "ws-ridgeline",
    name: "RidgeLine Estimator",
    description: "Roofing software. Business description, not policy.",
    industry: "construction_software",
    servingAtlasVersionId: "atlas-v15",
    ownerStatus: "active",
    createdAt: "2026-08-21T12:00:00.000Z",
  });
  store.putEmployeeRole({
    id: "EMP-001",
    workspaceId: "ws-ridgeline",
    agentId: "offer_strategist-ws-ridgeline",
    roleId: "offer_strategist",
    name: "Offer Strategist",
    roleTitle: "Offer Strategist",
    status: "development_verified",
    versionId: "offer_strategist-ws-ridgeline-v0",
    promoted: false,
    spendLimitUsd: 0.5,
    implementationStatus: "implemented_basic",
  });
  for (const [id, hash] of Object.entries(FROZEN_HASHES)) {
    if (!store.getVersion(id)) {
      store.putVersion({ id: id, agentId: id.split("-")[0] === "atlas" ? "atlas" : id.replace(/-v0$/, ""), contentHash: hash, immutable: true });
    }
  }
  store.putTeachingPacket({
    id: "TPK-001",
    workspaceId: "ws-ridgeline",
    status: "awaiting_owner_approval",
    recipientEmployeeId: "EMP-001",
    recipientRoleId: "offer_strategist",
    title: "Roofr public copy",
  });
  store.putApprovalRequest({
    id: "APR-005",
    workspaceId: "ws-ridgeline",
    kind: "teaching_packet",
    objectType: "teaching_packet",
    objectId: "TPK-001",
    status: "pending",
    requireLocalOwner: true,
    actorRequired: ["local_owner"],
    createdAt: "2026-08-21T21:30:07.237Z",
  });
}

function authorize(store, proposalId, extra) {
  return createTeam(store, {
    proposalId: proposalId,
    actor: "owner",
    confirm: "Create this team",
    authorized: true,
    createThisTeam: true,
    ...(extra || {}),
  });
}

function liveResponder(structured, extras) {
  return async () => ({
    kind: "live",
    text: JSON.stringify(structured),
    usage: { inputTokens: 12, outputTokens: 20 },
    model: "test-live-model",
    providerRequestId: (extras && extras.requestId) || "req-live-test",
  });
}

describe("live foundry phase 1", () => {
  test("role classification inventory covers catalog seats", () => {
    const table = roleClassificationTable();
    const byId = Object.fromEntries(table.map((r) => [r.roleId, r]));
    assert.equal(byId.business_research.intelligenceClass, "genuine_live_model");
    assert.equal(byId.offer_strategist.intelligenceClass, "genuine_live_model");
    assert.equal(byId.marketing.intelligenceClass, "genuine_live_model");
    assert.equal(byId.product.intelligenceClass, "genuine_live_model");
    assert.equal(byId.ops.intelligenceClass, "genuine_live_model");
    assert.equal(byId.finance.intelligenceClass, "genuine_live_model");
    assert.equal(byId.workflow_manager.intelligenceClass, "deterministic_appropriate");
    assert.equal(byId.independent_audit.intelligenceClass, "deterministic_appropriate");
    assert.equal(byId.sales.intelligenceClass, "genuine_live_model");
    assert.equal(byId.executive.intelligenceClass, "genuine_live_model");
    assert.ok(byId.sales.taskTypes.includes("sales_planning"));
    assert.ok(byId.executive.taskTypes.includes("executive_planning"));
    assert.equal(isLiveReasoningRole("offer_strategist"), true);
    assert.equal(isDeterministicAppropriateRole("independent_audit"), true);
  });

  test("live path is not labeled live unless a provider call actually ran", async () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Foundry Test Shop",
      ownerObjective: "Write marketing copy and an offer hypothesis for a neighborhood compost subscription.",
      budget: "1800",
      preferredIndustries: "neighborhood compost, local marketing",
      availableSkillsAndResources: "writing, pickup bike",
    });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const team = authorize(store, proposed.proposal.id);
    const marketing = team.employees.find((e) => e.roleId === "marketing");
    assert.ok(marketing, "marketing should be hired on the new workspace, not Demo A");
    assert.notEqual(created.workspace.id, "ws-ridgeline");
    assert.notEqual(created.workspace.name, "Linden Lane Bike Repair");
    const closed = await runEmployeeTaskLive(store, marketing.id, { preferLive: true, taskKind: "marketing_copy", ownerText: "Draft internal copy." }, { live: false });
    assert.equal(closed.liveProviderCall, false);
    assert.equal(closed.task.liveProviderCall, false);
    assert.equal(closed.task.output.liveProviderCall, false);
    assert.equal(closed.task.output.label, "deterministic");
    assert.equal(closed.fixtureFallback, false);
    const execs = store.listSpecialistExecutions(created.workspace.id);
    assert.ok(execs.length >= 1);
    assert.equal(execs.every((e) => e.live !== true || e.fixture !== true), true);
    assert.equal(execs.some((e) => e.live === true), false);
  });

  test("fixture cannot masquerade as live", async () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Fixture Trap Co",
      ownerObjective: "Research remaining unknowns for a local compost club.",
    });
    const out = await runLiveSpecialist(store, {
      workspaceId: created.workspace.id,
      roleId: "business_research",
      taskType: "scout_synthesis",
      ownerText: "What is still unknown?",
    }, {
      live: true,
      responder: async () => ({ kind: "fixture", text: JSON.stringify({ findings: [], questions: [], already_known: [], missing_information: [], assumptions: [], labels: { hypothesisVersusFact: true, status: "ok" } }) }),
    });
    assert.equal(out.live, false);
    assert.equal(out.fixtureFallback, false);
    assert.equal(out.execution.live, false);
    assert.match(String(out.error || ""), /fixture|not live|kind/i);
  });

  test("deterministic roles stay deterministic even when preferLive is set", async () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Watcher Only Co",
      ownerObjective: "Operate a neighborhood repair desk with a small team.",
      budget: "800",
    });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const team = authorize(store, proposed.proposal.id);
    const watcher = team.employees.find((e) => e.roleId === "independent_audit");
    assert.ok(watcher);
    const ran = await runEmployeeTaskLive(store, watcher.id, { preferLive: true, taskKind: "audit", ownerText: "Audit this." }, {
      live: true,
      responder: liveResponder({ findings: [], questions: [], already_known: [], missing_information: [], assumptions: [], labels: { hypothesisVersusFact: true, status: "ok" } }),
    });
    assert.equal(ran.liveProviderCall, false);
    assert.equal(ran.usedLivePath, false);
    assert.equal(ran.task.output.liveModelWork, false);
    assert.equal(ran.task.output.label, "deterministic");
    const manager = team.employees.find((e) => e.roleId === "workflow_manager");
    const plan = runEmployeeTask(store, manager.id, { taskKind: "supervised_plan", ownerText: "Plan work." });
    assert.equal(plan.liveProviderCall, false);
    assert.equal(plan.task.output.liveModelWork, false);
  });

  test("new workspace isolation and APR-005 still pending and frozen hashes", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Isolation Foundry Co",
      ownerObjective: "Write marketing copy for a compost subscription.",
      availableSkillsAndResources: "copywriting",
    });
    assert.notEqual(created.workspace.id, "ws-ridgeline");
    assert.notEqual(created.workspace.name, "Linden Lane Bike Repair");
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const team = authorize(store, proposed.proposal.id);
    const ids = team.employees.map((e) => e.id);
    assert.ok(!ids.includes("EMP-001"));
    assert.ok(team.employees.every((e) => e.workspaceId === created.workspace.id));
    const knowledge = (store.listKnowledge() || []).filter((k) => k.workspaceId === created.workspace.id);
    assert.ok(knowledge.every((k) => k.workspaceId === created.workspace.id));
    const hashes = frozenHashCheck(store);
    assert.equal(hashes["atlas-v15"].expected, "0a1b77111582b76a4be3b873a09a4c2a73efec7103f6bb9dafdff7e8a4774a70");
    assert.equal(hashes["atlas-v15"].mutated, false);
    assert.equal(hashes["atlas-v16"].expected, "64bb716d5aa030376a1e96194a30858bb3ad67093ede1c16b3146a1fd86321d1");
    assert.equal(hashes["offer_strategist-ws-ridgeline-v0"].expected, "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce");
    assert.equal(store.getEmployeeRole("EMP-001").status, "development_verified");
    const approvals = productApprovals(store, {});
    assert.equal(approvals.apr005 && approvals.apr005.pending, true);
    assert.equal(store.getApprovalRequest("APR-005").status, "pending");
    assert.equal(store.getTeachingPacket("TPK-001").status, "awaiting_owner_approval");
  });

  test("search provider boundary reports not-connected", () => {
    resetSearchConnectionForTests();
    const status = searchProviderStatus();
    assert.equal(status.connected, false);
    assert.equal(status.usefulOnTopic, false);
    assert.equal(status.status, SEARCH_PROVIDER_STATUS);
    assert.equal(status.searchIntegrationExists, false);
    assert.equal(status.internetWideSearch, false);
    const q = querySearchProvider("roofing software market size");
    assert.equal(q.ok, false);
    assert.equal(q.results.length, 0);
    assert.equal(q.live, false);
    assert.equal(dispatchProductRequest(new FileStore(mkdtempSync(join(tmpdir(), "midas-search-"))), "GET", "/app/search", {}, {}).status, "not-connected");
  });

  test("genuine live specialist is labeled live only after a live responder", async () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Live Copy Co",
      ownerObjective: "Draft marketing copy and an offer for a neighborhood compost subscription.",
      preferredIndustries: "compost, marketing",
      availableSkillsAndResources: "copywriting, pickup bike",
    });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const team = authorize(store, proposed.proposal.id);
    const marketing = team.employees.find((e) => e.roleId === "marketing");
    const structured = {
      audience: "neighbors who want a compost pickup",
      customer_problem: "Owner-stated hassle of hauling scraps.",
      headline: "Cedar Path pickup — draft only",
      body_outline: ["Problem as stated", "Offer as stated", "Do not email anyone"],
      cta_internal_only: "Owner reviews the draft. No send.",
      assumptions: ["Neighbors exist as the owner stated"],
      missing_information: ["Demand is unknown"],
      labels: { hypothesisVersusFact: true, status: "hypothesis" },
    };
    const ran = await runEmployeeTaskLive(store, marketing.id, {
      preferLive: true,
      taskKind: "marketing_copy",
      ownerText: "Draft internal landing copy.",
    }, { live: true, responder: liveResponder(structured) });
    assert.equal(ran.liveProviderCall, true);
    assert.equal(ran.task.liveProviderCall, true);
    assert.equal(ran.task.output.label, "live");
    assert.equal(ran.task.output.fixtureFallback, false);
    assert.equal(ran.execution.live, true);
    assert.equal(ran.execution.fixture, false);
    assert.equal(ran.execution.model, "test-live-model");
    assert.ok(ran.execution.rawText.includes("Cedar Path"));
  });

  test("two owner profiles produce different opportunities", () => {
    const { store } = tmpStore();
    const a = generateOpportunities(store, {
      ownerObjective: "Start a neighborhood bicycle repair shop.",
      budget: "2500",
      preferredIndustries: "local bicycle repair",
      availableSkillsAndResources: "hand tools",
      geographicConstraints: "one Midwestern neighborhood",
    });
    const b = generateOpportunities(store, {
      companyName: "Harbor Oven",
      ownerObjective: "Grow an existing bakery.",
      existingOffer: "weekend sourdough loaves",
      customerProfile: "walk-in neighbors",
      currentChallenges: "Friday leftover bread",
      goals: "use leftover loaves",
      workspaceId: createExistingBusiness(store, {
        companyName: "Harbor Oven",
        businessDescription: "weekend sourdough",
        existingOffer: "weekend sourdough loaves",
        customerProfile: "walk-in neighbors",
        currentChallenges: "Friday leftover bread",
        goals: "use leftover loaves",
      }).workspace.id,
    });
    assert.ok(a.opportunities.length >= 3);
    assert.ok(b.opportunities.length >= 3);
    assert.notEqual(a.opportunities[0].name, b.opportunities[0].name);
    assert.equal(a.liveProviderCall, false);
    assert.equal(b.set.intakeKind, "existing_business");
    assert.notEqual(a.set.intakeKind, b.set.intakeKind);
  });

  test("autonomy policy requires owner/local_owner and blocks prohibited actions", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Autonomy Co",
      ownerObjective: "Operate a compost pickup with a supervised team.",
    });
    assert.throws(() => persistInternalAutonomyPolicy(store, {
      workspaceId: created.workspace.id,
      actor: "demo_operator",
      authorized: true,
      confirm: "Save autonomy policy",
    }), /demo_operator/);
    const saved = persistInternalAutonomyPolicy(store, {
      workspaceId: created.workspace.id,
      actor: "local_owner",
      authorized: true,
      confirm: "Save autonomy policy",
      authorizedActions: ["run_specialist_task", "assemble_deliverables"],
      testOrLocalOwner: true,
    });
    assert.equal(saved.policy.authorizedBy, "local_owner");
    assert.equal(saved.policy.kind, "internal_supervised_policy");
    const skip = evaluateInternalAutonomy(store, created.workspace.id, "run_specialist_task");
    assert.equal(skip.skipPrompt, true);
    const blocked = evaluateInternalAutonomy(store, created.workspace.id, "outreach");
    assert.equal(blocked.blocked, true);
    const view = autonomyPolicyView(store, { workspaceId: created.workspace.id });
    assert.equal(view.active.id, saved.policy.id);
    const dispatched = dispatchProductRequest(store, "GET", "/app/autonomy", {}, { workspaceId: created.workspace.id });
    assert.equal(dispatched.active.id, saved.policy.id);
  });

  test("owner workspaces cannot retrieve unscoped RidgeLine knowledge", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    store.putKnowledge({
      id: "K-001-01",
      statement: "RidgeLine unscoped leak probe",
      accepted: true,
      reviewStatus: "approved",
    });
    store.putKnowledge({
      id: "K-RL-SCOPED",
      workspaceId: "ws-ridgeline",
      statement: "RidgeLine scoped fact",
      accepted: true,
      reviewStatus: "approved",
    });
    const created = createNewBusiness(store, {
      companyName: "Scoped Retrieval Co",
      ownerObjective: "Keep owner knowledge on this company only.",
    });
    store.putKnowledge({
      id: "K-OWN-LOCAL",
      workspaceId: created.workspace.id,
      statement: "Cedar pails only",
      accepted: true,
      reviewStatus: "approved",
      classification: "company_fact",
    });
    const ctx = retrieveWorkspaceContext(store, created.workspace.id, {});
    assert.ok(ctx.retrievedIds.includes("K-OWN-LOCAL"));
    assert.ok(!ctx.retrievedIds.includes("K-001-01"));
    assert.ok(!ctx.retrievedIds.includes("K-RL-SCOPED"));
    const ridge = retrieveWorkspaceContext(store, "ws-ridgeline", {});
    assert.ok(ridge.retrievedIds.includes("K-RL-SCOPED"));
  });

  test("additional marketing seat requires owner authorize and stays off Demo A", () => {
    const { store } = tmpStore();
    const created = createNewBusiness(store, {
      companyName: "Add Seat Co",
      ownerObjective: "Operate a compost pickup. Budget $800.",
      budget: "800",
    });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const team = authorize(store, proposed.proposal.id);
    assert.ok(!team.employees.some((e) => e.roleId === "marketing"));
    const extra = proposeAdditionalSeats(store, { workspaceId: created.workspace.id, roleIds: ["marketing"] });
    assert.equal(extra.proposal.kind, "additional_seats");
    assert.equal(extra.employeesCreated, false);
    const added = authorize(store, extra.proposal.id);
    assert.equal(added.authorizedBy, "owner");
    assert.ok(added.employees.some((e) => e.roleId === "marketing"));
    assert.ok(added.employees.every((e) => e.workspaceId === created.workspace.id));
  });

  test("live conductor submit does not pre-run deterministic specialists", async () => {
    const { store } = tmpStore();
    const created = createNewBusiness(store, {
      companyName: "Live Conductor Co",
      ownerObjective: "Write marketing copy and an offer hypothesis for a neighborhood compost subscription.",
      availableSkillsAndResources: "copywriting, pickup bike",
    });
    const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
    const team = authorize(store, proposed.proposal.id);
    const structured = {
      audience: "neighbors",
      customer_problem: "hauling scraps",
      headline: "Draft only",
      body_outline: ["Problem", "Offer", "No send"],
      cta_internal_only: "Owner reviews",
      assumptions: ["neighbors exist"],
      missing_information: ["demand unknown"],
      labels: { hypothesisVersusFact: true, status: "hypothesis" },
      proposed_offer: "Thursday pail pickup",
      findings: [{ statement: "Owner wants a compost club", claim_class: "owner_provided", evidence_ids: [] }],
      questions: ["Demand?"],
      already_known: ["owner objective"],
      slice: "Local landing checklist",
      acceptance_checks: ["inspectable file"],
      not_shipped: true,
    };
    const work = await submitProductObjectiveLive(store, {
      workspaceId: created.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem.",
    }, { live: true, responder: liveResponder(structured) });
    const liveTasks = (work.tasks || []).filter((t) => t.liveProviderCall === true);
    assert.ok(liveTasks.length >= 1, "expected at least one live specialist task, got " + liveTasks.length);
    assert.equal(work.fixtureLabeledAsLive, false);
    assert.ok((work.tasks || []).some((t) => t.assignedRoleId === "independent_audit" && t.liveProviderCall !== true));
  });

  test("search extractor persists markdown and citation pages that used to be dropped", () => {
    const rawText = [
      "1. **Title:** West Asheville | Buncombe County, NC",
      "   **URL:** (Buncombe County site)",
      "   **Excerpt:**",
      '   "Serving the westside since 1953." ([buncombenc.gov](https://www.buncombenc.gov/292/West-Asheville?utm_source=openai))',
      "",
      "2. **Title:** Libraries – West Asheville",
      "   **URL:** (Buncombecounty.org)",
      "   **Excerpt:**",
      '   "The library also houses a large children\'s section." ([buncombecounty.org](https://www.buncombecounty.org/governing/depts/library/branch-locations/west-asheville.aspx?utm_source=openai))',
    ].join("\n");
    const hits = extractSearchResults({ output_text: rawText }, rawText);
    assert.ok(hits.length >= 2);
    assert.ok(hits.some((h) => /buncombenc\.gov/.test(h.url)));
    assert.ok(hits.some((h) => /West Asheville/.test(h.title)));
    const { store } = tmpStore();
    store.putWorkspace({ id: "ws-own-004", name: "Harbor Oak Music Lessons", createdAt: "2026-08-22T00:00:00.000Z" });
    store.putSearchRecord({
      id: "SRCH-001",
      workspaceId: "ws-own-004",
      query: "West Asheville library bulletin",
      live: true,
      fixture: false,
      urls: [],
      titles: [],
      excerpts: [],
      rawText: rawText,
      createdAt: "2026-08-22T02:19:57.214Z",
    });
    const fixed = persistAcceptedFromExistingRecord(store, "SRCH-001");
    assert.equal(fixed.ok, true);
    assert.ok(fixed.acceptedCount >= 2);
    assert.equal((store.getSearchRecord("SRCH-001").urls || []).length, 0);
    assert.ok(store.getSearchRecord(fixed.record.id).urls.length >= 2);
    hydrateSearchConnection(store);
    const view = dispatchProductRequest(store, "GET", "/app/search", {}, { workspaceId: "ws-own-004" });
    assert.equal(view.status, "connected");
    assert.equal(view.usefulOnTopic, true);
    assert.ok(view.records.some((r) => (r.urls || []).length >= 2));
    resetSearchConnectionForTests();
  });

  test("on-topic relevance filter accepts library URLs and rejects inspect docs", () => {
    const harborQuery = "West Asheville North Carolina public library community bulletin board after-school programs official site";
    const libraryHits = [
      { url: "https://www.buncombenc.gov/292/West-Asheville?utm_source=openai", title: "West Asheville | Buncombe County, NC", excerpt: "Serving the westside since 1953, the West Asheville Library is right in the heart of this vibrant community on Haywood Rd." },
      { url: "https://www.buncombecounty.org/governing/depts/library/branch-locations/west-asheville.aspx?utm_source=openai", title: "Libraries – West Asheville (Buncombe County Public Libraries)", excerpt: "The library also houses a large children's section and a 75-seat meeting room." },
      { url: "https://media.buncombenc.gov/common/library/Programs%20-%20February%202025.pdf?utm_source=openai", title: "Programs – February 2025 (Buncombe County Public Libraries PDF)", excerpt: "Button Making Party … West Asheville Library – after-school art experience programs." },
      { url: "https://www.trumba.com/calendars/west-asheville-library?media=print&utm_source=openai", title: "West Asheville Library – Calendar (Trumba)", excerpt: "West Asheville Library – Family Story Time … Baby Story Time." },
    ];
    const inspectHits = [
      { url: "https://support.google.com/webmasters/answer/12482179?hl=en&utm_source=openai", title: "Inspect and troubleshoot a single page - Search Console Help", excerpt: "" },
      { url: "https://developers.google.com/search/docs/essentials/technical?authuser=19&hl=en&utm_source=openai", title: "Google Search Technical Requirements", excerpt: "" },
      { url: "https://developer.chrome.com/docs/devtools/inspect-mode?hl=en&utm_source=openai", title: "Inspect mode: Quickly analyze element properties | Chrome DevTools", excerpt: "" },
      { url: "https://developer.apple.com/documentation/javascriptcore/jscontext/isinspectable?language=objc&utm_source=openai", title: "inspectable | Apple Developer Documentation", excerpt: "" },
      { url: "https://developer.apple.com/documentation/safari-developer-tools/enabling-inspecting-content-in-your-apps?utm_source=openai", title: "Enabling inspecting content in your apps", excerpt: "" },
      { url: "https://developer.apple.com/documentation/webkit/wkwebview/isinspectable?changes=la_5&language=objc&utm_source=openai", title: "inspectable | Apple Developer Documentation", excerpt: "" },
      { url: "https://chromium.googlesource.com/chromium/chromium/%2B/trunk/chrome/browser/devtools/frontend/devtools_discovery_page.html?utm_source=openai", title: "devtools_discovery_page.html", excerpt: "" },
    ];
    for (const h of libraryHits) {
      const c = classifyOnTopicRelevance(h, harborQuery);
      assert.equal(c.acceptedUseful, true, "expected accept for " + h.url);
    }
    for (const h of inspectHits) {
      const c = classifyOnTopicRelevance(h, harborQuery);
      assert.equal(c.acceptedUseful, false, "expected reject for " + h.url);
      assert.equal(c.classification, "rejected_off_topic");
    }
    const { store } = tmpStore();
    store.putWorkspace({ id: "ws-own-004", name: "Harbor Oak Music Lessons", createdAt: "2026-08-22T00:00:00.000Z" });
    store.putSearchRecord({
      id: "SRCH-002",
      workspaceId: "ws-own-004",
      query: harborQuery,
      live: true,
      fixture: false,
      urls: libraryHits.map((h) => h.url),
      titles: libraryHits.map((h) => h.title),
      excerpts: libraryHits.map((h) => h.excerpt),
      createdAt: "2026-08-22T02:34:46.512Z",
    });
    store.putSearchRecord({
      id: "SRCH-003",
      workspaceId: "ws-own-004",
      query: harborQuery,
      live: true,
      fixture: false,
      urls: inspectHits.map((h) => h.url),
      titles: inspectHits.map((h) => h.title),
      excerpts: inspectHits.map((h) => h.excerpt),
      createdAt: "2026-08-22T02:34:53.967Z",
    });
    const derived = classifyExistingSearchRecords(store, ["SRCH-002", "SRCH-003"]);
    assert.equal(derived.ok, true);
    assert.equal(derived.record.acceptedUsefulCount, 4);
    assert.equal(derived.record.rejectedOffTopicCount, 7);
    assert.ok((store.getSearchRecord("SRCH-002").urls || []).length === 4);
    assert.ok((store.getSearchRecord("SRCH-003").urls || []).length === 7);
    hydrateSearchConnection(store);
    const status = searchProviderStatus(store);
    assert.equal(status.connected, true);
    assert.equal(status.usefulOnTopic, true);
    assert.equal(status.internetWideSearch, true);
    assert.ok(status.acceptedUsefulPages >= 4);
    assert.ok(status.rejectedOffTopicPages >= 7);
    // SRCH-003 alone must not count as useful-on-topic research success
    resetSearchConnectionForTests();
    const store3 = tmpStore().store;
    store3.putSearchRecord({
      id: "SRCH-003",
      workspaceId: "ws-own-004",
      query: harborQuery,
      live: true,
      fixture: false,
      urls: inspectHits.map((h) => h.url),
      titles: inspectHits.map((h) => h.title),
      excerpts: inspectHits.map((h) => ""),
      createdAt: "2026-08-22T02:34:53.967Z",
    });
    hydrateSearchConnection(store3);
    const onlyInspect = searchProviderStatus(store3);
    assert.equal(onlyInspect.connected, true);
    assert.equal(onlyInspect.usefulOnTopic, false);
    assert.equal(onlyInspect.internetWideSearch, false);
    resetSearchConnectionForTests();
  });

  test("work feed is deterministic and workspace-scoped", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Feed Scope Co",
      ownerObjective: "Neighborhood piano lessons. Budget $1800.",
    });
    persistInternalAutonomyPolicy(store, {
      workspaceId: created.workspace.id,
      actor: "local_owner",
      authorized: true,
      confirm: "Save autonomy policy",
      authorizedActions: ["run_specialist_task", "assemble_deliverables"],
      testOrLocalOwner: true,
    });
    store.putSpecialistExecution({
      id: "LSE-FEED-1",
      workspaceId: created.workspace.id,
      roleId: "marketing",
      taskType: "marketing_copy",
      ok: true,
      live: true,
      fixture: false,
      estimatedCostUsd: 0.01,
      retrievedIds: ["K-LOCAL"],
      createdAt: "2026-08-22T03:00:00.000Z",
    });
    store.putSpecialistExecution({
      id: "LSE-RIDGE",
      workspaceId: "ws-ridgeline",
      roleId: "offer_strategist",
      taskType: "offer_strategist",
      ok: true,
      live: true,
      retrievedIds: ["K-001-01"],
      createdAt: "2026-08-22T03:00:01.000Z",
    });
    const feed = assembleWorkFeed(store, { workspaceId: created.workspace.id });
    assert.equal(feed.liveProviderCall, false);
    assert.ok(feed.feed.some((r) => r.id === "LSE-FEED-1"));
    assert.ok(!feed.feed.some((r) => r.id === "LSE-RIDGE"));
    const row = feed.feed.find((r) => r.id === "LSE-FEED-1");
    assert.ok(row.whyPermitted);
    assert.deepEqual(row.sourcesUsed, ["K-LOCAL"]);
    assert.equal(row.costUsd, 0.01);
  });

  test("landing assembly uses persisted live marketing and product results", () => {
    const { store } = tmpStore();
    seedRidgelineBeside(store);
    const created = createNewBusiness(store, {
      companyName: "Harbor Oak Music Lessons",
      ownerObjective: "Start a neighborhood after-school piano and guitar studio. Budget $1,800.",
    });
    store.putSpecialistExecution({
      id: "LSE-009",
      workspaceId: created.workspace.id,
      roleId: "marketing",
      taskType: "marketing_copy",
      ok: true,
      live: true,
      createdAt: "2026-08-22T02:20:06.000Z",
      structured: {
        audience: "Parents of children ages 7-14 in West Asheville",
        customer_problem: "Walkable after-school piano and guitar lessons are hard to find.",
        headline: "Walkable After-School Piano and Guitar Lessons",
        body_outline: ["Neighborhood studio", "Ages 7 to 14", "Parent present at first visit"],
        cta_internal_only: "In-person inquiry only.",
      },
    });
    store.putSpecialistExecution({
      id: "LSE-014",
      workspaceId: created.workspace.id,
      roleId: "product",
      taskType: "product_planning",
      ok: true,
      live: true,
      createdAt: "2026-08-22T02:20:24.000Z",
      structured: {
        slice: "Revise the landing-page outline to $40 for 30 minutes.",
        acceptance_checks: ["Landing page outline states lessons are $40 for 30 minutes."],
        not_shipped: true,
      },
    });
    const html = buildLandingHtml(store, { id: "OBJ-TEST", workspaceId: created.workspace.id, ownerText: "Start a studio." }, []);
    assert.match(html, /Walkable After-School Piano and Guitar Lessons/);
    assert.match(html, /LSE-009/);
    assert.match(html, /LSE-014/);
    assert.match(html, /\$40 for 30 minutes/);
    assert.match(html, /Draft/);
    assert.doesNotMatch(html, /\$35/);
  });

});
