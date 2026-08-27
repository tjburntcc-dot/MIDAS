/**
 * Readiness-aligned discovery.
 *
 * The existing discovery asks the web for "requests for proposals". That is why
 * every one of the thirteen open opportunities is formal procurement, and why
 * none of them is winnable: a company with no verified entity, no vendor
 * registration, no insurance and no delivered work is furthest from exactly that
 * tier. The search was well executed and pointed at the wrong pond.
 *
 * Queries here are derived from what the company can currently evidence, not
 * only from what it sells. When readiness improves, the queries should move
 * upmarket on their own.
 *
 * Discovery only. Nothing is contacted, and nothing leaves this machine except
 * search queries.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { FileStore, stateDir, repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { estimateUsd } from "../packages/eval/src/spend.ts";

const workspaceId = "ws-hemmer";
loadWorkspaceEnv(workspaceId);
const store = new FileStore(stateDir());
const ws = store.getWorkspace(workspaceId);

const readiness = JSON.parse(readFileSync(repoPath("var", "state", "company0-readiness.json"), "utf8"));
const canBidPublic = readiness.profile.availableCapabilities.includes("bid_public_sector");
const canBidEnterprise = readiness.profile.availableCapabilities.includes("bid_enterprise");
const hasPastWork = readiness.profile.availableCapabilities.includes("evidence_past_work");

/**
 * Constraints stated to the search rather than filtered afterwards. Asking for
 * work that requires vendor registration and then discarding it wastes the
 * search; asking for work that does not is the same cost and returns more.
 */
const exclusions = [
  !canBidPublic ? "Exclude anything requiring vendor registration, a government supplier portal, a bid bond, or a formal public procurement process." : "",
  !canBidEnterprise ? "Exclude enterprise procurement, anything requiring an insurance certificate, and anything requiring a signed master services agreement with a large organisation." : "",
  !hasPastWork ? "Exclude anything requiring references, case studies, or a minimum number of years in business." : "",
].filter(Boolean).join(" ");

const offers = String(ws.offer || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);

const QUERIES = [
  "Small businesses and small organisations currently advertising paid freelance work for " + (offers[0] || "website development") +
    ", where an individual freelancer can be hired directly without a procurement process. Budgets between $500 and $3,000.",
  "Currently open paid freelance listings for " + (offers[1] || "written content and SEO") +
    " that a solo freelancer can apply to directly, posted within the last month.",
  "Currently open paid freelance or contract listings for " + (offers[2] || "data cleanup and enrichment") +
    " suitable for an individual contractor working remotely, with a stated budget.",
  "Small organisations that have publicly posted in the last month that they need help with " + (offers[3] || "workflow automation") +
    ", where the posting names a contact and does not require a formal bid.",
];

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["opportunities"],
  properties: {
    opportunities: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "organisation", "url", "summary", "posted_or_deadline_text", "stated_budget_text", "how_to_apply", "requires_procurement_process"],
        properties: {
          title: { type: "string" }, organisation: { type: "string" }, url: { type: "string" },
          summary: { type: "string" }, posted_or_deadline_text: { type: "string" },
          stated_budget_text: { type: "string" }, how_to_apply: { type: "string" },
          requires_procurement_process: { type: "string" },
        },
      },
    },
  },
};

const provider = new OpenAIResponsesProvider(undefined, process.env.MIDAS_DISCOVERY_MODEL || "gpt-4.1");
console.log("readiness-aligned discovery for:", ws.name);
console.log("excluded tiers:", [!canBidPublic && "public procurement", !canBidEnterprise && "enterprise", !hasPastWork && "reference-gated"].filter(Boolean).join(", "));
console.log("");

let usd = 0, calls = 0;
const found = [];
for (const q of QUERIES) {
  try {
    const c = await provider.complete({
      input: q + " " + exclusions,
      instructions:
        "Search the web for real, currently open opportunities. Report only postings you actually found, with the real URL. " +
        "Copy deadline, budget and application wording verbatim from the page; if the page does not state one, say so rather than estimating. " +
        "Never invent an organisation, a URL, a budget, a date or a contact. " +
        "For requires_procurement_process, say yes or no and quote the wording that shows it.",
      tools: [{ type: "web_search" }],
      outputSchema: { name: "aligned_opportunities", strict: false, schema: SCHEMA },
    });
    calls += 1;
    const u = c.usage || {};
    usd += estimateUsd(u.inputTokens, u.outputTokens);
    const text = String(c.text || "");
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a < 0 || b < a) { console.log("  no JSON for a query"); continue; }
    const parsed = JSON.parse(text.slice(a, b + 1));
    for (const o of parsed.opportunities || []) found.push({ ...o, query: q });
    console.log("  +" + (parsed.opportunities || []).length + " candidates");
  } catch (e) {
    console.log("  query failed:", String(e.message).slice(0, 120));
  }
}

const withUrl = found.filter((o) => /^https?:\/\//i.test(String(o.url || "").trim()));
const out = {
  at: new Date().toISOString(), workspaceId,
  channelAlignment: "Queries derived from what the company can currently evidence, not only from what it sells.",
  excluded: { publicProcurement: !canBidPublic, enterprise: !canBidEnterprise, referenceGated: !hasPastWork },
  queries: QUERIES, calls, estimatedUsd: Number(usd.toFixed(4)),
  candidates: withUrl,
  discardedWithoutUrl: found.length - withUrl.length,
  outboundActionsTaken: 0,
  note: "Discovery only. Nothing verified yet, nothing contacted, nothing queued for approval from this file alone.",
};
writeFileSync(repoPath("var", "state", "company0-discovery-aligned.json"), JSON.stringify(out, null, 1));

console.log("");
console.log("candidates with a usable URL:", withUrl.length, "| calls:", calls, "| estimated $" + usd.toFixed(4));
for (const o of withUrl) {
  console.log("");
  console.log(" ", o.title.slice(0, 80));
  console.log("   org:", String(o.organisation).slice(0, 60), "| procurement:", String(o.requires_procurement_process).slice(0, 40));
  console.log("   budget:", String(o.stated_budget_text).slice(0, 70));
  console.log("   ", o.url.slice(0, 100));
}
