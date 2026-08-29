/**
 * The smallest company state that can carry a decision.
 *
 * This exists to answer one question and may well be deleted afterwards: does
 * knowing what a company is, has tried, and what happened create decision value
 * over the same facts written out as prose? Five cycles have shown that prompt
 * scaffolding does not, and the one place MIDAS decisively won was an
 * environment with tools and consequences. This is the cheapest possible test of
 * whether state is the thing.
 *
 * So there is no ontology here, no store, no embeddings and no retrieval engine.
 * There is a list of items with enough structure to say when something was
 * superseded and where it came from, three renderings of that same list, and a
 * two-call interface over it. Nothing else.
 *
 * The rule that makes the experiment mean anything is that all three renderings
 * are generated from ONE list. No arm can be given a fact another lacks, because
 * there is only one set of facts and a parity test asserts it.
 */

/**
 * What kind of thing this is.
 *
 * Kept short. Every kind here is used by a case; a kind that decorates without
 * changing a decision would be exactly the theater this mission forbids.
 */
export const STATE_KINDS = [
  "objective",       // what the company is trying to do now
  "fact",            // something true of the business
  "event",           // something that happened, at a point in time
  "decision",        // something the company chose
  "experiment",      // something it tried in order to learn
  "outcome",         // what actually followed
  "constraint",      // something that limits what is possible
  "resource",        // capital, time, people
  "authority",       // what may be committed, and by whom
  "worker_state",    // a worker and how reliable it has been shown to be
  "open_question",   // known unknown
  "deferred",        // work explicitly not being done
] as const;

export const EPISTEMIC = ["verified", "reported", "inferred", "assumed", "unknown"] as const;

export interface StateItem {
  id: string;
  kind: string;
  /** Ordering, not a calendar. Cases care about before and after, not dates. */
  at: number;
  content: string;
  provenance: string;
  epistemic: string;
  /** "current" or "superseded". A superseded item is history, not truth. */
  status: string;
  supersededBy?: string;
}

export interface CompanyState {
  company: string;
  objective: string;
  items: StateItem[];
}

// ------------------------------------------------------------- renderings

/**
 * Arm A. Everything, in the order it happened, as prose.
 *
 * Deliberately not crippled: every fact is present in full, and the reader is
 * told plainly that some of it has been overtaken. What it does not get is
 * anyone having sorted it. This is what a capable model with a long context
 * actually receives in practice.
 */
export function renderChronologicalDossier(state: CompanyState) {
  const lines = [
    "COMPANY: " + state.company,
    "OBJECTIVE: " + state.objective,
    "",
    "HISTORY AND CURRENT POSITION, in the order things happened. Some of what",
    "follows was later overtaken by something else in this record.",
    "",
  ];
  for (const it of [...state.items].sort((a, b) => a.at - b.at)) {
    lines.push("(" + it.at + ") " + it.content + " [" + it.provenance + "]");
  }
  return lines.join("\n");
}

/**
 * Arm B. The same items, sorted into sections, with status and provenance shown.
 *
 * The only difference from A is organisation. Same facts, same words, arranged.
 */
export function renderStructuredState(state: CompanyState) {
  const order = ["objective", "fact", "constraint", "resource", "authority", "worker_state", "event", "decision", "experiment", "outcome", "open_question", "deferred"];
  const lines = ["COMPANY: " + state.company, "OBJECTIVE: " + state.objective, ""];
  const current = state.items.filter((i) => i.status === "current");
  const superseded = state.items.filter((i) => i.status !== "current");
  lines.push("CURRENT STATE");
  for (const kind of order) {
    const group = current.filter((i) => i.kind === kind).sort((a, b) => a.at - b.at);
    if (!group.length) continue;
    lines.push("  " + kind.toUpperCase());
    for (const it of group) lines.push("    - " + it.content + " (" + it.epistemic + ", " + it.provenance + ")");
  }
  if (superseded.length) {
    lines.push("");
    lines.push("SUPERSEDED, retained as history and no longer true");
    for (const it of superseded.sort((a, b) => a.at - b.at)) {
      lines.push("    - " + it.content + " (superseded by " + (it.supersededBy || "a later item") + ")");
    }
  }
  return lines.join("\n");
}

/**
 * Arm C. The same items behind two calls.
 *
 * The listing gives ids, kinds and a short label, and never the content. Nothing
 * marks which items matter: the interface provides access to state, it does not
 * solve the decision, and what the worker chooses to open is part of what is
 * being measured.
 */
export function listState(state: CompanyState, kind?: string) {
  // A filter nobody offered must say so. The first version returned an empty
  // string for an unknown kind, so a worker whose reasonable opening guess was
  // list_state({kind:"all"}) received silence, wasted a turn, and never learned
  // why. That one defect cost four of seven cases their decision.
  if (kind && !state.items.some((i) => i.kind === kind)) {
    const kinds = [...new Set(state.items.map((i) => i.kind))];
    return 'No items of kind="' + kind + '". Kinds present: ' + JSON.stringify(kinds)
      + ". Call list_state({}) with no argument for everything.";
  }
  const items = kind ? state.items.filter((i) => i.kind === kind) : state.items;
  return items.map((i) => 'id="' + i.id + '" kind="' + i.kind + '" order=' + i.at + ' status="' + i.status + '"').join("\n");
}

export function readState(state: CompanyState, id: string) {
  const it = state.items.find((i) => i.id === id);
  if (!it) {
    return { ok: false, output: 'No such state item id="' + id + '". Available ids: ' + JSON.stringify(state.items.map((i) => i.id)) };
  }
  return {
    ok: true,
    output: JSON.stringify({
      id: it.id, kind: it.kind, order: it.at, status: it.status,
      supersededBy: it.supersededBy || null, provenance: it.provenance, epistemic: it.epistemic, content: it.content,
    }),
  };
}

export const STATE_INTERFACE_BRIEF = [
  "The company's state is held in a store you must read. Two calls are available:",
  "  list_state({kind}) -- every item, or every item of one kind. Ids and labels only, never content.",
  "  read_state({id})   -- the full item, including whether it is current or superseded.",
  "The listing does not tell you what matters. Open what you need and decide when you have enough.",
  "list_state({}) with no argument returns everything. An invented kind will tell you which kinds exist.",
].join("\n");

// ------------------------------------------------------------ parity

/**
 * Do all three renderings carry the same facts?
 *
 * The whole experiment rests on this. If one arm can see something another
 * cannot, the result measures information rather than representation, and the
 * mission says to stop rather than report it.
 */
export function parityAudit(state: CompanyState) {
  const dossier = renderChronologicalDossier(state);
  const structured = renderStructuredState(state);
  const missing = { fromDossier: [] as string[], fromStructured: [] as string[], fromStore: [] as string[] };

  for (const it of state.items) {
    if (!dossier.includes(it.content)) missing.fromDossier.push(it.id);
    if (!structured.includes(it.content)) missing.fromStructured.push(it.id);
    const r = readState(state, it.id);
    if (!r.ok || !r.output.includes(it.content.slice(0, 40))) missing.fromStore.push(it.id);
  }

  // The listing must not leak content, or arm C gets the answer without reading.
  const listing = listState(state);
  const leaked = state.items.filter((i) => listing.includes(i.content.slice(0, 30))).map((i) => i.id);

  return {
    items: state.items.length,
    ...missing,
    listingLeaksContent: leaked,
    parity: missing.fromDossier.length === 0 && missing.fromStructured.length === 0 && missing.fromStore.length === 0 && leaked.length === 0,
  };
}

/** Every figure any arm could legitimately cite, for the numeric-support check. */
export function suppliedNumbers(state: CompanyState) {
  const out = new Set<string>();
  for (const it of state.items) {
    for (const n of it.content.match(/\b\d[\d,]*(?:\.\d+)?\b/g) || []) out.add(n.replace(/,/g, ""));
  }
  return [...out];
}
