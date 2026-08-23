/** Fictional RidgeLine handoff scenario. Not gold. Reviewer answers stay outside runtime. */

export const HANDOFF_SOURCE_LABEL = "owner-provided operational knowledge";
export const HANDOFF_SCOUT_QUESTION =
  "When two otherwise-qualified US roofing contractors differ only by estimating workflow, which buying signal is source-attributed?";
export const HANDOFF_OWNER_PASTE = [
  "RidgeLine owner-provided operational note. This is not a public webpage and not a search-engine result.",
  "US roofing contractors who still produce estimates by hand or with generic spreadsheets often take longer to issue proposals.",
  "Dedicated takeoff and estimating software is used to turn roof measurements into material lists and proposals.",
  "When two otherwise similar US contractors both have verified budget and are not protected, the contractor still estimating by hand is the stronger candidate for RidgeLine Estimator.",
  "A contractor that already uses dedicated estimating software may still be eligible, but is not the stronger buying-signal candidate.",
  "This is an inference from owner-provided operational knowledge. It is not a verified conversion rate, win-rate, or revenue statistic.",
  "This page does not state a conversion rate, average revenue, or win-rate statistic.",
  "The buying signal cannot create a hard disqualifier by itself. Hard owner policies still control eligibility.",
].join("\n");

export const HANDOFF_FICTIONAL_PROSPECTS = [
  {
    id: "P-HAND",
    company: "Cedar & Slate Roofing",
    facts: {
      company: "Cedar & Slate Roofing",
      country: "US",
      monthly_budget_usd: 4800,
      account_status: "new_logo",
      protected_account_name: null,
      estimates_by_hand: true,
      estimating_method: "spreadsheet",
      uses_estimating_software: false,
      employee_count: 16,
    },
    evidence: [
      { id: "E-HAND-1", claim: "Cedar & Slate Roofing is a US contractor with verified monthly budget of 4800 USD.", source: "first_party", age_days: 3 },
      { id: "E-HAND-2", claim: "The crew still produces estimates by hand or with generic spreadsheets.", source: "first_party", age_days: 5 },
    ],
  },
  {
    id: "P-SOFT",
    company: "Metro Pitch Roofing",
    facts: {
      company: "Metro Pitch Roofing",
      country: "US",
      monthly_budget_usd: 5000,
      account_status: "new_logo",
      protected_account_name: null,
      estimates_by_hand: false,
      estimating_method: "dedicated_software",
      uses_estimating_software: true,
      employee_count: 17,
    },
    evidence: [
      { id: "E-SOFT-1", claim: "Metro Pitch Roofing is a US contractor with verified monthly budget of 5000 USD.", source: "first_party", age_days: 4 },
      { id: "E-SOFT-2", claim: "The company already uses dedicated estimating software.", source: "first_party", age_days: 6 },
    ],
  },
  {
    id: "P-GAP",
    company: "Open Deck Roofing",
    facts: {
      company: "Open Deck Roofing",
      country: "US",
      monthly_budget_usd: null,
      account_status: "new_logo",
      protected_account_name: null,
      estimates_by_hand: true,
      estimating_method: "hand",
      uses_estimating_software: false,
      employee_count: 11,
    },
    evidence: [
      { id: "E-GAP-1", claim: "Open Deck Roofing is a US contractor. Monthly budget is not on the record.", source: "first_party", age_days: 2 },
    ],
  },
  {
    id: "P-CA",
    company: "Laurentian Ridge Works",
    facts: {
      company: "Laurentian Ridge Works",
      country: "CA",
      monthly_budget_usd: 6200,
      account_status: "new_logo",
      protected_account_name: null,
      estimates_by_hand: true,
      estimating_method: "hand",
      uses_estimating_software: false,
      employee_count: 20,
    },
    evidence: [
      { id: "E-CA-1", claim: "Laurentian Ridge Works is headquartered in Canada.", source: "first_party", age_days: 5 },
    ],
  },
];

export function handoffQualificationPolicy() {
  return {
    required: [
      "Apply Atlas Owner Policy: Territory",
      "Apply Atlas Owner Policy: Qualification Thresholds",
      "Apply Atlas Owner Policy: Protected Accounts",
    ],
    preferred: [
      "When otherwise qualified, a manual or spreadsheet estimating workflow may be a positive buying signal if an owner-approved Scout finding supports it. Inference, not a verified conversion fact. Cannot hard-DQ by itself.",
    ],
    disqualifiers: [],
    unknown_policy: "mandatory_unknown_requires_research",
  };
}
