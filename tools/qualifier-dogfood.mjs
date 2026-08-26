/**
 * Hemmer Digital dogfood: run the promoted Opportunity Qualifier over real,
 * currently-public opportunities in RECOMMENDATION MODE.
 *
 * Recommendation mode means exactly this: the worker reads and scores, and the
 * output is a ranked recommendation for Mason. Nothing is sent, no buyer is
 * contacted, no price is quoted, no commitment is made. There is no code path in
 * this file that performs an outbound action.
 *
 * Provenance: every opportunity below was discovered by public web search on
 * 2026-08-25 and every evidence entry quotes text actually retrieved from the
 * cited URL. Nothing is inferred, and fields the public page does not state are
 * left null rather than guessed -- which is itself part of the test, since the
 * worker should hold for the missing information rather than invent it.
 *
 * These are publicly discoverable candidates, not Mason's private pipeline.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import {
  ensureQualifierVersion, buildQualifierRequest, OPPORTUNITY_QUALIFIER_SPEC, QUALIFIER_V1_ID,
} from "../packages/eval/src/qualifier-foundry.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

const DISCOVERED_ON = "2026-08-25";

const OPPORTUNITIES = [
  {
    case_id: "HD-LIVE-01",
    title: "RWA / SGA website redesign and ADA compliance consultant",
    source: "rfp",
    url: "https://rwah2o.org/rfp-consultant-support-for-the-website-redesign-and-ada-compliance-project/",
    brief:
      "The Regional Water Authority and Sacramento Groundwater Authority are seeking consultant support for a Website Redesign and ADA Compliance Project. " +
      "Electronic submittals are due by 3:00 p.m. PT on September 15, 2026. Questions go to the RWA Project Manager by email. The public notice states no budget figure.",
    facts: {
      posted_budget_usd: null,
      client_payment_verified: null,
      client_prior_hires: null,
      deadline_days: 21,
      posted_days_ago: 1,
      contact_is_decision_maker: null,
      buyer_type: "public_agency",
    },
    evidence: [
      { id: "E1", text: "The Regional Water Authority (RWA) and Sacramento Groundwater Authority (SGA) are seeking Consultant support for the Website Redesign and ADA Compliance Project.", source: "rfp_page", age_days: 1 },
      { id: "E2", text: "To be considered, one electronic version of the submittal (send via email) must be received by the principal contact listed below by 3:00 p.m. PT on September 15, 2026.", source: "rfp_page", age_days: 1 },
      { id: "E3", text: "Questions regarding the RFP shall be directed to the RWA Project Manager, Ashley Flores, by e-mail.", source: "rfp_page", age_days: 1 },
      { id: "E4", text: "The public notice was published on August 24, 2026 and states no budget figure.", source: "rfp_page", age_days: 1 },
    ],
  },
  {
    case_id: "HD-LIVE-02",
    title: "Hunger Task Force full website rebuild",
    source: "rfp",
    url: "https://www.hungertaskforce.org/2026/03/18/website-redesign-rfp/",
    brief:
      "Hunger Task Force posted a website redesign RFP for a full website rebuild including CMS evaluation, with a stated budget range of 75,000 to 100,000 USD. " +
      "The stated proposal deadline was April 21, 2026 at 5:00 PM CT. Priority is given to United States vendors with a preference for the Midwest region.",
    facts: {
      posted_budget_usd: 87500,
      client_payment_verified: null,
      client_prior_hires: null,
      deadline_days: -126,
      posted_days_ago: 160,
      buyer_type: "nonprofit",
    },
    evidence: [
      { id: "E1", text: "Full website rebuild (CMS evaluation included).", source: "rfp_page", age_days: 160 },
      { id: "E2", text: "Budget Range: $75,000-$100,000. Vendors are encouraged to propose solutions that align with this range.", source: "rfp_page", age_days: 160 },
      { id: "E3", text: "Deadline: April 21, 2026 at 5:00 PM CT.", source: "rfp_page", age_days: 160 },
      { id: "E4", text: "Hunger Task Force will give priority consideration to vendors based in the United States, with a preference for those located in the Midwest region.", source: "rfp_page", age_days: 160 },
    ],
  },
  {
    case_id: "HD-LIVE-03",
    title: "Boulder County Film Commission website redesign",
    source: "rfp",
    url: "https://www.boulderchamber.com/2026/03/04/rfp-website-redesign-boulder-county-film-commission/",
    brief:
      "The Boulder County Film Commission, a program of the Boulder Chamber, is seeking proposals from web design firms to redesign and modernize the BCFC website. " +
      "The Chamber encourages proposals that include both cash and trade components. The RFP contact is the Boulder Chamber Senior Marketing Manager. The retrieved page states no budget figure and no submission deadline.",
    facts: {
      posted_budget_usd: null,
      client_payment_verified: null,
      client_prior_hires: null,
      deadline_days: null,
      posted_days_ago: 174,
      partial_payment_in_trade: true,
      buyer_type: "chamber_of_commerce",
    },
    evidence: [
      { id: "E1", text: "The Boulder County Film Commission (BCFC), a program of the Boulder Chamber, is seeking proposals from innovative and highly creative web design firms to redesign and modernize the BCFC website.", source: "rfp_page", age_days: 174 },
      { id: "E2", text: "The Chamber encourages proposals that include both cash and trade components.", source: "rfp_page", age_days: 174 },
      { id: "E3", text: "Proposals should cover technical approach and CMS recommendation, and willingness to structure cash/trade proposal models.", source: "rfp_page", age_days: 174 },
      { id: "E4", text: "RFP Contact: Boulder Chamber Senior Marketing Manager. The retrieved page states no budget figure and no submission deadline.", source: "rfp_page", age_days: 174 },
    ],
  },
  {
    case_id: "HD-LIVE-04",
    title: "FPRA Capital Chapter website redesign",
    source: "rfp",
    url: "https://fpra-capital.org/news/request-for-proposals-website-redesign-for-fpra-capital-chapter/",
    brief:
      "The FPRA Capital Chapter sought proposals from qualified website designers or agencies to redesign fpra-capital.org. " +
      "Proposals were to be submitted by email in PDF format by January 16, 2026, 5 p.m. EST, and late submissions would not be considered. " +
      "The chapter would provide brand assets and content, and is open to a template-based approach. No budget figure is stated on the page.",
    facts: {
      posted_budget_usd: null,
      client_payment_verified: null,
      client_prior_hires: null,
      deadline_days: -221,
      posted_days_ago: 240,
      buyer_type: "professional_association",
    },
    evidence: [
      { id: "E1", text: "The FPRA Capital Chapter is seeking proposals from qualified website designers or agencies to redesign fpra-capital.org.", source: "rfp_page", age_days: 240 },
      { id: "E2", text: "Submit proposals by January 16, 2026, 5 p.m. EST. Submissions should be in PDF format. Late submissions will not be considered.", source: "rfp_page", age_days: 240 },
      { id: "E3", text: "Do you have existing brand assets, or is this part of the scope? Yes, we would provide assets and content.", source: "rfp_page", age_days: 240 },
      { id: "E4", text: "Would you be open to a template-based design approach? We are open to discussing both options with our selected vendor.", source: "rfp_page", age_days: 240 },
    ],
  },
];

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const store = new FileStore(stateDir());
const version = ensureQualifierVersion(store, QUALIFIER_V1_ID);
const provider = new OpenAIResponsesProvider(undefined, version.modelProfile.model);

const results = [];
let usd = 0;
for (const opp of OPPORTUNITIES) {
  const req = buildQualifierRequest(QUALIFIER_V1_ID, opp);
  const completion = await provider.complete({
    input: req.input, instructions: req.instructions, outputSchema: req.outputSchema,
  });
  const u = completion.usage || {};
  usd += estimateUsd(u.inputTokens, u.outputTokens);
  const check = validateAgainstSchema(completion.text, OPPORTUNITY_QUALIFIER_SPEC.outputSchema);
  results.push({
    case_id: opp.case_id, title: opp.title, url: opp.url,
    ok: check.ok, assessment: check.ok ? check.value : null,
    error: check.ok ? null : (check.errors || []).slice(0, 3).join("; "),
  });
}

const order = { pursue: 0, hold_for_info: 1, decline: 2 };
results.sort((a, b) => (order[a.assessment?.decision] ?? 3) - (order[b.assessment?.decision] ?? 3));

const report = {
  at: new Date().toISOString(),
  mode: "recommendation_only",
  outboundActionsTaken: 0,
  worker: "opportunity_qualifier",
  version: QUALIFIER_V1_ID,
  versionContentHash: version.contentHash,
  model: version.modelProfile.model,
  discoveredOn: DISCOVERED_ON,
  provenance: "Publicly discoverable solicitations found by web search. Every evidence entry quotes text retrieved from the cited URL. Not Mason's private pipeline.",
  authorityBoundary: OPPORTUNITY_QUALIFIER_SPEC.authorityBoundary,
  evidenceNote: "Evidence scoring is deterministic. The semantic evidence judge is unqualified and contributed nothing to these assessments.",
  results,
  usdEstimate: Number(usd.toFixed(4)),
};
writeFileSync(join(stateDir(), "qualifier-dogfood.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("=== HEMMER DIGITAL -- RECOMMENDATION MODE (nothing sent) ===");
console.log("worker", QUALIFIER_V1_ID, "| model", version.modelProfile.model, "| discovered", DISCOVERED_ON);
for (const r of results) {
  const a = r.assessment;
  console.log("\n[" + (a ? a.decision.toUpperCase() : "UNPARSED") + "] " + r.case_id + " -- " + r.title);
  console.log("  " + r.url);
  if (!a) { console.log("  error:", r.error); continue; }
  console.log("  legitimacy " + a.buyer_legitimacy + " | clarity " + a.task_clarity + " | fraud " + a.fraud_risk);
  console.log("  value " + (a.estimated_value_usd ? "$" + a.estimated_value_usd.low + "-" + a.estimated_value_usd.high : "not estimable") +
              " | AI " + (a.ai_fulfillment_pct == null ? "n/a" : a.ai_fulfillment_pct + "%") +
              " | human " + (a.human_minutes == null ? "n/a" : a.human_minutes + " min"));
  console.log("  close " + (a.close_probability_pct ?? "n/a") + "% | payment " + (a.payment_probability_pct ?? "n/a") + "%");
  if (a.disqualifiers.length) console.log("  disqualifiers: " + a.disqualifiers.join(", "));
  if (a.missing_information.length) console.log("  needs: " + a.missing_information.join("; "));
  console.log("  cites: " + (a.cited_evidence_ids.join(", ") || "none"));
  console.log("  " + a.rationale.slice(0, 400));
}
console.log("\nusd", report.usdEstimate, "| outbound actions taken:", report.outboundActionsTaken);
