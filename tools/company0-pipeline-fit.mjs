/**
 * Readiness-adjusted assessment of the real pipeline.
 *
 * Every open opportunity is scored against what Company 0 can currently
 * evidence. Nothing is deleted. A blocked opportunity keeps its unlock path,
 * because the pattern across blocked items is usually more informative than any
 * single one of them.
 *
 * Read-only. No outbound action.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { assessOpportunityFit, rankByReadiness } from "../packages/eval/src/readiness.ts";

const items = JSON.parse(readFileSync(repoPath("var", "state", "company0-readiness.json"), "utf8")).items;
const work = JSON.parse(readFileSync(repoPath("var", "state", "work_items.json"), "utf8"));
const open = work.filter((w) => w.state === "qualifying" || w.state === "blocked");

/**
 * What a buyer of this shape requires before they can pay anyone.
 *
 * Derived from the buyer, not from the work. A five-page website for a school
 * district and the same site for a local business need identical skills and
 * completely different paperwork.
 */
function requiredCapabilities(w) {
  const hay = [w.title, w.source?.note || "", ...(w.evidence || []).map((e) => e.text)].join(" ").toLowerCase();
  const caps = new Set(["onboard_client", "invoice_and_collect", "quote_confidently"]);

  const publicSector = /(city|county|state of|school district|isd|municipal|public|government|department of|authority|district)/.test(hay);
  const institutional = /(university|college|hospital|health system|foundation|association|nonprofit)/.test(hay);
  const enterprise = /(enterprise|national|platform|corporation|inc\.|holdings)/.test(hay);

  if (publicSector) { caps.add("bid_public_sector"); caps.add("sign_binding_contract"); caps.add("evidence_past_work"); }
  if (institutional || enterprise) { caps.add("bid_enterprise"); caps.add("sign_binding_contract"); caps.add("evidence_past_work"); }
  if (/(data|records|directory|member|customer|student|patient|invoice)/.test(hay)) caps.add("handle_personal_data");
  if (/(consult|advisory|assessment|study)/.test(hay)) caps.add("evidence_past_work");
  if (!publicSector && !institutional && !enterprise) caps.add("sign_binding_contract");

  return { caps: [...caps], channel: publicSector ? "public_procurement" : institutional ? "institutional" : enterprise ? "enterprise" : "private_direct" };
}

const assessed = open.map((w) => {
  const { caps, channel } = requiredCapabilities(w);
  const fit = assessOpportunityFit({ opportunityId: w.id, requiredCapabilities: caps, items });
  return { ...fit, title: w.title, state: w.state, channel, url: w.source?.url, buyer: w.source?.note };
});

const ranked = rankByReadiness(assessed);
const byChannel = {};
for (const a of assessed) byChannel[a.channel] = (byChannel[a.channel] || 0) + 1;

const eligible = ranked.filter((a) => a.eligibleNow);
const blocked = ranked.filter((a) => !a.eligibleNow);

// The pattern across blocked items, which is the finding that matters more than
// any single opportunity.
const blockerFrequency = {};
for (const a of blocked) for (const u of a.unlockPath) blockerFrequency[u.requirement] = (blockerFrequency[u.requirement] || 0) + 1;
const topBlockers = Object.entries(blockerFrequency).sort((a, b) => b[1] - a[1]);

const out = {
  at: new Date().toISOString(),
  openOpportunities: open.length,
  eligibleNow: eligible.length,
  blocked: blocked.length,
  byChannel,
  topBlockers: topBlockers.map(([requirement, count]) => ({ requirement, blocksOpportunities: count })),
  ranked,
  note: "Nothing deleted. Ranking is presentation and prioritisation.",
  outboundActionsTaken: 0,
};
writeFileSync(repoPath("var", "state", "company0-pipeline-fit.json"), JSON.stringify(out, null, 1));

console.log("open opportunities:", open.length, "| eligible today:", eligible.length, "| blocked:", blocked.length);
console.log("by channel:", JSON.stringify(byChannel));
console.log("");
console.log("What blocks the most:");
for (const [req, n] of topBlockers) console.log("  " + String(n).padStart(2) + " opportunities <- " + req);
console.log("");
console.log("Ranked:");
for (const a of ranked) {
  console.log(" ", (a.eligibleNow ? "OPEN " : "BLOCK"), a.channel.padEnd(20), a.title.slice(0, 52).padEnd(54), "missing:" + a.missing.length);
}
