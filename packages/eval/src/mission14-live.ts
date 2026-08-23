/** Mission 14 live runner. FILE_STORE. No secrets. No Offer Strategist unless Stage I passes. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import { correctProvisionalEffective } from "./contribution.ts";
import { submitObjective, runUntilBlocked, decideApproval, objectiveView, resolveServingAtlasVersion } from "./conductor.ts";
import { runScoutResearch, reviewFinding } from "./scout.ts";
import { shadowCompile } from "./shadow-compile.ts";
import { auditCompletedWork } from "./watcher.ts";
import { evaluateStageIGate, FROZEN_HASHES } from "./stage-i-gate.ts";
import { factoryAvailability } from "./employee-factory.ts";
import { looksLikeVideoPlaceholder } from "./html-extract.ts";
import { HANDOFF_FICTIONAL_PROSPECTS, handoffQualificationPolicy } from "./handoff-scenario.ts";
import { ownerSpendView } from "./spend-ledger.ts";

const STATE = process.env.MIDAS_STATE_DIR || "/workspace/midas/var/state";
const BUYING_Q = "What operational buying signals matter for estimating software candidacy?";
const OPERATIONAL_BODY = [
  "US roofing contractors produce estimates from takeoffs of roof area, pitch, and materials.",
  "Estimating software turns measurements into material lists and proposals.",
  "Contractors who still estimate by hand or with generic spreadsheets may be candidates for dedicated takeoff tools.",
  "This page does not state a conversion rate, average revenue, or win-rate statistic.",
  "Geography in this source is the United States.",
].join("\n");
const VIDEO_SNIPPET = "Please enable javascript to play this video.";

function isoEt(d = new Date()) {
  return d.toISOString() + " (UTC) / " + new Date(d.getTime() - 4 * 3600 * 1000).toISOString().replace("Z", " ET");
}

async function main() {
  const store = new FileStore(STATE);
  const workspaceId = "ws-ridgeline";
  const live: any = {
    writtenAt: isoEt(),
    persistence: "FILE_STORE",
    notIAM: true,
    notPostgres: true,
    promotion: false,
    additionalLiveApiUsd: 0,
  };

  const corrected = correctProvisionalEffective(store, ["CE-013", "CE-014", "CE-015"]);
  live.ceCorrection = corrected.map((r) => ({
    originalId: r.original.id,
    originalEffective: r.original.effective,
    originalState: r.original.state,
    correctionId: r.correction.id,
  }));

  for (const t of store.listTasks("OBJ-004") || []) {
    if (["queued", "running"].includes(t.status)) {
      store.putTask({
        ...t,
        status: "canceled",
        updatedAt: new Date().toISOString(),
        resultRefs: { ...(t.resultRefs || {}), skipped: true, reason: "mission13_rejected_cleanup" },
      });
    }
  }
  live.obj004Cleanup = (store.listTasks("OBJ-004") || []).map((t) => ({ id: t.id, type: t.type, status: t.status }));

  let blsMode = "existing_source";
  let blsErr = null;
  let blsWaited = null;
  const existingBls = (store.listObjectives(workspaceId) || []).find((o) => o.terminalStatus === "completed_no_actionable_evidence");
  if (existingBls) {
    live.blsObjectiveId = existingBls.id;
    blsMode = "reused_obj_" + existingBls.id;
    try { blsWaited = await runUntilBlocked(store, existingBls.id, { parentVersionId: "atlas-v15" }); } catch { /* finish remaining */ }
  } else try {
    const submitted = submitObjective(store, {
      workspaceId: workspaceId,
      ownerText: BUYING_Q + " Use only the permitted public occupational page.",
      seedUrls: ["https://www.bls.gov/ooh/construction-and-extraction/roofers.htm"],
      livePublic: true,
      requireLocalOwner: false,
      permittedFictionalScenario: {
        title: "RidgeLine fictional eval", fictional: true,
        prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy(),
      },
      maxSpendUsd: 1,
    });
    blsWaited = await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v15" });
    blsMode = "live_http_fetch";
    live.blsObjectiveId = submitted.objective.id;
  } catch (err) {
    blsErr = err instanceof Error ? err.message : String(err);
    const existing = (store.listSources() || []).find((s) => /roofers\.htm/.test(String(s.url || "")) && (s.substantiveText || s.excerpt));
    const submitted = submitObjective(store, {
      workspaceId: workspaceId,
      ownerText: BUYING_Q + " Use only the already-fetched permitted public occupational page.",
      existingSourceIds: existing ? [existing.id] : [],
      seedUrls: existing ? [] : undefined,
      livePublic: Boolean(existing && existing.live),
      permittedFictionalScenario: {
        title: "RidgeLine fictional eval", fictional: true,
        prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy(),
      },
      maxSpendUsd: 1,
    });
    blsWaited = await runUntilBlocked(store, submitted.objective.id, { parentVersionId: "atlas-v15" });
    blsMode = "reused_existing_live_source";
    live.blsObjectiveId = submitted.objective.id;
    live.blsFallbackReason = blsErr;
  }
  live.bls = {
    mode: blsMode,
    awaitingOwnerApproval: Boolean(blsWaited && blsWaited.awaitingOwnerApproval),
    objective: live.blsObjectiveId && store.getObjective(live.blsObjectiveId),
    view: live.blsObjectiveId ? objectiveView(store, live.blsObjectiveId) : null,
  };

  const pos = await runScoutResearch(store, {
    workspaceId: workspaceId,
    question: BUYING_Q,
    paste: OPERATIONAL_BODY,
    fixture: true,
    context: "Labeled synthetic positive control. Not a live page.",
  });
  const eligible = (pos.findings || []).filter((f) => f.approvalEligible === true);
  let approved = null;
  let shadow = null;
  if (eligible[0]) {
    approved = reviewFinding(store, eligible[0].id, { actor: "demo_operator", action: "approve", assignToAtlas: true });
    shadow = shadowCompile(store, {
      workspaceId: workspaceId,
      parentVersionId: "atlas-v15",
      servingVersionId: "atlas-v15",
      findings: [store.getScoutFinding(eligible[0].id)],
      objectiveId: pos.request && pos.request.objectiveId,
      fictionalScenario: { title: "predeclared fictional RidgeLine qualification", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS },
    });
  }
  live.positive = {
    labeledSynthetic: true,
    requestId: pos.request && pos.request.id,
    eligibleIds: eligible.map((f) => f.id),
    approvedId: approved && approved.finding && approved.finding.id,
    usefulnessId: pos.usefulness && pos.usefulness.id,
    shadowId: shadow && shadow.id,
    shadowOutcome: shadow && shadow.outcome,
    noNewVersion: !store.getVersion("atlas-v17"),
  };

  const audit = auditCompletedWork(store, { workspaceId: workspaceId, omitted: [] });
  live.watcher = { auditId: audit && audit.report && audit.report.id, status: audit && audit.report && audit.report.status };

  const gate = evaluateStageIGate(store, {
    workspaceId: workspaceId,
    proofs: {
      salaryRejected: Boolean(live.bls.view && live.bls.view.whyReachedOwnerReview && live.bls.view.whyReachedOwnerReview.reachedOwnerReview === false),
      videoRejected: looksLikeVideoPlaceholder(VIDEO_SNIPPET),
      usefulnessPersisted: Boolean(pos.usefulness && pos.usefulness.id),
      positiveControlPassed: eligible.length > 0,
      shadowWorked: Boolean(shadow && shadow.outcome),
      mandatoryPoliciesPreserved: Boolean(shadow && (shadow.mandatoryPolicyDisplaced || []).length === 0),
      watcherAudited: Boolean(audit && audit.report),
    },
  });
  live.gate = gate;
  live.factory = factoryAvailability(store, { workspaceId: workspaceId });
  live.offerStrategistExists = (store.listEmployeeRoles(workspaceId) || []).some((r) => r.roleId === "offer_strategist");

  const spend = ownerSpendView(store, workspaceId);
  live.spend = {
    dayUsd: spend && spend.today && spend.today.usd,
    note: "Mission 14 additional live model API intended $0. BLS path is HTTP page fetch or reused source. Positive is synthetic fixture.",
  };
  live.serving = resolveServingAtlasVersion(store, workspaceId);
  live.hashes = {};
  for (const [id, expected] of Object.entries(FROZEN_HASHES)) {
    const v = store.getVersion(id);
    live.hashes[id] = { expected: expected, actual: v && v.contentHash, match: v ? v.contentHash === expected : "missing" };
  }

  writeFileSync(join(STATE, "mission14-live.json"), JSON.stringify(live, null, 2) + "\n");
  writeFileSync(join(STATE, "mission14-stage-i-gate.json"), JSON.stringify(gate, null, 2) + "\n");
  console.log(JSON.stringify({
    blsObjectiveId: live.blsObjectiveId,
    blsMode: blsMode,
    awaitingOwner: live.bls.awaitingOwnerApproval,
    terminal: live.bls.objective && live.bls.objective.terminalStatus,
    positiveEligible: eligible.length,
    gatePass: gate.pass,
    failed: gate.failedIds,
    offerStrategist: live.offerStrategistExists,
    serving: live.serving,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
