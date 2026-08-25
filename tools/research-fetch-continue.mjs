/** Continue MIDAS: fetch SRCH-002 page bodies for Harbor Oak. $0 model. Do not decide APR-005. */
import { FileStore, repoPath, stateDir } from "@midas/db";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  fetchRankAndBriefHarborSrch002,
  writeResearchFetchReports,
  updateCapabilityMatrixForResearchFetch,
  HARBOR_WORKSPACE_ID,
} from "../packages/eval/src/research-fetch.ts";

const STATE = stateDir();
const store = new FileStore(STATE);

function apr005Status() {
  const rows = store.listApprovalRequests ? store.listApprovalRequests() : [];
  const apr = rows.find((r) => r.id === "APR-005") || (store.getApprovalRequest && store.getApprovalRequest("APR-005"));
  return apr && apr.status;
}

function hclIntact() {
  try {
    const raw = JSON.parse(readFileSync(join(STATE, "historical_contamination.json"), "utf8"));
    const rows = Array.isArray(raw) ? raw : [raw];
    const h = rows.find((r) => r && r.id === "HCL-001");
    return Boolean(h && h.rewritten === false && h.erased === false);
  } catch {
    return false;
  }
}

const beforeApr = apr005Status();
const beforeHcl = hclIntact();
if (beforeApr !== "pending") {
  console.error("WARN: APR-005 was not pending before run:", beforeApr);
}
if (!beforeHcl) {
  console.error("WARN: HCL-001 not intact before run");
}

const result = await fetchRankAndBriefHarborSrch002(store, {
  workspaceId: HARBOR_WORKSPACE_ID,
});

const afterApr = apr005Status();
const afterHcl = hclIntact();

const reports = writeResearchFetchReports(result, {
  stateDir: STATE,
  apr005Status: afterApr,
  hcl001: afterHcl,
  tests: "pending_runner_will_fill",
});

updateCapabilityMatrixForResearchFetch({
  note: "source_collection + scout_honesty updated after SRCH-002 page-body fetch",
});

const summary = {
  urlsOk: (result.fetchRows || []).filter((r) => r.ok).map((r) => r.url),
  urlsFailed: (result.fetchRows || []).filter((r) => !r.ok).map((r) => ({ url: r.url, reason: r.failureReason || r.fetchStatus })),
  passageCount: result.passageCount,
  scoutBriefId: result.scoutBriefId,
  researchRequestId: result.researchRequestId,
  researchBriefId: result.researchBriefId,
  opportunityId: result.opportunity && result.opportunity.id,
  costUsd: 0,
  modelCalls: 0,
  apr005: afterApr,
  apr005Untouched: beforeApr === afterApr && afterApr === "pending",
  hcl001Intact: afterHcl,
  reportMd: reports.mdPath,
  reportJson: reports.livePath,
};

writeFileSync(join(STATE, "research-fetch-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
