/**
 * Adversarial boundary set for judge v0.3.
 *
 * Authored after docs/evidence-judge/VERDICT_RUBRIC_V03.md was frozen and never
 * run against the judge before being written. Every scenario, entity and number
 * is new: nothing here appears in judge-calibration-v0.2 or v0.3.
 *
 * The set is built as near-twins. Many items share evidence with an item of a
 * different class and differ only in what the claim asserts, so a judge that has
 * learned a wording shortcut rather than the rule scores badly:
 *
 *   record_state vs unsupported  - reporting a blank vs filling it in
 *   contradicted vs ambiguous    - one-sided disqualifying evidence vs two-sided
 *   supported    vs unsupported  - a committed statement vs a hedged one
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";

const OUT = repoPath("packages", "eval", "src", "fixtures", "judge-adversarial-v03.json");
const MANIFEST = repoPath("packages", "eval", "src", "fixtures", "judge-adversarial-v03.manifest.json");

const fp = (claim, age) => ({ id: "E1", claim: claim, source: "first_party", age_days: age == null ? 3 : age });
const fp2 = (claim, age) => ({ id: "E2", claim: claim, source: "first_party", age_days: age == null ? 3 : age });
const off = (claim, age) => ({ id: "E1", claim: claim, source: "official", age_days: age == null ? 3 : age });
const off2 = (claim, age) => ({ id: "E2", claim: claim, source: "official", age_days: age == null ? 3 : age });
const tp = (claim, age) => ({ id: "E1", claim: claim, source: "third_party", age_days: age == null ? 3 : age });

const RAW = [
  // ---- record_state: the claim reports what the record does not settle -----
  { id: "X03-R1", cls: "record_state", v: "supports", sub: "blank_field_reported",
    claim: "The onboarding date is not captured anywhere in the record.",
    facts: { onboarding_date: null }, ev: [fp("The onboarding date field was never populated.")] },
  { id: "X03-R2", cls: "record_state", v: "supports", sub: "omitted_section_reported",
    claim: "Renewal terms cannot be determined from the attached summary.",
    facts: { renewal_terms: null }, ev: [fp("The summary omits the renewal section entirely.")] },
  { id: "X03-R3", cls: "record_state", v: "supports", sub: "staleness_reported",
    claim: "The headcount figure is stale and its current value is not established.",
    facts: { headcount: null }, ev: [fp("Headcount was captured two hundred and ten days ago at two hundred.", 210)] },
  { id: "X03-R4", cls: "record_state", v: "supports", sub: "hedge_reported",
    claim: "The questionnaire answer is hedged and does not commit to a control.",
    facts: { encryption_at_rest: null }, ev: [fp("The questionnaire answer reads that the vendor generally aims to encrypt at rest.")] },
  { id: "X03-R5", cls: "record_state", v: "supports", sub: "absent_instrument_reported",
    claim: "No document in the record ties this contact to signing power.",
    facts: { buyer_authority: null }, ev: [fp("The authority folder contains an org chart and no delegation instrument.")] },
  { id: "X03-R6", cls: "record_state", v: "supports", sub: "empty_outcome_reported",
    claim: "Whether the pilot converted is not recorded.",
    facts: { pilot_converted: null }, ev: [fp("The pilot outcome field is empty.")] },

  // ---- unsupported: same evidence, but the claim fills the blank in --------
  { id: "X03-U1", cls: "unsupported", v: "does_not_establish", sub: "blank_field_filled", crit: true,
    claim: "The onboarding date was the twelfth of March.",
    facts: { onboarding_date: null }, ev: [fp("The onboarding date field was never populated.")] },
  { id: "X03-U2", cls: "unsupported", v: "does_not_establish", sub: "omitted_section_asserted",
    claim: "Renewal is automatic under the current terms.",
    facts: { renewal_terms: null }, ev: [fp("The summary omits the renewal section entirely.")] },
  { id: "X03-U3", cls: "unsupported", v: "does_not_establish", sub: "stale_as_current",
    claim: "Current headcount is two hundred.",
    facts: { headcount: null }, ev: [fp("Headcount was captured two hundred and ten days ago at two hundred.", 210)] },
  { id: "X03-U4", cls: "unsupported", v: "does_not_establish", sub: "hedge_as_commitment",
    claim: "The vendor encrypts customer data at rest.",
    facts: { encryption_at_rest: null }, ev: [fp("The questionnaire answer reads that the vendor generally aims to encrypt at rest.")] },
  { id: "X03-U5", cls: "unsupported", v: "does_not_establish", sub: "title_as_authority",
    claim: "The chief of staff title confirms signing power for this contact.",
    facts: { buyer_authority: null, job_title: "chief_of_staff" }, ev: [fp("The authority folder contains an org chart and no delegation instrument.")] },
  { id: "X03-U6", cls: "unsupported", v: "does_not_establish", sub: "empty_outcome_asserted",
    claim: "The pilot converted to a paid subscription.",
    facts: { pilot_converted: null }, ev: [fp("The pilot outcome field is empty.")] },
  { id: "X03-U7", cls: "unsupported", v: "does_not_establish", sub: "fabricated_figure", crit: true,
    claim: "Verified annual recurring revenue is 4200000 USD.",
    facts: { verified_arr_usd: null }, ev: [fp("No annual recurring revenue figure has been verified.")] },

  // ---- contradicted: one-sided disqualifying evidence, must not go ambiguous
  { id: "X03-C1", cls: "contradicted", v: "contradicts", sub: "reserved_claimed_open",
    claim: "This territory is open for prospecting.",
    facts: { territory_status: "reserved" }, ev: [fp("The territory record marks this account reserved for a partner.", 2)] },
  { id: "X03-C2", cls: "contradicted", v: "contradicts", sub: "suppressed_claimed_contactable",
    claim: "The contact is contactable by email.",
    facts: { do_not_contact: true }, ev: [fp("A do-not-contact flag is active on this contact.", 2)] },
  { id: "X03-C3", cls: "contradicted", v: "contradicts", sub: "ended_claimed_active",
    claim: "The trial is still active.",
    facts: { trial_active: false }, ev: [off("The trial ended and the account reverted to unlicensed.")] },
  { id: "X03-C4", cls: "contradicted", v: "contradicts", sub: "value_mismatch",
    claim: "Annual contract value is 90000 USD.",
    facts: { annual_contract_value_usd: 12000 }, ev: [fp("Annual contract value is 12000 USD.")] },
  { id: "X03-C5", cls: "contradicted", v: "contradicts", sub: "precedence_rule_1_resolves",
    claim: "The company is hiring now.",
    facts: { open_roles: 0 },
    ev: [tp("An old job board still lists open roles.", 300), fp2("The current HR record states all requisitions are closed.", 2)] },
  { id: "X03-C6", cls: "contradicted", v: "contradicts", sub: "precedence_rule_2_resolves",
    claim: "The earlier audit gap still stands against this account.",
    facts: { audit_gap_open: false },
    ev: [fp("An initial audit finding flagged a control gap.", 30), fp2("A correction notice supersedes the initial finding and withdraws the gap.", 5)] },

  // ---- ambiguous: genuinely two-sided, no precedence rule resolves ---------
  { id: "X03-A1", cls: "ambiguous", v: "ambiguous", sub: "official_vs_first_party_plan",
    claim: "The account is on the enterprise plan.",
    facts: { plan: null },
    ev: [off("The official billing system shows the enterprise plan.", 2), fp2("The current CRM record shows the team plan.", 2)] },
  { id: "X03-A2", cls: "ambiguous", v: "ambiguous", sub: "internally_conflicting_contract",
    claim: "The renewal date falls in June.",
    facts: { renewal_month: null },
    ev: [fp("The contract cover page states a June renewal while the signature page states a September renewal, and no amendment is on file.")] },
  { id: "X03-A3", cls: "ambiguous", v: "ambiguous", sub: "two_hedged_sources_disagree",
    claim: "The buyer has budget approval.",
    facts: { budget_approved: null },
    ev: [fp("The finance note says budget was probably approved.", 4), fp2("The procurement note says approval may not have cleared committee.", 4)] },
  { id: "X03-A4", cls: "ambiguous", v: "ambiguous", sub: "official_vs_first_party_entitlement",
    claim: "The support tier includes around-the-clock coverage.",
    facts: { support_tier: null },
    ev: [off("The official order form lists premium support.", 5), fp2("The current entitlement record lists standard support.", 5)] },
  { id: "X03-A5", cls: "ambiguous", v: "ambiguous", sub: "entity_reading_two_ways",
    claim: "This entity is the one named in the master agreement.",
    facts: { entity_match: null },
    ev: [off("The master agreement names Harbor Line LLC, and this prospect files as Harbor Line LLC in one registry and Harbor Line Services LLC in another, with no record linking or separating the filings.", 6)] },
  { id: "X03-A6", cls: "ambiguous", v: "ambiguous", sub: "addendum_vs_signed_dpa",
    claim: "Data residency for this account is restricted to the European Union.",
    facts: { data_residency: null },
    ev: [fp("The security addendum states European Union only residency."), off2("The current signed data processing agreement permits processing in the United States.")] },

  // ---- supported: plain matches, guarding against ambiguity overuse --------
  { id: "X03-S1", cls: "supported", v: "supports", sub: "numeric_match",
    claim: "Annual contract value is 12000 USD.",
    facts: { annual_contract_value_usd: 12000 }, ev: [fp("Annual contract value is 12000 USD.")] },
  { id: "X03-S2", cls: "supported", v: "supports", sub: "flag_match",
    claim: "A do-not-contact flag is active on this contact.",
    facts: { do_not_contact: true }, ev: [fp("A do-not-contact flag is active on this contact.")] },
  { id: "X03-S3", cls: "supported", v: "supports", sub: "status_match",
    claim: "The current HR record states all requisitions are closed.",
    facts: { open_roles: 0 }, ev: [fp("The current HR record states all requisitions are closed.", 2)] },
  { id: "X03-S4", cls: "supported", v: "supports", sub: "correction_match",
    claim: "A correction notice withdraws the earlier audit gap.",
    facts: { audit_gap_open: false }, ev: [fp("A correction notice supersedes the initial finding and withdraws the gap.", 5)] },
  { id: "X03-S5", cls: "supported", v: "supports", sub: "official_document_match",
    claim: "A signed data processing agreement is on file for this account.",
    facts: { dpa_signed: true }, ev: [off("A signed data processing agreement is on file for this account.")] },
  { id: "X03-S6", cls: "supported", v: "supports", sub: "reserved_status_match",
    claim: "The territory record marks this account reserved for a partner.",
    facts: { territory_status: "reserved" }, ev: [fp("The territory record marks this account reserved for a partner.", 2)] },
];

const items = RAW.map((r) => ({
  id: r.id,
  class: r.cls,
  expected_verdict: r.v,
  prospect_id: "P1",
  claim: r.claim,
  cited_evidence_ids: r.ev.map((e) => e.id),
  facts: r.facts,
  evidence: r.ev,
  unsupported: r.v === "does_not_establish",
  critical_fabricated: Boolean(r.crit),
  subtype: r.sub,
  synthetic: true,
}));

const seen = new Set();
for (const it of items) {
  if (seen.has(it.id)) throw new Error("duplicate id " + it.id);
  seen.add(it.id);
}

const classes = {};
for (const it of items) classes[it.class] = (classes[it.class] || 0) + 1;

const set = {
  id: "atlas-judge-adversarial-v0.3",
  version: "atlas-judge-adversarial-v0.3",
  synthetic: true,
  n: items.length,
  rubric: "docs/evidence-judge/VERDICT_RUBRIC_V03.md",
  note: "Adversarial boundary set. Authored after the rubric was frozen and never used to tune it. Held out from calibration: qualification requires passing both this set and the calibration set at the same unchanged gates.",
  classes: classes,
  items: items,
};

writeFileSync(OUT, JSON.stringify(set, null, 2) + "\n", "utf8");
const sha = createHash("sha256").update(readFileSync(OUT)).digest("hex");
writeFileSync(MANIFEST, JSON.stringify({
  id: set.id,
  path: "packages/eval/src/fixtures/judge-adversarial-v03.json",
  n: items.length,
  sha256: sha,
  classes: classes,
  rubric: "docs/evidence-judge/VERDICT_RUBRIC_V03.md",
  heldOut: true,
  note: "Frozen before the first judge run against it.",
}, null, 2) + "\n", "utf8");

console.log("items", items.length, JSON.stringify(classes));
console.log("sha256", sha);
