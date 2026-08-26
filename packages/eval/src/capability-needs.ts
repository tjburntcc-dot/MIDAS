/**
 * Minimal capability-needs analysis — the first bridge toward an Organization
 * Designer, deliberately stopping well short of one.
 *
 * Given a company, its objective, its actual work population and the workers that
 * exist, this answers: what work must happen, what capabilities that requires,
 * which are covered, which are missing, and which missing one is worth adding
 * next in expected cash terms.
 *
 * The design constraint that matters: the required capabilities are derived from
 * the company's own value chain and its actual work, never from a fixed template.
 * If every company came back needing the same sales-and-web team, the abstraction
 * would be wrong, and there is a test that runs three unrelated companies and
 * fails if their required sets converge.
 *
 * Not built here: dream-team generation, reporting lines, headcount planning,
 * hiring sequencing. Reality has not yet said what those need to be.
 */

/**
 * A capability is a named ability to convert specific inputs into specific
 * outputs in service of a named economic outcome. Not a job title: several
 * capabilities can live in one worker, and one capability can be met by tooling
 * or by removing the work entirely.
 */
export interface Capability {
  id: string;
  title: string;
  economicOutcome: string;
  inputs: string[];
  outputs: string[];
  /** Work types whose items cannot progress without this capability. */
  servesWorkTypes: string[];
  /** States this capability is what moves an item out of. */
  unblocksStates: string[];
  /** If absent, what actually happens. Not rhetorical: it sets the gap cost. */
  ifAbsent: string;
  /** Cheaper alternatives that must be ruled out before manufacturing a worker. */
  alternatives: { tooling?: string; process?: string; absorbBy?: string; external?: string };
}

/**
 * The value chain of a business model, expressed as the stages value passes
 * through. Different business models have genuinely different chains, which is
 * what stops this collapsing into one template.
 */
export const VALUE_CHAINS: Record<string, string[]> = {
  // `opportunity_research` sits between discovery and qualification because
  // reality put it there: on the first real Company 0 population, 11 of 15
  // items could not be qualified for want of facts that were in the full
  // posting but not in the discovery summary. The stage was added after
  // observing that, not before.
  services: ["demand_discovery", "opportunity_research", "qualification", "feasibility", "commercial", "delivery", "collection", "retention"],
  saas: ["problem_discovery", "product_definition", "build", "activation", "conversion", "retention", "support"],
  local_physical_service: ["local_demand_capture", "scheduling", "on_site_delivery", "quality_assurance", "collection", "repeat_booking"],
  ecommerce: ["sourcing", "merchandising", "traffic_acquisition", "conversion", "fulfilment_logistics", "returns_support", "repeat_purchase"],
};

/** Capabilities each stage requires. Stage-driven, so the chain determines the set. */
const STAGE_CAPABILITIES: Record<string, Capability[]> = {
  demand_discovery: [{
    id: "cap.demand_discovery", title: "Find explicit buyer demand",
    economicOutcome: "A continuing supply of real opportunities to qualify",
    inputs: ["public demand sources", "capability boundary"], outputs: ["opportunity records with evidence"],
    servesWorkTypes: ["commercial_opportunity"], unblocksStates: ["discovered"],
    ifAbsent: "The pipeline runs dry and every downstream capability idles.",
    alternatives: { tooling: "Saved searches and alerts on demand sources", process: "Inbound referral only, which caps volume" },
  }],
  opportunity_research: [{
    id: "cap.opportunity_research", title: "Retrieve the facts a decision needs from the source",
    economicOutcome: "Opportunities become decidable instead of stalling as unknowns",
    inputs: ["opportunity URL", "the facts qualification requires"],
    outputs: ["budget, deadline, contact, scope, submission requirements, or an explicit statement that the source omits them"],
    servesWorkTypes: ["commercial_opportunity", "research"], unblocksStates: ["qualifying", "under_research"],
    ifAbsent: "Discovery produces summaries, qualification asks for facts the summary does not contain, and items pile up as held-for-information. Volume grows and decisions do not.",
    alternatives: { tooling: "Fetch and extract the full posting automatically", absorbBy: "cap.demand_discovery if discovery captured full pages rather than summaries" },
  }],

  qualification: [{
    id: "cap.qualification", title: "Decide which opportunities are worth time",
    economicOutcome: "Founder hours spent only on opportunities that can convert and pay",
    inputs: ["opportunity record", "owner policy"], outputs: ["pursue/hold/decline with disqualifiers and economics"],
    servesWorkTypes: ["commercial_opportunity"], unblocksStates: ["qualifying"],
    ifAbsent: "Time is spent on scams, unpayable work and out-of-scope requests.",
    alternatives: { process: "A manual checklist, which does not scale past a few items a day" },
  }],
  feasibility: [{
    id: "cap.feasibility", title: "Establish that the work can actually be delivered",
    economicOutcome: "No commitment to work that cannot be built, which prevents refunds and reputation loss",
    inputs: ["scope", "capability boundary", "tool access"], outputs: ["deliverability verdict, effort split, failure modes"],
    servesWorkTypes: ["commercial_opportunity", "engineering"], unblocksStates: ["qualified"],
    ifAbsent: "Sales promises work on a model's optimism and delivery discovers the truth.",
    alternatives: { tooling: "A checklist of known-deliverable patterns", absorbBy: "cap.qualification where scope is simple" },
  }],
  commercial: [{
    id: "cap.commercial", title: "Turn a qualified opportunity into a truthful offer",
    economicOutcome: "Replies and quotes, which is the only path from opportunity to cash",
    inputs: ["qualified opportunity", "feasibility verdict", "capability evidence"], outputs: ["channel-appropriate outreach, scope framing, price basis, next action"],
    servesWorkTypes: ["commercial_opportunity", "sales_action"], unblocksStates: ["ready_for_work"],
    ifAbsent: "Qualified opportunities accumulate and never convert. Work stops at analysis.",
    alternatives: { process: "Founder writes each message, which is the current bottleneck" },
  }],
  delivery: [{
    id: "cap.delivery", title: "Produce the agreed deliverable",
    economicOutcome: "Delivered work, without which nothing is payable however well it was sold",
    inputs: ["agreed scope", "tools", "access"], outputs: ["deliverable"],
    servesWorkTypes: ["engineering", "fulfilment"], unblocksStates: ["fulfilling"],
    ifAbsent: "Money cannot be earned even when it is won.",
    alternatives: { external: "Subcontract to a human specialist per engagement" },
  }],
  collection: [{
    id: "cap.collection", title: "Convert delivered work into received cash",
    economicOutcome: "Cash actually in the account, which is the only revenue that counts",
    inputs: ["agreed scope and price", "payment rails"], outputs: ["payment request, verified receipt"],
    servesWorkTypes: ["finance"], unblocksStates: ["quoted", "payment_ready"],
    ifAbsent: "Delivered work goes unpaid and the business funds its own customers.",
    alternatives: { tooling: "Payment links and invoicing from an existing processor" },
  }],
  retention: [{
    id: "cap.retention", title: "Turn a completed engagement into the next one",
    economicOutcome: "Repeat revenue at near-zero acquisition cost",
    inputs: ["delivery history", "buyer relationship"], outputs: ["follow-up, upsell, renewal"],
    servesWorkTypes: ["marketing", "support"], unblocksStates: ["delivered"],
    ifAbsent: "Every engagement costs full acquisition and margin stays low.",
    alternatives: { process: "Scheduled manual check-ins" },
  }],
  quality_assurance: [{
    id: "cap.quality_assurance", title: "Check work against agreed scope before it ships",
    economicOutcome: "Fewer revisions and refunds, protecting margin and reputation",
    inputs: ["agreed scope", "deliverable"], outputs: ["pass/fail with specifics"],
    servesWorkTypes: ["fulfilment", "operations"], unblocksStates: ["working"],
    ifAbsent: "Defects reach the buyer and cost more to fix than to catch.",
    alternatives: { absorbBy: "cap.delivery for low-risk work" },
  }],
  problem_discovery: [{
    id: "cap.problem_discovery", title: "Establish which user problem is worth solving",
    economicOutcome: "Build effort aimed at a problem people pay to remove",
    inputs: ["user evidence", "market signals"], outputs: ["validated problem statement"],
    servesWorkTypes: ["research", "product"], unblocksStates: ["under_research"],
    ifAbsent: "Engineering builds confidently in the wrong direction.",
    alternatives: { process: "Founder intuition, which is cheap and often wrong" },
  }],
  product_definition: [{
    id: "cap.product_definition", title: "Decide what to build and what to refuse",
    economicOutcome: "Scarce build capacity spent on what moves activation and retention",
    inputs: ["validated problems", "usage data"], outputs: ["prioritised specification"],
    servesWorkTypes: ["product"], unblocksStates: ["ready_for_work"],
    ifAbsent: "The roadmap follows whoever complained most recently.",
    alternatives: {},
  }],
  build: [{
    id: "cap.build", title: "Ship working software",
    economicOutcome: "A working product in users’ hands, without which every other capability is preparation for nothing",
    inputs: ["specification"], outputs: ["deployed software"],
    servesWorkTypes: ["engineering"], unblocksStates: ["working"],
    ifAbsent: "There is no product.",
    alternatives: { external: "Contract engineering" },
  }],
  activation: [{
    id: "cap.activation", title: "Get a new user to first value quickly",
    economicOutcome: "Activation drives every downstream conversion and retention number",
    inputs: ["product telemetry", "onboarding flow"], outputs: ["improved first-run experience"],
    servesWorkTypes: ["product", "marketing"], unblocksStates: ["working"],
    ifAbsent: "Acquisition spend leaks out through users who never reach value.",
    alternatives: { tooling: "In-product guides" },
  }],
  conversion: [{
    id: "cap.conversion", title: "Convert active users into payers",
    economicOutcome: "Revenue per acquired user, which determines what the business can afford to pay for the next one",
    inputs: ["usage data", "pricing"], outputs: ["pricing and paywall decisions"],
    servesWorkTypes: ["marketing", "experiment"], unblocksStates: ["working"],
    ifAbsent: "Usage grows and revenue does not.",
    alternatives: {},
  }],
  support: [{
    id: "cap.support", title: "Resolve user problems without founder time",
    economicOutcome: "Retention protected at low marginal cost",
    inputs: ["tickets", "product knowledge"], outputs: ["resolutions, deflection content"],
    servesWorkTypes: ["support"], unblocksStates: ["working"],
    ifAbsent: "The founder becomes the support desk and stops building.",
    alternatives: { tooling: "Help centre and canned responses" },
  }],
  local_demand_capture: [{
    id: "cap.local_demand_capture", title: "Capture demand in a fixed geography",
    economicOutcome: "A full schedule, which is the binding constraint on a local service",
    inputs: ["local listings", "reviews", "local search"], outputs: ["booking enquiries"],
    servesWorkTypes: ["marketing"], unblocksStates: ["discovered"],
    ifAbsent: "Capacity sits idle regardless of how good the service is.",
    alternatives: { tooling: "Listings and review management" },
  }],
  scheduling: [{
    id: "cap.scheduling", title: "Fill and sequence a route or calendar efficiently",
    economicOutcome: "More billable hours per travel hour",
    inputs: ["enquiries", "capacity", "geography"], outputs: ["assigned schedule"],
    servesWorkTypes: ["operations"], unblocksStates: ["ready_for_work"],
    ifAbsent: "Staff spend the day travelling rather than serving.",
    alternatives: { tooling: "Scheduling software" },
  }],
  on_site_delivery: [{
    id: "cap.on_site_delivery", title: "Perform the service in person",
    economicOutcome: "The service itself, which is the only thing the customer is actually paying for",
    inputs: ["schedule", "equipment", "trained people"], outputs: ["completed job"],
    servesWorkTypes: ["external_human"], unblocksStates: ["fulfilling"],
    ifAbsent: "Nothing is delivered. This cannot be met by software.",
    alternatives: { external: "Employ or subcontract people; no AI substitute exists" },
  }],
  repeat_booking: [{
    id: "cap.repeat_booking", title: "Convert a completed job into a recurring one",
    economicOutcome: "Predictable recurring revenue that removes the cost of winning the same customer twice",
    inputs: ["job history"], outputs: ["rebooking, maintenance plans"],
    servesWorkTypes: ["marketing"], unblocksStates: ["delivered"],
    ifAbsent: "Every month restarts from zero.",
    alternatives: { process: "Ask at the end of every job" },
  }],
  sourcing: [{
    id: "cap.sourcing", title: "Find products worth selling at a workable margin",
    economicOutcome: "Gross margin per order, which sets the ceiling on everything the business can spend to acquire a customer",
    inputs: ["supplier data", "demand signals"], outputs: ["product and supplier selection"],
    servesWorkTypes: ["operations"], unblocksStates: ["under_research"],
    ifAbsent: "The catalogue cannot earn a margin whatever the traffic.",
    alternatives: {},
  }],
  merchandising: [{
    id: "cap.merchandising", title: "Present the catalogue so it sells",
    economicOutcome: "Conversion rate and average order value, the two levers that turn existing traffic into more revenue without more spend",
    inputs: ["catalogue", "behaviour data"], outputs: ["listings, copy, imagery"],
    servesWorkTypes: ["marketing"], unblocksStates: ["working"],
    ifAbsent: "Good products do not sell.",
    alternatives: {},
  }],
  traffic_acquisition: [{
    id: "cap.traffic_acquisition", title: "Bring qualified visitors at a workable cost",
    economicOutcome: "Contribution after acquisition cost, which decides whether growth funds itself or consumes capital",
    inputs: ["channel data", "margin"], outputs: ["campaigns, channel mix"],
    servesWorkTypes: ["marketing"], unblocksStates: ["discovered"],
    ifAbsent: "No demand reaches the storefront.",
    alternatives: {},
  }],
  fulfilment_logistics: [{
    id: "cap.fulfilment_logistics", title: "Get physical goods to buyers",
    economicOutcome: "Delivered orders at a predictable unit cost, so margin survives contact with shipping",
    inputs: ["orders", "inventory", "carriers"], outputs: ["shipments"],
    servesWorkTypes: ["operations", "external_human"], unblocksStates: ["fulfilling"],
    ifAbsent: "Orders are taken and not delivered.",
    alternatives: { external: "Third-party logistics" },
  }],
  returns_support: [{
    id: "cap.returns_support", title: "Handle returns and complaints",
    economicOutcome: "Margin protected against refund and chargeback leakage",
    inputs: ["orders", "policy"], outputs: ["resolutions"],
    servesWorkTypes: ["support"], unblocksStates: ["working"],
    ifAbsent: "Chargebacks and reviews erode both margin and reach.",
    alternatives: { tooling: "Self-service returns" },
  }],
  repeat_purchase: [{
    id: "cap.repeat_purchase", title: "Bring buyers back",
    economicOutcome: "Lifetime value above acquisition cost",
    inputs: ["purchase history"], outputs: ["lifecycle campaigns"],
    servesWorkTypes: ["marketing"], unblocksStates: ["delivered"],
    ifAbsent: "The business pays full acquisition cost for every sale forever.",
    alternatives: {},
  }],
};

export function requiredCapabilities(businessModel: string): Capability[] {
  const chain = VALUE_CHAINS[businessModel];
  if (!chain) throw new Error("no value chain for business model " + businessModel);
  const out: Capability[] = [];
  for (const stage of chain) {
    for (const c of STAGE_CAPABILITIES[stage] || []) out.push({ ...c, stage } as any);
  }
  return out;
}

/**
 * Assess a company: which required capabilities are covered by an existing
 * worker, which are missing, and what each gap is costing right now.
 *
 * The gap cost is measured from the company's own work population, not asserted.
 * A capability whose absence is not currently blocking anything is a real gap but
 * not today's bottleneck, and the two are reported separately.
 */
export function assessCompany(args: {
  workspace: any;
  businessModel: string;
  objective: string;
  workItems: any[];
  workers: Array<{ roleId: string; versionId: string; capabilities: string[]; productionStatus: string }>;
  evScore: (item: any) => { score: number; expectedCash: number };
}) {
  const required = requiredCapabilities(args.businessModel);
  const covered = new Map<string, any>();
  for (const w of args.workers) {
    for (const cap of w.capabilities) {
      const existing = covered.get(cap);
      // A production-eligible worker covers a capability; a development one is
      // recorded as partial, because unverified coverage is not coverage.
      if (!existing || w.productionStatus === "production_eligible") covered.set(cap, w);
    }
  }

  const rows = required.map((cap) => {
    const worker = covered.get(cap.id) || null;
    const blocked = args.workItems.filter((w) =>
      cap.servesWorkTypes.includes(w.type) && cap.unblocksStates.includes(w.state));
    const blockedCash = blocked.reduce((a, w) => a + (args.evScore(w).expectedCash || 0), 0);
    return {
      capabilityId: cap.id,
      title: cap.title,
      stage: (cap as any).stage,
      economicOutcome: cap.economicOutcome,
      status: worker ? (worker.productionStatus === "production_eligible" ? "covered" : "partial") : "missing",
      coveredBy: worker ? { roleId: worker.roleId, versionId: worker.versionId, productionStatus: worker.productionStatus } : null,
      blockedItems: blocked.length,
      blockedExpectedCashUsd: Number(blockedCash.toFixed(2)),
      ifAbsent: cap.ifAbsent,
      alternatives: cap.alternatives,
      inputs: cap.inputs,
      outputs: cap.outputs,
    };
  });

  const missing = rows.filter((r) => r.status !== "covered");
  // The bottleneck is the gap with the most expected cash stuck behind it right
  // now. A gap blocking nothing today is still a gap, and is reported as latent
  // rather than promoted to bottleneck on narrative grounds.
  const ranked = missing.slice().sort((a, b) =>
    b.blockedExpectedCashUsd - a.blockedExpectedCashUsd || b.blockedItems - a.blockedItems);
  const bottleneck = ranked.find((r) => r.blockedItems > 0) || null;

  return {
    workspaceId: args.workspace.id,
    company: args.workspace.name,
    businessModel: args.businessModel,
    objective: args.objective,
    valueChain: VALUE_CHAINS[args.businessModel],
    capabilities: rows,
    covered: rows.filter((r) => r.status === "covered").map((r) => r.capabilityId),
    partial: rows.filter((r) => r.status === "partial").map((r) => r.capabilityId),
    missing: missing.map((r) => r.capabilityId),
    latentGaps: ranked.filter((r) => r.blockedItems === 0).map((r) => r.capabilityId),
    bottleneck,
    rankedGaps: ranked,
    workItemsConsidered: args.workItems.length,
  };
}
