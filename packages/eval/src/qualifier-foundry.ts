/**
 * Opportunity Qualifier foundry pipeline.
 *
 * Freezes versions, presents cases without gold, runs them live, and produces a
 * promotion decision from sealed-set evidence. Comparison and regression
 * detection are delegated to the existing `compareEvalRuns`, which was written
 * for Atlas and is reused here unchanged -- that reuse is the point of the slice.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stateDir, repoPath, contentHash } from "@midas/db";
import { OPPORTUNITY_QUALIFIER_SPEC, QUALIFIER_SPEC_V1, QUALIFIER_SPEC_V2, qualifierSpec, QUALIFIER_V0_PROMPT, QUALIFIER_ROLE_ID } from "./opportunity-qualifier.ts";
import { runWorkerEval, workerSpecHash } from "./worker-spec.ts";

export const QUALIFIER_AGENT_ID = "opportunity_qualifier";
export const QUALIFIER_V0_ID = "oq-v0";
export const QUALIFIER_V1_ID = "oq-v1";
export const QUALIFIER_PLACEBO_ID = "oq-v1-placebo";
/** Control: v1 knowledge with the v2 output contract. Isolates having the code from knowing the policy. */
export const QUALIFIER_V1_SCHEMA2_ID = "oq-v1-schema2";
/** Control: v1 knowledge plus irrelevant text the same length as the expiry policy. */
export const QUALIFIER_V2_PLACEBO_ID = "oq-v2-placebo";
export const QUALIFIER_V2_ID = "oq-v2";

export const DEV_CASES_PATH = repoPath("evals", "opportunity-qualifier", "v0", "dev_cases_v0.json");
export const SEALED_CASES_PATH = join(stateDir(), "sealed", "opportunity-qualifier-sealed-v0.json");
export const SEALED_CASES_V1_PATH = join(stateDir(), "sealed", "opportunity-qualifier-sealed-v1.json");
export const SEALED_CASES_V2_PATH = join(stateDir(), "sealed", "opportunity-qualifier-sealed-v2.json");
export const CASES_MANIFEST_V2_PATH = repoPath("evals", "opportunity-qualifier", "v2", "manifest.json");
export const CASES_MANIFEST_PATH = repoPath("evals", "opportunity-qualifier", "v0", "manifest.json");

/**
 * Hemmer Digital operating policy, authored by the owner.
 *
 * This is the knowledge that separates v0 from v1. Several sealed answers are
 * only derivable from it -- the value floor, the capability boundary, the
 * payment rules -- so an untrained baseline cannot reach them by reasoning. That
 * is deliberate: it makes the measured gain attributable to knowledge
 * acquisition rather than to a bigger prompt, which is what the placebo arm then
 * tests.
 */
export const HEMMER_POLICY_SOURCE = {
  id: "SRC-HD-001",
  title: "Hemmer Digital engagement policy v1",
  publisher: "Hemmer Digital (owner-authored)",
  claimKind: "owner_policy",
  captureStatus: "LOCAL_REFERENCE",
};

export const HEMMER_POLICY_KNOWLEDGE = [
  {
    id: "K-HD-001", type: "constraint",
    statement: "The minimum engagement value is 500 USD. An opportunity whose stated or realistic value falls below 500 USD is declined as below_minimum_value, regardless of how straightforward the work looks.",
  },
  {
    id: "K-HD-002", type: "constraint",
    statement: "Capability boundary. In scope: marketing and content websites, landing pages, CMS work, written content, SEO and listing work, data cleanup and enrichment, and workflow automation over existing systems. Out of scope: native mobile applications, real-time video or audio infrastructure, embedded or firmware work, and anything requiring physical presence on site. Out-of-scope requests are declined as out_of_scope_capability however large the budget.",
  },
  {
    id: "K-HD-003", type: "decision_rule",
    statement: "Money never flows from Hemmer Digital to a buyer. Any request for the contractor to pay a deposit, licence, application fee, or good faith payment before work is an advance_fee_request and the opportunity is declined.",
  },
  {
    id: "K-HD-004", type: "decision_rule",
    statement: "Payment must run through platform escrow or a documented 50 percent deposit. A buyer pushing to move the conversation or the payment off platform, to cryptocurrency, to direct wire, or to a personal account is an off_platform_payment_push and the opportunity is declined.",
  },
  {
    id: "K-HD-005", type: "decision_rule",
    statement: "Unpaid speculative work is declined as unpaid_spec_work. This includes demo builds, sample articles, and trial designs offered as a condition of selection. A paid discovery engagement is acceptable and is not spec work.",
  },
  {
    id: "K-HD-006", type: "constraint",
    statement: "Deceptive work is declined as illegal_or_deceptive_work. This includes fabricated reviews, invented testimonials attributed to real-seeming people, and content designed to misrepresent who is speaking.",
  },
  {
    id: "K-HD-007", type: "decision_rule",
    statement: "A buyer whose identity cannot be checked against a verified payment method, a company record, or a prior contract history is identity_unverifiable. Combined with any adverse signal this is a decline; on its own with no adverse signal it is a hold pending verification.",
  },
  {
    id: "K-HD-008", type: "decision_rule",
    statement: "Do not pursue without a route to the person who signs. If the contact states they are gathering quotes for someone else, or is an intermediary, record no_decision_maker_contact and hold for the decision maker rather than declining.",
  },
  {
    id: "K-HD-009", type: "procedure",
    statement: "When budget, scope, or timeline is absent and cannot be inferred from the record, hold for information and name the specific missing field. Do not estimate a value from an empty record.",
  },
  {
    id: "K-HD-010", type: "principle",
    statement: "Target economics. Content, SEO, and data work typically reach 70 to 100 percent AI fulfilment. Site builds and CMS migrations typically reach 50 to 90 percent. Human time for a standard engagement runs from roughly 30 minutes on content work to several hundred minutes on a multi-page build. Estimate value from the stated budget when one exists, in a band around it, not as a point figure.",
  },
];

/**
 * Added after live use. `opportunity_expired` did not exist in the v1 taxonomy,
 * so a solicitation past its deadline had to be labelled with some other code,
 * and the worker chose a value-floor breach on a record that stated no value.
 * Both halves of that failure are addressed: the expiry rule, and the rule that
 * an absent figure is not a low figure.
 */
export const HEMMER_EXPIRY_KNOWLEDGE = [
  {
    id: "K-HD-011", type: "decision_rule",
    statement: "An opportunity whose stated submission deadline or response window has already passed is opportunity_expired and is declined. Judge this against the deadline stated in the record and the age of the posting. Do not record an expired opportunity under a different reason, and do not treat a deadline that is merely soon as expired.",
  },
  {
    id: "K-HD-012", type: "constraint",
    statement: "An absent figure is not a low figure. Where the record states no budget at all, do not record below_minimum_value; that code applies only where a value is stated or is genuinely inferable from the scope. Where no value is stated and none is inferable, name the missing budget instead.",
  },
];

/** Irrelevant text matched to the length of the expiry knowledge, for the v2 placebo arm. */
export const V2_PLACEBO_KNOWLEDGE = [
  {
    id: "K-PL-016", type: "procedure",
    statement: "A document that will be revisited benefits from a short change log at the foot rather than the head, because a reader arriving for the current state should not have to scroll past the history of states that no longer apply in order to reach it, and because the writer updating it can append without disturbing the opening paragraph that most readers rely on.",
  },
  {
    id: "K-PL-017", type: "principle",
    statement: "A list that mixes items of different granularity is harder to act on than two lists, because the reader must silently reclassify each entry before deciding whether it is a task, a topic, or a decision that was already taken somewhere else, and that reclassification is repeated by every reader rather than done once by the writer.",
  },
];

/** Irrelevant, length-matched knowledge for the placebo arm. */
export const PLACEBO_KNOWLEDGE = [
  { id: "K-PL-001", type: "principle", statement: "Written communication is clearer when sentences carry one idea each and paragraphs open with their subject rather than their qualification." },
  { id: "K-PL-002", type: "principle", statement: "Meeting notes are more useful when decisions are recorded separately from discussion, and when each decision names the person accountable for the next step." },
  { id: "K-PL-003", type: "procedure", statement: "A weekly review works better when the previous week's list is closed out before the coming week's list is written, so carried items are visible rather than silently repeated." },
  { id: "K-PL-004", type: "principle", statement: "Filing conventions survive longer when the name of a document describes its content rather than its date, because dates are already recorded by the system holding the file." },
  { id: "K-PL-005", type: "constraint", statement: "Calendar blocks reserved for focused work lose their value when they are routinely reassigned, so a block that is moved twice should be released rather than moved a third time." },
  { id: "K-PL-006", type: "principle", statement: "Checklists are most effective for steps that are easy to skip and expensive to miss, and least effective as a substitute for judgement on steps that vary each time." },
  { id: "K-PL-007", type: "procedure", statement: "An inbox is easier to keep at zero when messages requiring a reply longer than two minutes are moved to a task list immediately rather than left in place as a reminder." },
  { id: "K-PL-008", type: "principle", statement: "Templates reduce effort when the varying parts are marked explicitly, and increase it when the reader must diff the template against the intended message to find them." },
  { id: "K-PL-009", type: "principle", statement: "Naming a file after the decision it records rather than the meeting that produced it makes the decision findable by people who did not attend the meeting." },
  { id: "K-PL-010", type: "procedure", statement: "Archiving completed material quarterly keeps active folders small enough to scan, which matters more for retrieval speed than any particular folder hierarchy." },
  { id: "K-PL-011", type: "principle", statement: "A shared document benefits from a short summary at the top written after the body is finished, because the summary a writer plans in advance rarely matches the document they end up producing." },
  { id: "K-PL-012", type: "procedure", statement: "Recurring reminders are more reliable when attached to an event that already happens, such as the start of a working day, than when scheduled at an arbitrary clock time that competes with whatever else is running." },
  { id: "K-PL-013", type: "constraint", statement: "Notification settings that interrupt for every message train people to dismiss without reading, so interruption should be reserved for categories that genuinely change what someone does in the next hour." },
  { id: "K-PL-014", type: "principle", statement: "Written status updates age better than spoken ones because the reader can check what was actually claimed at the time rather than relying on a recollection of the conversation." },
  { id: "K-PL-015", type: "procedure", statement: "Keeping a single running list rather than several topic lists reduces the effort of deciding where an item belongs, which is usually a larger cost than the effort of scanning a longer list." },
];

export const DEV_CASES_V1_PATH = repoPath("evals", "opportunity-qualifier", "v1", "dev_cases_v1.json");
export const CASES_MANIFEST_V1_PATH = repoPath("evals", "opportunity-qualifier", "v1", "manifest.json");

/** Load a sealed set by version, verifying it against its committed manifest hash. */
export function loadSealedSet(setVersion) {
  const path = setVersion === "v2" ? SEALED_CASES_V2_PATH : setVersion === "v1" ? SEALED_CASES_V1_PATH : SEALED_CASES_PATH;
  const manifestPath = setVersion === "v2" ? CASES_MANIFEST_V2_PATH : setVersion === "v1" ? CASES_MANIFEST_V1_PATH : CASES_MANIFEST_PATH;
  if (!existsSync(path)) {
    throw new Error("Sealed case set " + setVersion + " is not present on this machine. Promotion cannot be decided without it.");
  }
  const raw = readFileSync(path);
  const sha = createHash("sha256").update(raw).digest("hex");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (sha !== manifest.sealed.sha256) {
    throw new Error("Sealed set " + setVersion + " hash does not match the committed manifest. Refusing to score against a modified holdout.");
  }
  return { cases: JSON.parse(raw.toString("utf8")).cases, sha256: sha, version: setVersion };
}

export function loadDevCasesV1() {
  return JSON.parse(readFileSync(DEV_CASES_V1_PATH, "utf8")).cases;
}

export function loadDevCases() {
  return JSON.parse(readFileSync(DEV_CASES_PATH, "utf8")).cases;
}

export function sealedCasesAvailable() {
  return existsSync(SEALED_CASES_PATH);
}

/**
 * Load sealed cases and verify them against the committed hash. A promotion run
 * must be able to prove it used the set it names.
 */
export function loadSealedCases() {
  if (!existsSync(SEALED_CASES_PATH)) {
    throw new Error("Sealed case set is not present on this machine. Promotion cannot be decided without it.");
  }
  const raw = readFileSync(SEALED_CASES_PATH);
  const sha = createHash("sha256").update(raw).digest("hex");
  const manifest = JSON.parse(readFileSync(CASES_MANIFEST_PATH, "utf8"));
  if (sha !== manifest.sealed.sha256) {
    throw new Error("Sealed case set hash does not match the committed manifest. Refusing to score against a modified holdout.");
  }
  return { cases: JSON.parse(raw.toString("utf8")).cases, sha256: sha };
}

/**
 * Present a case to the worker.
 *
 * Whitelisted field by field. Gold has to be impossible to leak by accident, so
 * this builds a new object rather than deleting keys from the record.
 */
export function presentQualifierCase(record: any) {
  return {
    case_id: record.case_id,
    source: record.source,
    opportunity_text: record.brief,
    facts: record.facts || {},
    evidence: ((record.evidence || []) as any[]).map((e) => ({ id: e.id, text: e.text, source: e.source, age_days: e.age_days })),
  };
}

const GOLD_KEYS = ["gold", "gold_rationale", "disqualifiers", "bands", "required_missing", "decision"];

/** Structural guard: no presented payload may carry a gold field. */
export function assertNoGoldLeak(presented: any) {
  const blob = JSON.stringify(presented);
  for (const key of GOLD_KEYS) {
    if (new RegExp('"' + key + '"\\s*:').test(blob)) {
      throw new Error("presented case leaked a gold field: " + key);
    }
  }
  return true;
}

export function knowledgeBlock(items: any[]) {
  if (!items || !items.length) return "";
  return "Operating knowledge available to you:\n" + items.map((k) => "- [" + k.id + "] " + k.statement).join("\n");
}

/** Version definitions. v0 is frozen first and never rewritten. */
export function qualifierVersionDefs() {
  // Each version is bound to the spec it was frozen under. Extending the
  // taxonomy changes the output contract, so it must not retroactively alter
  // the content hash of a version that shipped before the extension existed.
  const baseFor = (specVersion) => ({
    agentId: QUALIFIER_AGENT_ID,
    roleId: QUALIFIER_ROLE_ID,
    specVersion,
    modelProfile: { provider: "openai", model: process.env.MIDAS_QUALIFIER_MODEL || "gpt-4.1" },
    // Spec v1 keeps its original schema id verbatim. The id is part of the frozen
    // content hash, so renaming it would invalidate versions already on disk.
    outputSchema: { $id: specVersion === "v1" ? "https://midas.local/schemas/opportunity-qualifier-v0.json" : "https://midas.local/schemas/opportunity-qualifier-v2.json" },
    workerSpecHash: workerSpecHash(qualifierSpec(specVersion)),
    allowedTools: [],
  });
  const base = baseFor("v1");
  const base2 = baseFor("v2");
  const v1System = QUALIFIER_V0_PROMPT.system + "\n\n" + knowledgeBlock(HEMMER_POLICY_KNOWLEDGE);
  return {
    [QUALIFIER_V0_ID]: {
      ...base,
      id: QUALIFIER_V0_ID,
      parentVersionId: null,
      promptBundle: { ...QUALIFIER_V0_PROMPT },
      knowledgeIds: [],
      declaredChange: "Initial frozen baseline. Role statement and output contract only, no operating knowledge.",
    },
    [QUALIFIER_V1_ID]: {
      ...base,
      id: QUALIFIER_V1_ID,
      parentVersionId: QUALIFIER_V0_ID,
      promptBundle: { system: v1System, developer: QUALIFIER_V0_PROMPT.developer },
      knowledgeIds: HEMMER_POLICY_KNOWLEDGE.map((k) => k.id),
      declaredChange: "Adds owner-authored Hemmer Digital engagement policy as operating knowledge. Prompt otherwise unchanged from v0.",
    },
    [QUALIFIER_PLACEBO_ID]: {
      ...base,
      id: QUALIFIER_PLACEBO_ID,
      parentVersionId: QUALIFIER_V0_ID,
      promptBundle: {
        system: QUALIFIER_V0_PROMPT.system + "\n\n" + knowledgeBlock(PLACEBO_KNOWLEDGE),
        developer: QUALIFIER_V0_PROMPT.developer,
      },
      knowledgeIds: PLACEBO_KNOWLEDGE.map((k) => k.id),
      declaredChange: "Placebo arm. Same shape and comparable length of added text, none of it relevant to qualifying an opportunity.",
    },
    [QUALIFIER_V1_SCHEMA2_ID]: {
      ...base2,
      id: QUALIFIER_V1_SCHEMA2_ID,
      parentVersionId: QUALIFIER_V1_ID,
      promptBundle: { system: v1System, developer: QUALIFIER_V0_PROMPT.developer },
      knowledgeIds: HEMMER_POLICY_KNOWLEDGE.map((k) => k.id),
      declaredChange: "Control arm. Identical knowledge to the promoted v1, but the v2 output contract so the expiry code is available. Isolates having the code from knowing when to use it.",
    },
    [QUALIFIER_V2_PLACEBO_ID]: {
      ...base2,
      id: QUALIFIER_V2_PLACEBO_ID,
      parentVersionId: QUALIFIER_V1_SCHEMA2_ID,
      promptBundle: {
        system: v1System + "\n" + knowledgeBlock(V2_PLACEBO_KNOWLEDGE).replace("Operating knowledge available to you:\n", ""),
        developer: QUALIFIER_V0_PROMPT.developer,
      },
      knowledgeIds: HEMMER_POLICY_KNOWLEDGE.map((k) => k.id).concat(V2_PLACEBO_KNOWLEDGE.map((k) => k.id)),
      declaredChange: "Placebo for the expiry increment. Same added length as the expiry policy, none of it about expiry or value floors.",
    },
    [QUALIFIER_V2_ID]: {
      ...base2,
      id: QUALIFIER_V2_ID,
      parentVersionId: QUALIFIER_V1_SCHEMA2_ID,
      promptBundle: {
        system: v1System + "\n" + knowledgeBlock(HEMMER_EXPIRY_KNOWLEDGE).replace("Operating knowledge available to you:\n", ""),
        developer: QUALIFIER_V0_PROMPT.developer,
      },
      knowledgeIds: HEMMER_POLICY_KNOWLEDGE.map((k) => k.id).concat(HEMMER_EXPIRY_KNOWLEDGE.map((k) => k.id)),
      declaredChange: "Adds the expiry decision rule and the absent-figure constraint, both written in response to an observed live failure. Prompt otherwise identical to the control arm.",
    },
  };
}

/** Freeze a version into the store. An existing version is never rewritten. */
export function ensureQualifierVersion(store: any, versionId: string) {
  const defs = qualifierVersionDefs();
  const def = defs[versionId];
  if (!def) throw new Error("unknown qualifier version " + versionId);
  const existing = store.getVersion(versionId);
  const hash = contentHash({
    promptBundle: def.promptBundle,
    knowledgeIds: def.knowledgeIds,
    outputSchema: def.outputSchema,
    workerSpecHash: def.workerSpecHash,
    model: def.modelProfile.model,
  });
  if (existing) {
    if (existing.contentHash !== hash) {
      throw new Error("refusing to rewrite frozen version " + versionId + "; freeze a new id instead");
    }
    return existing;
  }
  return store.putVersion({
    ...def,
    contentHash: hash,
    createdAt: new Date().toISOString(),
  });
}

export function placeboLengthDelta() {
  const defs = qualifierVersionDefs();
  const v1 = defs[QUALIFIER_V1_ID].promptBundle.system.length;
  const pl = defs[QUALIFIER_PLACEBO_ID].promptBundle.system.length;
  return { v1, placebo: pl, ratio: pl / v1 };
}

/** Build the live request for one case. */
export function buildQualifierRequest(versionId: string, record: any) {
  const defs = qualifierVersionDefs();
  const def = defs[versionId];
  const presented = presentQualifierCase(record);
  assertNoGoldLeak(presented);
  return {
    instructions: def.promptBundle.system + "\n\n" + def.promptBundle.developer,
    input: { opportunity: presented },
    outputSchema: { name: "opportunity_qualification", strict: false, schema: qualifierSpec(def.specVersion).outputSchema },
  };
}

export { OPPORTUNITY_QUALIFIER_SPEC, QUALIFIER_SPEC_V1, QUALIFIER_SPEC_V2, qualifierSpec, runWorkerEval };
