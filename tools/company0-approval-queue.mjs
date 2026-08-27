/**
 * Build the owner approval queue.
 *
 * Every candidate is assessed against three separate things, because they fail
 * independently and collapsing them hides which one actually binds:
 *
 *   1. Is it real, and is it a buyer? Some postings are suppliers advertising.
 *   2. Are we eligible to participate in the venue at all?
 *   3. Is the work worth doing at the stated price?
 *
 * Nothing here contacts anyone. The queue is a list of things awaiting the
 * owner's decision, and the owner's approval is required before any external
 * action of any kind.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";

const disc = JSON.parse(readFileSync(repoPath("var", "state", "company0-discovery-aligned.json"), "utf8"));
const MIN_ENGAGEMENT_USD = 500;

/**
 * Liveness checked directly against the source, not inferred from a discovery
 * summary. The discovery pass reported this posting with a budget, a scope and a
 * date; the page itself returns 410 Gone. Nothing reaches an owner without this
 * check, because the first run of this queue would otherwise have handed over a
 * dead listing described in convincing detail.
 */
const LIVENESS = {
  "https://www.craigslist.org/view/d/eastport-part-time-content-marketing/hZDgWh7Ak6cP7KkdEhh5Td": {
    checkedAt: "2026-08-26", result: "gone", detail: "HTTP 410 Gone. The posting has expired or been removed.",
  },
};

/** Venues whose own terms decide participation before any posting matters. */
const PLATFORM = /upwork|freelancer\.com|fiverr|alignerr|toptal|guru\.com|peopleperhour/i;
/** Postings that are somebody offering services rather than seeking them. */
const SUPPLIER_SIDE = /\[for hire\]|for hire|_forhire|\/consulting\b|our services/i;

function firstDollar(text) {
  const m = String(text || "").replace(/[‐-―−]/g, "-").match(/\$\s?([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

const assessed = disc.candidates.map((c) => {
  const hay = [c.title, c.url, c.organisation, c.summary].join(" ");
  const blockers = [];
  const notes = [];

  // 1. Is it a buyer at all?
  if (SUPPLIER_SIDE.test(hay)) {
    blockers.push({
      kind: "not_a_buyer",
      detail: "This reads as a supplier advertising services, or a firm's own services page, rather than someone seeking to hire.",
    });
  }

  // 2. Venue eligibility, which is separate from fitness for the work.
  if (PLATFORM.test(hay)) {
    blockers.push({
      kind: "channel_eligibility_unverified",
      detail: "This is a freelance marketplace. Marketplaces that handle payments commonly require account holders to be 18 or older. "
        + "That has NOT been verified against this platform's current terms and must be, before any time is spent. "
        + "If the requirement exists, this channel is closed -- and the only honest responses are a different channel, or an "
        + "adult account holder who is genuinely the contracting party. Creating an account that misstates age is not an option.",
    });
    notes.push("Account creation is the owner's action, never MIDAS's.");
  }

  // 3. Economics, judged against the company's own stated floor.
  const stated = firstDollar(c.stated_budget_text);
  const hourly = /hour|hr|\/h\b/i.test(String(c.stated_budget_text));
  if (stated != null && !hourly && stated < MIN_ENGAGEMENT_USD) {
    blockers.push({
      kind: "below_minimum_engagement",
      detail: "Stated at $" + stated + ", below the $" + MIN_ENGAGEMENT_USD + " floor. Below the floor, scoping, contracting, revisions and invoicing consume the job.",
    });
  }
  if (stated != null && hourly && stated < 20) {
    blockers.push({
      kind: "rate_below_viability",
      detail: "Stated at $" + stated + "/hour. Competing at that rate is a race against people who can live on it.",
    });
  }
  if (stated == null) notes.push("No budget stated on the page. Not an objection; it means the number is set in conversation.");

  // Liveness is a gate, not a note. An unchecked posting is not queueable.
  const live = LIVENESS[c.url];
  if (!live) {
    blockers.push({ kind: "liveness_unverified", detail: "The posting has not been fetched from its own source. A discovery summary is not evidence that a posting is still open." });
  } else if (live.result !== "live") {
    blockers.push({ kind: "posting_gone", detail: live.detail + " Checked " + live.checkedAt + "." });
  }

  return {
    title: c.title, organisation: c.organisation, url: c.url,
    liveness: live || { result: "unchecked" },
    statedBudget: c.stated_budget_text, howToApply: c.how_to_apply,
    blockers, notes,
    status: blockers.length === 0 ? "AWAITING_OWNER_APPROVAL" : "BLOCKED",
    // The single question that would resolve the most of these at once.
    decisiveQuestion: blockers.some((b) => b.kind === "channel_eligibility_unverified")
      ? "Does this platform permit an account holder under 18?" : null,
  };
});

const awaiting = assessed.filter((a) => a.status === "AWAITING_OWNER_APPROVAL");
const blocked = assessed.filter((a) => a.status === "BLOCKED");
const platformBlocked = blocked.filter((a) => a.blockers.some((b) => b.kind === "channel_eligibility_unverified"));

const out = {
  at: new Date().toISOString(),
  discipline: "No external action of any kind without explicit owner approval. Nothing here has been sent, applied to, or registered for.",
  outboundActionsTaken: 0,
  assessed: assessed.length,
  awaitingOwnerApproval: awaiting.length,
  blocked: blocked.length,
  blockedOnOneQuestion: platformBlocked.length,
  findings: [
    "The one candidate that cleared every other test was a dead posting. Discovery described it in convincing detail -- budget, scope, hours, how to apply -- and the page returns 410 Gone. Primary-source verification is now a gate on this queue rather than a later step.",
    "Discovery bypassed the promoted Opportunity Qualifier, which already carries an opportunity_expired disqualifier earned through the foundry. A trained worker existed for exactly this failure and the new path did not call it. That is an integration gap, not a knowledge gap.",
    "Seven of nine blocked candidates turn on a single unanswered question about platform age requirements. One answer opens or closes that entire channel.",
  ],
  preservedDecisions: [
    { id: "WI-39f6b3ce", decision: "NO-BID", note: "Idaho pursuit. Unchanged; the source-derived correction did not move it." },
    { id: "WI-77181040", decision: "BLOCKED", note: "Re-verification blocked by bot protection; remains demoted rather than queued." },
  ],
  queue: assessed,
};
writeFileSync(repoPath("var", "state", "company0-approval-queue.json"), JSON.stringify(out, null, 1));

console.log("assessed:", assessed.length, "| awaiting owner approval:", awaiting.length, "| blocked:", blocked.length);
console.log("of the blocked,", platformBlocked.length, "turn on one unanswered question.");
console.log("");
for (const a of assessed) {
  console.log(a.status === "BLOCKED" ? "BLOCK" : "QUEUE", "|", a.title.slice(0, 62));
  for (const b of a.blockers) console.log("        - " + b.kind);
}
console.log("");
console.log("outbound actions taken:", 0);
