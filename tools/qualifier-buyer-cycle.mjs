/**
 * Foundry cycle for the `not_a_buyer` taxonomy candidate.
 *
 * Three arms, because "the worker got better" has two explanations that need
 * separating: it might have learned when to use a new code, or it might simply
 * have been handed the code and used it.
 *
 *   oq-v2           the promoted worker. No code, no knowledge.
 *   oq-v2-schema3   control. Has the code available, no knowledge about it.
 *   oq-v3           candidate. Code plus the buyer-side rule.
 *
 * The criteria below are declared before any result is seen, and the false
 * positive rule has zero tolerance on purpose: a supplier-side posting wrongly
 * pursued costs one wasted assessment, while a genuine buyer wrongly labelled
 * not_a_buyer is silently deleted from the pipeline and nobody ever finds out.
 * Those errors are not worth the same and the gate should not pretend they are.
 *
 * Read-only with respect to the world. No outbound action.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { FileStore, stateDir, repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import {
  ensureQualifierVersion, buildQualifierRequest,
  QUALIFIER_V2_ID, QUALIFIER_V2_SCHEMA3_ID, QUALIFIER_V3_ID,
} from "../packages/eval/src/qualifier-foundry.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

loadWorkspaceEnv("ws-hemmer");
const store = new FileStore(stateDir());
for (const v of [QUALIFIER_V2_ID, QUALIFIER_V2_SCHEMA3_ID, QUALIFIER_V3_ID]) ensureQualifierVersion(store, v);

/**
 * Criteria, fixed before running. Anything loosened after seeing a result is
 * not a gate.
 */
const CRITERIA = {
  minRecallOnSealedSupplierSide: 0.8,
  maxFalsePositivesOnGenuineBuyers: 0,
  maxDecisionAccuracyDropVsControl: 2,
  requiresMarginOverControl: true,
  note: "A false positive deletes a real opportunity silently. A false negative costs one assessment. They are not weighted the same.",
};

function ev(id, text) { return { id, text, source: "posting", age_days: 2 }; }

/** Supplier-side records: somebody selling, not somebody buying. */
function supplier(id, title, body) {
  return {
    case_id: id, title, source: "job_board", url: "https://example.invalid/" + id,
    brief: body, gold: { isBuyer: false },
    facts: { posted_budget_usd: null, client_payment_verified: null, client_prior_hires: null, deadline_days: null, posted_days_ago: 2, contact_is_decision_maker: null, buyer_type: "unknown" },
    evidence: [ev("E1", body), ev("E2", "No request for proposals or applications appears in the record.")],
  };
}
/** Genuine buyers. A not_a_buyer label on any of these is a silent deletion. */
function buyer(id, title, body, budget) {
  return {
    case_id: id, title, source: "job_board", url: "https://example.invalid/" + id,
    brief: body, gold: { isBuyer: true },
    facts: { posted_budget_usd: budget, client_payment_verified: null, client_prior_hires: null, deadline_days: 21, posted_days_ago: 2, contact_is_decision_maker: null, buyer_type: "private_business" },
    evidence: [ev("E1", body), ev("E2", "The poster asks interested parties to get in touch.")],
  };
}

/** Development set. Used for inspection, never for the gate. */
const DEV = [
  supplier("DEV-S1", "[For Hire] Freelance automation specialist available", "Experienced automation specialist available for new projects. Open to hourly or fixed price. Message me for my portfolio."),
  supplier("DEV-S2", "Our web design services", "We build beautiful websites for small businesses. See our packages and book a free consultation today."),
  supplier("DEV-S3", "Content writer seeking clients", "Professional content writer with availability from next month. Rates from $60 per article. Accepting new clients."),
  buyer("DEV-B1", "Need a 5-page site for our clinic", "We are a small dental clinic and need a new 5-page website with an appointment enquiry form. Budget around $2,000.", 2000),
  buyer("DEV-B2", "Looking for help cleaning our customer list", "Our customer spreadsheet has 8,000 rows with duplicates and bad formatting. Looking to hire someone to clean and standardise it.", 900),
];

/**
 * Sealed set. Written once, hashed, and never inspected before the run. Only the
 * hash is committed; the cases live in gitignored state.
 */
const SEALED = [
  supplier("SEAL-S1", "Virtual assistant available for hire", "Reliable VA offering inbox management, scheduling and research. Flexible hours. DM to discuss rates."),
  supplier("SEAL-S2", "Consulting - workflow design and automation", "Our consulting practice helps organisations design and automate their internal workflows. Contact us to scope an engagement."),
  supplier("SEAL-S3", "Experienced SEO specialist taking on work", "Ten years in search. Currently have capacity for two more retainers. Portfolio on request."),
  supplier("SEAL-S4", "Agency roster - accepting new subcontractors", "We maintain a roster of vetted freelancers. Submit your details to be considered for future work."),
  supplier("SEAL-S5", "Directory listing: local web design firms", "A directory of web design companies serving the region. Browse listings by speciality."),
  buyer("SEAL-B1", "Wanted: someone to rebuild our booking flow", "Our online booking flow loses people at the payment step. We want to hire a developer to rebuild it. Budget $3,500.", 3500),
  buyer("SEAL-B2", "Seeking a writer for our monthly newsletter", "We publish a monthly newsletter and need a writer to take it over. Roughly 8 hours a month. $600 monthly.", 600),
  buyer("SEAL-B3", "Small business needs data enrichment", "We have 4,000 leads missing company size and industry. Looking to pay someone to enrich the list.", 1200),
  buyer("SEAL-B4", "RFP: association website redevelopment", "Our association is seeking proposals from vendors to redevelop our public website. Responses due in three weeks.", null),
  buyer("SEAL-B5", "Need automation between our CRM and invoicing", "Every invoice is currently entered twice. We want to hire someone to connect the two systems.", 1800),
];

const sealedDir = repoPath("var", "state", "sealed");
if (!existsSync(sealedDir)) mkdirSync(sealedDir, { recursive: true });
const sealedPath = sealedDir + "/qualifier-buyer-sealed-v1.json";
writeFileSync(sealedPath, JSON.stringify(SEALED, null, 1));
const sealedHash = createHash("sha256").update(JSON.stringify(SEALED)).digest("hex");

const provider = new OpenAIResponsesProvider(undefined, process.env.MIDAS_QUALIFIER_MODEL || "gpt-4.1");
let usd = 0;

async function runArm(versionId, cases) {
  const rows = [];
  for (const c of cases) {
    const presented = { ...c };
    delete presented.gold;
    const req = buildQualifierRequest(versionId, presented);
    try {
      const out = await provider.complete({ instructions: req.instructions, input: JSON.stringify(req.input), outputSchema: req.outputSchema });
      const u = out.usage || {};
      usd += estimateUsd(u.inputTokens, u.outputTokens);
      const text = String(out.text || "");
      const a = text.indexOf("{"), b = text.lastIndexOf("}");
      const parsed = a >= 0 ? JSON.parse(text.slice(a, b + 1)) : {};
      const codes = (parsed.disqualifiers || []).map((x) => (typeof x === "string" ? x : x.code));
      rows.push({ case_id: c.case_id, isBuyer: c.gold.isBuyer, decision: parsed.decision, codes });
    } catch (e) {
      rows.push({ case_id: c.case_id, isBuyer: c.gold.isBuyer, error: String(e.message).slice(0, 100) });
    }
  }
  return rows;
}

function score(rows) {
  const suppliers = rows.filter((r) => !r.isBuyer);
  const buyers = rows.filter((r) => r.isBuyer);
  const caught = suppliers.filter((r) => (r.codes || []).includes("not_a_buyer"));
  const declinedSuppliers = suppliers.filter((r) => r.decision === "decline");
  const falsePositives = buyers.filter((r) => (r.codes || []).includes("not_a_buyer"));
  const buyersWronglyDeclined = buyers.filter((r) => r.decision === "decline");
  return {
    supplierRecall: suppliers.length ? Number((caught.length / suppliers.length).toFixed(3)) : 0,
    supplierDeclineRate: suppliers.length ? Number((declinedSuppliers.length / suppliers.length).toFixed(3)) : 0,
    falsePositives: falsePositives.map((r) => r.case_id),
    buyersWronglyDeclined: buyersWronglyDeclined.map((r) => r.case_id),
    decisionAccuracy: Number((((declinedSuppliers.length + (buyers.length - buyersWronglyDeclined.length)) / rows.length) * 100).toFixed(2)),
  };
}

console.log("sealed set hash:", sealedHash.slice(0, 16), "| cases:", SEALED.length);
console.log("criteria declared before running:", JSON.stringify(CRITERIA));
console.log("");

const devCandidate = await runArm(QUALIFIER_V3_ID, DEV);
console.log("dev (candidate only, for inspection):", JSON.stringify(score(devCandidate)));
console.log("");

const arms = {};
for (const v of [QUALIFIER_V2_ID, QUALIFIER_V2_SCHEMA3_ID, QUALIFIER_V3_ID]) {
  arms[v] = { rows: await runArm(v, SEALED) };
  arms[v].score = score(arms[v].rows);
  console.log(v.padEnd(16), JSON.stringify(arms[v].score));
}

const control = arms[QUALIFIER_V2_SCHEMA3_ID].score;
const candidate = arms[QUALIFIER_V3_ID].score;

const checks = [
  { id: "recall_on_sealed", pass: candidate.supplierRecall >= CRITERIA.minRecallOnSealedSupplierSide, detail: "recall " + candidate.supplierRecall },
  { id: "no_false_positives", pass: candidate.falsePositives.length <= CRITERIA.maxFalsePositivesOnGenuineBuyers, detail: candidate.falsePositives.length + " false positives: " + (candidate.falsePositives.join(",") || "none") },
  { id: "accuracy_not_degraded", pass: candidate.decisionAccuracy >= control.decisionAccuracy - CRITERIA.maxDecisionAccuracyDropVsControl, detail: "candidate " + candidate.decisionAccuracy + " vs control " + control.decisionAccuracy },
  { id: "beats_having_the_code_alone", pass: !CRITERIA.requiresMarginOverControl || candidate.supplierRecall > control.supplierRecall, detail: "candidate recall " + candidate.supplierRecall + " vs control " + control.supplierRecall },
];
const promote = checks.every((c) => c.pass);

const out = {
  at: new Date().toISOString(),
  candidateCode: "not_a_buyer",
  placement: "Opportunity Qualifier taxonomy. Whether a record is a buyer is a judgement about the posting, which is this worker's job.",
  rejectedPlacement: {
    code: "channel_ineligible",
    decision: "NOT added to the worker taxonomy",
    reason: "Whether a venue permits the company to participate is a fact to be read from that venue's terms, not a judgement about a posting. Putting it in the worker would invite a model to state what a terms-of-service page says, and inventing the contents of one is a worse failure than the gap it closes. It stays in the gate layer, backed by verified data.",
  },
  sealedHash, sealedCases: SEALED.length, criteria: CRITERIA,
  arms: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, v.score])),
  dev: score(devCandidate),
  checks, promote,
  verdict: promote ? "PROMOTE oq-v3" : "REJECT oq-v3",
  reason: promote
    ? "The knowledge, not merely the code, produced the improvement, and no genuine buyer was silently deleted."
    : "Failed: " + checks.filter((c) => !c.pass).map((c) => c.id).join(", "),
  estimatedUsd: Number(usd.toFixed(4)),
  outboundActionsTaken: 0,
  perCase: { dev: devCandidate, sealed: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, v.rows])) },
};
writeFileSync(repoPath("var", "state", "qualifier-buyer-cycle.json"), JSON.stringify(out, null, 1));

console.log("");
for (const c of checks) console.log((c.pass ? "  PASS " : "  FAIL ") + c.id.padEnd(30) + c.detail);
console.log("");
console.log(out.verdict + " -- " + out.reason);
console.log("estimated $" + usd.toFixed(4));
