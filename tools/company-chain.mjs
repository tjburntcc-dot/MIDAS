/**
 * The multi-worker Company 0 chain.
 *
 *   research (or-v3, production eligible)
 *     -> re-qualify (oq-v2, promoted)
 *       -> commercial draft (cd-v0, development)
 *         -> independent audit (au-v0, development)
 *           -> awaiting_approval
 *
 * Nothing is sent. The chain stops at the approval queue by construction: there
 * is no transport in this file, and the only state an item can reach is
 * `awaiting_approval`.
 *
 * The commercial drafter and the auditor are honestly labelled development
 * status. They have not been through a sealed promotion, which is why their
 * output is gated behind both an independent audit and owner approval rather
 * than being trusted on its own. The researcher is the worker that earned
 * production eligibility this mission.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/company-chain.mjs <workspaceId> [maxItems]
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir, contentHash } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import { listWorkItems, putWorkItem, transition, expectedValueScore, rankWorkItems } from "../packages/eval/src/work-item.ts";
import { OPPORTUNITY_RESEARCHER_SPEC } from "../packages/eval/src/opportunity-researcher.ts";
import { buildQualifierRequest, ensureQualifierVersion, qualifierSpec } from "../packages/eval/src/qualifier-foundry.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

const workspaceId = process.argv[2] || "ws-hemmer";
const maxItems = Number(process.argv[3] || 100);

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const store = new FileStore(stateDir());
const ws = store.getWorkspace(workspaceId);
const model = "gpt-4.1";
const provider = new OpenAIResponsesProvider(undefined, model);
let usd = 0;
let calls = 0;

const RETRYABLE = /\b(429|500|502|503|504)\b|rate_limit|overloaded|timeout|ETIMEDOUT|ECONNRESET|UND_ERR_SOCKET|fetch failed|socket hang up/i;
async function ask(instructions, input, schema) {
  let last = null;
  for (let a = 0; a < 5; a += 1) {
    try {
      const c = await provider.complete({ input, instructions, outputSchema: { name: "out", strict: false, schema } });
      const u = c.usage || {};
      calls += 1;
      const cost = estimateUsd(u.inputTokens, u.outputTokens);
      usd += cost;
      const check = validateAgainstSchema(c.text, schema);
      return { ok: check.ok, value: check.value, cost };
    } catch (e) {
      last = e;
      if (!RETRYABLE.test(String(e && e.message))) throw e;
      await new Promise((r) => setTimeout(r, Math.min(20000, 2000 * Math.pow(2, a))));
    }
  }
  throw last;
}

function textOf(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/[ ]/g, " ").replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------ 1. research
const researcher = store.getVersion("or-v3");
const held = listWorkItems(store, workspaceId).filter((w) => w.state === "qualifying" && w.source && w.source.url).slice(0, maxItems);
console.log("researching " + held.length + " held items with or-v3");
let researched = 0;
for (const w of held) {
  let html = "";
  try {
    const r = await fetch(w.source.url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    if (r.ok) html = await r.text();
  } catch { html = ""; }
  if (!html) continue;
  const page = textOf(html).slice(0, 12000);
  if (page.length < 400) continue;
  const res = await ask(
    researcher.promptBundle.system + "\n\n" + researcher.promptBundle.developer,
    { posting: { case_id: w.id, title: w.title, source_url: w.source.url, page_text: page } },
    OPPORTUNITY_RESEARCHER_SPEC.outputSchema,
  );
  if (!res.ok) continue;
  const f = res.value.facts || {};
  const evidence = w.evidence.concat([{
    id: "E-RESEARCH", source: "opportunity_researcher", url: w.source.url,
    text: ["budget", "deadline", "contact"].map((k) => k + ": " + (f[k] && f[k].stated ? String(f[k].value).slice(0, 120) : "not stated in the source")).join(" | "),
  }]);
  putWorkItem(store, {
    ...w, evidence,
    outputs: { ...w.outputs, research: res.value },
    cost: { ...w.cost, usd: w.cost.usd + res.cost, modelCalls: w.cost.modelCalls + 1 },
    updatedAt: new Date().toISOString(),
  });
  researched += 1;
}
console.log("  researched " + researched);

// -------------------------------------------------------- 2. re-qualify
const qv = ensureQualifierVersion(store, "oq-v2");
const qspec = qualifierSpec(qv.specVersion || "v4");
const toRequalify = listWorkItems(store, workspaceId).filter((w) => w.state === "qualifying" && w.outputs && w.outputs.research);
console.log("re-qualifying " + toRequalify.length + " items with newly recovered facts");
let nowQualified = 0;
let nowDeclined = 0;
for (const w of toRequalify) {
  const r = w.outputs.research;
  const budget = r.facts?.budget?.stated ? String(r.facts.budget.value) : null;
  const numeric = budget ? Number(String(budget).replace(/[^0-9.]/g, "")) : null;
  const record = {
    case_id: w.id, title: w.title, source: "rfp",
    brief: r.scope_summary || w.title,
    facts: {
      posted_budget_usd: Number.isFinite(numeric) && numeric > 0 ? numeric : null,
      client_payment_verified: null,
      deadline_stated: Boolean(r.facts?.deadline?.stated),
      contact_stated: Boolean(r.facts?.contact?.stated),
    },
    evidence: w.evidence.map((e) => ({ id: e.id, text: e.text, source: e.source || "posting", age_days: 1 })),
  };
  const req = buildQualifierRequest("oq-v2", record);
  const res = await ask(req.instructions, req.input, qspec.outputSchema);
  if (!res.ok) continue;
  const out = res.value;
  const economics = {
    expectedValueUsd: out.estimated_value_usd ? (Number(out.estimated_value_usd.low) + Number(out.estimated_value_usd.high)) / 2 : null,
    closeProbabilityPct: out.close_probability_pct, paymentProbabilityPct: out.payment_probability_pct,
    aiFulfilmentPct: out.ai_fulfillment_pct, humanMinutes: out.human_minutes,
    riskPct: out.fraud_risk === "high" ? 70 : out.fraud_risk === "medium" ? 30 : 10, daysToCash: 30,
  };
  const to = out.decision === "pursue" ? "qualified" : out.decision === "decline" ? "declined" : null;
  if (!to) { putWorkItem(store, { ...w, economics, outputs: { ...w.outputs, requalify: out } }); continue; }
  const moved = transition({ ...w, economics }, {
    to, by: "worker", reason: String(out.rationale || "").slice(0, 400),
    workerRoleId: "opportunity_qualifier", workerVersionId: "oq-v2",
    evidenceRefs: out.cited_evidence_ids || [], output: out,
    costUsd: res.cost, modelCalls: 1, model,
  });
  putWorkItem(store, { ...moved, priority: Number(expectedValueScore(moved).score.toFixed(4)) });
  if (to === "qualified") nowQualified += 1; else nowDeclined += 1;
}
console.log("  newly qualified " + nowQualified + " | newly declined " + nowDeclined);

// ------------------------------------------- 3. commercial draft + audit
const DRAFT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["channel", "subject", "message", "scope_offered", "price_basis", "next_action", "assumptions", "claims_made"],
  properties: {
    channel: { type: "string" }, subject: { type: "string" }, message: { type: "string" },
    scope_offered: { type: "string" }, price_basis: { type: "string" }, next_action: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    claims_made: { type: "array", items: { type: "string" } },
  },
};
const AUDIT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["verdict", "unsupported_claims", "fabrications", "compliance_issues", "reasons"],
  properties: {
    verdict: { enum: ["pass", "fail"] },
    unsupported_claims: { type: "array", items: { type: "string" } },
    fabrications: { type: "array", items: { type: "string" } },
    compliance_issues: { type: "array", items: { type: "string" } },
    reasons: { type: "string" },
  },
};

const DRAFTER = {
  id: "cd-v0", status: "development",
  instructions:
    "You draft one outbound message for a qualified opportunity on behalf of a small digital services business.\n\n" +
    "Company: " + ws.name + ". Capabilities: " + ws.offer + ". Constraints: " + ws.constraints + "\n\n" +
    "Rules that override any instinct to sound impressive. Use only facts present in the supplied record. " +
    "You have no portfolio, no named clients, no case studies and no prior work with this buyer, so claim none. " +
    "Do not assert a problem with their current website or operations that the record does not state. " +
    "Do not invent urgency, experience, team size, or technical ability. " +
    "If the price basis is not derivable from a stated budget, say what you would need to quote rather than naming a number. " +
    "List every claim you make in claims_made so it can be checked against the record. Be brief and specific.",
};
const AUDITOR = {
  id: "au-v0", status: "development",
  instructions:
    "You are an independent auditor. You did not write the draft and your job is to try to falsify it, not to improve it.\n\n" +
    "Check every claim in the draft against the opportunity record supplied. Fail the draft if it: states a fact the record does not contain; " +
    "claims experience, clients, portfolio or results that are not evidenced; asserts a problem the buyer did not describe; " +
    "invents urgency or a deadline; names a price with no stated basis; promises work outside the stated capability boundary; " +
    "or misrepresents who is writing. Passing a draft that contains an unsupported claim is the failure that matters most here. " +
    "Return fail with specifics if anything is unsupported.",
};

const qualified = rankWorkItems(listWorkItems(store, workspaceId).filter((w) => w.state === "qualified")).map((r) => r.item);
console.log("drafting and auditing " + qualified.length + " qualified items");
let awaiting = 0;
let auditFailed = 0;
for (const w of qualified) {
  const record = {
    title: w.title, source_url: w.source?.url || null,
    evidence: w.evidence.map((e) => ({ id: e.id, text: e.text })),
    research: w.outputs?.research || null,
    qualification: w.outputs?.qualified || w.outputs?.requalify || null,
    company_capabilities: ws.offer, company_constraints: ws.constraints,
  };
  const draft = await ask(DRAFTER.instructions, { opportunity: record }, DRAFT_SCHEMA);
  if (!draft.ok) continue;
  let moved = transition(w, {
    to: "ready_for_work", by: "worker", reason: "Qualified and ranked for commercial work.",
    workerRoleId: "commercial_drafter", workerVersionId: DRAFTER.id, costUsd: draft.cost, modelCalls: 1, model,
  });
  moved = transition(moved, {
    to: "working", by: "worker", reason: "Outbound draft produced.",
    workerRoleId: "commercial_drafter", workerVersionId: DRAFTER.id, output: draft.value,
  });
  const audit = await ask(AUDITOR.instructions, { opportunity_record: record, draft: draft.value }, AUDIT_SCHEMA);
  const verdict = audit.ok ? audit.value : { verdict: "fail", reasons: "Auditor output unusable.", unsupported_claims: [], fabrications: [], compliance_issues: [] };
  if (verdict.verdict === "pass") {
    moved = transition(moved, {
      to: "awaiting_approval", by: "worker",
      reason: "Independent audit passed. Held for owner approval; nothing has been sent.",
      workerRoleId: "commercial_auditor", workerVersionId: AUDITOR.id,
      output: verdict, auditStatus: "passed", externalActionStatus: "pending_owner_approval",
      costUsd: audit.cost || 0, modelCalls: 1, model,
    });
    awaiting += 1;
  } else {
    moved = transition(moved, {
      to: "audit_failed", by: "worker",
      reason: String(verdict.reasons || "Audit failed.").slice(0, 400),
      workerRoleId: "commercial_auditor", workerVersionId: AUDITOR.id,
      output: verdict, auditStatus: "failed", costUsd: audit.cost || 0, modelCalls: 1, model,
    });
    auditFailed += 1;
  }
  putWorkItem(store, moved);
}

const population = listWorkItems(store, workspaceId);
const byState = population.reduce((a, w) => { a[w.state] = (a[w.state] || 0) + 1; return a; }, {});
const report = {
  at: new Date().toISOString(), workspaceId,
  workers: [
    { roleId: "opportunity_researcher", versionId: "or-v3", status: "production_eligible" },
    { roleId: "opportunity_qualifier", versionId: "oq-v2", status: "promoted" },
    { roleId: "commercial_drafter", versionId: "cd-v0", status: "development" },
    { roleId: "commercial_auditor", versionId: "au-v0", status: "development" },
  ],
  researched, newlyQualified: nowQualified, newlyDeclined: nowDeclined,
  awaitingApproval: awaiting, auditFailed,
  population: population.length, byState,
  modelCalls: calls, usdEstimate: Number(usd.toFixed(4)),
  outboundActionsTaken: 0,
  note: "No message was sent. There is no transport in this pipeline; awaiting_approval is the terminal state it can reach.",
};
writeFileSync(join(stateDir(), "company-chain.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("\nawaiting_approval " + awaiting + " | audit_failed " + auditFailed);
console.log("population " + population.length + " " + JSON.stringify(byState));
console.log("model calls " + calls + " | usd " + report.usdEstimate + " | outbound actions 0");
