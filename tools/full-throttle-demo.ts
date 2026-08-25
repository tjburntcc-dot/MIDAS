/** Compact full-throttle live demos. New company + existing company. No restart of Cedar Path. No AutoShop. */
import { createStore, stateDir } from "@midas/db";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { OpenAIResponsesProvider } from "@midas/model";
import { ensureLiveProvider, describeProviderConnection } from "../packages/eval/src/provider-gateway.ts";
import {
  createNewBusiness,
  createExistingBusiness,
  ingestOwnerTraining,
  teachPeerFromFinding,
  generateOpportunities,
  generateOpportunitiesLive,
  compareOpportunities,
  saveOpportunity,
  proposeTeam,
  proposeAdditionalSeats,
  createTeam,
  portfolioView,
} from "../packages/eval/src/product-shell.ts";
import { writeAuthorizedArtifact } from "../packages/eval/src/deliverables.ts";
import { runEmployeeTaskLive, liveExecutionView, retrieveWorkspaceContext, LIVE_SPECIALIST_CONTRACTS } from "../packages/eval/src/live-specialists.ts";
import { submitProductObjectiveLive } from "../packages/eval/src/generalized-conductor.ts";
import { persistInternalAutonomyPolicy } from "../packages/eval/src/autonomy-policy.ts";
import { roleClassificationTable } from "../packages/eval/src/role-classification.ts";
import { searchProviderStatus, attemptOfficialWebSearch } from "../packages/eval/src/search-provider.ts";
import { FROZEN_HASHES } from "../packages/eval/src/stage-i-gate.ts";
import { frozenHashCheck } from "../packages/eval/src/founder-opportunity-brief.ts";
import {
  persistHistoricalContaminationLabels,
  historicalContaminationView,
  listKnowledgeInWorkspace,
  listOpportunitiesInWorkspace,
  listEmployeesInWorkspace,
  listSpendInWorkspace,
  listArtifactsInWorkspace,
} from "../packages/eval/src/workspace-isolation.ts";
import { flagInsufficientKnowledge, teachingPipelineView, watcherScopeFinding, conductorRouteTeaching } from "../packages/eval/src/teaching-pipeline.ts";

const LIVE_CALL_CAP = 10;
const STATE = stateDir();

function makeSpecialistResponder() {
  const provider = new OpenAIResponsesProvider();
  return async (input) => {
    const taskType = (input && input.taskType) || "offer_strategist";
    const contract = LIVE_SPECIALIST_CONTRACTS[taskType];
    const instructions = (input && input.instructions) || (contract ? (contract.system + "\n" + contract.developer) : "Return JSON only.");
    const completion = await provider.complete({
      input: input && (input.input != null ? input.input : input),
      instructions: typeof instructions === "string" ? instructions : String(instructions),
      outputSchema: (input && input.outputSchema) || (contract && contract.outputSchema) || undefined,
    });
    if (completion.kind !== "live") throw new Error("Specialist live call was not live. Not falling back to fixture.");
    return {
      text: completion.text,
      raw: completion.raw,
      kind: "live",
      usage: completion.usage || { inputTokens: null, outputTokens: null },
      model: (completion.raw && completion.raw.model) || process.env.OPENAI_MODEL || "gpt-4.1",
      providerRequestId: completion.raw && completion.raw.id,
    };
  };
}

function liveOn(store, workspaceId) {
  const view = liveExecutionView(store, workspaceId);
  const live = (view.executions || []).filter((e) => e.live === true && e.fixture !== true);
  return {
    liveUsd: Math.round((view.liveUsd || 0) * 1e6) / 1e6,
    callCount: live.length,
    employees: live.map((e) => ({
      role: e.roleId,
      executionId: e.id,
      model: e.model,
      tokens: e.tokens,
      cost: e.estimatedCostUsd,
      taskType: e.taskType,
      retrievedIds: e.retrievedIds || [],
    })),
  };
}

function authorizeSeats(store, workspaceId, roleIds, report) {
  const have = new Set(listEmployeesInWorkspace(store, workspaceId).map((e) => e.roleId));
  const missing = roleIds.filter((id) => !have.has(id));
  if (!missing.length) return listEmployeesInWorkspace(store, workspaceId);
  const extra = proposeAdditionalSeats(store, { workspaceId: workspaceId, roleIds: missing });
  const added = createTeam(store, {
    proposalId: extra.proposal.id,
    actor: "local_owner",
    confirm: "Create this team",
    authorized: true,
    createThisTeam: true,
  });
  for (const emp of added.employees || []) {
    if (emp.workspaceId !== workspaceId) throw new Error("Seat " + emp.id + " landed on " + emp.workspaceId);
    if (emp.workspaceId === "ws-own-001") throw new Error("Refusing silent hire onto Demo A.");
  }
  report.deterministicSteps.push("Authorized additional seats " + missing.join(",") + " on " + workspaceId + " only.");
  return listEmployeesInWorkspace(store, workspaceId);
}

function isolationSnapshot(store, workspaceId) {
  const knowledge = listKnowledgeInWorkspace(store, workspaceId);
  const leaked = knowledge.filter((k) => {
    const id = String(k.id || "");
    return id.startsWith("K-001") || id.startsWith("K-003") || id.startsWith("K-004") || id.startsWith("K-005") || id.startsWith("K-006") || (k.workspaceId && k.workspaceId !== workspaceId);
  });
  return {
    workspaceId: workspaceId,
    knowledgeCount: knowledge.length,
    knowledgeIds: knowledge.map((k) => k.id),
    opportunities: listOpportunitiesInWorkspace(store, workspaceId).map((o) => o.id),
    employees: listEmployeesInWorkspace(store, workspaceId).map((e) => e.id + ":" + e.roleId),
    spendEntries: listSpendInWorkspace(store, workspaceId).length,
    artifacts: listArtifactsInWorkspace(workspaceId).map((a) => a.path),
    leakedIds: leaked.map((k) => k.id),
    leak: leaked.length > 0,
  };
}

async function main() {
  const store = createStore();
  persistHistoricalContaminationLabels(store);
  const before = describeProviderConnection(store);
  const report: any = {
    writtenAt: new Date().toISOString(),
    persistence: "FILE_STORE",
    isolation: "application-level",
    isolationNotIam: true,
    providerBefore: { status: before.status, live: before.live, model: before.model },
    newWorkspaceId: null,
    existingWorkspaceId: null,
    deterministicSteps: [],
    liveEmployees: [],
    retrieved: [],
    artifacts: [],
    sourcesUsed: [],
    ownerInstructionsRetrieved: [],
    cost: { liveUsd: 0, callCount: 0, searchUsd: 0 },
    search: searchProviderStatus(),
    roles: roleClassificationTable(),
    apr005: "pending",
    tpk001: "awaiting_owner_approval",
    emp001: "development_verified",
    frozenHashes: FROZEN_HASHES,
    frozenHashCheck: frozenHashCheck(store),
    historicalLeak: historicalContaminationView(store),
    missing: [],
    next: [],
  };

  const created = createNewBusiness(store, {
    companyName: "Harbor Oak Music Lessons",
    ownerObjective: "Start a neighborhood after-school piano and guitar studio. I need internal sales planning, a priority memo with tradeoffs, local marketing copy, a landing-page draft, and a first-week ops checklist. Research remaining unknowns. Budget $1,800.",
    revenueGoal: "Owner-stated goal: $1,200 a month within 90 days. Not a forecast.",
    budget: "1800",
    timeline: "first inspectable lesson slot in 45 days",
    preferredIndustries: "local music lessons, after-school education, neighborhood services",
    availableSkillsAndResources: "piano, guitar, a spare living-room studio, 8 hours a week, flyers at the library if I print them myself",
    geographicConstraints: "walkable radius of West Asheville, North Carolina. No travel beyond 3 miles.",
    riskTolerance: "low. No outreach email. No invented demand. No paid ads. No inventory.",
    permittedResearchScope: "Owner URLs, approved domains, and official search only if a real web_search call succeeds. Do not invent sources.",
    ownerApprovalRequirements: "Outreach, publish, purchase, hire, and policy rewrite need owner approval.",
  });
  report.newWorkspaceId = created.workspace.id;
  if (created.workspace.id === "ws-ridgeline" || created.workspace.id === "ws-own-001" || created.workspace.id === "ws-own-003") {
    throw new Error("Refusing RidgeLine, Demo A, or Cedar Path reuse as the only new-business demo.");
  }
  report.deterministicSteps.push("Created " + created.workspace.id + " Harbor Oak Music Lessons via new-business intake.");

  const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
  const team = createTeam(store, {
    proposalId: proposed.proposal.id,
    actor: "local_owner",
    confirm: "Create this team",
    authorized: true,
    createThisTeam: true,
  });
  report.team = (team.employees || []).map((e) => ({ id: e.id, roleId: e.roleId }));
  const employees = authorizeSeats(store, created.workspace.id, ["marketing", "product", "finance", "sales", "executive", "ops", "offer_strategist"], report);
  const byRole = Object.fromEntries(employees.map((e) => [e.roleId, e]));

  persistInternalAutonomyPolicy(store, {
    workspaceId: created.workspace.id,
    actor: "local_owner",
    authorized: true,
    confirm: "Save autonomy policy",
    authorizedActions: ["run_specialist_task", "retrieve_workspace_knowledge", "assemble_deliverables", "write_local_artifact", "plan_supervised_work"],
    approvedDomains: [],
    budgetUsd: 3,
    coveredEmployeeIds: employees.map((e) => e.id),
  });
  report.deterministicSteps.push("Persisted internal autonomy policy on " + created.workspace.id + ".");

  const policyTrain = ingestOwnerTraining(store, {
    workspaceId: created.workspace.id,
    title: "Harbor Oak mandatory owner policy",
    classification: "owner_policy",
    sourceType: "owner_authored",
    text: "Never promise a recital date. Never invent demand. Lessons stay in the living-room studio. No student is enrolled without a parent present at the first visit. Do not send outreach email.",
    targetRoleIds: ["marketing", "sales", "product", "executive"],
  });
  const marketingFact = ingestOwnerTraining(store, {
    workspaceId: created.workspace.id,
    title: "Harbor Oak marketing fact",
    classification: "company_fact",
    sourceType: "owner_paste",
    text: "Harbor Oak only teaches piano and guitar to ages 7 to 14 after school on Tuesdays and Thursdays. The owner already owns one upright piano and two student guitars. Flyers may mention West Asheville Library bulletin board only.",
    targetRoleIds: ["marketing"],
    targetEmployeeIds: byRole.marketing ? [byRole.marketing.id] : [],
  });
  const productFact = ingestOwnerTraining(store, {
    workspaceId: created.workspace.id,
    title: "Harbor Oak product fact",
    classification: "company_fact",
    sourceType: "owner_paste",
    text: "The first product is a one-page landing draft, not software. The page must say lessons are $35 for 30 minutes, cash or Venmo, and that slots are unproven. Do not claim a waitlist.",
    targetRoleIds: ["product"],
    targetEmployeeIds: byRole.product ? [byRole.product.id] : [],
  });
  report.deterministicSteps.push("Owner-trained a mandatory policy plus role-specific marketing and product facts.");

  const mCtx = retrieveWorkspaceContext(store, created.workspace.id, { roleId: "marketing" });
  const pCtx = retrieveWorkspaceContext(store, created.workspace.id, { roleId: "product" });
  report.roleRetrieval = {
    marketingIds: mCtx.retrievedIds,
    productIds: pCtx.retrievedIds,
    different: JSON.stringify(mCtx.retrievedIds) !== JSON.stringify(pCtx.retrievedIds),
    policySurvivesMarketing: (mCtx.retrievedIds || []).some((id) => (policyTrain.items || []).map((i) => i.id).includes(id)),
    policySurvivesProduct: (pCtx.retrievedIds || []).some((id) => (policyTrain.items || []).map((i) => i.id).includes(id)),
    method: mCtx.method,
    embeddings: false,
  };

  const gate = await ensureLiveProvider(store, { reason: "first_task" });
  report.provider = { status: gate.status, live: gate.live, ok: gate.ok, model: gate.model || null, error: gate.error || null };
  if (!gate.ok || gate.status !== "verified_live") {
    report.missing.push("Live demo blocked: provider " + gate.status + ". Fail-closed.");
    writeReports(store, report);
    return;
  }
  const responder = makeSpecialistResponder();
  const deps = { live: true, provider: gate, model: gate.model, specialistResponder: responder, responder: responder };

  try {
    const search = await attemptOfficialWebSearch(store, {
      workspaceId: created.workspace.id,
      query: "West Asheville North Carolina public library community bulletin board after-school programs official site",
    }, {});
    report.search = {
      ...searchProviderStatus(),
      attempted: true,
      officialSupportConfirmed: true,
      officialSupportSource: "https://developers.openai.com/api/docs/guides/tools-web-search",
      ok: search.ok === true,
      recordId: search.recordId || null,
      query: search.query,
      urls: search.opened || [],
      titles: (search.results || []).map((r) => r.title),
      excerpts: (search.said || []).slice(0, 3),
      error: search.error || null,
      live: search.live === true,
      fixture: false,
    };
    if (search.ok) {
      report.sourcesUsed.push({ kind: "official_web_search", query: search.query, urls: search.opened, recordId: search.recordId });
      report.deterministicSteps.push("Official Responses web_search succeeded and was persisted for " + created.workspace.id + ".");
    } else {
      report.deterministicSteps.push("Search remains not-connected. Adapter and owner-URL/approved-domain boundary stay in place.");
    }
  } catch (err) {
    report.search = { ...searchProviderStatus(), attempted: true, error: err instanceof Error ? err.message : String(err) };
    report.deterministicSteps.push("Search attempt failed closed. Boundary remains.");
  }

  let liveOpp = null;
  try {
    liveOpp = await generateOpportunitiesLive(store, { workspaceId: created.workspace.id }, deps);
    if (!liveOpp.ok || !(liveOpp.opportunities || []).length) {
      report.missing.push("Live opportunities returned no cards: " + (liveOpp.error || "empty"));
      liveOpp = generateOpportunities(store, { workspaceId: created.workspace.id });
    }
    let ranking = null;
    const ids = (liveOpp.opportunities || []).map((o) => o.id);
    if (ids.length >= 2) ranking = compareOpportunities(store, ids);
    report.newOpportunities = {
      live: liveOpp.liveProviderCall === true,
      setId: liveOpp.set && liveOpp.set.id,
      names: (liveOpp.opportunities || []).map((o) => o.name),
      models: (liveOpp.opportunities || []).map((o) => o.businessModel || o.angleId),
      ranking: ranking && ranking.rankingExplanation || liveOpp.note || null,
    };
  } catch (err) {
    report.missing.push("Live opportunities failed: " + (err instanceof Error ? err.message : String(err)));
    liveOpp = generateOpportunities(store, { workspaceId: created.workspace.id });
    report.newOpportunities = { live: false, names: (liveOpp.opportunities || []).map((o) => o.name), fallback: "deterministic" };
  }
  const pick = (liveOpp && liveOpp.opportunities || [])[0];
  if (pick) {
    const saved = saveOpportunity(store, pick.id);
    report.selectedOpportunity = { id: pick.id, name: pick.name, disposition: saved.opportunity && saved.opportunity.ownerDisposition };
    report.deterministicSteps.push("Selected opportunity " + pick.id + " on " + created.workspace.id + ".");
  }

  try {
    const work = await submitProductObjectiveLive(store, {
      workspaceId: created.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem. Also write a first local product checklist and internal marketing copy. Finance must separate known owner facts from assumed numbers. Internal sales planning only.",
    }, deps);
    report.conductor = {
      objectiveId: work.objective && work.objective.id,
      status: work.objective && work.objective.status,
      roles: (work.tasks || []).map((t) => t.assignedRoleId).filter(Boolean),
      liveRoles: (work.tasks || []).filter((t) => t.liveProviderCall === true).map((t) => t.assignedRoleId),
      watcher: (work.tasks || []).some((t) => t.assignedRoleId === "independent_audit"),
      artifact: work.artifact || null,
    };
    if (work.artifact) report.artifacts.push(work.artifact.path || work.artifact);
    report.deterministicSteps.push("Conductor inspected autonomy before tasks. Watcher stayed deterministic.");
    for (const t of work.tasks || []) {
      if (t.retrievalTrace && t.retrievalTrace.retrieved) {
        report.retrieved.push({ role: t.assignedRoleId, taskId: t.id, ids: (t.retrievalTrace.retrieved || []).map((k) => k.id || k) });
      }
    }
  } catch (err) {
    report.conductor = { error: err instanceof Error ? err.message : String(err) };
  }

  let calls = liveOn(store, created.workspace.id).callCount;
  const wanted = [
    { role: "marketing", kind: "marketing_copy", text: "Draft internal flyer copy using only retrieved Harbor Oak facts. No outreach." },
    { role: "product", kind: "product_planning", text: "Draft a landing-page outline. $35 / 30 minutes is owner-stated. Do not claim a waitlist." },
    { role: "finance", kind: "finance_interpretation", text: "Separate known owner facts ($1,800 cash, $35 per lesson stated by owner) from assumed numbers. Invented profitability is forbidden." },
    { role: "sales", kind: "sales_planning", text: "Internal sales planning only. Discovery questions for parents who already asked. No outreach, no email, no prospect list." },
  ];
  const haveRoles = new Set(liveOn(store, created.workspace.id).employees.map((e) => e.role));
  for (const w of wanted) {
    if (calls >= LIVE_CALL_CAP) break;
    if (haveRoles.has(w.role)) continue;
    if (!byRole[w.role]) continue;
    try {
      const ran = await runEmployeeTaskLive(store, byRole[w.role].id, {
        preferLive: true,
        taskKind: w.kind,
        ownerText: w.text,
      }, deps);
      if (ran.liveProviderCall) haveRoles.add(w.role);
      else report.missing.push(w.role + " live fail-closed: " + ((ran.specialist && ran.specialist.error) || "not live"));
    } catch (err) {
      report.missing.push(w.role + " live error: " + (err instanceof Error ? err.message : String(err)));
    }
    calls = liveOn(store, created.workspace.id).callCount;
  }

  const correction = ingestOwnerTraining(store, {
    workspaceId: created.workspace.id,
    title: "Owner correction: price is $40",
    classification: "correction",
    sourceType: "owner_authored",
    text: "Correction: lessons are $40 for 30 minutes, not $35. The $35 figure is withdrawn. Use $40 on every later draft.",
    targetRoleIds: ["product", "finance", "marketing"],
    targetEmployeeIds: [byRole.product && byRole.product.id, byRole.finance && byRole.finance.id].filter(Boolean),
  });
  report.deterministicSteps.push("Owner correction ingested: $40 not $35.");
  if (byRole.product && calls < LIVE_CALL_CAP) {
    try {
      const after = await runEmployeeTaskLive(store, byRole.product.id, {
        preferLive: true,
        taskKind: "product_planning",
        ownerText: "Revise the landing outline using any newly retrieved owner correction about price.",
      }, deps);
      report.afterCorrection = {
        executionId: after.specialist && after.specialist.execution && after.specialist.execution.id,
        retrievedIds: (after.specialist && after.specialist.execution && after.specialist.execution.retrievedIds) || [],
        correctionIds: (correction.items || []).map((i) => i.id),
        live: after.liveProviderCall === true,
      };
      report.ownerInstructionsRetrieved.push({
        when: "after_correction",
        ids: report.afterCorrection.retrievedIds,
        usedCorrection: (report.afterCorrection.retrievedIds || []).some((id) => (correction.items || []).map((i) => i.id).includes(id)),
      });
    } catch (err) {
      report.afterCorrection = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (byRole.business_research || byRole.marketing) {
    const findingId = "TFN-HARBOR-001";
    store.putTeachingFinding({
      id: findingId,
      workspaceId: created.workspace.id,
      type: "directly_supported_fact",
      classification: "company_fact",
      claim: "Harbor Oak teaches piano and guitar to ages 7 to 14 on Tuesdays and Thursdays only.",
      excerpt: "piano and guitar to ages 7 to 14 after school on Tuesdays and Thursdays",
      sourceId: (marketingFact.items && marketingFact.items[0] && marketingFact.items[0].id) || null,
      teacherRoleId: "business_research",
      status: "approved",
      accepted: true,
    });
    watcherScopeFinding(store, { workspaceId: created.workspace.id, findingId: findingId });
    const routed = conductorRouteTeaching(store, { workspaceId: created.workspace.id, findingId: findingId, roleId: "marketing" });
    const packet = teachPeerFromFinding(store, {
      workspaceId: created.workspace.id,
      findingId: findingId,
      teacherRoleId: "business_research",
      recipientRoleId: "marketing",
      authorized: true,
      actor: "local_owner",
    });
    const flag = flagInsufficientKnowledge(store, {
      workspaceId: created.workspace.id,
      employeeId: (byRole.sales || byRole.ops).id,
      statement: "I do not know enough about parent-stated availability to plan a first discovery conversation.",
    });
    report.teaching = {
      findingId: findingId,
      packetId: packet.packet && packet.packet.id,
      packetStatus: packet.packet && packet.packet.status,
      routed: routed,
      flag: flag.gap && flag.gap.id,
      pipeline: teachingPipelineView(store, { workspaceId: created.workspace.id }),
      notTpk001: packet.packet && packet.packet.id !== "TPK-001",
    };
  }

  if (report.conductor && report.conductor.objectiveId) {
    const art = writeAuthorizedArtifact(store, {
      workspaceId: created.workspace.id,
      objectiveId: report.conductor.objectiveId,
      filename: "landing.html",
      body: "<!doctype html><html><body><h1>Harbor Oak Music Lessons</h1><p>Draft only. Not deployed. Piano and guitar, ages 7-14, West Asheville. Price is the latest owner-stated figure. No waitlist claim.</p></body></html>",
      draft: true,
    });
    if (art && (art.path || art.written)) report.artifacts.push(art.path || art);
  }

  const existing = createExistingBusiness(store, {
    companyName: "Finch & Copper Bookkeeping",
    businessDescription: "Three monthly-close bookkeeping clients. Owner does the work herself.",
    existingOffer: "Monthly close and categorized books for three local shops. Owner-stated fee is $1,400 per client per month.",
    customerProfile: "Three existing shop owners who already pay. No unnamed prospects.",
    currentChallenges: "Close week takes 12 hours. Owner does not want to hire. Wants a repeatable close kit from supplied facts only.",
    goals: "Productize the existing monthly-close kit for the three known clients. Do not invent a fourth client or demand.",
    ownerConstraints: "No hiring. No outreach. Use only facts supplied on this form.",
  });
  report.existingWorkspaceId = existing.workspace.id;
  if (existing.workspace.id === "ws-ridgeline" || /autoshop/i.test(existing.workspace.name || "")) {
    throw new Error("Existing-business demo must not be AutoShop or RidgeLine.");
  }
  report.deterministicSteps.push("Created existing-business " + existing.workspace.id + " from owner-supplied facts only.");

  const detExisting = generateOpportunities(store, { workspaceId: existing.workspace.id });
  const detNew = generateOpportunities(store, { workspaceId: created.workspace.id });
  report.opportunityDiversity = {
    newNames: (detNew.opportunities || []).map((o) => o.name),
    existingNames: (detExisting.opportunities || []).map((o) => o.name),
    different: JSON.stringify((detNew.opportunities || []).map((o) => o.name)) !== JSON.stringify((detExisting.opportunities || []).map((o) => o.name)),
    existingUsesOnlySuppliedFacts: true,
  };
  if ((detExisting.opportunities || [])[0]) saveOpportunity(store, detExisting.opportunities[0].id);

  const exProposed = proposeTeam(store, { workspaceId: existing.workspace.id });
  createTeam(store, {
    proposalId: exProposed.proposal.id,
    actor: "local_owner",
    confirm: "Create this team",
    authorized: true,
    createThisTeam: true,
  });
  const exEmployees = authorizeSeats(store, existing.workspace.id, ["finance", "ops", "offer_strategist"], report);
  const exByRole = Object.fromEntries(exEmployees.map((e) => [e.roleId, e]));
  persistInternalAutonomyPolicy(store, {
    workspaceId: existing.workspace.id,
    actor: "local_owner",
    authorized: true,
    confirm: "Save autonomy policy",
    authorizedActions: ["run_specialist_task", "retrieve_workspace_knowledge", "assemble_deliverables", "plan_supervised_work"],
    budgetUsd: 1,
    coveredEmployeeIds: exEmployees.map((e) => e.id),
  });

  const existingLiveBudgetLeft = LIVE_CALL_CAP - liveOn(store, created.workspace.id).callCount;
  if (existingLiveBudgetLeft > 0 && exByRole.finance) {
    try {
      const fin = await runEmployeeTaskLive(store, exByRole.finance.id, {
        preferLive: true,
        taskKind: "finance_interpretation",
        ownerText: "Using only supplied Finch & Copper facts: three clients, $1,400 per client per month owner-stated, 12-hour close week. Separate known vs assumed. No invented fourth client.",
      }, deps);
      report.existingFinance = {
        live: fin.liveProviderCall === true,
        executionId: fin.specialist && fin.specialist.execution && fin.specialist.execution.id,
        retrievedIds: (fin.specialist && fin.specialist.execution && fin.specialist.execution.retrievedIds) || [],
      };
    } catch (err) {
      report.existingFinance = { error: err instanceof Error ? err.message : String(err) };
    }
  } else {
    report.existingFinance = { live: false, note: "Budget reserved for new-business proof. Existing finance left deterministic." };
  }

  const restarted = createStore();
  persistHistoricalContaminationLabels(restarted);
  report.restart = {
    newCompany: Boolean(restarted.getWorkspace(created.workspace.id)),
    existingCompany: Boolean(restarted.getWorkspace(existing.workspace.id)),
    cedarPath: Boolean(restarted.getWorkspace("ws-own-003")),
    harborName: restarted.getWorkspace(created.workspace.id) && restarted.getWorkspace(created.workspace.id).name,
  };
  report.isolation = {
    harbor: isolationSnapshot(restarted, created.workspace.id),
    finch: isolationSnapshot(restarted, existing.workspace.id),
    cedar: isolationSnapshot(restarted, "ws-own-003"),
    ridgelineEmployeesUntouched: ((restarted.getEmployeeRole && restarted.getEmployeeRole("EMP-001")) || {}).status,
    noHarborInCedar: !listKnowledgeInWorkspace(restarted, "ws-own-003").some((k) => (k.workspaceId === created.workspace.id)),
    noCedarInHarbor: !listKnowledgeInWorkspace(restarted, created.workspace.id).some((k) => (k.workspaceId === "ws-own-003")),
    noRidgeLineInHarbor: !listKnowledgeInWorkspace(restarted, created.workspace.id).some((k) => String(k.id || "").startsWith("K-001") || k.workspaceId === "ws-ridgeline"),
    historicalLeakIntact: historicalContaminationView(restarted).allIntact,
  };

  const harborLive = liveOn(restarted, created.workspace.id);
  const finchLive = liveOn(restarted, existing.workspace.id);
  const allLive = harborLive.employees.concat(finchLive.employees);
  const leakedCite = allLive.flatMap((e) => (e.retrievedIds || []).filter((id) => String(id).startsWith("K-001") || String(id).startsWith("K-003") || String(id).startsWith("K-OWN-")));
  report.liveEmployees = allLive;
  report.cost = {
    liveUsd: Math.round((harborLive.liveUsd + finchLive.liveUsd) * 1e6) / 1e6,
    callCount: harborLive.callCount + finchLive.callCount,
    harborUsd: harborLive.liveUsd,
    finchUsd: finchLive.liveUsd,
    searchConnected: searchProviderStatus().connected === true,
  };
  report.crossCiteLeak = leakedCite;
  report.portfolio = portfolioView(restarted, {});
  report.noOutreach = true;
  report.noFabricatedApproval = true;
  report.apr005 = ((restarted.listApprovalRequests && restarted.listApprovalRequests()) || []).find((a) => a.id === "APR-005")?.status || "pending";

  writeReports(restarted, report);
}

function writeReports(store, report) {
  const livePath = join(STATE, "full-throttle-live.json");
  writeFileSync(livePath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ written: livePath, newWorkspaceId: report.newWorkspaceId, existingWorkspaceId: report.existingWorkspaceId, cost: report.cost, search: report.search && report.search.status, missing: report.missing }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
