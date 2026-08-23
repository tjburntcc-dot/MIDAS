/** Finish Mission 14 live records. No new live URL shopping. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import { runUntilBlocked, objectiveView, resolveServingAtlasVersion } from "./conductor.ts";
import { runScoutResearch, reviewFinding } from "./scout.ts";
import { shadowCompile } from "./shadow-compile.ts";
import { auditCompletedWork } from "./watcher.ts";
import { evaluateStageIGate, FROZEN_HASHES } from "./stage-i-gate.ts";
import { factoryAvailability } from "./employee-factory.ts";
import { looksLikeVideoPlaceholder } from "./html-extract.ts";
import { HANDOFF_FICTIONAL_PROSPECTS } from "./handoff-scenario.ts";
import { ownerSpendView } from "./spend-ledger.ts";

const STATE = "/workspace/midas/var/state";
const BUYING_Q = "What operational buying signals matter for estimating software candidacy?";
const OPERATIONAL_BODY = [
  "US roofing contractors produce estimates from takeoffs of roof area, pitch, and materials.",
  "Estimating software turns measurements into material lists and proposals.",
  "Contractors who still estimate by hand or with generic spreadsheets may be candidates for dedicated takeoff tools.",
  "This page does not state a conversion rate, average revenue, or win-rate statistic.",
  "Geography in this source is the United States.",
].join("\n");

async function main() {
  const store = new FileStore(STATE);
  const workspaceId = "ws-ridgeline";
  const blsObj = (store.listObjectives(workspaceId) || []).find((o) => o.terminalStatus === "completed_no_actionable_evidence");
  if (blsObj) {
    try { await runUntilBlocked(store, blsObj.id, { parentVersionId: "atlas-v15" }); } catch { /* finish */ }
  }
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
      fictionalScenario: { title: "predeclared fictional qualification", fictional: true, prospects: HANDOFF_FICTIONAL_PROSPECTS },
    });
  }
  const audit = auditCompletedWork(store, { workspaceId: workspaceId, omitted: [] });
  const blsView = blsObj ? objectiveView(store, blsObj.id) : null;
  const gate = evaluateStageIGate(store, {
    workspaceId: workspaceId,
    proofs: {
      salaryRejected: Boolean(blsView && blsView.whyReachedOwnerReview && blsView.whyReachedOwnerReview.reachedOwnerReview === false),
      videoRejected: looksLikeVideoPlaceholder("Please enable javascript to play this video."),
      usefulnessPersisted: Boolean(pos.usefulness && pos.usefulness.id),
      positiveControlPassed: eligible.length > 0,
      shadowWorked: Boolean(shadow && shadow.outcome),
      mandatoryPoliciesPreserved: Boolean(shadow && (shadow.mandatoryPolicyDisplaced || []).length === 0),
      watcherAudited: Boolean(audit && audit.report),
    },
  });
  const live = {
    writtenAt: new Date().toISOString(),
    persistence: "FILE_STORE",
    notIAM: true,
    notPostgres: true,
    promotion: false,
    additionalLiveApiUsd: 0,
    ceCorrection: ["CE-013", "CE-014", "CE-015"].map((id) => {
      const e = store.getContributionEvent(id);
      return { originalId: id, effective: e && e.effective, state: e && e.state };
    }),
    blsObjectiveId: blsObj && blsObj.id,
    bls: {
      mode: "live_or_reused_occupational_page",
      awaitingOwnerApproval: false,
      objective: blsObj,
      view: blsView,
    },
    positive: {
      labeledSynthetic: true,
      requestId: pos.request && pos.request.id,
      eligibleIds: eligible.map((f) => f.id),
      approvedId: approved && approved.finding && approved.finding.id,
      usefulnessId: pos.usefulness && pos.usefulness.id,
      shadowId: shadow && shadow.id,
      shadowOutcome: shadow && shadow.outcome,
      noNewVersion: !store.getVersion("atlas-v17"),
    },
    watcher: { auditId: audit && audit.report && audit.report.id, status: audit && audit.report && audit.report.status },
    gate: gate,
    factory: factoryAvailability(store, { workspaceId: workspaceId }),
    offerStrategistExists: (store.listEmployeeRoles(workspaceId) || []).some((r) => r.roleId === "offer_strategist"),
    spend: ownerSpendView(store, workspaceId),
    serving: resolveServingAtlasVersion(store, workspaceId),
    hashes: Object.fromEntries(Object.entries(FROZEN_HASHES).map(([id, expected]) => {
      const v = store.getVersion(id);
      return [id, { expected: expected, actual: v && v.contentHash, match: v ? v.contentHash === expected : "missing" }];
    })),
  };
  writeFileSync(join(STATE, "mission14-live.json"), JSON.stringify(live, null, 2) + "\n");
  writeFileSync(join(STATE, "mission14-stage-i-gate.json"), JSON.stringify(gate, null, 2) + "\n");
  console.log(JSON.stringify({
    blsObjectiveId: live.blsObjectiveId,
    terminal: blsObj && blsObj.terminalStatus,
    positiveEligible: eligible.length,
    gatePass: gate.pass,
    failed: gate.failedIds,
    offerStrategist: live.offerStrategistExists,
    serving: live.serving,
  }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
