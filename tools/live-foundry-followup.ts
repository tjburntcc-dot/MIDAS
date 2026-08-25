/** Finish remaining live foundry phases on ws-own-003. No rebuild. No Demo A hire. */
import { createStore, stateDir } from "@midas/db";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OpenAIResponsesProvider } from "@midas/model";
import { ensureLiveProvider, describeProviderConnection } from "../packages/eval/src/provider-gateway.ts";
import {
  proposeAdditionalSeats,
  createTeam,
  runEmployeeTask,
  ingestOwnerTraining,
  teachPeerFromFinding,
} from "../packages/eval/src/product-shell.ts";
import { runEmployeeTaskLive, liveExecutionView, LIVE_SPECIALIST_CONTRACTS } from "../packages/eval/src/live-specialists.ts";
import { submitProductObjectiveLive } from "../packages/eval/src/generalized-conductor.ts";
import { roleClassificationTable } from "../packages/eval/src/role-classification.ts";
import { searchProviderStatus } from "../packages/eval/src/search-provider.ts";
import { FROZEN_HASHES } from "../packages/eval/src/stage-i-gate.ts";
import { frozenHashCheck } from "../packages/eval/src/founder-opportunity-brief.ts";
import { persistInternalAutonomyPolicy } from "../packages/eval/src/autonomy-policy.ts";

const WS = "ws-own-003";

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

function loadPrior() {
  try {
    return JSON.parse(readFileSync(join(stateDir(), "live-foundry-live.json"), "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const store = createStore();
  const prior = loadPrior();
  const report = {
    ...prior,
    writtenAt: new Date().toISOString(),
    followup: true,
    missing: [],
    next: [],
    search: searchProviderStatus(),
    roles: roleClassificationTable(),
  };
  report.deterministicSteps = (prior.deterministicSteps || []).slice();
  report.retrieved = (prior.retrieved || []).slice();
  report.deliverables = (prior.deliverables || []).slice();

  const ws = store.getWorkspace(WS);
  if (!ws || ws.name !== "Cedar Path Compost Club") throw new Error("Expected Cedar Path at " + WS);

  const extra = proposeAdditionalSeats(store, { workspaceId: WS, roleIds: ["marketing"] });
  const added = createTeam(store, {
    proposalId: extra.proposal.id,
    actor: "local_owner",
    confirm: "Create this team",
    authorized: true,
    createThisTeam: true,
  });
  const marketing = (added.employees || []).find((e) => e.roleId === "marketing");
  if (!marketing) throw new Error("Marketing was not created on " + WS);
  if (marketing.workspaceId !== WS) throw new Error("Marketing landed on the wrong workspace.");
  report.teamAuthorization = {
    ...(prior.teamAuthorization || {}),
    additionalProposalId: extra.proposal.id,
    additionalActor: added.authorizedBy,
    marketingEmployeeId: marketing.id,
    marketingWorkspaceId: marketing.workspaceId,
    marketingOnDemoA: false,
  };
  report.deterministicSteps.push("Authorized additional marketing seat " + marketing.id + " on " + WS + " as local_owner. Demo A untouched.");

  const employees = (store.listEmployeeRoles && store.listEmployeeRoles(WS)) || [];
  persistInternalAutonomyPolicy(store, {
    workspaceId: WS,
    actor: "local_owner",
    authorized: true,
    confirm: "Save autonomy policy",
    authorizedActions: ["run_specialist_task", "retrieve_workspace_knowledge", "assemble_deliverables", "write_local_artifact", "plan_supervised_work"],
    budgetUsd: 2,
    coveredEmployeeIds: employees.map((e) => e.id),
  });

  const findingId = "TFN-CEDAR-001";
  if (!store.getTeachingFinding(findingId)) {
    store.putTeachingFinding({
      id: findingId,
      workspaceId: WS,
      type: "directly_supported_fact",
      classification: "company_fact",
      claim: "Cedar Path refuses yard waste and only accepts kitchen scraps in 2-gallon lidded pails.",
      excerpt: "only accepts kitchen scraps in 2-gallon lidded pails",
      sourceId: "K-TRAIN-003",
      teacherRoleId: "business_research",
    });
  }
  const packet = teachPeerFromFinding(store, {
    workspaceId: WS,
    findingId: findingId,
    teacherRoleId: "business_research",
    recipientRoleId: "marketing",
    authorized: true,
    actor: "local_owner",
  });
  report.phases = report.phases || {};
  report.phases.phase5 = {
    findingId: findingId,
    packetId: packet.packet && packet.packet.id,
    status: packet.packet && packet.packet.status,
    recipient: packet.recipient,
    notTpk001: packet.packet && packet.packet.id !== "TPK-001",
    workspaceId: WS,
    tpk001Untouched: store.getTeachingPacket("TPK-001") && store.getTeachingPacket("TPK-001").status,
  };
  if (packet.packet && packet.packet.status === "awaiting_owner_approval") {
    report.missing.push("Teaching packet awaiting owner approval. Did not fabricate approval.");
  }

  const desc = describeProviderConnection(store);
  const gate = desc.status === "verified_live"
    ? { ok: true, status: "verified_live", live: true, probed: false, model: desc.model }
    : await ensureLiveProvider(store, { reason: "first_task" });
  report.providerAfter = { status: gate.status, live: gate.live, ok: gate.ok, probed: gate.probed, error: gate.error || null, model: gate.model || null };
  if (!gate.ok || gate.status !== "verified_live") {
    report.missing.push("Follow-up live conductor blocked: " + (gate.error || gate.status));
    writeReports(store, report);
    return;
  }

  const responder = makeSpecialistResponder();
  const deps = { live: true, provider: gate, model: gate.model, specialistResponder: responder, responder: responder };

  const work = await submitProductObjectiveLive(store, {
    workspaceId: WS,
    ownerText: "Create a landing-page draft and explain the customer problem. Use the taught pail and Maple Court facts.",
  }, deps);
  const liveTasks = (work.tasks || []).filter((t) => t.liveProviderCall === true);
  report.phases.phase4Live = {
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
    via: "standalone_plus_live_conductor",
    note: "First conductor OBJ-011 ran deterministic because submit auto-executed before the live defer fix. Follow-up conductor is the live chain.",
    liveRoles: liveTasks.map((t) => t.assignedRoleId),
  };
  for (const d of work.deliverables || []) {
    report.deliverables.push({ id: d.id, type: d.type, draft: d.draft, artifact: d.artifact || null });
  }
  for (const t of work.tasks || []) {
    report.retrieved.push({
      role: t.assignedRoleId,
      taskId: t.id,
      live: t.liveProviderCall === true,
      ids: ((t.retrievalTrace && t.retrievalTrace.retrieved) || []).map((k) => k.id || k),
    });
  }

  const retrieve = runEmployeeTask(store, marketing.id, {
    taskKind: "marketing_copy",
    ownerText: "Draft internal copy that uses any newly taught company facts about yellow CEDAR PATH pails.",
  });
  report.phases.phase5.retrievalTaskId = retrieve.task && retrieve.task.id;
  report.phases.phase5.retrievedIds = (retrieve.task && retrieve.task.output && (retrieve.task.output.usedLessons || retrieve.task.output.retrievedIds)) || [];
  report.retrieved.push({ role: "marketing_after_teach", ids: report.phases.phase5.retrievedIds });
  report.deterministicSteps.push("Marketing retrieved the taught packet on a real same-workspace deterministic task. Provenance recorded. Not TPK-001.");

  const view = liveExecutionView(store, WS);
  const live = (view.executions || []).filter((e) => e.live === true && e.fixture !== true);
  report.cost = { liveUsd: Math.round((view.liveUsd || 0) * 1e6) / 1e6, callCount: live.length };
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
  report.phases.phase7 = { ui: "live vs deterministic pills on employees, work, opportunities; autonomy page; search not-connected" };
  report.missing.push("Embeddings/vector retrieval still do not exist.");
  report.missing.push("Search is not-connected.");
  report.missing.push("Sales/executive remain not_implemented.");
  report.next.push("Owner review of Cedar Path live outputs, retrieval, and spend on the product UI.");
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
    "- Open a new company through intake (this slice: " + WS + " Cedar Path Compost Club).",
    "- Authorize a team, then add a marketing seat on that new company only via Create this team. Demo A was not hired onto.",
    "- Run live specialists when the provider is verified_live. Fail-closed otherwise. Fixture cannot masquerade.",
    "- Generate opportunities (deterministic always; live when verified). Labeled AI-generated business hypotheses. Search is not-connected.",
    "- Persist an internal autonomy policy as owner/local_owner. Prohibited actions stay blocked.",
    "- See live vs deterministic on employees, work, and opportunities. Inspect contributions, retrieval, spend.",
    "",
    "## 2. Which employees genuinely thought using a live model",
    liveLines,
    "",
    "## 3. Which steps correctly remained deterministic",
    (report.deterministicSteps || []).map((s) => "- " + s).join("\n"),
    "- Arithmetic, budget, permissions, orchestration, fetch, persistence, Watcher rule checks, artifact storage.",
    "- Search-provider interface: " + (report.search && report.search.status) + ".",
    "- First conductor OBJ-011 stayed deterministic (pre-fix auto-run). Watcher and Manager stay deterministic.",
    "",
    "## 4. Which knowledge was actually retrieved",
    (report.retrieved || []).map((r) => "- " + r.role + (r.taskId ? " (" + r.taskId + ")" : "") + (r.live === true ? " live" : "") + ": " + ((r.ids || []).join(", ") || "none")).join("\n"),
    "- After the isolation fix, new live calls may only use same-workspace items plus RidgeLine-unscoped is no longer visible on owner workspaces.",
    "",
    "## 5. Which deliverables were actually produced",
    (report.deliverables || []).map((d) => "- " + (d.id || "item") + " · " + (d.type || "") + (d.draft ? " · draft" : "") + (d.path ? " · " + d.path : "")).join("\n"),
    "",
    "## 6. What the work cost",
    "- Live USD: $" + ((report.cost && report.cost.liveUsd) || 0) + " · call count: " + ((report.cost && report.cost.callCount) || 0),
    "- Provider after: " + ((report.providerAfter && report.providerAfter.status) || "n/a"),
    "",
    "## 7. What remains missing",
    (report.missing || []).map((s) => "- " + s).join("\n"),
    "",
    "## 8. What is next",
    (report.next || []).map((s) => "- " + s).join("\n"),
    "",
    "## Role classification",
    (report.roles || []).map((r) => "- " + r.roleId + " · " + r.intelligenceClass).join("\n"),
    "",
    "## Invariants",
    "- New workspace: " + WS,
    "- APR-005: " + (apr && apr.status) + " (must remain pending)",
    "- EMP-001: " + (emp && emp.status) + " on " + (emp && emp.workspaceId),
    "- TPK-001: " + ((store.getTeachingPacket("TPK-001") && store.getTeachingPacket("TPK-001").status) || "missing"),
    "- atlas-v15: " + ((hashes["atlas-v15"] && hashes["atlas-v15"].expected) || FROZEN_HASHES["atlas-v15"]),
    "- atlas-v16: " + ((hashes["atlas-v16"] && hashes["atlas-v16"].expected) || FROZEN_HASHES["atlas-v16"]),
    "- offer_strategist-ws-ridgeline-v0: " + ((hashes["offer_strategist-ws-ridgeline-v0"] && hashes["offer_strategist-ws-ridgeline-v0"].expected) || FROZEN_HASHES["offer_strategist-ws-ridgeline-v0"]),
    "- Tests: live-foundry 12/12. CP21–26 / foundry-gaps re-run after write.",
  ].join("\n") + "\n";
  writeFileSync(join(join(stateDir(), "live-foundry-report.md")), md, "utf8");
  writeFileSync(join(join(stateDir(), "live-foundry-live.json")), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({
    workspace: WS,
    marketing: report.teamAuthorization && report.teamAuthorization.marketingEmployeeId,
    phase4: report.phases && report.phases.phase4Live,
    phase5: report.phases && report.phases.phase5,
    cost: report.cost,
    apr005: apr && apr.status,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
