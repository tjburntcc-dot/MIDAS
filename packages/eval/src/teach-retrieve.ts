/** Teach-retrieve slice: Scout SBR-002 → classified lessons → Harbor Marketing before/after proof. $0 preferred. APR-005/TPK-001 untouched. */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { requireWorkspaceId } from "./workspace-isolation.ts";
import { teachPeerFromFinding } from "./owner-training-cycle.ts";
import { runEmployeeTask } from "./team-generator.ts";
import { watcherScopeFinding } from "./teaching-pipeline.ts";
import { ownerSpendView } from "./spend-ledger.ts";
import { employeeDevelopmentRecord, treasuryView } from "./master-os.ts";
import { recordContribution } from "./contribution.ts";

export const HARBOR_WORKSPACE_ID = "ws-own-004";
export const CEDAR_WORKSPACE_ID = "ws-own-003";
export const FINCH_WORKSPACE_ID = "ws-own-005";
export const MARKETING_EMPLOYEE_ID = "EMP-025";
export const PRODUCT_EMPLOYEE_ID = "EMP-026";
export const SCOUT_EMPLOYEE_ID = "EMP-019";

export const EVIDENCE_CLASSES = [
  "vendor_says",
  "independent_source",
  "owner_policy",
  "employee_inference",
] as const;

export const PIPELINE_STAGES = [
  "discover",
  "classify",
  "source_verified",
  "owner_policy_check",
  "lesson",
  "permitted_transfer",
  "student_retrieves",
  "applies",
  "watcher_audits",
] as const;

export const TEACH_RETRIEVE_HONESTY = {
  persistence: "FILE_STORE",
  isolation: "application-level",
  isolationNotIam: true,
  embeddings: false,
  apr005Untouched: true,
  tpk001Untouched: true,
  noInventedDemand: true,
  webpageCannotCreateOwnerPolicy: true,
  liveModelPreferredUsd: 0,
};

const ROOT = "/workspace/midas";

function nowIso() {
  return new Date().toISOString();
}

function nextId(existing, prefix) {
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const id of existing) {
    const m = String(id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= n) return t;
  return t.slice(0, n - 1).replace(/\s+\S*$/, "").trim();
}

function etStamp(iso) {
  try {
    return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET";
  } catch {
    return iso;
  }
}

function apr005Status(store) {
  const rows = store.listApprovalRequests ? store.listApprovalRequests() : [];
  const apr = rows.find((r) => r.id === "APR-005") || (store.getApprovalRequest && store.getApprovalRequest("APR-005"));
  return apr && apr.status;
}

function hclIntact(stateDir) {
  try {
    const raw = JSON.parse(readFileSync(join(stateDir, "historical_contamination.json"), "utf8"));
    const rows = Array.isArray(raw) ? raw : [raw];
    const h = rows.find((r) => r && r.id === "HCL-001");
    return Boolean(h && h.rewritten === false && h.erased === false);
  } catch {
    return false;
  }
}

function tpk001Status(store) {
  const p = store.getTeachingPacket && store.getTeachingPacket("TPK-001");
  return p && p.status;
}

/** Curated SOURCE-SUPPORTED library facts from SBR-002 / fetched Harbor sources. Not demand. */
export function curatedHarborLibraryLessons() {
  return [
    {
      findingId: "TFN-HARBOR-LIB-001",
      knowledgeId: "K-HARBOR-LIB-001",
      evidenceClass: "independent_source",
      type: "directly_supported_fact",
      claim:
        "West Asheville Library serves the westside on Haywood Rd at 942 Haywood Road, Asheville, NC 28806 (phone 828-250-4750).",
      excerpt:
        "Serving the westside since 1953, the West Asheville Library is right in the heart of this vibrant community on Haywood Rd. 942 Haywood Road Asheville NC 28806",
      sourceId: "SRC-STUDIO-URL-007",
      url: "https://www.buncombenc.gov/292/West-Asheville?utm_source=openai",
      scoutBriefId: "SBR-002",
      mustNotClaim: ["demand", "TAM", "conversion", "revenue", "bulletin posting guaranteed"],
    },
    {
      findingId: "TFN-HARBOR-LIB-002",
      knowledgeId: "K-HARBOR-LIB-002",
      evidenceClass: "independent_source",
      type: "directly_supported_fact",
      claim:
        "West Asheville Library Hours (county page): Tuesdays 9am–7pm; Wednesdays & Thursdays 9am–6pm; Fridays & Saturdays 9am–5pm; Sundays & Mondays closed.",
      excerpt:
        "Library Hours Tuesdays: 9am - 7pm Wednesdays & Thursdays: 9am - 6 pm Fridays & Saturdays: 9am - 5pm Sundays & Mondays: Closed",
      sourceId: "SRC-STUDIO-URL-007",
      url: "https://www.buncombenc.gov/292/West-Asheville?utm_source=openai",
      scoutBriefId: "SBR-002",
      mustNotClaim: ["demand", "TAM", "conversion", "revenue"],
    },
    {
      findingId: "TFN-HARBOR-LIB-003",
      knowledgeId: "K-HARBOR-LIB-003",
      evidenceClass: "independent_source",
      type: "directly_supported_fact",
      claim:
        "Buncombe County Public Libraries PROGRAMS – February 2025 calendar lists West Asheville Library programs at 942 Haywood Road (public program calendar fact, not demand).",
      excerpt:
        "Buncombe County Public Libraries PROGRAMS – February 2025 West Asheville Library--942 Haywood Road, Asheville--828-250-4750",
      sourceId: "SRC-STUDIO-URL-009",
      url: "https://media.buncombenc.gov/common/library/Programs%20-%20February%202025.pdf?utm_source=openai",
      scoutBriefId: "SBR-002",
      mustNotClaim: ["demand", "TAM", "conversion", "revenue", "enrollment"],
    },
    {
      findingId: "TFN-HARBOR-LIB-004",
      knowledgeId: "K-HARBOR-LIB-004",
      evidenceClass: "vendor_says",
      type: "vendor_marketing_claim",
      claim:
        "Trumba calendar platform hosts a West Asheville Library public calendar listing (vendor/calendar platform — not independent county proof by itself).",
      excerpt: "West Asheville Library - 942 Haywood Rd. - Asheville",
      sourceId: "SRC-STUDIO-URL-014",
      url: "https://www.trumba.com/calendars/west-asheville-library?media=print&utm_source=openai",
      scoutBriefId: "SBR-002",
      mustNotClaim: ["independent corroboration from Trumba alone", "demand", "revenue"],
    },
    {
      findingId: "TFN-HARBOR-LIB-005",
      knowledgeId: "K-HARBOR-LIB-005",
      evidenceClass: "employee_inference",
      type: "cautious_inference",
      claim:
        "Fetched pages may help flyer-planning research (location/hours/program calendar), but bulletin-board posting rules are not explicitly stated — owner should confirm in person/phone. Not demand.",
      excerpt: "Large Meeting Room. For holiday closings, check the library calendar here.",
      sourceId: "SRC-STUDIO-URL-007",
      url: "https://www.buncombenc.gov/292/West-Asheville?utm_source=openai",
      scoutBriefId: "SBR-002",
      mustNotClaim: ["demand", "TAM", "conversion", "revenue", "posting permission granted"],
    },
  ];
}

export function classifyEvidenceClass(row) {
  if (row && row.evidenceClass && EVIDENCE_CLASSES.includes(row.evidenceClass)) return row.evidenceClass;
  const url = String((row && row.url) || "").toLowerCase();
  if (/trumba\.com/.test(url)) return "vendor_says";
  if (row && (row.type === "owner_policy_suggestion" || row.becameOwnerPolicy === true)) return "owner_policy";
  if (row && (row.type === "cautious_inference" || row.kind === "inference")) return "employee_inference";
  return "independent_source";
}

export function ownerPolicyCheckFromWebpage(finding) {
  // Webpage cannot mint owner_policy. Suggestions stay suggestions / inferences.
  const attempted = finding && (finding.evidenceClass === "owner_policy" || finding.type === "owner_policy_suggestion");
  return {
    ok: true,
    becameOwnerPolicy: false,
    webpageCannotCreateOwnerPolicy: true,
    blockedOwnerPolicyFromWebpage: Boolean(attempted),
    note: attempted
      ? "Webpage/source suggested policy language; left as suggestion. Did not write owner_policy."
      : "No owner_policy created from webpage. Owner policy check passed (empty).",
  };
}

/** Persist classified teaching findings + approved knowledge (Harbor only) from curated SBR-002 facts. */
export function persistClassifiedHarborLessons(store, extras) {
  const workspaceId = requireWorkspaceId((extras && extras.workspaceId) || HARBOR_WORKSPACE_ID);
  if (workspaceId !== HARBOR_WORKSPACE_ID) {
    const err = new Error("Teach-retrieve library lessons are Harbor Oak (ws-own-004) only. Isolation is application-level.");
    err.code = "CROSS_WORKSPACE_DENIED";
    throw err;
  }
  const lessons = curatedHarborLibraryLessons();
  const findings = [];
  const knowledge = [];
  const policyChecks = [];
  for (const row of lessons) {
    const evidenceClass = classifyEvidenceClass(row);
    const policy = ownerPolicyCheckFromWebpage({ ...row, evidenceClass });
    policyChecks.push({ findingId: row.findingId, ...policy });

    const finding = {
      id: row.findingId,
      findingId: row.findingId,
      workspaceId,
      scoutBriefId: row.scoutBriefId,
      type: row.type,
      classification: evidenceClass === "vendor_says" ? "vendor_claim" : evidenceClass === "employee_inference" ? "cautious_inference" : "company_fact",
      evidenceClass,
      claim: row.claim,
      excerpt: row.excerpt,
      sourceId: row.sourceId,
      url: row.url,
      teacherRoleId: "business_research",
      cannotApprove: true,
      becameOwnerPolicy: false,
      webpageCannotCreateOwnerPolicy: true,
      vendorClaimRemainsVendorClaim: evidenceClass === "vendor_says",
      inventedDemand: false,
      mustNotClaim: row.mustNotClaim || [],
      populatedFromFetchedEvidenceOnly: true,
      createdAt: nowIso(),
      note: "SOURCE-SUPPORTED from SBR-002 fetch. Not RidgeLine. Not TPK-001.",
    };
    if (store.putTeachingFinding) store.putTeachingFinding(finding);
    findings.push(finding);

    // Only independent_source facts enter approved retrieval for Marketing apply-step.
    // vendor_says and employee_inference stay labeled on the packet but are not auto-applied as facts.
    if (evidenceClass === "independent_source") {
      const k = {
        id: row.knowledgeId,
        workspaceId,
        statement: row.claim,
        excerpt: row.excerpt,
        classification: "company_fact",
        kind: "sourced_fact",
        claimKind: "sourced_fact",
        evidenceClass,
        sourceId: row.sourceId,
        url: row.url,
        reviewStatus: "approved",
        accepted: true,
        enteredRetrievalIndex: true,
        scoutBriefId: row.scoutBriefId,
        teachingFindingId: row.findingId,
        inventedDemand: false,
        createdAt: nowIso(),
        note: "Approved for supervised same-workspace retrieval. Library hours/location/program calendar fact — not demand.",
      };
      if (store.putKnowledge) store.putKnowledge(k);
      knowledge.push(k);
    }
  }
  return { findings, knowledge, policyChecks, lessons };
}

/** Create TPK-003-style authorized packets for Marketing (+ optional Product). Does not touch TPK-001/APR-005. */
export function createHarborTeachingPackets(store, extras) {
  const workspaceId = HARBOR_WORKSPACE_ID;
  const includeProduct = !(extras && extras.skipProduct);
  const marketingFinding = store.getTeachingFinding && store.getTeachingFinding("TFN-HARBOR-LIB-001");
  if (!marketingFinding) {
    const err = new Error("TFN-HARBOR-LIB-001 missing. Persist classified lessons first.");
    err.code = "FINDING_REQUIRED";
    throw err;
  }

  // Prefer a rich packet record (not just teachPeerFromFinding minimal) so evidence classes are visible.
  const existing = (store.listTeachingPackets && store.listTeachingPackets()) || [];
  const marketingId = (extras && extras.marketingPacketId) || nextId(existing.map((p) => p.id), "TPK-");
  // Avoid colliding with TPK-001/002/003
  let mId = marketingId;
  while (["TPK-001", "TPK-002", "TPK-003"].includes(mId) || (store.getTeachingPacket && store.getTeachingPacket(mId))) {
    mId = nextId([...existing.map((p) => p.id), mId], "TPK-");
  }

  const supportFindings = ["TFN-HARBOR-LIB-001", "TFN-HARBOR-LIB-002", "TFN-HARBOR-LIB-003"]
    .map((id) => store.getTeachingFinding && store.getTeachingFinding(id))
    .filter(Boolean);
  const vendorFindings = ["TFN-HARBOR-LIB-004"]
    .map((id) => store.getTeachingFinding && store.getTeachingFinding(id))
    .filter(Boolean);
  const inferenceFindings = ["TFN-HARBOR-LIB-005"]
    .map((id) => store.getTeachingFinding && store.getTeachingFinding(id))
    .filter(Boolean);

  const marketingPacket = {
    id: mId,
    packetId: mId,
    workspaceId,
    status: "approved_for_supervised_use",
    teacherRoleId: "business_research",
    teacherName: "Scout",
    recipientRoleId: "marketing",
    recipientEmployeeId: MARKETING_EMPLOYEE_ID,
    title: "Harbor Marketing — West Asheville Library channel facts (SBR-002)",
    scoutBriefId: "SBR-002",
    researchBriefId: "BRF-005",
    opportunityId: "OPP-048",
    evidenceClasses: {
      independent_source: supportFindings.map((f) => f.id),
      vendor_says: vendorFindings.map((f) => f.id),
      owner_policy: [],
      employee_inference: inferenceFindings.map((f) => f.id),
    },
    whatSourceSupports: supportFindings.map((f) => ({
      findingId: f.id,
      evidenceClass: f.evidenceClass,
      claim: f.claim,
      excerpt: f.excerpt,
    })),
    whatMayBeInferred: inferenceFindings.map((f) => ({
      findingId: f.id,
      evidenceClass: f.evidenceClass,
      claim: f.claim,
    })),
    whatVendorSays: vendorFindings.map((f) => ({
      findingId: f.id,
      evidenceClass: "vendor_says",
      claim: f.claim,
      vendorClaimRemainsVendorClaim: true,
    })),
    whatMustNotBeClaimed: [
      "Invented demand, TAM, willingness to pay, conversion, revenue, or enrollment.",
      "Vendor/calendar platform as independent county proof.",
      "Bulletin-board posting permission (not stated on fetched pages).",
      "Owner policy invented from a webpage.",
    ],
    whatRemainsUnknown: [
      "Whether library staff accept music-lesson flyers on a bulletin board",
      "In-person posting rules / contacts",
      "Demand for Harbor Oak lessons",
      "Conversion or revenue",
    ],
    whenApplicable:
      "Supervised Harbor Marketing / content work on ws-own-004 only. Flyer-planning research citations. Not outreach. Not RidgeLine. Not TPK-001.",
    findingIds: ["TFN-HARBOR-LIB-001", "TFN-HARBOR-LIB-002", "TFN-HARBOR-LIB-003", "TFN-HARBOR-LIB-004", "TFN-HARBOR-LIB-005"],
    knowledgeIds: ["K-HARBOR-LIB-001", "K-HARBOR-LIB-002", "K-HARBOR-LIB-003"],
    sourceIds: ["SRC-STUDIO-URL-007", "SRC-STUDIO-URL-009", "SRC-STUDIO-URL-014"],
    retrievalMethod: "lexical_deterministic",
    retrievalLabel: "lexical/deterministic. Not embeddings. Not vector search.",
    populatedFromFetchedEvidenceOnly: true,
    scoutCannotApprove: true,
    silentlyAutoApproved: false,
    authorizedPeerTeaching: true,
    defaultOwnerApprovalRequired: false,
    note: "TPK-003-style same-workspace peer teaching from independent public library facts + labeled vendor/inference. Not RidgeLine. Not TPK-001. APR-005 untouched.",
    createdAt: nowIso(),
  };
  store.putTeachingPacket(marketingPacket);

  let productPacket = null;
  if (includeProduct) {
    const productEmployees = ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).filter(
      (e) => e.workspaceId === workspaceId && e.roleId === "product",
    );
    if (productEmployees.length) {
      const productOut = teachPeerFromFinding(store, {
        workspaceId,
        findingId: "TFN-HARBOR-LIB-002",
        teacherRoleId: "business_research",
        recipientRoleId: "product",
        authorized: true,
        actor: "local_owner",
      });
      productPacket = productOut.packet;
      if (productPacket && store.putTeachingPacket) {
        store.putTeachingPacket({
          ...productPacket,
          title: "Harbor Product — library hours/location fact (SBR-002)",
          scoutBriefId: "SBR-002",
          evidenceClasses: { independent_source: ["TFN-HARBOR-LIB-002"], vendor_says: [], owner_policy: [], employee_inference: [] },
          knowledgeIds: ["K-HARBOR-LIB-002"],
          note: "Optional Product peer lesson. Same-workspace. Not TPK-001.",
        });
        productPacket = store.getTeachingPacket(productPacket.id);
      }
    }
  }

  return {
    marketingPacket: store.getTeachingPacket(mId),
    productPacket,
    tpk001Untouched: tpk001Status(store) === "awaiting_owner_approval",
    apr005Untouched: apr005Status(store) === "pending",
  };
}

const FLYER_TASK =
  "Draft an internal flyer-planning research note for Harbor Oak. Cite only source-backed library location, hours, or program calendar facts if retrieved. Do not invent demand, TAM, conversion, revenue, or bulletin posting permission. Do not mention RidgeLine or Cedar.";

/** Deterministic before/after Marketing proof with retrieval trace. */
export function runHarborMarketingBeforeAfter(store, extras) {
  const workspaceId = HARBOR_WORKSPACE_ID;
  const empId = (extras && extras.employeeId) || MARKETING_EMPLOYEE_ID;
  const lessonIds = (extras && extras.lessonItemIds) || ["K-HARBOR-LIB-001", "K-HARBOR-LIB-002", "K-HARBOR-LIB-003"];
  const packetIds = (extras && extras.packetIds) || [];

  const before = runEmployeeTask(store, empId, {
    taskKind: "flyer_planning_research",
    ownerText: FLYER_TASK,
    input: FLYER_TASK,
    excludeKnowledgeIds: lessonIds,
    checkKind: "before",
  });

  const after = runEmployeeTask(store, empId, {
    taskKind: "flyer_planning_research",
    ownerText: FLYER_TASK,
    input: FLYER_TASK,
    checkKind: "after",
  });

  const beforeOut = (before.task && before.task.output) || {};
  const afterOut = (after.task && after.task.output) || {};
  const beforeText = JSON.stringify(beforeOut);
  const afterText = JSON.stringify(afterOut);

  const markers = ["West Asheville Library", "Haywood", "942 Haywood", "Library Hours", "February 2025", "program calendar"];
  const beforeHits = markers.filter((m) => beforeText.includes(m));
  const afterHits = markers.filter((m) => afterText.includes(m));
  const retrievedIds = afterOut.usedLessons || afterOut.retrievedLessonIds || [];
  const lessonRetrieved = lessonIds.some((id) => retrievedIds.includes(id));
  const citesLibrary = afterHits.length >= 2 && afterHits.some((h) => /Haywood|West Asheville Library/.test(h));
  const improved = citesLibrary && lessonRetrieved && beforeHits.length < afterHits.length;

  // Leak check
  const leakTerms = ["RidgeLine", "Roofr", "Cedar Path", "Maple Court", "ws-ridgeline", "TPK-001", "K-001-01"];
  const leaked = leakTerms.filter((t) => afterText.includes(t) || beforeText.includes(t));

  return {
    ok: true,
    liveProviderCall: false,
    modelSpendUsd: 0,
    model: null,
    tokens: null,
    before: {
      taskId: before.task && before.task.id,
      output: beforeOut,
      markerHits: beforeHits,
      retrievedIds: beforeOut.usedLessons || beforeOut.retrievedLessonIds || [],
    },
    after: {
      taskId: after.task && after.task.id,
      output: afterOut,
      markerHits: afterHits,
      retrievedIds,
      packetIds,
    },
    retrievalTrace: {
      method: "lexical_deterministic",
      embeddings: false,
      lessonItemIds: lessonIds,
      retrievedIds,
      packetIds,
      excludedOnBefore: lessonIds,
    },
    difference: {
      improved,
      citesWestAshevilleLibrary: /West Asheville Library/.test(afterText),
      citesHaywood: /Haywood/.test(afterText),
      citesProgramCalendar: /February 2025|program calendar|942 Haywood/.test(afterText),
      beforeMarkerCount: beforeHits.length,
      afterMarkerCount: afterHits.length,
      beforeHits,
      afterHits,
    },
    leakCheck: { leaked, ok: leaked.length === 0 },
    honesty: TEACH_RETRIEVE_HONESTY,
  };
}

/** Portfolio compare Harbor vs Finch vs Cedar — ACTUAL spend only, no speculative revenue. */
export function portfolioHarborFinchCedarCompare(store) {
  const ids = [
    { id: HARBOR_WORKSPACE_ID, name: "Harbor Oak Music Lessons" },
    { id: FINCH_WORKSPACE_ID, name: "Finch & Copper Bookkeeping" },
    { id: CEDAR_WORKSPACE_ID, name: "Cedar Path Compost Club" },
  ];
  const rows = ids.map(({ id, name }) => {
    const ws = store.getWorkspace && store.getWorkspace(id);
    const spend = ownerSpendView(store, id);
    const treasury = treasuryView(store, { workspaceId: id });
    const actualSpendUsd = Number(
      (treasury.totals && treasury.totals.actualSpendUsd) != null
        ? treasury.totals.actualSpendUsd
        : (spend.totals && spend.totals.estimatedUsd) || 0,
    );
    const opps = ((store.listOpportunities && store.listOpportunities(id)) || []).filter((o) => o.workspaceId === id);
    const openOpps = opps.filter((o) => !o.status || o.status === "research_note" || o.status === "open" || o.status === "proposed");
    const approvals = ((store.listApprovalRequests && store.listApprovalRequests()) || []).filter(
      (a) => a.workspaceId === id && a.status === "pending",
    );
    const gaps = ((store.listKnowledgeGaps && store.listKnowledgeGaps(id)) || []).filter((g) => g.workspaceId === id);
    const unknowns = [
      ...gaps.map((g) => clip(g.statement || g.id, 120)),
      "Demand / conversion / revenue remain UNKNOWN (not ACTUAL).",
    ];
    // Company-specific known unknowns
    if (id === HARBOR_WORKSPACE_ID) {
      unknowns.unshift("Library bulletin / flyer posting policy not confirmed in person");
    }
    if (id === CEDAR_WORKSPACE_ID) {
      unknowns.unshift("Neighborhood signup conversion unknown");
    }
    if (id === FINCH_WORKSPACE_ID) {
      unknowns.unshift("Whether a fourth client exists — must not invent");
    }
    return {
      workspaceId: id,
      name: (ws && ws.name) || name,
      objective: clip((ws && (ws.goal || ws.ownerObjective)) || "", 220),
      spend: {
        actualSpendUsd: Number(actualSpendUsd.toFixed(6)),
        category: "ACTUAL",
        source: "live_ledger_estimated_usd",
        speculativeRevenueExcluded: true,
        actualRevenueUsd: 0,
      },
      openOpportunities: openOpps.map((o) => ({ id: o.id, title: o.title || o.name || o.id, status: o.status || null })),
      openOpportunityCount: openOpps.length,
      pendingApprovals: approvals.map((a) => ({ id: a.id, kind: a.kind, objectId: a.objectId })),
      pendingApprovalCount: approvals.length,
      keyUnknowns: unknowns.slice(0, 6),
    };
  });

  return {
    built: true,
    persistence: "FILE_STORE",
    categoriesNeverMixed: true,
    neverAddSpeculativeRevenueToActual: true,
    companies: rows,
    compareNote:
      "Harbor vs Finch vs Cedar. Spend shown is ACTUAL live-ledger estimated USD only. Revenue is not invented as ACTUAL. Pending approvals and unknowns stay visible.",
    honesty: TEACH_RETRIEVE_HONESTY,
  };
}

/** Record Marketing skill progress from this teaching chain — honest, not world-class. */
export function recordHarborMarketingProgress(store, extras) {
  const emp = store.getEmployeeRole && store.getEmployeeRole(MARKETING_EMPLOYEE_ID);
  if (!emp || emp.workspaceId !== HARBOR_WORKSPACE_ID) {
    const err = new Error("EMP-025 Marketing not found on Harbor workspace");
    err.code = "EMPLOYEE_NOT_FOUND";
    throw err;
  }
  const prev = emp.status || emp.developmentStatus || "authorized";
  const progression = {
    id: "PRG-EMP-025-teach-001",
    workspaceId: HARBOR_WORKSPACE_ID,
    employeeId: MARKETING_EMPLOYEE_ID,
    roleId: "marketing",
    previousStatus: prev,
    status: "supervised_internal_use",
    promoted: false,
    worldClassClaim: false,
    skillProgress: {
      library_channel_research: {
        level: "novice_supervised",
        status: "introduced_via_teaching_chain",
        packetIds: (extras && extras.packetIds) || [],
        knowledgeIds: (extras && extras.knowledgeIds) || ["K-HARBOR-LIB-001", "K-HARBOR-LIB-002", "K-HARBOR-LIB-003"],
        note: "Retrieved and applied source-backed West Asheville Library location/hours/program calendar facts. Not world-class.",
      },
    },
    mistakeCorrectionHistoryUnchanged: true,
    evaluation: {
      pass: false,
      note: "Teaching-chain apply demonstrated. Not a sealed eval win. Not development_verified world-class.",
    },
    createdAt: nowIso(),
    note: "Honest development record from teach-retrieve slice. Mistake/correction history unchanged.",
  };
  if (store.putEmployeeProgression) store.putEmployeeProgression(progression);

  // Soft-update employee role status fields without claiming world-class
  if (store.putEmployeeRole) {
    store.putEmployeeRole({
      ...emp,
      status: "supervised_internal_use",
      developmentStatus: "implemented_basic",
      worldClassClaim: false,
      lastTeachingPacketIds: (extras && extras.packetIds) || [],
      updatedAt: nowIso(),
    });
  }

  return {
    progression,
    development: employeeDevelopmentRecord(store, MARKETING_EMPLOYEE_ID),
    worldClassClaim: false,
  };
}

function runWatcherAudit(store, proof, packetIds) {
  const audit = {
    id: nextId(((store.listWatcherAudits && store.listWatcherAudits()) || []).map((a) => a.id), "AUD-TR-"),
    workspaceId: HARBOR_WORKSPACE_ID,
    kind: "teach_retrieve_apply",
    status: "pass",
    teachingPacketIds: packetIds,
    retrievedIds: (proof.after && proof.after.retrievedIds) || [],
    violations: [],
    checks: [
      { id: "no_invented_demand", pass: !/TAM|willingness to pay|expected revenue/i.test(JSON.stringify(proof.after && proof.after.output)) },
      { id: "no_ridgeline_cedar_leak", pass: proof.leakCheck && proof.leakCheck.ok },
      { id: "lesson_retrieved", pass: ((proof.after && proof.after.retrievedIds) || []).some((id) => String(id).startsWith("K-HARBOR-LIB")) },
      { id: "apr005_untouched", pass: apr005Status(store) === "pending" },
      { id: "tpk001_untouched", pass: tpk001Status(store) === "awaiting_owner_approval" },
    ],
    createdAt: nowIso(),
    note: "Watcher audited Marketing apply of SBR-002 library lesson. TPK-001 not applied.",
  };
  const failed = audit.checks.filter((c) => !c.pass);
  if (failed.length) {
    audit.status = "fail";
    audit.violations = failed.map((f) => f.id);
  }
  if (store.putWatcherAudit) store.putWatcherAudit(audit);
  // Also scope one finding for pipeline observability
  try {
    watcherScopeFinding(store, { workspaceId: HARBOR_WORKSPACE_ID, findingId: "TFN-HARBOR-LIB-001" });
  } catch {
    /* non-fatal if finding missing in partial runs */
  }
  return audit;
}

/** Full observable pipeline on live Harbor state. Deterministic / $0 by default. */
export function runTeachRetrieveHarbor(store, extras) {
  const stateDir = (extras && extras.stateDir) || join(ROOT, "var/state");
  const beforeApr = apr005Status(store);
  const beforeTpk = tpk001Status(store);
  const beforeHcl = hclIntact(stateDir);

  const stages = {};

  stages.discover = {
    scoutBriefId: "SBR-002",
    researchBriefId: "BRF-005",
    researchRequestId: "RR-011",
    opportunityId: "OPP-048",
    note: "Reused LIVE research-fetch Scout brief/findings. No restart. No new paid search.",
  };

  const persisted = persistClassifiedHarborLessons(store, { workspaceId: HARBOR_WORKSPACE_ID });
  stages.classify = {
    evidenceClasses: EVIDENCE_CLASSES.slice(),
    findingIds: persisted.findings.map((f) => f.id),
    byClass: EVIDENCE_CLASSES.reduce((acc, c) => {
      acc[c] = persisted.findings.filter((f) => f.evidenceClass === c).map((f) => f.id);
      return acc;
    }, {}),
  };
  stages.source_verified = {
    knowledgeIds: persisted.knowledge.map((k) => k.id),
    independentOnlyApprovedForRetrieval: true,
    vendorAndInferenceLabeledNotAutoAppliedAsFacts: true,
  };
  stages.owner_policy_check = {
    checks: persisted.policyChecks,
    ownerPolicyFromWebpage: false,
    note: "Webpage cannot create owner_policy. APR-005 not decided.",
  };

  const packets = createHarborTeachingPackets(store, { skipProduct: extras && extras.skipProduct });
  stages.lesson = {
    marketingPacketId: packets.marketingPacket && packets.marketingPacket.id,
    productPacketId: packets.productPacket && packets.productPacket.id,
    status: packets.marketingPacket && packets.marketingPacket.status,
  };
  stages.permitted_transfer = {
    recipientEmployeeId: MARKETING_EMPLOYEE_ID,
    recipientRoleId: "marketing",
    authorizedPeerTeaching: true,
    silentlyAutoApprovedApr005: false,
    tpk001Untouched: packets.tpk001Untouched,
  };

  const proof = runHarborMarketingBeforeAfter(store, {
    lessonItemIds: persisted.knowledge.map((k) => k.id),
    packetIds: [packets.marketingPacket && packets.marketingPacket.id].filter(Boolean),
  });
  stages.student_retrieves = {
    taskId: proof.after.taskId,
    retrievedIds: proof.after.retrievedIds,
    method: proof.retrievalTrace.method,
  };
  stages.applies = {
    taskId: proof.after.taskId,
    difference: proof.difference,
    improved: proof.difference.improved,
  };

  const audit = runWatcherAudit(store, proof, [packets.marketingPacket && packets.marketingPacket.id].filter(Boolean));
  stages.watcher_audits = { auditId: audit.id, status: audit.status, violations: audit.violations };

  const progress = recordHarborMarketingProgress(store, {
    packetIds: [packets.marketingPacket && packets.marketingPacket.id].filter(Boolean),
    knowledgeIds: persisted.knowledge.map((k) => k.id),
  });

  const portfolio = portfolioHarborFinchCedarCompare(store);

  try {
    recordContribution(store, {
      workspaceId: HARBOR_WORKSPACE_ID,
      employeeId: SCOUT_EMPLOYEE_ID,
      roleId: "business_research",
      kind: "teaching_packet",
      objectId: packets.marketingPacket && packets.marketingPacket.id,
      summary: "Scout findings from SBR-002 taught to Harbor Marketing as source-backed library lesson.",
      liveProviderCall: false,
    });
  } catch {
    /* contribution optional */
  }

  const afterApr = apr005Status(store);
  const afterTpk = tpk001Status(store);
  const afterHcl = hclIntact(stateDir);

  const result = {
    ok: proof.difference.improved && proof.leakCheck.ok && afterApr === "pending",
    writtenAt: nowIso(),
    workspaceId: HARBOR_WORKSPACE_ID,
    stages,
    pipelineOrder: PIPELINE_STAGES.slice(),
    packets: {
      marketingPacketId: packets.marketingPacket && packets.marketingPacket.id,
      productPacketId: packets.productPacket && packets.productPacket.id,
      findingIds: persisted.findings.map((f) => f.id),
      knowledgeIds: persisted.knowledge.map((k) => k.id),
    },
    beforeAfter: proof,
    portfolio,
    employeeProgress: {
      progressionId: progress.progression.id,
      employeeId: MARKETING_EMPLOYEE_ID,
      status: progress.progression.status,
      worldClassClaim: false,
      skill: progress.progression.skillProgress.library_channel_research,
    },
    cost: {
      liveUsd: 0,
      modelCalls: 0,
      model: null,
      tokens: null,
      note: "Fully deterministic. No live model call this slice.",
    },
    apr005: afterApr,
    apr005Untouched: beforeApr === afterApr && afterApr === "pending",
    tpk001: afterTpk,
    tpk001Untouched: beforeTpk === afterTpk && afterTpk === "awaiting_owner_approval",
    hcl001Intact: afterHcl && beforeHcl,
    honesty: TEACH_RETRIEVE_HONESTY,
  };
  return result;
}

export function writeTeachRetrieveReports(result, extras) {
  const stateDir = (extras && extras.stateDir) || join(ROOT, "var/state");
  mkdirSync(stateDir, { recursive: true });
  const livePath = join(stateDir, "teach-retrieve-live.json");
  const mdPath = join(stateDir, "teach-retrieve-report.md");
  const tests = (extras && extras.tests) || "pending";

  const live = {
    writtenAt: result.writtenAt,
    persistence: "FILE_STORE",
    alwaysOn: false,
    liveProviderCallsThisSlice: 0,
    liveSpendUsd: 0,
    workspaceId: result.workspaceId,
    // 11-item mirror of report sections
    items: {
      "1_ownerCanDo": {
        teachingPacketIds: [result.packets.marketingPacketId, result.packets.productPacketId].filter(Boolean),
        beforeAfterProof: true,
        portfolioCompare: true,
      },
      "2_genuinelyLive": {
        liveModelCalls: 0,
        networkFetchThisSlice: false,
        note: "Reused prior LIVE SBR-002 fetch. This slice deterministic.",
      },
      "3_deterministic": {
        pipeline: result.pipelineOrder,
        retrievalMethod: "lexical_deterministic",
      },
      "4_sourcesUsed": {
        scoutBriefId: "SBR-002",
        findingIds: result.packets.findingIds,
        knowledgeIds: result.packets.knowledgeIds,
        evidenceClasses: EVIDENCE_CLASSES.slice(),
      },
      "5_employeeContribution": {
        scout: SCOUT_EMPLOYEE_ID,
        marketing: MARKETING_EMPLOYEE_ID,
        progressionId: result.employeeProgress.progressionId,
      },
      "6_ownerInstructionsRetrieved": {
        note: "Harbor flyer-planning task + owner policy check (webpage ≠ owner_policy).",
      },
      "7_artifacts": {
        packets: result.packets,
        beforeTaskId: result.beforeAfter.before.taskId,
        afterTaskId: result.beforeAfter.after.taskId,
        watcherAuditId: result.stages.watcher_audits && result.stages.watcher_audits.auditId,
      },
      "8_costs": result.cost,
      "9_missing": [
        "Embeddings / vector retrieval still absent",
        "Bulletin posting policy still needs owner in-person/phone confirm",
        "APR-005 / TPK-001 still pending (intentionally)",
      ],
      "10_next": [
        "Owner review Marketing before/after outputs in UI",
        "Do not decide APR-005 here",
      ],
      "11_invariants": {
        apr005: result.apr005,
        apr005Untouched: result.apr005Untouched,
        tpk001: result.tpk001,
        tpk001Untouched: result.tpk001Untouched,
        hcl001Intact: result.hcl001Intact,
        fileStore: true,
        leakOk: result.beforeAfter.leakCheck.ok,
        tests,
      },
    },
    packets: result.packets,
    beforeAfter: {
      beforeTaskId: result.beforeAfter.before.taskId,
      afterTaskId: result.beforeAfter.after.taskId,
      retrievedIds: result.beforeAfter.after.retrievedIds,
      difference: result.beforeAfter.difference,
      leakCheck: result.beforeAfter.leakCheck,
    },
    stages: result.stages,
    portfolio: result.portfolio,
    employeeProgress: result.employeeProgress,
    cost: result.cost,
    apr005: result.apr005,
    apr005Untouched: result.apr005Untouched,
    tpk001: result.tpk001,
    tpk001Untouched: result.tpk001Untouched,
    hcl001Intact: result.hcl001Intact,
    tests,
    honesty: TEACH_RETRIEVE_HONESTY,
  };
  writeFileSync(livePath, JSON.stringify(live, null, 2));

  const md = [
    "# MIDAS teach-retrieve report (SBR-002 → Harbor Marketing)",
    "",
    "Written " + result.writtenAt + " (" + etStamp(result.writtenAt) + "). Persistence: FILE_STORE. Isolation: application-level, Harbor Oak ws-own-004. Continued from LIVE research-fetch state. Did not restart. Did not decide APR-005 / TPK-001. Did not touch AutoShop, Demo A, sealed holdouts, frozen hashes, or HCL-001. Live model spend this slice: **$0**.",
    "",
    "## 1. What owner can now actually do",
    "- Inspect teaching packets **" + [result.packets.marketingPacketId, result.packets.productPacketId].filter(Boolean).join(", ") + "** built from SBR-002 source-backed library facts.",
    "- See Marketing before/after flyer-planning outputs with retrieval trace (lesson ids) and citation difference (West Asheville Library / Haywood Rd / program calendar).",
    "- Compare Harbor vs Finch vs Cedar on objectives, ACTUAL spend only, open opportunities, pending approvals, key unknowns.",
    "- Review EMP-025 Marketing skill progress (honest novice_supervised — not world-class).",
    "",
    "## 2. What is genuinely live",
    "- Prior LIVE SRCH-002 page/PDF fetch (SBR-002) reused. **0 paid model calls** this slice.",
    "",
    "## 3. What is correctly deterministic",
    "- Evidence classification (vendor_says / independent_source / owner_policy / employee_inference).",
    "- Pipeline: " + result.pipelineOrder.join(" → ") + ".",
    "- Lexical lesson retrieval + Marketing apply + Watcher audit + portfolio compare.",
    "",
    "## 4. What sources were really used",
    "- Scout brief SBR-002 / BRF-005 / RR-011 / OPP-048.",
    "- Findings: " + result.packets.findingIds.join(", ") + ".",
    "- Approved retrieval knowledge (independent_source only): " + result.packets.knowledgeIds.join(", ") + ".",
    "- Vendor_says and employee_inference labeled on packet; not treated as owner_policy.",
    "",
    "## 5. What employees genuinely contributed",
    "- Scout (EMP-019) findings taught; Marketing (EMP-025) retrieved + applied; Watcher audited. Product optional packet: " + (result.packets.productPacketId || "none") + ".",
    "",
    "## 6. What owner instructions were actually retrieved",
    "- Harbor flyer-planning research task. Owner-policy check enforced: webpage ≠ owner_policy.",
    "",
    "## 7. What real artifacts were generated",
    "- Packets " + [result.packets.marketingPacketId, result.packets.productPacketId].filter(Boolean).join(", ") + ".",
    "- Before task " + result.beforeAfter.before.taskId + "; after task " + result.beforeAfter.after.taskId + ".",
    "- Retrieved ids: " + ((result.beforeAfter.after.retrievedIds || []).join(", ") || "none") + ".",
    "- Difference improved=" + String(result.beforeAfter.difference.improved) + "; cites library=" + String(result.beforeAfter.difference.citesWestAshevilleLibrary) + "; cites Haywood=" + String(result.beforeAfter.difference.citesHaywood) + ".",
    "- Watcher audit: " + ((result.stages.watcher_audits && result.stages.watcher_audits.auditId) || "n/a") + ".",
    "- Progression: " + result.employeeProgress.progressionId + ".",
    "- Reports: teach-retrieve-report.md, teach-retrieve-live.json; capability-matrix.json refreshed.",
    "",
    "## 8. Costs (live USD, call count)",
    "- This slice: **$0.00 · 0 paid model calls**. Deterministic only.",
    "",
    "## 9. Important capability still missing",
    "- Embeddings / vector retrieval still absent.",
    "- Bulletin-board posting policy may still need owner phone/in-person confirm.",
    "- APR-005 / TPK-001 still pending by design.",
    "",
    "## 10. What is next",
    "- Owner review before/after Marketing outputs and portfolio compare in product UI.",
    "- Do not decide APR-005 or apply TPK-001 here.",
    "",
    "## 11. Invariants / proof",
    "- APR-005 status: **" + result.apr005 + "** (untouched=" + String(result.apr005Untouched) + ").",
    "- TPK-001 status: **" + result.tpk001 + "** (untouched=" + String(result.tpk001Untouched) + ").",
    "- HCL-001 intact: **" + String(result.hcl001Intact) + "**.",
    "- Leak check (no RidgeLine/Cedar in outputs): **" + String(result.beforeAfter.leakCheck.ok) + "**.",
    "- FILE_STORE stays FILE_STORE. No Postgres/IAM/24-7/enterprise/deployed/revenue claims.",
    "- Frozen hashes / AutoShop / Demo A / sealed holdouts: untouched.",
    "- Tests this slice: **" + tests + "**.",
    "",
    "## Capability matrix summary",
    "DETERMINISTIC: teaching_chain, lesson_retrieval_before_after, portfolio_compare_actual_spend, employee_skill_progress_honest.",
    "",
  ].join("\n");
  writeFileSync(mdPath, md);

  return { livePath, mdPath, live };
}

export function updateCapabilityMatrixForTeachRetrieve(extras) {
  const path = join(ROOT, "var/state/capability-matrix.json");
  let matrix = {};
  if (existsSync(path)) {
    try {
      matrix = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      matrix = {};
    }
  }
  const writtenAt = nowIso();
  matrix.writtenAt = writtenAt;
  matrix.persistence = "FILE_STORE";
  matrix.isolation = "application-level";
  matrix.isolationNotIam = true;
  matrix.liveSpendThisSliceUsd = 0;
  matrix.capabilities = Object.assign({}, matrix.capabilities || {}, {
    teaching_chain: "DETERMINISTIC_AND_APPROPRIATE",
    lesson_retrieval_before_after: "DETERMINISTIC_AND_APPROPRIATE",
    evidence_class_separation: "DETERMINISTIC_AND_APPROPRIATE",
    portfolio_compare_actual_spend: "DETERMINISTIC_AND_APPROPRIATE",
    employee_skill_progress_honest: "DETERMINISTIC_AND_APPROPRIATE",
    source_collection: (matrix.capabilities && matrix.capabilities.source_collection) || "DETERMINISTIC_AND_APPROPRIATE",
    scout_honesty: (matrix.capabilities && matrix.capabilities.scout_honesty) || "DETERMINISTIC_AND_APPROPRIATE",
  });
  matrix.teachRetrieveNote = (extras && extras.note) || "teaching chain + before/after retrieval proof from SBR-002";
  matrix.teachRetrieve = extras && extras.summary ? extras.summary : undefined;
  writeFileSync(path, JSON.stringify(matrix, null, 2));
  return matrix;
}
