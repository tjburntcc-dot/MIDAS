/**
 * Build the owner approval queue.
 *
 * Rewritten after the integration audit found this path reimplementing, in
 * regular expressions, work that a foundry-promoted worker already does. That is
 * how a dead listing reached the owner: the qualifier holds an expiry
 * disqualifier earned through measured training, and this file had its own
 * hand-written checks instead.
 *
 * The order now is: the promoted worker decides, readiness decides whether the
 * company could act on it, certification decides whether anything may be
 * prepared, and only the classes the worker's taxonomy genuinely does not cover
 * are handled here -- explicitly, as a temporary overlay with candidates already
 * queued for the foundry.
 *
 * No outbound action. Nothing here has been sent, applied to, or registered for.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { readinessProfile, assessOpportunityFit } from "../packages/eval/src/readiness.ts";
import { mayPrepare } from "../packages/eval/src/shadow.ts";
import { tierRank } from "../packages/eval/src/academy.ts";

const disc = JSON.parse(readFileSync(repoPath("var", "state", "company0-discovery-aligned.json"), "utf8"));
const verdicts = JSON.parse(readFileSync(repoPath("var", "state", "company0-qualifier-verdicts.json"), "utf8"));
const liveness = JSON.parse(readFileSync(repoPath("var", "state", "company0-liveness.json"), "utf8")).checks;
const readinessItems = JSON.parse(readFileSync(repoPath("var", "state", "company0-readiness.json"), "utf8")).items;
const profile = readinessProfile(readinessItems);

/**
 * The overlay. Two classes the promoted worker has no code for, evidenced on
 * real candidates and queued for the foundry rather than bolted into the
 * worker's taxonomy by hand.
 */
/**
 * Channel eligibility is decided by each platform's own verified terms rather
 * than by a blanket assumption. The assumption was that marketplaces handling
 * payments require account holders to be 18. It was wrong for one of three, and
 * asserting it without checking was the same failure as trusting an aggregator
 * summary: a general claim standing in for a specific fact.
 */
const channels = JSON.parse(readFileSync(repoPath("var", "state", "company0-channel-eligibility.json"), "utf8"));

function channelRuling(url) {
  for (const host of Object.keys(channels.channels)) {
    if (String(url).includes(host)) return Object.assign({ host }, channels.channels[host]);
  }
  // A venue nobody has read is not a venue that is open.
  if (/upwork|freelancer|fiverr|alignerr|toptal|guru\.com|peopleperhour/i.test(String(url))) {
    return { host: "unknown_marketplace", eligibleForPrincipal: null, confidence: "unchecked",
      ruling: "This venue's terms have not been read. Unchecked is not open." };
  }
  return null;
}

const PLATFORM = /upwork|freelancer\.com|fiverr|alignerr|toptal|guru\.com|peopleperhour/i;
const SUPPLIER_SIDE = /\[for hire\]|for hire|_forhire|\/consulting\b|our services/i;

/** What a venue of this shape requires the company to be able to do. */
function requiredCapabilities(url, howToApply) {
  const caps = ["onboard_client", "invoice_and_collect", "quote_confidently"];
  if (/\bcontract|agreement|sign/i.test(String(howToApply))) caps.push("sign_binding_contract");
  return caps;
}

// Provenance: the verdicts artifact must describe these candidates, not an
// earlier run of discovery. Matching by array position would break silently the
// first time discovery returns a different set, which is the quiet version of
// the bypass this rewrite exists to fix.
const verdictByUrl = new Map(verdicts.results.map((r) => [r.url, r]));
const stale = disc.candidates.filter((c) => !verdictByUrl.has(c.url));
if (stale.length) {
  console.log("PROVENANCE: " + stale.length + " candidate(s) have no verdict in the artifact. They will be blocked as unassessed.");
}

const queue = disc.candidates.map((c, i) => {
  const v = verdictByUrl.get(c.url);
  const hay = [c.title, c.url, c.organisation, c.summary].join(" ");
  const blockers = [];
  const notes = [];

  // 1. The promoted worker's decision, which is the primary input rather than
  //    one opinion among several.
  const decision = v?.verdict?.decision || "unknown";
  const workerCodes = (v?.verdict?.disqualifiers || []).map((d) => (typeof d === "string" ? d : d.code));
  if (decision === "decline") {
    blockers.push({ kind: "qualifier_declined", source: "promoted_worker", detail: "oq-v2 declined: " + (workerCodes.join(", ") || "no disqualifier code given") + "." });
  }
  if (decision === "unknown") {
    blockers.push({ kind: "not_assessed", source: "pipeline", detail: "The promoted qualifier has not assessed this candidate. An unassessed candidate does not reach the owner." });
  }

  // 2. Liveness against the primary source. A discovery summary is not evidence
  //    that a posting is still open.
  const live = liveness[c.url];
  if (!live) {
    blockers.push({ kind: "liveness_unverified", source: "gate", detail: "Not fetched from its own source." });
  } else if (live.result !== "live") {
    blockers.push({ kind: "posting_gone", source: "gate", detail: live.detail + " Checked " + live.checkedAt + "." });
  }

  // 3. The overlay, marked as such.
  const channel = channelRuling(c.url);
  if (channel) {
    if (channel.eligibleForPrincipal === false) {
      blockers.push({
        kind: "channel_ineligible", source: "verified_terms",
        detail: channel.host + " requires " + channel.minimumAge + "+. " + channel.ruling,
        quote: String(channel.quote || "").slice(0, 200),
        foundryCandidate: "channel_ineligible",
      });
    } else if (channel.eligibleForPrincipal === null) {
      blockers.push({ kind: "channel_eligibility_unchecked", source: "gate", detail: channel.ruling, foundryCandidate: "channel_ineligible" });
    } else {
      notes.push("Channel open: " + channel.ruling);
      notes.push("Platform access is not contract capacity. Holding an account does not make a minor able to bind the company to what is agreed there.");
    }
    notes.push("Account creation is the owner's action, never MIDAS's.");
  }

  if (SUPPLIER_SIDE.test(hay)) {
    blockers.push({
      kind: "not_a_buyer", source: "rules_overlay",
      detail: "Reads as a supplier advertising, or a firm's own services page, rather than someone seeking to hire.",
      foundryCandidate: "not_a_buyer",
    });
  }

  // 4. Could the company act on it if it wanted to?
  const fit = assessOpportunityFit({
    opportunityId: "CAND-" + (i + 1),
    requiredCapabilities: requiredCapabilities(c.url, c.how_to_apply),
    items: readinessItems,
  });
  if (!fit.eligibleNow) {
    blockers.push({ kind: "readiness_blocked", source: "readiness", detail: fit.ruling });
  }

  // 5. Certification: may anything buyer-facing even be prepared for this?
  const gate = mayPrepare({
    actionClass: "shadow_external_draft",
    workerTier: "SANDBOX_COMPETENT",
    teamCertified: false,
    auditorCertified: false,
    minTierRequired: "SHADOW_ELIGIBLE",
    tierRank,
  });

  return {
    title: c.title, organisation: c.organisation, url: c.url,
    statedBudget: c.stated_budget_text, howToApply: c.how_to_apply,
    qualifier: { version: verdicts.version, decision, disqualifiers: workerCodes, fraudRisk: v?.verdict?.fraud_risk || null },
    liveness: live || { result: "unverified" },
    readiness: { eligibleNow: fit.eligibleNow, missing: fit.missing },
    certificationGate: { allowed: gate.allowed, reasons: gate.reasons },
    blockers, notes,
    status: blockers.length === 0 && gate.allowed ? "AWAITING_OWNER_APPROVAL" : "BLOCKED",
    channel: channel ? { host: channel.host, eligible: channel.eligibleForPrincipal, confidence: channel.confidence } : null,
    decisiveQuestion: blockers.some((b) => b.kind === "channel_eligibility_unchecked")
      ? "What do this venue's own terms say about minimum age?" : null,
  };
});

const awaiting = queue.filter((a) => a.status === "AWAITING_OWNER_APPROVAL");
const blocked = queue.filter((a) => a.status === "BLOCKED");
const platformBlocked = blocked.filter((a) => a.blockers.some((b) => b.kind === "channel_ineligible" || b.kind === "channel_eligibility_unchecked"));
const bySource = {};
for (const a of queue) for (const b of a.blockers) bySource[b.source] = (bySource[b.source] || 0) + 1;

const out = {
  at: new Date().toISOString(),
  discipline: "No external action of any kind without explicit owner approval. Nothing here has been sent, applied to, or registered for.",
  outboundActionsTaken: 0,
  pipeline: "discovery -> liveness -> promoted qualifier (oq-v2) -> rules overlay -> readiness -> certification gate -> queue",
  provenance: {
    verdictsArtifact: "company0-qualifier-verdicts.json",
    verdictsVersion: verdicts.version,
    candidatesWithoutVerdict: stale.length,
    check: "Verdicts are matched to candidates by URL, so an artifact from an earlier discovery run cannot be mistaken for a current one.",
  },
  assessed: queue.length,
  awaitingOwnerApproval: awaiting.length,
  blocked: blocked.length,
  blockedOnOneQuestion: platformBlocked.length,
  blockersBySource: bySource,
  findings: [
    "This path previously reimplemented, in regular expressions, checks a promoted worker already performed. The integration audit found it; the worker is now the primary input.",
    "Nothing currently clears the certification gate: no worker holds SHADOW_ELIGIBLE, no chain is team-certified, and no auditor is certified. Buyer-facing preparation is refused on that basis alone, before any opportunity is considered.",
    "Channel eligibility was verified against each platform's own terms instead of assumed. Freelancer.com states a minimum age of 16 and is OPEN to the principal in their own name; Upwork and Fiverr state 18 and are closed. The blanket assumption that marketplaces require 18 was wrong for one of three.",
    "Platform eligibility is not contract capacity. Being permitted to hold an account does not make a minor able to bind the company to what is agreed there, and the signer question is untouched by this.",
  ],
  preservedDecisions: [
    { id: "WI-39f6b3ce", decision: "NO-BID", note: "Idaho pursuit. Frozen as regression and assurance evidence." },
    { id: "WI-77181040", decision: "BLOCKED", note: "Re-verification blocked by bot protection; remains demoted rather than queued." },
  ],
  readinessSummary: profile.summary,
  queue,
};
writeFileSync(repoPath("var", "state", "company0-approval-queue.json"), JSON.stringify(out, null, 1));

console.log("pipeline:", out.pipeline);
console.log("assessed:", queue.length, "| awaiting owner approval:", awaiting.length, "| blocked:", blocked.length);
console.log("blockers by source:", JSON.stringify(bySource));
console.log("");
for (const a of queue) {
  console.log(a.status === "BLOCKED" ? "BLOCK" : "QUEUE", "|", String(a.qualifier.decision).padEnd(13), "|", a.title.slice(0, 48));
  for (const b of a.blockers) console.log("        -", b.kind, "(" + b.source + ")");
}
console.log("");
console.log("outbound actions taken:", 0);
