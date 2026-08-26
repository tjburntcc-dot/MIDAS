/**
 * Live demand discovery for a company, via provider web search.
 *
 * General by construction: the queries are built from the company's own
 * capability boundary and geography held on its workspace record, not from
 * anything Hemmer-specific. Pointing this at a different company with a
 * different boundary produces different searches.
 *
 * Discovery only. Nothing here contacts anyone. Items land in `discovered` and
 * every one carries the URL and the retrieved text it came from, so a later
 * qualification decision can be traced to a source rather than to a summary.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/company-discover.mjs <workspaceId> [maxQueries]
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { newWorkItem, workItemFingerprint, upsertDiscovered, listWorkItems } from "../packages/eval/src/work-item.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

const workspaceId = process.argv[2] || "ws-hemmer";
const maxQueries = Number(process.argv[3] || 4);

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const store = new FileStore(stateDir());
const ws = store.getWorkspace(workspaceId);
if (!ws) { console.error("no workspace " + workspaceId); process.exit(2); }

/** Queries derived from the company's stated offer and geography. */
function queriesFor(workspace) {
  const offers = String(workspace.offer || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const geo = workspace.geography && workspace.geography !== "remote" ? workspace.geography : "";
  const base = offers.length ? offers : ["digital services"];
  return base.slice(0, maxQueries).map((offer) =>
    "current open requests for proposals or paid engagements for " + offer + (geo ? " in " + geo : "") +
    ", posted recently, with a submission deadline still in the future. Return concrete named organisations with the URL of the posting.");
}

const DISCOVERY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["opportunities"],
  properties: {
    opportunities: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "organisation", "url", "summary", "posted_or_deadline_text", "stated_budget_text", "why_it_matches"],
        properties: {
          title: { type: "string" }, organisation: { type: "string" }, url: { type: "string" },
          summary: { type: "string" }, posted_or_deadline_text: { type: "string" },
          stated_budget_text: { type: "string" }, why_it_matches: { type: "string" },
        },
      },
    },
  },
};

const provider = new OpenAIResponsesProvider(undefined, process.env.MIDAS_DISCOVERY_MODEL || "gpt-4.1");
const queries = queriesFor(ws);
console.log("company:", ws.name, "| offer:", ws.offer);
console.log("queries derived from the company's own boundary:", queries.length);

let usd = 0;
let calls = 0;
const found = [];
for (const q of queries) {
  try {
    const c = await provider.complete({
      input: q,
      instructions:
        "Search the web for real, currently open opportunities matching the request. " +
        "Report only postings you actually found, with the real URL. Copy deadline and budget wording verbatim from the page; " +
        "if a page does not state one, say so rather than estimating. Never invent an organisation, a URL, a budget or a date.",
      tools: [{ type: "web_search" }],
      outputSchema: { name: "discovered_opportunities", strict: false, schema: DISCOVERY_SCHEMA },
    });
    calls += 1;
    const u = c.usage || {};
    usd += estimateUsd(u.inputTokens, u.outputTokens);
    const text = String(c.text || "");
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a < 0 || b < a) { console.log("  no JSON returned for a query"); continue; }
    const parsed = JSON.parse(text.slice(a, b + 1));
    for (const o of parsed.opportunities || []) found.push({ ...o, query: q });
    console.log("  +" + (parsed.opportunities || []).length + " candidates");
  } catch (e) {
    console.log("  query failed:", String(e.message).slice(0, 100));
  }
}

/** Everything with a usable URL is retained. Ranking happens later; nothing is dropped for being unexciting. */
const items = [];
for (const o of found) {
  const url = String(o.url || "").trim();
  if (!/^https?:\/\//i.test(url)) continue;
  const fingerprint = workItemFingerprint({ workspaceId, type: "commercial_opportunity", url, title: o.title });
  items.push({
    ...newWorkItem({
      workspaceId, type: "commercial_opportunity",
      title: String(o.title || "").slice(0, 160),
      objective: "Convert into paid work if it qualifies",
      source: { kind: "web_search", url, discoveredAt: new Date().toISOString(), note: o.organisation || null },
      evidence: [
        { id: "E1", text: String(o.summary || "").slice(0, 600), source: "posting", url },
        { id: "E2", text: "Deadline or posting date as stated: " + String(o.posted_or_deadline_text || "not stated"), source: "posting", url },
        { id: "E3", text: "Budget as stated: " + String(o.stated_budget_text || "not stated"), source: "posting", url },
      ],
      inputs: { organisation: o.organisation, why_it_matches: o.why_it_matches, query: o.query },
    }),
    fingerprint,
  });
}

const before = listWorkItems(store, workspaceId).length;
const result = upsertDiscovered(store, items);
const report = {
  at: new Date().toISOString(), workspaceId, company: ws.name,
  queries, candidatesReturned: found.length, withUsableUrl: items.length,
  inserted: result.inserted.length, duplicatesSkipped: result.duplicates.length,
  populationBefore: before, populationAfter: listWorkItems(store, workspaceId).length,
  modelCalls: calls, usdEstimate: Number(usd.toFixed(4)),
  note: "Discovery only. No opportunity was contacted. Every item carries the source URL and the retrieved wording.",
};
writeFileSync(join(stateDir(), "company-discovery.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("\ncandidates " + found.length + " | usable " + items.length + " | inserted " + result.inserted.length +
  " | duplicates " + result.duplicates.length + " | population " + report.populationAfter);
console.log("usd", report.usdEstimate);
