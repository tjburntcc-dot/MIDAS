/**
 * Diagnostic, not a promotion run.
 *
 * The expiry defect was found against real solicitations, so the fix is checked
 * against the same real records. Three arms are run over the two expired
 * postings that produced the original mislabel, so the question "did the fix
 * actually work in reality" is answered by reality rather than by the sealed set.
 *
 * oq-v1 remains the promoted worker. oq-v2 failed its gate. Nothing here
 * promotes anything and nothing here is sent anywhere.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import {
  ensureQualifierVersion, buildQualifierRequest, qualifierSpec, qualifierVersionDefs,
  QUALIFIER_V1_ID, QUALIFIER_V1_SCHEMA2_ID, QUALIFIER_V2_ID,
} from "../packages/eval/src/qualifier-foundry.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

// The two real records whose deadlines had passed, verbatim from the dogfood run.
const REAL = [
  {
    case_id: "HD-LIVE-04",
    title: "FPRA Capital Chapter website redesign (deadline passed, no budget stated)",
    url: "https://fpra-capital.org/news/request-for-proposals-website-redesign-for-fpra-capital-chapter/",
    source: "rfp",
    brief:
      "The FPRA Capital Chapter sought proposals from qualified website designers or agencies to redesign fpra-capital.org. " +
      "Proposals were to be submitted by email in PDF format by January 16, 2026, 5 p.m. EST, and late submissions would not be considered. " +
      "The chapter would provide brand assets and content, and is open to a template-based approach. No budget figure is stated on the page.",
    facts: { posted_budget_usd: null, client_payment_verified: null, client_prior_hires: null, deadline_days: -221, posted_days_ago: 240, buyer_type: "professional_association" },
    evidence: [
      { id: "E1", text: "The FPRA Capital Chapter is seeking proposals from qualified website designers or agencies to redesign fpra-capital.org.", source: "rfp_page", age_days: 240 },
      { id: "E2", text: "Submit proposals by January 16, 2026, 5 p.m. EST. Submissions should be in PDF format. Late submissions will not be considered.", source: "rfp_page", age_days: 240 },
      { id: "E3", text: "Do you have existing brand assets, or is this part of the scope? Yes, we would provide assets and content.", source: "rfp_page", age_days: 240 },
      { id: "E4", text: "Would you be open to a template-based design approach? We are open to discussing both options with our selected vendor.", source: "rfp_page", age_days: 240 },
    ],
  },
  {
    case_id: "HD-LIVE-02",
    title: "Hunger Task Force full website rebuild (deadline passed, budget stated)",
    url: "https://www.hungertaskforce.org/2026/03/18/website-redesign-rfp/",
    source: "rfp",
    brief:
      "Hunger Task Force posted a website redesign RFP for a full website rebuild including CMS evaluation, with a stated budget range of 75,000 to 100,000 USD. " +
      "The stated proposal deadline was April 21, 2026 at 5:00 PM CT. Priority is given to United States vendors with a preference for the Midwest region.",
    facts: { posted_budget_usd: 87500, client_payment_verified: null, client_prior_hires: null, deadline_days: -126, posted_days_ago: 160, buyer_type: "nonprofit" },
    evidence: [
      { id: "E1", text: "Full website rebuild (CMS evaluation included).", source: "rfp_page", age_days: 160 },
      { id: "E2", text: "Budget Range: $75,000-$100,000. Vendors are encouraged to propose solutions that align with this range.", source: "rfp_page", age_days: 160 },
      { id: "E3", text: "Deadline: April 21, 2026 at 5:00 PM CT.", source: "rfp_page", age_days: 160 },
      { id: "E4", text: "Hunger Task Force will give priority consideration to vendors based in the United States, with a preference for those located in the Midwest region.", source: "rfp_page", age_days: 160 },
    ],
  },
];

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const store = new FileStore(stateDir());
const defs = qualifierVersionDefs();
const ARMS = [QUALIFIER_V1_ID, QUALIFIER_V1_SCHEMA2_ID, QUALIFIER_V2_ID];
const rows = [];
let usd = 0;

for (const versionId of ARMS) {
  const version = ensureQualifierVersion(store, versionId);
  const spec = qualifierSpec(defs[versionId].specVersion);
  const provider = new OpenAIResponsesProvider(undefined, version.modelProfile.model);
  for (const rec of REAL) {
    const req = buildQualifierRequest(versionId, rec);
    const completion = await provider.complete({ input: req.input, instructions: req.instructions, outputSchema: req.outputSchema });
    const u = completion.usage || {};
    usd += estimateUsd(u.inputTokens, u.outputTokens);
    const check = validateAgainstSchema(completion.text, spec.outputSchema);
    const a = check.ok ? check.value : null;
    rows.push({
      versionId, specVersion: defs[versionId].specVersion, caseId: rec.case_id, url: rec.url,
      decision: a ? a.decision : null,
      disqualifiers: a ? a.disqualifiers : null,
      rationale: a ? a.rationale.slice(0, 220) : null,
    });
  }
}

const report = {
  at: new Date().toISOString(),
  kind: "diagnostic_only",
  promotedWorker: QUALIFIER_V1_ID,
  note: "oq-v2 failed its promotion gate and is not promoted. This checks whether the taxonomy fix corrects the observed mislabel on the real records that produced it.",
  outboundActionsTaken: 0,
  rows,
  usdEstimate: Number(usd.toFixed(4)),
};
writeFileSync(join(stateDir(), "qualifier-expiry-diagnostic.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("=== EXPIRY FIX, CHECKED ON THE REAL RECORDS (diagnostic only) ===");
for (const caseId of ["HD-LIVE-04", "HD-LIVE-02"]) {
  console.log("\n" + caseId + "  " + REAL.find((r) => r.case_id === caseId).title);
  for (const r of rows.filter((x) => x.caseId === caseId)) {
    console.log("  " + r.versionId.padEnd(14) + "(spec " + r.specVersion + ")  " +
      String(r.decision).toUpperCase().padEnd(14) + " codes: " + ((r.disqualifiers || []).join(", ") || "none"));
  }
}
console.log("\nusd", report.usdEstimate, "| outbound actions:", report.outboundActionsTaken);
