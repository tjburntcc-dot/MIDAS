/**
 * Build calibration set v0.3 from the frozen v0.2 set.
 *
 * v0.2 is never modified. This script reads it, applies the rubric in
 * docs/evidence-judge/VERDICT_RUBRIC_V03.md, and writes a new set plus an
 * explicit ledger of every label that changed and why.
 *
 * Two structural changes:
 *
 * 1. The v0.2 `ambiguous` class conflated "the underlying fact is unknown" with
 *    "the evidence relation is two-sided". Items whose claim accurately reports
 *    what the record does not determine move to a new `record_state` class whose
 *    expected verdict is `supports`. It is a separate class, not folded into
 *    `supported`, so the hardest category keeps its own gate instead of hiding
 *    inside a larger one.
 * 2. The `ambiguous` class is rebuilt from genuinely two-sided evidence. The two
 *    v0.2 items that already had that shape are retained; fourteen new items are
 *    authored. None of the new claims contain hedge words, so a judge cannot
 *    reach the right answer by pattern-matching claim wording.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { repoPath } from "@midas/db";

const V02_PATH = repoPath("packages", "eval", "src", "fixtures", "judge-calibration-v02.json");
const OUT_PATH = repoPath("packages", "eval", "src", "fixtures", "judge-calibration-v03.json");
const MANIFEST_PATH = repoPath("packages", "eval", "src", "fixtures", "judge-calibration-v03.manifest.json");

const v02 = JSON.parse(readFileSync(V02_PATH, "utf8"));
const byId = new Map(v02.items.map((i) => [i.id, i]));

/**
 * Rubric application to the sixteen v0.2 `ambiguous` items.
 * `keep` means the item already matched the rubric's definition of ambiguous.
 */
const AMBIGUOUS_DISPOSITION = {
  "J02-A01": { to: "record_state", why: "Claim asserts the record does not determine protection; cited evidence states exactly that absence. Identical evidence to J02-U14, which the set already labels does_not_establish for asserting a definite value. Reporting the blank is the mirror case." },
  "J02-A02": { to: "record_state", why: "Claim asserts the notes cannot settle current hiring. A stale first-party note and a third-party board are both non-probative for currency under the rubric, so the record genuinely fails to determine it and the claim reports that correctly." },
  "J02-A03": { to: "record_state", why: "Claim asserts uncertainty whether an eighty-day note still applies. Evidence states the note's age; stale-to-current is a never-probative inference, so the record does not determine applicability." },
  "J02-A04": { to: "record_state", why: "Claim asserts the status is unknown; evidence states the status field is blank. Direct record-state match." },
  "J02-A05": { to: "record_state", why: "Claim asserts the record does not say whether spend clears the floor; evidence states spend is unpublished." },
  "J02-A06": { to: "record_state", why: "Claim asserts authority is unresolved; evidence states a title is listed and delegation is not mentioned. Title-to-authority is never probative, so unresolved is the accurate report." },
  "J02-A07": { to: "keep", why: "Current first-party ops and current official billing assert incompatible values of account_status. Precedence rule 3 declines to rank official above first-party, so no verdict dominates." },
  "J02-A08": { to: "record_state", why: "Claim asserts the buyer may be ready and that the note hedges; the cited note is itself hedged. The claim matches the evidence at the same strength." },
  "J02-A09": { to: "record_state", why: "Claim asserts the registry row's age is missing so currency is unclear; evidence states the row omits its age. The live v0.2 judge called this ambiguous, so this relabel moves an item away from the judge's answer." },
  "J02-A10": { to: "keep", why: "Two comparable sources point opposite ways on hiring_freeze and both are hedged. Neither establishes nor refutes." },
  "J02-A11": { to: "record_state", why: "Claim asserts the null fact plus a passing mention leaves the matter inconclusive; evidence is exactly a passing mention with no figure. The live v0.2 judge called this ambiguous." },
  "J02-A12": { to: "record_state", why: "Claim asserts the region may be served and that it is not sure; evidence states the region is not assigned. The live v0.2 judge called this ambiguous." },
  "J02-A13": { to: "record_state", why: "Claim explicitly asserts that the evidence does not establish protection, alongside an appearance of it; a hallway comment creates exactly that appearance without establishing anything." },
  "J02-A14": { to: "record_state", why: "Claim asserts identity is unclear rather than proven; evidence states a similar trade name exists. Name-to-identity is never probative, so unproven is the accurate report. The live v0.2 judge called this ambiguous." },
  "J02-A15": { to: "record_state", why: "Claim asserts consent cannot be determined from the fragment; evidence states the inbox rule is not documented." },
  "J02-A16": { to: "record_state", why: "Claim asserts the capacity number's currency is uncertain; evidence states capacity was discussed last season with no current figure." },
};

/**
 * Fourteen newly authored ambiguous items. Every one places evidence on both
 * sides of the claim, with no precedence rule available to resolve it. The
 * claims are plain assertions: none uses a hedge word.
 */
const NEW_AMBIGUOUS = [
  {
    id: "J03-A03", subtype: "official_vs_first_party_status",
    claim: "This account is an existing customer.",
    facts: { account_status: null },
    evidence: [
      { id: "E1", claim: "Official billing lists an active existing-customer contract.", source: "official", age_days: 2 },
      { id: "E2", claim: "Current ops record marks this account as a new logo with no contract.", source: "first_party", age_days: 2 },
    ],
  },
  {
    id: "J03-A04", subtype: "official_vs_first_party_freeze",
    claim: "The company has a hiring freeze in effect.",
    facts: { hiring_freeze: null },
    evidence: [
      { id: "E1", claim: "CFO memo this week states a company-wide hiring freeze.", source: "first_party", age_days: 3 },
      { id: "E2", claim: "Official filing this week reports active recruitment across all divisions.", source: "official", age_days: 3 },
    ],
  },
  {
    id: "J03-A05", subtype: "internally_conflicting_source",
    claim: "Monthly spend is 3200 USD.",
    facts: { monthly_spend_usd: null },
    evidence: [
      { id: "E1", claim: "Finance note states monthly spend of 3200 USD in its summary and 1800 USD in its table, and neither figure is marked as the correction.", source: "first_party", age_days: 3 },
    ],
  },
  {
    id: "J03-A06", subtype: "official_vs_first_party_seats",
    claim: "The account has eight seats.",
    facts: { seat_count: null },
    evidence: [
      { id: "E1", claim: "Official provisioning registry lists eight seats.", source: "official", age_days: 5 },
      { id: "E2", claim: "Current first-party account record lists three seats.", source: "first_party", age_days: 5 },
    ],
  },
  {
    id: "J03-A07", subtype: "two_hedged_sources_disagree",
    claim: "The buyer can sign without further approval.",
    facts: { buyer_authority: null },
    evidence: [
      { id: "E1", claim: "Sales note says the contact may be able to sign alone.", source: "first_party", age_days: 4 },
      { id: "E2", claim: "Legal note says approval may still be required for this buyer.", source: "first_party", age_days: 4 },
    ],
  },
  {
    id: "J03-A08", subtype: "entity_identity_two_sided",
    // Corrected after the first live run. The original version paired one
    // establishing reading against silence. Silence is not a direction, so under
    // the rubric's own definition that item was does_not_establish, not
    // ambiguous, and the judge was right to say so. Both sides are now active.
    claim: "This account is under territory protection.",
    facts: { account_status: null },
    evidence: [
      { id: "E1", claim: "A current official filing records that Cedar Point Holdings and Cedar Point Group merged and now share a single protection entry covering this account.", source: "official", age_days: 4 },
      { id: "E2", claim: "A current official filing records Cedar Point Holdings and Cedar Point Group as distinct entities, with the protection entry covering only the other one.", source: "official", age_days: 4 },
    ],
  },
  {
    id: "J03-A09", subtype: "official_vs_first_party_capacity",
    // Corrected after the first live run. The original claim did not assert a
    // value, so the period mismatch resolved it cleanly rather than leaving it
    // two-sided. The claim now asserts a specific figure that one current source
    // states and another current source of comparable standing denies.
    claim: "Seller capacity for the current quarter is fourteen accounts.",
    facts: { seller_capacity_accounts: null },
    evidence: [
      { id: "E1", claim: "The official capacity registry sets fourteen accounts for the current quarter.", source: "official", age_days: 3 },
      { id: "E2", claim: "The current first-party operations plan sets four accounts for the same quarter.", source: "first_party", age_days: 3 },
    ],
  },
  {
    id: "J03-A10", subtype: "official_vs_first_party_autorenewal",
    // Corrected after the first live run. The original item made an opt-out the
    // disputed attribute, but an opt-out is a hard stop under MIDAS's own owner
    // policy and the judge's instructions. A precedence rule that resolves a
    // conflict means the item is not ambiguous, so the original label asked the
    // judge to violate a rule it is required to follow. The attribute is now one
    // no hard-stop rule covers.
    claim: "The contract on file includes an auto-renewal clause.",
    facts: { auto_renewal: null },
    evidence: [
      { id: "E1", claim: "The executed contract on file includes an auto-renewal clause.", source: "official", age_days: 2 },
      { id: "E2", claim: "The current first-party contract abstract records that the auto-renewal clause was struck before signature.", source: "first_party", age_days: 2 },
    ],
  },
  {
    id: "J03-A11", subtype: "official_vs_first_party_geo",
    claim: "The account is headquartered in the United States.",
    facts: { country: null },
    evidence: [
      { id: "E1", claim: "The official incorporation filing lists a Delaware headquarters.", source: "official", age_days: 6 },
      { id: "E2", claim: "The current first-party account record lists the headquarters in Ontario, Canada.", source: "first_party", age_days: 6 },
    ],
  },
  {
    id: "J03-A12", subtype: "unversioned_model_outputs",
    claim: "Modeled payback is six months.",
    facts: { modeled_payback_months: null },
    evidence: [
      { id: "E1", claim: "One model output states six months.", source: "first_party", age_days: 3 },
      { id: "E2", claim: "Another model output states eleven months, and neither output is marked as superseding the other.", source: "first_party", age_days: 3 },
    ],
  },
  {
    id: "J03-A13", subtype: "official_vs_first_party_region",
    claim: "The region for this account is served.",
    facts: { region: null },
    evidence: [
      { id: "E1", claim: "The first-party territory map assigns this account to the Southeast, which is a served region.", source: "first_party", age_days: 3 },
      { id: "E2", claim: "The current official territory registry assigns the same account to the Pacific Northwest, which is reserved.", source: "official", age_days: 3 },
    ],
  },
  {
    id: "J03-A14", subtype: "official_vs_first_party_vertical",
    claim: "This is a commercial account.",
    facts: { vertical: null },
    evidence: [
      { id: "E1", claim: "The official registry classifies the entity as a public-sector bureau.", source: "official", age_days: 8 },
      { id: "E2", claim: "The current first-party account record classifies the entity as a commercial subsidiary.", source: "first_party", age_days: 8 },
    ],
  },
  {
    id: "J03-A15", subtype: "internally_conflicting_roster",
    claim: "The company has twelve employees.",
    facts: { employee_count: null },
    evidence: [
      { id: "E1", claim: "The roster header reports twelve employees while the roster body lists twenty names, and the discrepancy is unexplained.", source: "first_party", age_days: 3 },
    ],
  },
  {
    id: "J03-A16", subtype: "index_vs_folder_review",
    claim: "Written delegation for this buyer is on file.",
    facts: { buyer_authority: null },
    evidence: [
      { id: "E1", claim: "The official document index lists a signed delegation for this buyer.", source: "official", age_days: 3 },
      { id: "E2", claim: "A current first-party review of the contract folder found no delegation document on file.", source: "first_party", age_days: 3 },
    ],
  },
];

const items = [];
const ledger = [];

// Classes that carry over untouched.
for (const it of v02.items) {
  if (it.class === "ambiguous") continue;
  items.push({ ...it, origin: "v0.2", origin_id: it.id });
}

// v0.2 ambiguous items, dispositioned by the rubric.
let ambiguousKept = 0;
for (const it of v02.items) {
  if (it.class !== "ambiguous") continue;
  const d = AMBIGUOUS_DISPOSITION[it.id];
  if (!d) throw new Error("no rubric disposition for " + it.id);
  if (d.to === "keep") {
    items.push({ ...it, origin: "v0.2", origin_id: it.id });
    ambiguousKept += 1;
    ledger.push({ id: it.id, from_class: "ambiguous", to_class: "ambiguous", from_verdict: it.expected_verdict, to_verdict: it.expected_verdict, changed: false, why: d.why });
    continue;
  }
  items.push({
    ...it,
    class: "record_state",
    expected_verdict: "supports",
    origin: "v0.2",
    origin_id: it.id,
    relabelled_from: { class: it.class, expected_verdict: it.expected_verdict },
  });
  ledger.push({ id: it.id, from_class: "ambiguous", to_class: "record_state", from_verdict: it.expected_verdict, to_verdict: "supports", changed: true, why: d.why });
}

// Newly authored genuinely two-sided ambiguous items.
for (const n of NEW_AMBIGUOUS) {
  items.push({
    id: n.id,
    class: "ambiguous",
    expected_verdict: "ambiguous",
    prospect_id: "P1",
    claim: n.claim,
    cited_evidence_ids: n.evidence.map((e) => e.id),
    facts: n.facts,
    evidence: n.evidence,
    unsupported: false,
    critical_fabricated: false,
    subtype: n.subtype,
    synthetic: true,
    origin: "v0.3_authored",
  });
  ledger.push({ id: n.id, from_class: null, to_class: "ambiguous", from_verdict: null, to_verdict: "ambiguous", changed: true, why: "Newly authored two-sided item. Evidence bears on the claim from both directions with no precedence rule available; the claim contains no hedge word." });
}

const classes = {};
for (const it of items) classes[it.class] = (classes[it.class] || 0) + 1;

const set = {
  id: "atlas-judge-calibration-v0.3",
  version: "atlas-judge-calibration-v0.3",
  synthetic: true,
  n: items.length,
  derivedFrom: v02.version || v02.id,
  rubric: "docs/evidence-judge/VERDICT_RUBRIC_V03.md",
  note: "Rubric-aligned successor to v0.2. The v0.2 set is frozen and unmodified. `record_state` carries expected_verdict `supports` and is gated as its own class. `ambiguous` is rebuilt from two-sided evidence only. No challenge case ids.",
  classes: classes,
  relabelLedger: ledger,
  items: items,
};

const body = JSON.stringify(set, null, 2) + "\n";
writeFileSync(OUT_PATH, body, "utf8");
const sha = createHash("sha256").update(readFileSync(OUT_PATH)).digest("hex");
writeFileSync(MANIFEST_PATH, JSON.stringify({
  id: set.id,
  path: "packages/eval/src/fixtures/judge-calibration-v03.json",
  n: items.length,
  sha256: sha,
  classes: classes,
  derivedFrom: v02.version || v02.id,
  predecessorSha256: createHash("sha256").update(readFileSync(V02_PATH)).digest("hex"),
  rubric: "docs/evidence-judge/VERDICT_RUBRIC_V03.md",
  labelsChanged: ledger.filter((l) => l.changed && l.from_class).length,
  itemsAuthored: ledger.filter((l) => !l.from_class).length,
  ambiguousRetainedFromV02: ambiguousKept,
  note: "Labels frozen before running the v0.3 judge instructions.",
}, null, 2) + "\n", "utf8");

console.log("items", items.length, JSON.stringify(classes));
console.log("relabelled", ledger.filter((l) => l.changed && l.from_class).length, "authored", ledger.filter((l) => !l.from_class).length);
console.log("sha256", sha);
