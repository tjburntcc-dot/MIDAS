/**
 * Extend the Opportunity Qualifier case sets with expiry coverage.
 *
 * The v0 sets are left on disk untouched so the promoted-v1 evidence stays
 * reproducible. This writes dev v1 and sealed v1 as new files.
 *
 * Coverage is deliberately two-sided. Expired cases test that the worker records
 * `opportunity_expired`; live cases with a near or absent deadline test that it
 * does not start declaring things expired because the code now exists. One case
 * reproduces the exact live failure: a past deadline on a record that states no
 * budget at all, where `below_minimum_value` is a fabricated basis.
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { repoPath, stateDir } from "@midas/db";

const ev = (id, text, source, ageDays) => ({ id, text, source: source || "opportunity_post", age_days: ageDays == null ? 1 : ageDays });

const DEV_EXPIRY = [
  {
    case_id: "OQ-D13", title: "Redesign RFP whose deadline passed two months ago", source: "rfp",
    brief: "Regional association seeks proposals for a website redesign. Proposals were due by 5 p.m. on a date that has now passed by roughly sixty days. Budget stated as 14000 USD.",
    facts: { posted_budget_usd: 14000, client_payment_verified: true, deadline_days: -60, posted_days_ago: 95 },
    evidence: [
      ev("E1", "Proposals for the website redesign were due at 5 p.m., a date now sixty days in the past.", "rfp", 95),
      ev("E2", "The stated budget for the engagement is 14000 USD.", "rfp", 95),
    ],
    gold: {
      decision: "decline", disqualifiers: ["opportunity_expired"],
      bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null },
      required_missing: [],
      rationale: "In scope, well funded, real buyer, but the submission window closed. Value is not estimable for an engagement that cannot be entered.",
    },
  },
  {
    case_id: "OQ-D14", title: "Expired posting that states no budget at all", source: "rfp",
    brief: "A professional chapter sought a website redesign. Submissions closed on a date now long past. The posting states no budget figure anywhere.",
    facts: { posted_budget_usd: null, client_payment_verified: null, deadline_days: -210, posted_days_ago: 235 },
    evidence: [
      ev("E1", "Submissions were to be sent by a deadline now two hundred and ten days in the past, and late submissions would not be considered.", "rfp", 235),
      ev("E2", "The posting states no budget figure.", "rfp", 235),
    ],
    gold: {
      decision: "decline", disqualifiers: ["opportunity_expired"],
      bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null },
      required_missing: [],
      rationale: "Reproduces the live failure. The reason is the closed window. No value is stated, so a value-floor breach cannot be asserted.",
    },
  },
  {
    case_id: "OQ-D15", title: "Open posting with a deadline three weeks out", source: "rfp",
    brief: "A public agency published a website redesign and accessibility RFP last week. Submittals are due in about three weeks. A named project manager is listed for questions. No budget figure is given.",
    facts: { posted_budget_usd: null, client_payment_verified: null, deadline_days: 21, posted_days_ago: 6, buyer_type: "public_agency" },
    evidence: [
      ev("E1", "Submittals must be received by the principal contact in approximately three weeks.", "rfp", 6),
      ev("E2", "A named project manager is listed to receive questions about the solicitation.", "rfp", 6),
      ev("E3", "The notice states no budget figure.", "rfp", 6),
    ],
    gold: {
      decision: "hold_for_info", disqualifiers: [],
      bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null },
      required_missing: ["budget"],
      rationale: "Live and in scope. A deadline that is merely near is not expiry. The blocker is the missing budget.",
    },
  },
  {
    case_id: "OQ-D16", title: "Rolling engagement with no stated deadline", source: "inbound_email",
    brief: "A returning client asks for ongoing monthly content support starting whenever we have capacity. They mention 1500 USD per month. No deadline is stated because the engagement is rolling.",
    facts: { posted_budget_usd: 1500, client_payment_verified: true, deadline_days: null, posted_days_ago: 2 },
    evidence: [
      ev("E1", "The engagement is ongoing monthly content support beginning when capacity allows.", "inbound_email", 2),
      ev("E2", "The buyer mentions 1500 USD per month and has paid on prior engagements.", "inbound_email", 2),
    ],
    gold: {
      decision: "pursue", disqualifiers: [],
      bands: { estimated_value_usd: { low: 1100, high: 2000 }, ai_fulfillment_pct: { low: 70, high: 100 }, human_minutes: { low: 30, high: 300 } },
      required_missing: [],
      rationale: "An absent deadline on a rolling engagement is not expiry. Guards against reading a null deadline as a closed window.",
    },
  },
];

const SEALED_EXPIRY = [
  {
    case_id: "OQ-S19", title: "Municipal CMS migration closed last quarter", source: "rfp",
    brief: "A city published a CMS migration solicitation with a submission deadline that has now passed by about ninety days. The stated budget was 22000 USD.",
    facts: { posted_budget_usd: 22000, client_payment_verified: true, deadline_days: -90, posted_days_ago: 130 },
    evidence: [
      ev("E1", "The submission deadline for the CMS migration passed approximately ninety days ago.", "rfp", 130),
      ev("E2", "The solicitation stated a budget of 22000 USD.", "rfp", 130),
    ],
    gold: { decision: "decline", disqualifiers: ["opportunity_expired"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] },
  },
  {
    case_id: "OQ-S20", title: "Closed content RFP with no figure anywhere", source: "rfp",
    brief: "A trade body sought a content refresh. Responses closed on a date now well past. The posting contains no budget or value figure of any kind.",
    facts: { posted_budget_usd: null, client_payment_verified: null, deadline_days: -150, posted_days_ago: 180 },
    evidence: [
      ev("E1", "Responses closed on a date now one hundred and fifty days in the past.", "rfp", 180),
      ev("E2", "No budget or value figure appears anywhere in the posting.", "rfp", 180),
    ],
    gold: { decision: "decline", disqualifiers: ["opportunity_expired"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] },
  },
  {
    case_id: "OQ-S21", title: "Expired and also out of scope", source: "rfp",
    brief: "A hospital network sought a native mobile application with real-time video consultation. The response deadline passed forty days ago. Budget was 60000 USD.",
    facts: { posted_budget_usd: 60000, client_payment_verified: true, deadline_days: -40, posted_days_ago: 70 },
    evidence: [
      ev("E1", "The requirement is a native mobile application with real-time video consultation.", "rfp", 70),
      ev("E2", "The response deadline passed forty days ago.", "rfp", 70),
    ],
    gold: { decision: "decline", disqualifiers: ["opportunity_expired", "out_of_scope_capability"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] },
  },
  {
    case_id: "OQ-S22", title: "Open solicitation closing in nine days", source: "rfp",
    brief: "A county library district posted a website refresh solicitation eleven days ago. Proposals are due in nine days. Budget stated as 16000 USD. A procurement officer is named.",
    facts: { posted_budget_usd: 16000, client_payment_verified: true, deadline_days: 9, posted_days_ago: 11 },
    evidence: [
      ev("E1", "Proposals for the website refresh are due in nine days.", "rfp", 11),
      ev("E2", "The stated budget is 16000 USD and a procurement officer is named as the contact.", "rfp", 11),
    ],
    gold: { decision: "pursue", disqualifiers: [], bands: { estimated_value_usd: { low: 12000, high: 20000 }, ai_fulfillment_pct: { low: 50, high: 90 }, human_minutes: { low: 240, high: 1200 } }, required_missing: [] },
  },
  {
    case_id: "OQ-S23", title: "Deadline closing tomorrow", source: "rfp",
    brief: "A community foundation posted a landing page and donation flow project. Submissions close tomorrow. Budget stated as 4000 USD.",
    facts: { posted_budget_usd: 4000, client_payment_verified: true, deadline_days: 1, posted_days_ago: 20 },
    evidence: [
      ev("E1", "Submissions for the landing page and donation flow project close tomorrow.", "rfp", 20),
      ev("E2", "The stated budget is 4000 USD.", "rfp", 20),
    ],
    gold: { decision: "pursue", disqualifiers: [], bands: { estimated_value_usd: { low: 3000, high: 5200 }, ai_fulfillment_pct: { low: 60, high: 95 }, human_minutes: { low: 60, high: 480 } }, required_missing: [] },
  },
  {
    case_id: "OQ-S24", title: "Old posting with an explicitly open window", source: "job_board",
    brief: "A posting from six months ago states that applications remain open until the role is filled and the listing is still marked active. Ongoing SEO content work, 1900 USD monthly.",
    facts: { posted_budget_usd: 1900, client_payment_verified: true, deadline_days: null, posted_days_ago: 180 },
    evidence: [
      ev("E1", "The listing states applications remain open until filled and is still marked active.", "opportunity_post", 180),
      ev("E2", "The engagement is ongoing SEO content work at 1900 USD monthly.", "opportunity_post", 180),
    ],
    gold: { decision: "pursue", disqualifiers: [], bands: { estimated_value_usd: { low: 1400, high: 2500 }, ai_fulfillment_pct: { low: 70, high: 100 }, human_minutes: { low: 30, high: 300 } }, required_missing: [] },
  },
];

// ------------------------------------------------------------------ assemble
const devV0 = JSON.parse(readFileSync(repoPath("evals", "opportunity-qualifier", "v0", "dev_cases_v0.json"), "utf8"));
const sealedV0 = JSON.parse(readFileSync(join(stateDir(), "sealed", "opportunity-qualifier-sealed-v0.json"), "utf8"));

const devCases = devV0.cases.concat(DEV_EXPIRY);
const sealedCases = sealedV0.cases.concat(SEALED_EXPIRY);

const ids = new Set();
for (const c of devCases.concat(sealedCases)) {
  if (ids.has(c.case_id)) throw new Error("duplicate case id " + c.case_id);
  ids.add(c.case_id);
}

const devDoc = {
  id: "hemmer-opportunity-qualifier-dev-v1", version: "hemmer-opportunity-qualifier-dev-v1",
  specVersion: "v2", derivedFrom: devV0.version, synthetic: true, n: devCases.length,
  note: "Development cases plus expiry coverage. v0 is unchanged on disk so the promoted-v1 evidence stays reproducible.",
  cases: devCases,
};
const sealedDoc = {
  id: "hemmer-opportunity-qualifier-sealed-v1", version: "hemmer-opportunity-qualifier-sealed-v1",
  specVersion: "v2", derivedFrom: sealedV0.version, synthetic: true, n: sealedCases.length,
  note: "Sealed holdout plus expiry coverage. Private state only; never committed.",
  cases: sealedCases,
};

const devPath = repoPath("evals", "opportunity-qualifier", "v1", "dev_cases_v1.json");
mkdirSync(repoPath("evals", "opportunity-qualifier", "v1"), { recursive: true });
writeFileSync(devPath, JSON.stringify(devDoc, null, 2) + "\n", "utf8");

const sealedPath = join(stateDir(), "sealed", "opportunity-qualifier-sealed-v1.json");
writeFileSync(sealedPath, JSON.stringify(sealedDoc, null, 2) + "\n", "utf8");

const devSha = createHash("sha256").update(readFileSync(devPath)).digest("hex");
const sealedSha = createHash("sha256").update(readFileSync(sealedPath)).digest("hex");

const decisionMix = sealedCases.reduce((a, c) => { a[c.gold.decision] = (a[c.gold.decision] || 0) + 1; return a; }, {});
const manifest = {
  specVersion: "v2",
  dev: { id: devDoc.id, path: "evals/opportunity-qualifier/v1/dev_cases_v1.json", n: devCases.length, sha256: devSha },
  sealed: {
    id: sealedDoc.id, path: "var/state/sealed/opportunity-qualifier-sealed-v1.json",
    n: sealedCases.length, sha256: sealedSha, committed: false,
    note: "Sealed cases live in gitignored private state. Only this hash is committed.",
  },
  decisionMix,
  disqualifierCoverage: [...new Set(sealedCases.flatMap((c) => c.gold.disqualifiers))].sort(),
  expiryCases: {
    expired: sealedCases.filter((c) => (c.gold.disqualifiers || []).includes("opportunity_expired")).map((c) => c.case_id),
    liveButNearDeadline: ["OQ-S22", "OQ-S23", "OQ-S24"],
    note: "Two-sided by construction: adding the code must not make the worker start declaring live opportunities expired.",
  },
};
writeFileSync(repoPath("evals", "opportunity-qualifier", "v1", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log("dev v1", devCases.length, devSha.slice(0, 16));
console.log("sealed v1", sealedCases.length, sealedSha.slice(0, 16));
console.log("decision mix", JSON.stringify(decisionMix));
console.log("expired cases", manifest.expiryCases.expired.join(", "));
