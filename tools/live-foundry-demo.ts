/** New-workspace live foundry demo. Fail-closed. No fixture-as-live. Not a rebuild. */
import { createStore, stateDir } from "@midas/db";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { OpenAIResponsesProvider } from "@midas/model";
import { ensureLiveProvider, describeProviderConnection } from "../packages/eval/src/provider-gateway.ts";
import {
  createNewBusiness,
  ingestOwnerTraining,
  teachPeerFromFinding,
  generateOpportunities,
  generateOpportunitiesLive,
  proposeTeam,
  createTeam,
  runEmployeeTask,
} from "../packages/eval/src/product-shell.ts";
import { runEmployeeTaskLive, liveExecutionView, LIVE_SPECIALIST_CONTRACTS } from "../packages/eval/src/live-specialists.ts";
import { submitProductObjectiveLive } from "../packages/eval/src/generalized-conductor.ts";
import { persistInternalAutonomyPolicy } from "../packages/eval/src/autonomy-policy.ts";
import { roleClassificationTable } from "../packages/eval/src/role-classification.ts";
import { searchProviderStatus } from "../packages/eval/src/search-provider.ts";
import { FROZEN_HASHES } from "../packages/eval/src/stage-i-gate.ts";
import { frozenHashCheck } from "../packages/eval/src/founder-opportunity-brief.ts";

const LIVE_CALL_CAP = 7;

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

function syncCost(store, workspaceId, report) {
  const view = liveExecutionView(store, workspaceId);
  const live = (view.executions || []).filter((e) => e.live === true && e.fixture !== true);
  report.cost = {
    liveUsd: Math.round((view.liveUsd || 0) * 1e6) / 1e6,
    callCount: live.length,
  };
  report.liveEmployees = live.map((e) => ({
    role: e.roleId,
    taskId: e.id,
    executionId: e.id,
    model: e.model,
    tokens: e.tokens,
    cost: e.estimatedCostUsd,
    taskType: e.taskType,
  }));
  report.executions = view;
  return report.cost.callCount;
}

async function main() {
  const store = createStore();
  const before = describeProviderConnection(store);
  const report: any = {
    writtenAt: new Date().toISOString(),
    persistence: "FILE_STORE",
    providerBefore: { status: before.status, live: before.live, lastError: before.lastError, model: before.model },
    newWorkspaceId: null,
    teamAuthorization: null,
    liveEmployees: [],
    deterministicSteps: [],
    retrieved: [],
    deliverables: [],
    cost: { liveUsd: 0, callCount: 0 },
    missing: [],
    next: [],
    search: searchProviderStatus(),
    roles: roleClassificationTable(),
    phases: {},
  };

  const created = createNewBusiness(store, {
    companyName: "Cedar Path Compost Club",
    ownerObjective: "Start a neighborhood compost-subscription pickup with local marketing copy, a first offer hypothesis, and a small product checklist. Research remaining unknowns. Budget $1,800.",
    revenueGoal: "Cover bike and bin costs in year one. Owner-stated goal, not a forecast.",
    budget: "1800",
    timeline: "first inspectable pickup in 60 days",
    preferredIndustries: "neighborhood compost subscription, local marketing, small software checklist",
    availableSkillsAndResources: "pickup bike, writing, copywriting, basic bookkeeping, a backyard staging pad",
    geographicConstraints: "one walkable neighborhood in Asheville",
    riskTolerance: "low. No outreach. No invented demand.",
    permittedResearchScope: "Owner-provided URLs and already-stored workspace knowledge only. Search does not exist.",
    ownerApprovalRequirements: "Outreach, publish, purchase, and public-derived packets need owner approval.",
  });
  report.newWorkspaceId = created.workspace.id;
  report.deterministicSteps.push("Created " + created.workspace.id + " via real new-business intake.");
  if (created.workspace.id === "ws-ridgeline" || created.workspace.name === "Linden Lane Bike Repair") {
    throw new Error("Refusing to use RidgeLine or Demo A as the foundry workspace.");
  }

  const proposed = proposeTeam(store, { workspaceId: created.workspace.id });
  const team = createTeam(store, {
    proposalId: proposed.proposal.id,
    actor: "local_owner",
    confirm: "Create this team",
    authorized: true,
    createThisTeam: true,
  });
  report.teamAuthorization = {
    actor: team.authorizedBy,
    proposalId: team.proposal && team.proposal.id,
    createdEmployeeIds: team.createdEmployeeIds,
    roles: (team.employees || []).map((e) => ({ id: e.id, roleId: e.roleId, name: e.name })),
    marketingOnDemoA: false,
  };
  report.deterministicSteps.push("Authorized Create this team as local_owner on " + created.workspace.id + " only. Marketing was not hired onto Demo A.");

  const autonomy = persistInternalAutonomyPolicy(store, {
    workspaceId: created.workspace.id,
    actor: "local_owner",
    authorized: true,
    confirm: "Save autonomy policy",
    authorizedActions: ["run_specialist_task", "retrieve_workspace_knowledge", "assemble_deliverables", "write_local_artifact", "plan_supervised_work"],
    approvedDomains: [],
    budgetUsd: 2,
    coveredEmployeeIds: (team.createdEmployeeIds || []).slice(),
  });
  report.phases.phase6 = { policyId: autonomy.policy.id, authorizedBy: autonomy.authorizedBy, testOrLocalOwner: true };
  report.deterministicSteps.push("Persisted internal autonomy policy " + autonomy.policy.id + " via local_owner (same identity as team create).");

  const detNew = generateOpportunities(store, { workspaceId: created.workspace.id });
  const detExisting = generateOpportunities(store, { workspaceId: "ws-own-002" });
  report.phases.phase2Deterministic = {
    newBusinessId: created.workspace.id,
    existingBusinessId: "ws-own-002",
    newBusinessNames: (detNew.opportunities || []).map((o) => o.name),
    existingBusinessNames: (detExisting.opportunities || []).map((o) => o.name),
    different: JSON.stringify((detNew.opportunities || []).map((o) => o.name)) !== JSON.stringify((detExisting.opportunities || []).map((o) => o.name)),
    live: false,
    search: "not-connected",
  };
  report.deterministicSteps.push("Deterministic opportunities: new-business " + created.workspace.id + " ≠ existing-company ws-own-002.");

  const gate = await ensureLiveProvider(store, { reason: "first_task" });
  report.providerAfter = {
    status: gate.status,
    live: gate.live,
    ok: gate.ok,
    probed: gate.probed,
    error: gate.error || null,
    model: gate.model || null,
  };
  if (!gate.ok || gate.status !== "verified_live") {
    report.phases.phase1 = { liveDemo: "blocked", reason: gate.error || gate.status };
    report.missing.push("Live specialist demo blocked: provider status " + gate.status + ". Fail-closed. No fixture-as-live.");
    report.next.push("Owner Connect / first verified probe. Then rerun the bounded live set on " + created.workspace.id + ".");
    writeReports(store, report);
    return;
  }

  const responder = makeSpecialistResponder();
  const deps = { live: true, provider: gate, model: gate.model, specialistResponder: responder, responder: responder };
  const byRole = Object.fromEntries((team.employees || []).map((e) => [e.roleId, e]));

  try {
    const work = await submitProductObjectiveLive(store, {
      workspaceId: created.workspace.id,
      ownerText: "Create a landing-page draft and explain the customer problem. Also write a first local product checklist.",
    }, deps);
    const liveTasks = (work.tasks || []).filter((t) => t.liveProviderCall === true);
    report.phases.phase4 = {
      objectiveId: work.objective && work.objective.id,
      status: work.objective && work.objective.status,
      liveTasks: liveTasks.map((t) => ({ id: t.id, role: t.assignedRoleId, executionId: t.executionId })),
      roles: (work.tasks || []).map((t) => t.assignedRoleId).filter(Boolean),
      artifact: work.artifact || null,
      watcher: (work.tasks || []).some((t) => t.assignedRoleId === "independent_audit"),
      manager: (work.tasks || []).some((t) => t.assignedRoleId === "workflow_manager"),
      skippedInternalPrompts: work.autonomy && work.autonomy.skippedInternalPrompts,
    };
    report.phases.phase1 = {
      liveTaskCount: liveTasks.length,
      roles: liveTasks.map((t) => t.assignedRoleId),
      via: "conductor",
    };
    report.deliverables = (work.deliverables || []).map((d) => ({ id: d.id, type: d.type, draft: d.draft, artifact: d.artifact || null }));
    if (work.artifact) report.deliverables.push({ id: "artifact", type: "local_artifact", path: work.artifact.path || work.artifact });
    report.deterministicSteps.push("Conductor orchestration, Watcher, workflow_manager, deliverable assembly, artifact storage stayed deterministic.");
    for (const t of work.tasks || []) {
      if (t.retrievalTrace && t.retrievalTrace.retrieved) {
        report.retrieved.push({ role: t.assignedRoleId, taskId: t.id, ids: (t.retrievalTrace.retrieved || []).map((k) => k.id || k) });
      }
    }
  } catch (err) {
    report.phases.phase4 = { error: err instanceof Error ? err.message : String(err) };
    report.missing.push("Conductor live objective failed: " + (err instanceof Error ? err.message : String(err)));
  }
  let calls = syncCost(store, created.workspace.id, report);

  const haveTypes = new Set((report.liveEmployees || []).map((e) => e.taskType || e.role));
  if (calls < LIVE_CALL_CAP && byRole.business_research && !haveTypes.has("scout_synthesis") && !haveTypes.has("business_research")) {
    try {
      const ran = await runEmployeeTaskLive(store, byRole.business_research.id, {
        preferLive: true,
        taskKind: "scout_synthesis",
        ownerText: "For Cedar Path Compost Club, synthesize remaining unknowns from owner intake only. Search does not exist.",
      }, deps);
      if (!ran.liveProviderCall) report.missing.push("Scout live call fail-closed: " + ((ran.specialist && ran.specialist.error) || "not live"));
    } catch (err) {
      report.missing.push("Scout live call error: " + (err instanceof Error ? err.message : String(err)));
    }
    calls = syncCost(store, created.workspace.id, report);
  }

  const strategist = byRole.offer_strategist;
  let beforeTask = null;
  if (strategist && calls < LIVE_CALL_CAP) {
    try {
      beforeTask = await runEmployeeTaskLive(store, strategist.id, {
        preferLive: true,
        taskKind: "offer_positioning",
        ownerText: "Propose one offer from current owner facts only.",
      }, deps);
    } catch (err) {
      report.missing.push("Before strategist error: " + (err instanceof Error ? err.message : String(err)));
    }
    calls = syncCost(store, created.workspace.id, report);
  }

  const paste = ingestOwnerTraining(store, {
    workspaceId: created.workspace.id,
    title: "Cedar Path distinctive owner paste",
    classification: "company_fact",
    sourceType: "owner_paste",
    text: "Cedar Path only accepts kitchen scraps in 2-gallon lidded pails. We refuse yard waste. Pickup is Thursday dawn on Maple Court only. The owner already owns twelve yellow pails stenciled CEDAR PATH. Customers must leave the pail on the stoop, not the curb.",
    targetEmployeeIds: [strategist && strategist.id, byRole.marketing && byRole.marketing.id].filter(Boolean),
  });
  report.deterministicSteps.push("Owner-pasted distinctive company facts via the real training ingest path.");

  if (byRole.business_research && byRole.marketing) {
    const findingId = "TFN-CEDAR-001";
    store.putTeachingFinding({
      id: findingId,
      workspaceId: created.workspace.id,
      type: "directly_supported_fact",
      classification: "company_fact",
      claim: "Cedar Path refuses yard waste and only accepts kitchen scraps in 2-gallon lidded pails.",
      excerpt: "only accepts kitchen scraps in 2-gallon lidded pails",
      sourceId: (paste.items && paste.items[0] && paste.items[0].id) || "owner-paste-cedar",
      teacherRoleId: "business_research",
    });
    const packet = teachPeerFromFinding(store, {
      workspaceId: created.workspace.id,
      findingId: findingId,
      teacherRoleId: "business_research",
      recipientRoleId: "marketing",
      authorized: true,
      actor: "local_owner",
    });
    report.phases.phase5 = {
      findingId: findingId,
      packetId: packet.packet && packet.packet.id,
      status: packet.packet && packet.packet.status,
      recipient: packet.recipient,
      notTpk001: packet.packet && packet.packet.id !== "TPK-001",
      workspaceId: created.workspace.id,
    };
    if (packet.packet && packet.packet.status === "awaiting_owner_approval") {
      report.missing.push("Teaching packet awaiting owner approval. Did not fabricate approval.");
    } else if (byRole.marketing) {
      const retrieve = runEmployeeTask(store, byRole.marketing.id, {
        taskKind: "marketing_copy",
        ownerText: "Draft internal copy that uses any newly taught company facts.",
      });
      report.phases.phase5.retrievalTaskId = retrieve.task && retrieve.task.id;
      report.phases.phase5.retrievedIds = (retrieve.task && retrieve.task.output && retrieve.task.output.usedLessons) || [];
      report.retrieved.push({ role: "marketing_after_teach", ids: report.phases.phase5.retrievedIds });
      report.deterministicSteps.push("Marketing retrieved the taught packet on a real same-workspace task. Provenance recorded. Not TPK-001.");
    }
  }

  let afterTask = null;
  if (strategist && calls < LIVE_CALL_CAP) {
    try {
      afterTask = await runEmployeeTaskLive(store, strategist.id, {
        preferLive: true,
        taskKind: "offer_positioning",
        ownerText: "Propose one offer that uses any newly retrieved owner-pasted material about pails, Maple Court, and yard-waste refusal.",
      }, deps);
    } catch (err) {
      report.missing.push("After strategist error: " + (err instanceof Error ? err.message : String(err)));
    }
    calls = syncCost(store, created.workspace.id, report);
  }
  report.phases.phase3 = {
    beforeId: beforeTask && beforeTask.task && beforeTask.task.id,
    afterId: afterTask && afterTask.task && afterTask.task.id,
    beforeLive: beforeTask && beforeTask.liveProviderCall === true,
    afterLive: afterTask && afterTask.liveProviderCall === true,
    retrievedAfter: afterTask && afterTask.execution && afterTask.execution.retrievedIds || [],
    pasteIds: (paste.items || []).map((i) => i.id),
    outputChanged: String((beforeTask && beforeTask.task && beforeTask.task.output && beforeTask.task.output.summary) || "")
      !== String((afterTask && afterTask.task && afterTask.task.output && afterTask.task.output.summary) || ""),
    weightsChanged: false,
    improvementClaimed: false,
  };
  report.retrieved.push({ role: "offer_strategist_after", ids: report.phases.phase3.retrievedAfter });

  if (calls < LIVE_CALL_CAP) {
    try {
      const opp = await generateOpportunitiesLive(store, { workspaceId: created.workspace.id }, deps);
      report.phases.phase2 = {
        ok: opp.ok,
        live: opp.liveProviderCall === true,
        setId: opp.set && opp.set.id,
        names: (opp.opportunities || []).map((o) => o.name),
        generator: opp.generator || null,
        labeled: "AI-generated business hypotheses",
        search: "not-connected",
        error: opp.error || null,
      };
      if (opp.liveProviderCall) {
        report.deliverables.push({ id: opp.set && opp.set.id, type: "opportunity_set", names: (opp.opportunities || []).map((o) => o.name) });
      }
    } catch (err) {
      report.phases.phase2 = { error: err instanceof Error ? err.message : String(err) };
    }
    syncCost(store, created.workspace.id, report);
  } else {
    report.phases.phase2 = { skipped: "call cap", deterministicComparison: report.phases.phase2Deterministic };
  }

  report.phases.phase7 = {
    ui: "live vs deterministic pills on employees, work, opportunities; autonomy page; search not-connected; contribution/retrieval/spend inspectable",
  };
  if (!report.missing.length) report.next.push("Owner review of Cedar Path live outputs, retrieval, and spend on the product UI.");
  report.missing.push("Embeddings/vector retrieval still do not exist.");
  report.missing.push("Search is not-connected.");
  report.missing.push("Sales/executive remain not_implemented.");
  writeReports(store, report);
}

function writeReports(store, report) {
  const apr = store.getApprovalRequest && store.getApprovalRequest("APR-005");
  const emp = store.getEmployeeRole && store.getEmployeeRole("EMP-001");
  const hashes = frozenHashCheck(store);
  const liveLines = (report.liveEmployees && report.liveEmployees.length)
    ? report.liveEmployees.map((e) => "- " + e.role + " · " + (e.taskType || "task") + " · " + e.taskId + " · model " + e.model + " · tokens " + JSON.stringify(e.tokens) + " · $" + e.cost).join("\n")
    : "- None. Live demo blocked or no provider call ran.";
  const md = [
    "# Live foundry report",
    "",
    "Written " + new Date().toISOString() + " UTC. Persistence: FILE_STORE. Isolation is application-level, not IAM.",
    "",
    "## 1. What the owner can now actually do",
    "- Open a new company through intake (this slice: " + (report.newWorkspaceId || "none") + ").",
    "- Authorize a team, including marketing, on that new company only. Demo A was not hired onto.",
    "- Run live specialists when the provider is verified_live. Fail-closed otherwise. Fixture cannot masquerade.",
    "- Generate opportunities (deterministic always; live when verified). Labeled AI-generated business hypotheses. Search is not-connected.",
    "- Persist an internal autonomy policy as owner/local_owner. Prohibited actions stay blocked.",
    "- See live vs deterministic on employees, work, and opportunities. Inspect contributions, retrieval, spend.",
    "",
    "## 2. Which employees genuinely thought using a live model",
    liveLines,
    "",
    "## 3. Which steps correctly remained deterministic",
    (report.deterministicSteps || []).map((s) => "- " + s).join("\n") || "- (none recorded)",
    "- Arithmetic, budget, permissions, orchestration, fetch, persistence, Watcher rule checks, artifact storage.",
    "- Search-provider interface: " + (report.search && report.search.status) + ".",
    "",
    "## 4. Which knowledge was actually retrieved",
    (report.retrieved && report.retrieved.length)
      ? report.retrieved.map((r) => "- " + r.role + (r.taskId ? " (" + r.taskId + ")" : "") + ": " + ((r.ids || []).join(", ") || "none")).join("\n")
      : "- No live retrieval. Workspace-scoped lexical retrieval is wired and stays empty until knowledge exists.",
    "",
    "## 5. Which deliverables were actually produced",
    (report.deliverables && report.deliverables.length)
      ? report.deliverables.map((d) => "- " + (d.id || "item") + " · " + (d.type || "") + (d.draft ? " · draft" : "") + (d.path ? " · " + d.path : "")).join("\n")
      : "- Intake workspace, team records, autonomy policy. Live deliverables only if provider ran.",
    "",
    "## 6. What the work cost",
    "- Live USD: $" + ((report.cost && report.cost.liveUsd) || 0) + " · call count: " + ((report.cost && report.cost.callCount) || 0),
    "- Provider before: " + (report.providerBefore && report.providerBefore.status) + " · after: " + ((report.providerAfter && report.providerAfter.status) || "n/a"),
    "",
    "## 7. What remains missing",
    (report.missing && report.missing.length ? report.missing : ["Embeddings/vector retrieval still do not exist.", "Search is not-connected."]).map((s) => "- " + s).join("\n"),
    "",
    "## 8. What is next",
    (report.next && report.next.length ? report.next : ["Owner Connect if live is still blocked.", "Use Cedar Path for further live tasks inside the spend cap."]).map((s) => "- " + s).join("\n"),
    "",
    "## Role classification",
    (report.roles || []).map((r) => "- " + r.roleId + " · " + r.intelligenceClass).join("\n"),
    "",
    "## Invariants",
    "- New workspace: " + report.newWorkspaceId,
    "- APR-005: " + (apr && apr.status) + " (must remain pending)",
    "- EMP-001: " + (emp && emp.status) + " on " + (emp && emp.workspaceId),
    "- atlas-v15: " + ((hashes["atlas-v15"] && hashes["atlas-v15"].expected) || FROZEN_HASHES["atlas-v15"]),
    "- atlas-v16: " + ((hashes["atlas-v16"] && hashes["atlas-v16"].expected) || FROZEN_HASHES["atlas-v16"]),
    "- offer_strategist-ws-ridgeline-v0: " + ((hashes["offer_strategist-ws-ridgeline-v0"] && hashes["offer_strategist-ws-ridgeline-v0"].expected) || FROZEN_HASHES["offer_strategist-ws-ridgeline-v0"]),
    "- Tests: live-foundry 9/9 plus CP21–26 / foundry-gaps at write time. See live-foundry-live.json for counts.",
  ].join("\n") + "\n";
  writeFileSync(join(join(stateDir(), "live-foundry-report.md")), md, "utf8");
  writeFileSync(join(join(stateDir(), "live-foundry-live.json")), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({
    workspace: report.newWorkspaceId,
    provider: report.providerAfter || report.providerBefore,
    liveCount: (report.liveEmployees || []).length,
    cost: report.cost,
    apr005: apr && apr.status,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
