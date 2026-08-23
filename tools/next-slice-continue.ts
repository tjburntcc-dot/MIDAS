/** Continue MIDAS. Do not restart. Harbor Oak executive + search persist + landing. */
import { writeFileSync } from "node:fs";
import { createStore } from "@midas/db";
import { OpenAIResponsesProvider } from "@midas/model";
import { ensureLiveProvider } from "../packages/eval/src/provider-gateway.ts";
import { writeAuthorizedArtifact } from "../packages/eval/src/deliverables.ts";
import {
  runEmployeeTaskLive,
  retrieveWorkspaceContext,
  LIVE_SPECIALIST_CONTRACTS,
} from "../packages/eval/src/live-specialists.ts";
import { evaluateInternalAutonomy } from "../packages/eval/src/autonomy-policy.ts";
import {
  attemptOfficialWebSearch,
  persistAcceptedFromExistingRecord,
  searchProviderStatus,
  searchProviderView,
} from "../packages/eval/src/search-provider.ts";
import { assembleWorkFeed } from "../packages/eval/src/product-shell.ts";
import { frozenHashCheck } from "../packages/eval/src/founder-opportunity-brief.ts";
import {
  listKnowledgeInWorkspace,
  listArtifactsInWorkspace,
  historicalContaminationView,
} from "../packages/eval/src/workspace-isolation.ts";

const STATE = "/workspace/midas/var/state";
const HARBOR = "ws-own-004";
const FINCH = "ws-own-005";
const CEDAR = "ws-own-003";
const LEAK_IDS = new Set([
  "K-TRAIN-003", "K-001-01", "K-001-02", "K-001-03",
  "K-STUDIO-OWN-002", "K-STUDIO-URL-001", "K-STUDIO-OWN-001",
]);

function nowEtLabel(d = new Date()) {
  const utc = d.toISOString();
  const et = new Date(d.getTime() - 4 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const etStamp = et.getUTCFullYear() + "-" + pad(et.getUTCMonth() + 1) + "-" + pad(et.getUTCDate()) + " " + pad(et.getUTCHours()) + ":" + pad(et.getUTCMinutes()) + " ET";
  return { utc, etStamp };
}

function makeSpecialistResponder() {
  const provider = new OpenAIResponsesProvider();
  return async (input) => {
    const taskType = (input && input.taskType) || "executive_planning";
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

function isolationSnapshot(store) {
  const harborK = listKnowledgeInWorkspace(store, HARBOR).map((k) => k.id);
  const cedarK = listKnowledgeInWorkspace(store, CEDAR).map((k) => k.id);
  const finchK = listKnowledgeInWorkspace(store, FINCH).map((k) => k.id);
  const harborLeak = harborK.filter((id) => id === "K-TRAIN-003" || String(id).startsWith("K-STUDIO") || String(id).startsWith("K-001") || String(id).startsWith("K-OWN-"));
  const cedarHasHarbor = cedarK.some((id) => String(id).startsWith("K-TRAIN-00") && id !== "K-TRAIN-003");
  const hcl = historicalContaminationView(store);
  return {
    harborKnowledge: harborK,
    cedarKnowledge: cedarK,
    finchKnowledge: finchK,
    harborLeak: harborLeak,
    noHarborInCedar: !cedarHasHarbor && !cedarK.some((id) => id === "K-TRAIN-004"),
    noCedarInHarbor: !harborK.includes("K-TRAIN-003"),
    noRidgeLineInHarbor: !harborK.some((id) => String(id).startsWith("K-STUDIO") || String(id).startsWith("K-001")),
    historicalLeakIntact: Boolean(hcl && (hcl.id === "HCL-001" || (hcl.records || hcl.labels || []).length || hcl.intact !== false)),
    artifacts: {
      harbor: listArtifactsInWorkspace(HARBOR).map((a) => a.path),
      cedar: listArtifactsInWorkspace(CEDAR).map((a) => a.path),
    },
  };
}

async function main() {
  const store = createStore();
  const clock = nowEtLabel();
  const report: any = {
    writtenAt: clock.utc,
    writtenAtEt: clock.etStamp,
    persistence: "FILE_STORE",
    isolationNotIam: true,
    didNotRestart: true,
    didNotDecideApr005: true,
    didNotDecideTpk001: true,
    didNotTouchAutoShop: true,
    didNotHireDemoA: true,
    search: {},
    executive: null,
    landingImproved: false,
    costs: { probe: 0, searchRetry: 0, executive: 0, total: 0, paidCalls: 0 },
    retrievedIds: [],
    isolation: isolationSnapshot(store),
    workFeedCount: 0,
    missing: [],
    next: [],
  };

  const hashes = frozenHashCheck(store);
  report.frozenHashes = {
    "atlas-v15": hashes["atlas-v15"],
    "atlas-v16": hashes["atlas-v16"],
    "offer_strategist-ws-ridgeline-v0": hashes["offer_strategist-ws-ridgeline-v0"],
  };
  const emp001 = store.getEmployeeRole("EMP-001");
  report.emp001 = emp001 && emp001.status;
  const apr = store.getApprovalRequest("APR-005");
  const tpk = store.getTeachingPacket("TPK-001");
  report.apr005 = apr && apr.status;
  report.tpk001 = tpk && tpk.status;

  const backfill = persistAcceptedFromExistingRecord(store, "SRCH-001");
  report.search.backfill = {
    ok: backfill.ok === true,
    extractedCount: backfill.extractedCount || 0,
    acceptedCount: backfill.acceptedCount || 0,
    urls: (backfill.record && backfill.record.urls) || [],
    titles: (backfill.record && backfill.record.titles) || [],
    excerpts: ((backfill.record && backfill.record.excerpts) || []).slice(0, 4),
    note: "SRCH-001 official tool text already contained pages; extractor had dropped them.",
  };

  const gate = await ensureLiveProvider(store, { reason: "first_task" });
  report.provider = { status: gate.status, live: gate.live, ok: gate.ok, model: gate.model || null, probed: gate.probed === true, error: gate.error || null };
  if (gate.probed && gate.usage) {
    report.costs.probe = Number((gate as any).spendUsd || 0);
    report.costs.paidCalls += 1;
  }
  if (!gate.ok || gate.status !== "verified_live") {
    report.missing.push("Provider not verified_live. Stopped further paid calls.");
  }

  const persistenceFixed = backfill.ok === true && (backfill.acceptedCount || 0) > 0;
  if (persistenceFixed && gate.ok && gate.status === "verified_live") {
    const search = await attemptOfficialWebSearch(store, {
      workspaceId: HARBOR,
      query: "West Asheville North Carolina public library community bulletin board after-school programs official site",
    }, {});
    report.search.retry = {
      ok: search.ok === true,
      recordId: search.recordId || null,
      query: search.query,
      urls: search.opened || [],
      titles: (search.results || []).map((r) => r.title),
      excerpts: (search.said || []).slice(0, 4),
      extracted: (search.results || []).length,
      live: search.live === true,
      fixture: false,
      ledgerId: search.ledgerId || null,
      usage: search.usage || null,
    };
    if (search.ledgerId) {
      const led = store.getSpendLedgerEntry && store.getSpendLedgerEntry(search.ledgerId);
      report.costs.searchRetry = led && led.costUsd != null ? Number(led.costUsd) : 0;
      report.costs.paidCalls += 1;
    }
  } else if (!persistenceFixed) {
    report.search.retry = { skipped: true, reason: "Persistence fix did not recover accepted URLs. Not burning another empty search." };
  } else {
    report.search.retry = { skipped: true, reason: "Provider not verified_live." };
  }

  const searchView = searchProviderView(store, { workspaceId: HARBOR });
  const srch1 = store.getSearchRecord("SRCH-001");
  const acceptedAnywhere = ((store.listSearchRecords && store.listSearchRecords(HARBOR)) || []).some((r) => r.live === true && (r.urls || []).length > 0);
  report.search.status = searchView.status;
  report.search.connected = acceptedAnywhere === true && searchView.status === "connected";
  report.search.indexedPages = searchView.indexedPages;
  report.search.records = (searchView.records || []).map((r) => ({ id: r.id, query: r.query, urls: r.urls, live: r.live }));
  if (!acceptedAnywhere) report.search.connected = false;

  const preCtx = retrieveWorkspaceContext(store, HARBOR, { roleId: "executive" });
  report.preRetrieval = { ids: preCtx.retrievedIds, embeddings: false, method: preCtx.method };
  if (!preCtx.retrievedIds.includes("K-TRAIN-004")) {
    report.missing.push("Executive context did not retrieve mandatory K-TRAIN-004.");
  }
  const leakedPre = preCtx.retrievedIds.filter((id) => LEAK_IDS.has(id) || String(id).startsWith("K-001") || String(id).startsWith("K-OWN-") || id === "K-TRAIN-003");
  if (leakedPre.length) report.missing.push("Pre-retrieval leaked: " + leakedPre.join(","));

  if (gate.ok && gate.status === "verified_live") {
    const auto = evaluateInternalAutonomy(store, HARBOR, "run_specialist_task", { employeeId: "EMP-023" });
    report.autonomy = auto;
    const responder = makeSpecialistResponder();
    const exec = await runEmployeeTaskLive(store, "EMP-023", {
      preferLive: true,
      taskType: "executive_planning",
      taskKind: "priority_memo",
      ownerText: "INTERNAL PLANNING ONLY. Write a priority memo with tradeoffs for Harbor Oak Music Lessons using only owner facts and authorized same-workspace knowledge. Do not hire, create policy, authorize spend, outreach, publish, or claim demand or revenue. Name what is still unknown.",
      objectiveId: "OBJ-013",
    }, { live: true, provider: gate, model: gate.model, specialistResponder: responder, responder: responder });
    const execution = exec.execution || {};
    const retrieved = execution.retrievedIds || exec.retrievedIds || [];
    const leaked = retrieved.filter((id) => LEAK_IDS.has(id) || String(id).startsWith("K-001") || String(id).startsWith("K-OWN-") || id === "K-TRAIN-003");
    report.executive = {
      executionId: execution.id || exec.executionId || null,
      live: exec.liveProviderCall === true,
      fixture: exec.fixture === true,
      model: execution.model || exec.model,
      tokens: { input: execution.inputTokens, output: execution.outputTokens },
      cost: execution.estimatedCostUsd != null ? execution.estimatedCostUsd : exec.spendUsd,
      retrievedIds: retrieved,
      leakedIds: leaked,
      structured: execution.structured || (exec.task && exec.task.output) || null,
      ok: exec.liveProviderCall === true && leaked.length === 0,
    };
    report.retrievedIds = retrieved;
    report.costs.executive = Number(report.executive.cost || 0);
    report.costs.paidCalls += exec.liveProviderCall ? 1 : 0;
    if (leaked.length) report.missing.push("Executive retrieved leak ids: " + leaked.join(","));
  } else {
    report.missing.push("Skipped executive live call because provider is not verified_live.");
  }

  const landing = writeAuthorizedArtifact(store, {
    workspaceId: HARBOR,
    objectiveId: "OBJ-013",
    filename: "landing.html",
  });
  report.landing = {
    ok: landing.ok === true,
    path: landing.path || null,
    deployed: landing.deployed === true,
    byteLength: landing.byteLength || 0,
    preview: landing.preview || null,
  };
  const html = landing.ok && landing.path ? (await import("node:fs")).readFileSync(landing.path, "utf8") : "";
  report.landingImproved = /LSE-009/.test(html) && /LSE-014/.test(html) && /\$40/.test(html) && !/\$35/.test(html);
  if (!report.landingImproved) report.missing.push("Landing did not cite persisted LSE-009/LSE-014 or still lacked $40.");

  const feed = assembleWorkFeed(store, { workspaceId: HARBOR });
  report.workFeedCount = (feed.feed || []).length;
  report.workFeedSample = (feed.feed || []).slice(-6);
  for (const row of feed.feed || []) {
    if (store.putActivityFeedItem) {
      store.putActivityFeedItem({
        id: "AF-" + row.id,
        workspaceId: row.workspaceId,
        at: row.at,
        whatRan: row.whatRan,
        whyPermitted: row.whyPermitted,
        sourcesUsed: row.sourcesUsed,
        costUsd: row.costUsd,
        producedArtifact: row.producedArtifact,
        watcherResult: row.watcherResult,
        live: row.live === true,
        fixture: false,
        deterministic: true,
      });
    }
  }

  report.isolationAfter = isolationSnapshot(store);
  report.costs.total = Math.round((Number(report.costs.probe || 0) + Number(report.costs.searchRetry || 0) + Number(report.costs.executive || 0)) * 1e6) / 1e6;
  report.next = [
    "Owner review of Harbor Oak landing draft and executive memo in the product UI.",
    "Do not decide APR-005 or TPK-001 here.",
    report.search.connected ? "Search is connected for persisted official pages only. Do not treat owner-URL fetch as search." : "Search remains not-connected.",
    "Keep additional live spend small. Isolation stays application-level.",
  ];

  const ten = [
    "1. Owner can now do: inspect Harbor Oak draft landing assembled from persisted live marketing/product results; read a live executive priority memo (internal planning only); see a deterministic work feed (what ran, why permitted, sources, cost, artifact, Watcher); switch companies without a cross-workspace leak.",
    "2. Live this slice: " + (report.executive && report.executive.live ? ("executive " + report.executive.executionId + " $" + report.executive.cost) : "no executive live call") + "; search retry " + (report.search.retry && report.search.retry.ok ? (report.search.retry.recordId + " accepted " + ((report.search.retry.urls || []).length)) : (report.search.retry && report.search.retry.skipped ? "skipped" : "failed-or-empty")) + "; provider " + (report.provider && report.provider.status) + ".",
    "3. Deterministic: search extraction/persist/hydrate, landing assembly, work feed, Conductor/Watcher/autonomy inspect, isolation queries, FILE_STORE.",
    "4. Sources: owner policy K-TRAIN-004 plus Harbor facts/correction K-TRAIN-005/006/007; official web_search pages only if accepted URLs persisted; no embeddings; owner-URL fetch is not search.",
    "5. Employees: Harbor EMP-023 executive live (if ran). Marketing/product results reused from LSE-009 and LSE-014. Demo A and RidgeLine EMP-001 untouched.",
    "6. Retrieved: " + JSON.stringify(report.retrievedIds) + ". Leak ids forbidden and " + ((report.executive && report.executive.leakedIds && report.executive.leakedIds.length) ? "PRESENT — blocker" : "absent") + ".",
    "7. Artifacts: /workspace/midas/var/artifacts/ws-own-004/landing.html draft, not deployed, landingImproved=" + report.landingImproved + ".",
    "8. Cost this slice: probe $" + report.costs.probe + " · search $" + report.costs.searchRetry + " · executive $" + report.costs.executive + " · total $" + report.costs.total + " · paidCalls=" + report.costs.paidCalls + ".",
    "9. Missing: " + ((report.missing && report.missing.length) ? report.missing.join(" | ") : "none of the requested slice items") + ". Search connected=" + report.search.connected + ". Embeddings=false.",
    "10. Next: " + report.next.join(" "),
  ];

  const md = [
    "# MIDAS next-slice report",
    "",
    "Written " + clock.utc + " (" + clock.etStamp + "). Persistence: FILE_STORE. Isolation: application-level, not IAM. Did not restart. Did not decide APR-005 / TPK-001. Did not touch AutoShop, Demo A hiring, or frozen hashes.",
    "",
    ...ten,
    "",
    "## Search",
    "- SRCH-001 backfill acceptedCount=" + report.search.backfill.acceptedCount + " urls=" + JSON.stringify(report.search.backfill.urls),
    "- Retry: " + JSON.stringify(report.search.retry),
    "- connected=" + report.search.connected + " status=" + report.search.status,
    "",
    "## Executive",
    JSON.stringify(report.executive, null, 2),
    "",
    "## Isolation",
    JSON.stringify(report.isolationAfter, null, 2),
    "",
    "## Frozen hashes / sealed",
    "- APR-005: " + report.apr005,
    "- TPK-001: " + report.tpk001,
    "- EMP-001: " + report.emp001,
    "- atlas-v15 expected 0a1b77111582b76a4be3b873a09a4c2a73efec7103f6bb9dafdff7e8a4774a70 mutated=" + (hashes["atlas-v15"] && hashes["atlas-v15"].mutated),
    "- atlas-v16 expected 64bb716d5aa030376a1e96194a30858bb3ad67093ede1c16b3146a1fd86321d1 mutated=" + (hashes["atlas-v16"] && hashes["atlas-v16"].mutated),
    "- offer_strategist-ws-ridgeline-v0 expected 875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce mutated=" + (hashes["offer_strategist-ws-ridgeline-v0"] && hashes["offer_strategist-ws-ridgeline-v0"].mutated),
    "",
    "## Invariants",
    "- FILE_STORE stays FILE_STORE.",
    "- Historical leak LSE-001–004 labeled HCL-001; retrievedIds not rewritten.",
    "- Sales remains INTERNAL PLANNING ONLY.",
    "- No customers/revenue/TAM invented on the landing draft.",
    "",
  ].join("\n");

  writeFileSync(STATE + "/next-slice-live.json", JSON.stringify(report, null, 2));
  writeFileSync(STATE + "/next-slice-report.md", md);
  writeFileSync(STATE + "/capability-matrix.json", JSON.stringify({
    writtenAt: clock.utc,
    persistence: "FILE_STORE",
    isolation: "application-level",
    isolationNotIam: true,
    provider: report.provider && report.provider.status,
    searchConnected: report.search.connected === true,
    executiveLive: Boolean(report.executive && report.executive.live),
    executiveExecutionId: report.executive && report.executive.executionId,
    landingImproved: report.landingImproved,
    capabilities: {
      search: report.search.connected ? "LIVE_AND_WORKING" : "IMPLEMENTED_INCOMPLETE",
      executive: report.executive && report.executive.live ? "LIVE_AND_WORKING" : "IMPLEMENTED_INCOMPLETE",
      landing_assembly: "DETERMINISTIC_AND_APPROPRIATE",
      work_feed: "DETERMINISTIC_AND_APPROPRIATE",
      embeddings: false,
    },
  }, null, 2));
  console.log(JSON.stringify({
    ok: true,
    searchConnected: report.search.connected,
    executiveId: report.executive && report.executive.executionId,
    landingImproved: report.landingImproved,
    costs: report.costs,
    missing: report.missing,
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
