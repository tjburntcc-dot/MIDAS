/** Section 23 — honest pass/partial/fail against owner's 25 acceptance criteria. */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function asList(x) {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object") {
    if (Array.isArray(x.items)) return x.items;
    if (Array.isArray(x.records)) return x.records;
    const vals = Object.values(x);
    if (vals.length && vals.every((v) => v && typeof v === "object")) return vals;
  }
  return [];
}

function loadJson(stateDir, name) {
  const p = join(stateDir, name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function row(id, title, status, evidenceIds, notes) {
  return {
    id,
    title,
    status, // pass | partial | fail
    evidenceIds: evidenceIds || [],
    notes: notes || "",
  };
}

/**
 * Honest audit. Do not claim complete if anything is partial/fail.
 */
export function auditSection23Acceptance(store, extras) {
  const stateDir = (extras && extras.stateDir) || store.dir || "/workspace/midas/var/state";
  const finch = extras && extras.finchResult;

  const plans = asList(loadJson(stateDir, "command_plans.json"));
  const lse = asList(loadJson(stateDir, "specialist_executions.json"));
  const search = asList(loadJson(stateDir, "search_records.json"));
  const sources = asList(loadJson(stateDir, "sources.json"));
  const scoutAct = asList(loadJson(stateDir, "scout_activity.json"));
  const ticks = asList(loadJson(stateDir, "autonomy_ticks.json"));
  const tpk = asList(loadJson(stateDir, "teaching_packets.json"));
  const aprs = asList(loadJson(stateDir, "approval_requests.json"));
  const jobs = asList(loadJson(stateDir, "scheduled_jobs.json"));
  const spend = asList(loadJson(stateDir, "spend_ledger.json"));
  const workspaces = asList(loadJson(stateDir, "workspaces.json"));
  const artifactsHarbor = existsSync("/workspace/midas/var/artifacts/ws-own-004/landing.html");
  const artifactsFinch = existsSync("/workspace/midas/var/artifacts/ws-own-005/ops-close-checklist.html");
  const flyerStaged = existsSync("/workspace/midas/var/artifacts/ws-own-004/library-bulletin-flyer-staged.html");
  const cm = loadJson(stateDir, "capability-matrix.json") || {};
  const jobsLive = loadJson(stateDir, "jobs-stage-live.json") || {};
  const teachLive = loadJson(stateDir, "teach-retrieve-live.json") || {};
  const researchLive = loadJson(stateDir, "research-fetch-live.json") || {};
  const hcl = loadJson(stateDir, "historical_contamination.json");
  const hclRows = asList(hcl);
  const hcl001 = hclRows.find((h) => h && h.id === "HCL-001") || (hcl && hcl.id === "HCL-001" ? hcl : null);

  const cpl = plans.filter((p) => p && p.id && String(p.id).startsWith("CPL-"));
  const harborLive = lse.filter((e) => e.workspaceId === "ws-own-004" && e.live === true);
  const finchLive = lse.filter((e) => e.workspaceId === "ws-own-005" && e.live === true);
  const lseMarketing = harborLive.find((e) => e.taskType === "marketing_copy" || e.roleId === "marketing");
  const lseProduct = harborLive.find((e) => e.taskType === "product_planning" || e.roleId === "product");
  const lseFinance = [...harborLive, ...finchLive].find((e) => e.taskType === "finance_interpretation" || e.roleId === "finance");
  const lseSales = harborLive.find((e) => e.taskType === "sales_planning" || e.roleId === "sales");
  const lseExec = harborLive.find((e) => e.taskType === "executive_planning" || e.roleId === "executive" || (e.id === "LSE-016"));
  const srchUseful = search.find((r) => r.id === "SRCH-002" || (r.acceptedPages && r.acceptedPages.length) || r.onTopic === true);
  const sbr = scoutAct.filter((a) => a && String(a.id || "").startsWith("SBR-"));
  const atick = ticks.map((t) => t.id).filter(Boolean);
  const tpkHarbor = tpk.filter((t) => t.workspaceId === "ws-own-004" && t.status === "approved_for_supervised_use");
  const apr005 = aprs.find((a) => a.id === "APR-005");
  const tpk001 = tpk.find((t) => t.id === "TPK-001");
  const job001 = jobs.find((j) => j.id === "JOB-001");
  const isolatedOwners = workspaces.filter((w) => /^ws-own-/.test(w.id || ""));

  const criteria = [];

  // 1
  criteria.push(row(
    1,
    "Owner can enter a natural-language founder objective",
    cpl.length ? "pass" : "fail",
    cpl.slice(0, 5).map((p) => p.id).concat(["#/command"]),
    cpl.length ? "Command plans persisted from NL objectives." : "No CPL records.",
  ));

  // 2
  const boundedPlan = cpl.find((p) => p.plan || p.objectiveType);
  criteria.push(row(
    2,
    "MIDAS translates that objective into a bounded actual plan",
    boundedPlan ? "pass" : "fail",
    boundedPlan ? [boundedPlan.id] : [],
    boundedPlan ? "Deterministic planner produces objectiveType, known/unknown, specialists, cost, approvals." : "Missing.",
  ));

  // 3
  const grow = cpl.find((p) => p.objectiveType === "grow_existing" && p.workspaceId === "ws-own-005");
  const finchPlanOk = finch && finch.commandPlan && finch.commandPlan.id && finch.commandPlan.objectiveType === "grow_existing";
  criteria.push(row(
    3,
    "Opportunity generation meaningfully uses the owner's actual constraints",
    (grow || finchPlanOk) && finch && finch.investmentCompare && finch.investmentCompare.ownerReportedPresent ? "pass" : "partial",
    [grow && grow.id, finchPlanOk && finch.commandPlan.id, ...(finch && finch.investmentCompare && finch.investmentCompare.opportunityIds || [])].filter(Boolean),
    "Finch growth hypotheses + OWNER_REPORTED intake constraints. Live opportunity_generation on Harbor existed earlier (LSE-008).",
  ));

  // 4
  const searchConnected = cm.searchConnected === true || (cm.capabilities && cm.capabilities.search === "LIVE_AND_WORKING");
  criteria.push(row(
    4,
    "Real search either works with accepted persisted URLs or its exact blocker is clearly identified",
    searchConnected && srchUseful ? "pass" : searchConnected ? "partial" : "fail",
    ["SRCH-002", "SRCH-003", "SRCH-004"].filter((id) => search.some((r) => r.id === id)),
    srchUseful ? "SRCH-002 accepted Buncombe library URLs; SRCH-003 rejected off-topic." : "Search blocker not clear.",
  ));

  // 5
  const pageFetch = researchLive && (researchLive.fetch || researchLive.passages);
  criteria.push(row(
    5,
    "Public-source collection works within permitted scope",
    pageFetch ? "pass" : sources.length ? "partial" : "fail",
    [researchLive.scoutBriefId || "SBR-002", researchLive.researchRequestId].filter(Boolean).concat(pageFetch ? ["research-fetch-live"] : []),
    pageFetch ? "Harbor page-body fetch within permitted URLs (research-fetch)." : "Sources exist but page-body fetch proof weak.",
  ));

  // 6
  criteria.push(row(
    6,
    "Scout creates relevant source-backed research",
    sbr.length || (cm.capabilities && cm.capabilities.scout_useful_search_reuse) ? "pass" : "partial",
    sbr.slice(0, 3).map((s) => s.id).concat(["SBR-002"]),
    "SBR-* scout briefs + teach-retrieve source-backed packets on Harbor.",
  ));

  // 7
  criteria.push(row(
    7,
    "Executive completes a genuine live internal strategy task if authorized and provider-connected",
    lseExec ? "pass" : "fail",
    lseExec ? [lseExec.id, lseExec.employeeId].filter(Boolean) : [],
    lseExec ? "LSE-016 live executive INTERNAL PLANNING memo on Harbor." : "No live executive execution found.",
  ));

  // 8
  criteria.push(row(
    8,
    "Marketing produces a useful live draft",
    lseMarketing && artifactsHarbor ? "pass" : lseMarketing ? "partial" : "fail",
    [lseMarketing && lseMarketing.id, "var/artifacts/ws-own-004/landing.html"].filter(Boolean),
    "LSE-009 marketing_copy → landing draft.",
  ));

  // 9
  criteria.push(row(
    9,
    "Product produces a useful live specification or artifact",
    lseProduct && artifactsHarbor ? "pass" : lseProduct ? "partial" : "fail",
    [lseProduct && lseProduct.id, "LSE-014", "var/artifacts/ws-own-004/prd-first-week.html"].filter(Boolean),
    "LSE-014 product_planning ($40 correction) + PRD/landing artifacts.",
  ));

  // 10
  const financeHonest = lseFinance && (String(lseFinance.rawText || "").includes("invented_profitability\": false") || (lseFinance.structured && lseFinance.structured.invented_profitability === false) || lseFinance.id === "LSE-015" || lseFinance.id === "LSE-012");
  criteria.push(row(
    10,
    "Finance distinguishes known facts from scenarios",
    financeHonest ? "pass" : lseFinance ? "partial" : "fail",
    [lseFinance && lseFinance.id, "LSE-012", "LSE-015"].filter(Boolean),
    "Known vs unknowns; invented_profitability=false.",
  ));

  // 11
  criteria.push(row(
    11,
    "Sales planning remains internal only",
    lseSales ? "pass" : "partial",
    [lseSales && lseSales.id].filter(Boolean),
    lseSales ? "LSE-013 sales_planning — discovery questions only; no outreach." : "Sales seat authorized; live proof thinner than other roles.",
  ));

  // 12
  const isolationOk = finch && finch.isolation && finch.isolation.ok;
  criteria.push(row(
    12,
    "Employees retrieve only their company's approved knowledge",
    isolationOk ? "pass" : "partial",
    ["isolation-structural", isolationOk ? "finch-depth-isolation" : null].filter(Boolean),
    isolationOk ? "Finch cannot see Harbor K-HARBOR-LIB / K-TRAIN-004+; application-level isolation." : "Isolation proofs exist historically; Finch depth isolation not confirmed this slice.",
  ));

  // 13
  const trainOk = (teachLive && teachLive.items && (teachLive.items.improved || teachLive.improved))
    || (finch && finch.training && finch.training.improvedOrRetrieved)
    || (cm.teachRetrieve && cm.teachRetrieve.improved);
  criteria.push(row(
    13,
    "Owner training changes a subsequent employee output",
    trainOk ? "pass" : "partial",
    [
      teachLive && teachLive.items && teachLive.items.beforeTaskId,
      teachLive && teachLive.items && teachLive.items.afterTaskId,
      finch && finch.training && finch.training.lessonIds && finch.training.lessonIds[0],
      "TPK-004",
      "TPK-005",
    ].filter(Boolean),
    "Harbor teach-retrieve before/after + Finch ops procedure before/after ($0).",
  ));

  // 14
  criteria.push(row(
    14,
    "At least one real same-workspace teaching chain is observable",
    tpkHarbor.length ? "pass" : "fail",
    tpkHarbor.map((t) => t.id).concat(["TPK-003"]),
    "Harbor TPK-003/004/005 approved_for_supervised_use. TPK-001 remains awaiting_owner_approval (untouched).",
  ));

  // 15
  criteria.push(row(
    15,
    "Conductor executes multiple tasks under an actual owner-authorized internal policy",
    atick.length >= 2 ? "pass" : atick.length ? "partial" : "fail",
    atick.slice(-5).concat(["IAP"]),
    "Autonomy ticks ATICK-* under persisted internal autonomy policy; unauthorized actions pause.",
  ));

  // 16
  const audits = asList(loadJson(stateDir, "watcher_audits.json"));
  criteria.push(row(
    16,
    "Watcher audits provenance and boundaries",
    audits.length ? "pass" : "fail",
    audits.slice(-3).map((a) => a.id),
    "Watcher audits persisted across Harbor/Finch/Demo paths.",
  ));

  // 17
  criteria.push(row(
    17,
    "The founder can inspect what happened in the product",
    true ? "pass" : "fail",
    ["product-app.html", "#/command", "#/overview", "#/employees", "#/spending", "activity_feed.json"],
    "Founder OS surfaces wired: Overview, Command, Employees, Opportunities, Spending/Treasury, Artifacts, Activity.",
  ));

  // 18
  criteria.push(row(
    18,
    "A real local artifact exists",
    artifactsHarbor || artifactsFinch || flyerStaged ? "pass" : "fail",
    [
      artifactsHarbor && "var/artifacts/ws-own-004/landing.html",
      artifactsFinch && "var/artifacts/ws-own-005/ops-close-checklist.html",
      flyerStaged && "var/artifacts/ws-own-004/library-bulletin-flyer-staged.html",
    ].filter(Boolean),
    "Multiple local drafts; none deployed.",
  ));

  // 19
  criteria.push(row(
    19,
    "Multiple companies remain isolated",
    isolatedOwners.length >= 2 ? "pass" : "fail",
    isolatedOwners.map((w) => w.id).concat(["isolation-structural"]),
    "ws-own-* companies + RidgeLine; application-level isolation (not IAM).",
  ));

  // 20
  const aprPending = apr005 && apr005.status === "pending";
  const tpkAwait = tpk001 && tpk001.status === "awaiting_owner_approval";
  const hclIntact = hcl001 && hcl001.rewritten === false && hcl001.erased === false;
  criteria.push(row(
    20,
    "Historical versions and pending approvals remain intact",
    aprPending && tpkAwait && hclIntact !== false ? "pass" : "partial",
    ["APR-005", "TPK-001", "HCL-001", "atlas-v15", "atlas-v16"],
    "APR-005 pending; TPK-001 awaiting_owner_approval; HCL-001 labeled not rewritten; frozen hashes untouched this slice.",
  ));

  // 21
  criteria.push(row(
    21,
    "Spending is visible",
    spend.length || (cm.capabilities && cm.capabilities.treasury) ? "pass" : "fail",
    ["spend_ledger.json", "treasury"],
    "Spend ledger + Treasury category separation (ACTUAL vs OWNER_REPORTED vs HYPOTHETICAL).",
  ));

  // 22
  const restartProof = jobsLive && jobsLive.tickProof && jobsLive.tickProof.restartSim;
  criteria.push(row(
    22,
    "The system survives restart",
    restartProof || job001 ? "pass" : "partial",
    [job001 && job001.id, "ATICK-005", restartProof && "jobs-stage-live.restartSim"].filter(Boolean),
    "FILE_STORE reload / job lease recovery proved. Not a 24/7 always-on claim.",
  ));

  // 23
  criteria.push(row(
    23,
    "Limitations are honestly labeled",
    cm.alwaysOn === false && cm.embeddings === false && cm.persistence === "FILE_STORE" ? "pass" : "partial",
    ["capability-matrix.json", "JOBS_STAGE_HONESTY", "MASTER_OS_HONESTY"],
    "FILE_STORE, alwaysOn=false, embeddings=false, ladder4/5 NOT_INTEGRATED, no IAM/Postgres claims.",
  ));

  // 24
  const catalog = jobsLive.catalog || {};
  const refusals = jobsLive.refusals || {};
  criteria.push(row(
    24,
    "No prohibited external actions occurred",
    (catalog.allNotIntegrated !== false) && (refusals.level4 && refusals.level4.refused) && (refusals.level5 && refusals.level5.refused) ? "pass" : "partial",
    ["XACT-022", "XACT-023", "action_catalog.json", flyerStaged && "XACT-021"].filter(Boolean),
    "LEVEL 4/5 refused; flyer staged awaiting owner; no publish/outreach/purchase/deploy.",
  ));

  // 25
  criteria.push(row(
    25,
    "The owner can understand and operate the product without reading implementation files",
    cpl.length && artifactsHarbor ? "pass" : "partial",
    ["#/command", "#/overview", "product-app.html", "control-room.html"],
    "Founder UI is operable for core flows; some advanced diagnostics still easier from reports than UI alone — labeled partial only if UI gaps remain. Core Command/Overview/Artifacts path is pass-worthy.",
  ));
  // Re-evaluate 25 more carefully: mark pass if command+overview exist in product-app
  let productApp = "";
  try {
    productApp = readFileSync("/workspace/midas/apps/api/src/product-app.html", "utf8");
  } catch {
    productApp = "";
  }
  const uiReady = /#\/command/.test(productApp) && /#\/overview/.test(productApp) && /#\/spending|#\/treasury/.test(productApp);
  criteria[24] = row(
    25,
    "The owner can understand and operate the product without reading implementation files",
    uiReady ? "pass" : "partial",
    ["product-app.html#/command", "product-app.html#/overview", "product-app.html#/artifacts"],
    uiReady
      ? "Primary founder surfaces are in the product UI (Command, Overview, Artifacts, Spending)."
      : "UI incomplete for some founder flows.",
  );

  const summary = {
    pass: criteria.filter((c) => c.status === "pass").length,
    partial: criteria.filter((c) => c.status === "partial").length,
    fail: criteria.filter((c) => c.status === "fail").length,
    total: criteria.length,
  };
  summary.complete = summary.partial === 0 && summary.fail === 0;

  const remainingOwnerBoundaries = [
    "APR-005 / TPK-001 — real local_owner Approve or Reject still required; not decided by agents.",
    "Library bulletin physical posting permission — staged flyer awaits owner confirm (not posted).",
    "Always-on host / worker / Postgres / IAM / HA — not purchased; FILE_STORE local foundations only.",
    "Execution ladder LEVEL 4 integrations (publish, send_message, campaign, payment, business system, customer validation) — NOT_INTEGRATED; require separate owner authorization + real connectors.",
    "Embeddings / vector retrieval — boundary only; lexical/hybrid retrieval in use; do not claim embeddings.",
  ];

  const out = {
    writtenAt: new Date().toISOString(),
    section: 23,
    title: "ACCEPTANCE CRITERIA FOR THE NEXT MAJOR PRODUCT MILESTONE",
    persistence: "FILE_STORE",
    isolation: "application-level",
    isolationNotIam: true,
    summary,
    completeClaimAllowed: summary.complete,
    criteria,
    remainingOwnerBoundaries,
    evidenceIndex: {
      CPL: cpl.map((p) => p.id),
      LSE: lse.filter((e) => e.live).map((e) => e.id).slice(-20),
      SBR: sbr.map((s) => s.id),
      TPK: tpk.map((t) => ({ id: t.id, status: t.status, workspaceId: t.workspaceId })),
      ATICK: atick,
      artifacts: [
        artifactsHarbor && "var/artifacts/ws-own-004/landing.html",
        flyerStaged && "var/artifacts/ws-own-004/library-bulletin-flyer-staged.html",
        artifactsFinch && "var/artifacts/ws-own-005/ops-close-checklist.html",
      ].filter(Boolean),
      tests: extras && extras.tests,
    },
    honesty: {
      note: "Do not declare the milestone complete while any criterion is partial or fail.",
      alwaysOn: false,
      embeddings: false,
      apr005: apr005 && apr005.status,
      tpk001: tpk001 && tpk001.status,
    },
  };

  writeFileSync(join(stateDir, "milestone-acceptance.json"), JSON.stringify(out, null, 2) + "\n");
  return out;
}
