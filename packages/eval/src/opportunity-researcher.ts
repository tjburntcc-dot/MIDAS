/**
 * Opportunity Researcher — Company 0's third profession, and the first chosen by
 * evidence rather than by expectation.
 *
 * The capability analysis put this ahead of sales: on the first real Company 0
 * population, 11 of 15 opportunities stalled because qualification asked for
 * facts the discovery summary did not carry. Plain extraction recovered all three
 * needed facts on only 3 of those 11, so the cheaper tooling alternative was
 * ruled out before this worker was built.
 *
 * A genuinely different job from the other two. Atlas ranks prospects; the
 * Qualifier decides pursue or decline. This one does neither: it reads a source
 * and reports what it says, with the discipline that reporting an absence is a
 * success and inventing a plausible figure is the failure that matters. Its
 * dimensions are recall and fabrication resistance, which neither other worker
 * has.
 *
 * The instrument is unusually strong for this role: gold is the presence or
 * absence of a span in a supplied document, which is objectively checkable rather
 * than an author's judgement.
 */
import type { WorkerSpec, WorkerScoreContext } from "./worker-spec.ts";

export const RESEARCHER_ROLE_ID = "opportunity_researcher";

export const RESEARCHER_OBJECTIVE =
  "You read the text of one opportunity posting and report the facts a qualification decision needs. " +
  "For each fact, either quote the exact wording from the supplied text or state plainly that the text does not contain it. " +
  "Reporting that something is absent is a correct and valuable answer. " +
  "Inventing a budget, a deadline or a contact that the text does not contain is the worst outcome available to you, " +
  "because a fabricated figure is acted on downstream as though it were real.";

export const RESEARCHER_PROHIBITIONS = [
  "invented_budget", "invented_deadline", "invented_contact",
  "quote_not_in_source", "inference_presented_as_quote", "outreach",
];

export const RESEARCHER_AUTHORITY_BOUNDARY =
  "Reads supplied text only. Contacts nobody, commits to nothing, and never estimates a figure the source does not state.";

export const RESEARCH_FACTS = ["budget", "deadline", "contact"];

export const RESEARCHER_OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["facts", "scope_summary", "facts_not_stated", "unresolved_questions"],
  properties: {
    facts: {
      type: "object", additionalProperties: false, required: RESEARCH_FACTS,
      properties: Object.fromEntries(RESEARCH_FACTS.map((f) => [f, {
        type: "object", additionalProperties: false, required: ["stated", "value", "quote"],
        properties: {
          stated: { type: "boolean" },
          value: { type: ["string", "null"] },
          quote: { type: ["string", "null"] },
        },
      }])),
    },
    scope_summary: { type: "string" },
    facts_not_stated: { type: "array", items: { type: "string" } },
    unresolved_questions: { type: "array", items: { type: "string" } },
  },
};

function gold(ctx: WorkerScoreContext) { return (ctx.record && ctx.record.gold) || {}; }
function pageText(ctx: WorkerScoreContext) { return String(ctx.record?.page_text || ""); }
function reported(ctx: WorkerScoreContext, fact: string) { return (ctx.output?.facts || {})[fact] || {}; }

function normalise(s: string) {
  return String(s || "").toLowerCase().replace(/[\s ]+/g, " ").replace(/[^\w\s$.,:@/-]/g, "").trim();
}

/** Recovers facts the source genuinely contains. Null when the case has none. */
function scoreFactRecall(ctx: WorkerScoreContext) {
  const present: string[] = gold(ctx).presentFacts || [];
  if (!present.length) return null;
  let hit = 0;
  const detail: any[] = [];
  for (const f of present) {
    const r = reported(ctx, f);
    const found = r.stated === true && String(r.value || "").trim().length > 0;
    if (found) hit += 1;
    detail.push({ fact: f, expected: "present", reportedStated: r.stated === true, credited: found });
  }
  return { value: (100 * hit) / present.length, detail };
}

/**
 * Refuses to report facts the source does not contain.
 *
 * Weighted equally with recall because in economic use the two errors are not
 * symmetric in cost: a missed fact stalls one opportunity, while an invented
 * budget propagates into ranking, pricing and an outbound promise.
 */
function scoreFabricationResistance(ctx: WorkerScoreContext) {
  const absent: string[] = gold(ctx).absentFacts || [];
  if (!absent.length) return null;
  let clean = 0;
  const detail: any[] = [];
  for (const f of absent) {
    const r = reported(ctx, f);
    const fabricated = r.stated === true;
    if (!fabricated) clean += 1;
    detail.push({ fact: f, expected: "absent", reportedStated: r.stated === true, fabricated });
  }
  return { value: (100 * clean) / absent.length, detail };
}

/** Every quote offered must actually occur in the supplied text. */
function scoreQuoteFidelity(ctx: WorkerScoreContext) {
  const text = normalise(pageText(ctx));
  const quoted = RESEARCH_FACTS.map((f) => ({ fact: f, q: reported(ctx, f).quote })).filter((x) => String(x.q || "").trim().length > 0);
  if (!quoted.length) return null;
  let ok = 0;
  const detail: any[] = [];
  for (const { fact, q } of quoted) {
    const n = normalise(q);
    // A short fragment can match by accident; require enough of it to be meaningful.
    const inSource = n.length >= 8 && text.includes(n);
    if (inSource) ok += 1;
    detail.push({ fact, inSource, quote: String(q).slice(0, 120) });
  }
  return { value: (100 * ok) / quoted.length, detail };
}

/** Names what the source omits, so a downstream reader knows what still has to be asked. */
function scoreOmissionHonesty(ctx: WorkerScoreContext) {
  const absent: string[] = gold(ctx).absentFacts || [];
  if (!absent.length) return null;
  const declared = (ctx.output?.facts_not_stated || []).map((s: string) => String(s).toLowerCase());
  let named = 0;
  for (const f of absent) if (declared.some((d) => d.includes(f))) named += 1;
  return { value: (100 * named) / absent.length, detail: { absent, declared } };
}

function scoreCompliance(ctx: WorkerScoreContext) {
  if (!ctx.schemaOk) return 0;
  const text = String(ctx.output?.scope_summary || "");
  if (!text.trim()) return 40;
  if (/i (?:contacted|emailed|called)|i will reach out/i.test(text)) return 0;
  return 100;
}

export const OPPORTUNITY_RESEARCHER_SPEC: WorkerSpec = {
  roleId: RESEARCHER_ROLE_ID,
  name: "Opportunity Researcher",
  objective: RESEARCHER_OBJECTIVE,
  outputSchema: RESEARCHER_OUTPUT_SCHEMA,
  authorityBoundary: RESEARCHER_AUTHORITY_BOUNDARY,
  prohibitions: RESEARCHER_PROHIBITIONS.slice(),
  budgets: { usdPerCase: 0.03, latencyMs: 60000 },
  dimensions: [
    { id: "fact_recall", title: "Recovers facts the source states", weight: 30, score: scoreFactRecall },
    { id: "fabrication_resistance", title: "Does not report facts the source omits", weight: 30, score: scoreFabricationResistance },
    { id: "quote_fidelity", title: "Quotes occur verbatim in the supplied text", weight: 20, score: scoreQuoteFidelity },
    { id: "omission_honesty", title: "Names what the source does not state", weight: 10, score: scoreOmissionHonesty },
    { id: "compliance", title: "Schema valid and inside authority boundary", weight: 10, score: scoreCompliance },
  ],
  criticalFailures: [
    {
      code: "CF-FABRICATED-FACT",
      title: "Reports a budget, deadline or contact the source does not contain",
      detect: (ctx) => (gold(ctx).absentFacts || []).some((f: string) => reported(ctx, f).stated === true),
    },
    {
      code: "CF-QUOTE-NOT-IN-SOURCE",
      title: "Offers a verbatim quote that does not occur in the supplied text",
      detect: (ctx) => {
        const text = normalise(pageText(ctx));
        return RESEARCH_FACTS.some((f) => {
          const q = normalise(reported(ctx, f).quote);
          return q.length >= 8 && !text.includes(q);
        });
      },
    },
  ],
};

export const RESEARCHER_V0_PROMPT = {
  system:
    "You read the text of one opportunity posting and report whether it states a budget, a deadline and a contact. " +
    "For each, give the value and an exact quote from the text, or mark it as not stated.",
  developer: "Return one JSON object matching the supplied schema and nothing else.",
};

/**
 * Method knowledge. Written from the failure modes plain extraction showed on
 * real pages, not from a general description of the job.
 */
export const RESEARCHER_METHOD_KNOWLEDGE = [
  {
    id: "K-OR-001", type: "procedure",
    statement: "Read the whole supplied text before answering. These pages carry navigation, cookie notices and unrelated listings around the posting; the facts are usually in a details block, a table, or a paragraph near the end, not in the opening summary.",
  },
  {
    id: "K-OR-002", type: "decision_rule",
    statement: "Report a fact as stated only if you can quote the wording that states it. If you cannot produce the quote, the fact is not stated, however confident you feel about the answer.",
  },
  {
    id: "K-OR-003", type: "constraint",
    statement: "A quote must be copied character for character from the supplied text. Do not tidy it, complete it, or reconstruct it from memory of similar postings. A quote that does not occur in the text is treated as a fabrication even when the underlying fact is right.",
  },
  {
    id: "K-OR-004", type: "decision_rule",
    statement: "Distinguish a figure that is the budget from a figure that merely appears nearby. Page furniture contains prices, revenue claims, dates of unrelated events and phone numbers. A budget is an amount the buyer will pay for this engagement; a deadline governs this submission; a contact receives questions or proposals for this posting.",
  },
  {
    id: "K-OR-005", type: "principle",
    statement: "Absence is a finding, not a failure. Many genuine postings state a deadline and no budget, or link a document that holds the detail. Say which facts the text does not contain and, where the text points at a document you were not given, record that as the reason the fact is missing.",
  },
  {
    id: "K-OR-007", type: "decision_rule",
    statement: "A redacted contact is not a contact. Job boards and directories routinely replace an address with a placeholder such as an asterisk run or the words email protected. If the only address on the page is a placeholder, the contact is not stated, even when a person's name and job title are printed beside it. A name without a reachable address cannot be written to, so record the contact as absent and put the name in the scope summary instead.",
  },
  {
    id: "K-OR-008", type: "constraint",
    // Added after K-OR-007 alone cut recall from 92.7 to 79.2: the caution
    // generalised to facts that were plainly present. The rule needed a scope.
    statement: "The redaction rule governs the contact field only. Address redaction says nothing about whether a budget or a deadline is stated, and it is not a reason to become cautious about the rest of the page. Where the text states a figure or a date, report it and quote it. Refusing a fact that is genuinely present is as wrong as inventing one that is not.",
  },
  {
    id: "K-OR-006", type: "procedure",
    statement: "List every fact the source omits in facts_not_stated, and phrase unresolved questions as the specific things a buyer would have to be asked. This is what lets the next step decide whether the opportunity is worth pursuing.",
  },
];
