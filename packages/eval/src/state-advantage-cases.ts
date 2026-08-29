/**
 * Seven businesses whose right answer depends on their history.
 *
 * Each case is a list of state items, rendered three ways from that one list, so
 * no arm can hold a fact another lacks. Each contains facts that matter, facts
 * that look like they matter and do not, at least one item that has been
 * overtaken by a later one, and at least one item whose importance only appears
 * once another item is known.
 *
 * The eighth shape the mission lists -- owner attention repeatedly consumed for
 * weak return -- is deliberately absent. The owner-involvement field is a free
 * string scored as a categorical one, which is a known instrument defect, so a
 * case built on it would produce a number nobody could read. Six model calls are
 * better spent on shapes that can be measured.
 *
 * `gold.staleTokens` are phrases that appear only in superseded items. Using one
 * to justify a decision is a stale-state error, and it is the sharpest thing this
 * benchmark measures.
 */
import type { CompanyState } from "./company-state.ts";

export interface StateCase {
  id: string;
  shape: string;
  state: CompanyState;
  gold: {
    acceptableBottlenecks: string[];
    acceptableActions: string[];
    forbiddenActions?: string[];
    mustDefer?: string[];
    authorityRequiredFor?: string[];
    ownerRequiredNowFor?: string[];
    /** Only in superseded items. Relying on one is an error. */
    staleTokens: string[];
    /** In the item that superseded it, or in the decisive current item. */
    currentTokens: string[];
    /** The historical signal the decision turns on. */
    memoryTokens: string[];
    memoryKind: string;
    relevantItemIds: string[];
    irrelevantItemIds: string[];
  };
  audit: {
    bindingBottleneck: string;
    keyOutcomeSignal: string;
    supersededFact: string;
    plausibleAlternatives: string;
    whyPreferredWins: string;
    falsifier: string;
  };
}

const S = (id: string, kind: string, at: number, content: string, provenance: string, epistemic = "verified", status = "current", supersededBy?: string) =>
  ({ id, kind, at, content, provenance, epistemic, status, supersededBy });

export const STATE_CASES: StateCase[] = [
  {
    id: "SA-1", shape: "repeated failure of one intervention class",
    state: {
      company: "a company selling bookkeeping software to small firms",
      objective: "Acquire paying customers this quarter.",
      items: [
        S("obj", "objective", 1, "The company wants paying customers this quarter.", "owner"),
        S("ads1", "experiment", 2, "A paid search campaign ran for six weeks at 4000 total.", "internal record"),
        S("ads1o", "outcome", 3, "That campaign produced 900 visitors, 11 trial sign-ups and no paying customers.", "analytics"),
        S("ads2", "experiment", 4, "A second paid campaign ran on a different network at 2500, with new creative.", "internal record"),
        S("ads2o", "outcome", 5, "It produced 600 visitors, 7 trials and no paying customers.", "analytics"),
        S("ads3", "experiment", 6, "A third campaign targeted a narrower audience at 1800.", "internal record"),
        S("ads3o", "outcome", 7, "It produced 300 visitors, 4 trials and no paying customers.", "analytics"),
        S("calls", "event", 8, "Four trial users were spoken to by the founder.", "founder notes"),
        S("callso", "outcome", 9, "All four said they abandoned the trial because importing their existing ledger failed.", "founder notes"),
        S("build", "fact", 10, "A ledger import tool has never been built and is estimated at three weeks.", "engineering"),
        S("brand", "fact", 11, "The company logo and site were redesigned last year and are well liked in feedback.", "survey"),
        S("office", "fact", 12, "The office lease renews in eight months.", "admin"),
        S("cash", "resource", 13, "Remaining marketing budget is 3000.", "accounts"),
        S("prop", "fact", 14, "A fourth paid campaign has been proposed at 3000 with another new audience.", "marketing"),
        S("auth", "authority", 15, "Spending above 500 requires the owner. Internal build work does not.", "owner"),
      ],
    },
    gold: {
      acceptableBottlenecks: ["product", "offer", "demand"],
      acceptableActions: ["execute_bounded_action", "manufacture_capability", "stop_spend", "run_micro_test"],
      forbiddenActions: ["scale"],
      mustDefer: ["campaign|paid|advertis|fourth"],
      authorityRequiredFor: ["execute_bounded_action", "scale", "stop_spend"],
      ownerRequiredNowFor: ["execute_bounded_action", "scale", "stop_spend"],
      staleTokens: [],
      currentTokens: ["import", "ledger"],
      memoryTokens: ["three campaigns", "no paying", "third", "all three", "previous campaigns", "each campaign"],
      memoryKind: "prior_failure",
      relevantItemIds: ["ads1o", "ads2o", "ads3o", "callso", "build", "cash", "prop"],
      irrelevantItemIds: ["brand", "office"],
    },
    audit: {
      bindingBottleneck: "The product cannot be adopted: every trial dies at ledger import.",
      keyOutcomeSignal: "Three campaigns, 8300 spent, 22 trials, zero paying customers, and four of four interviews name the same cause.",
      supersededFact: "None. This case tests memory of repeated failure rather than staleness.",
      plausibleAlternatives: "A fourth campaign; more interviews; a price change.",
      whyPreferredWins: "Traffic is not the constraint. The same intervention has failed three times for a reason the interviews already identified.",
      falsifier: "Trial users who did import successfully and still did not pay.",
    },
  },
  {
    id: "SA-2", shape: "a constraint that no longer applies",
    state: {
      company: "a small civil engineering consultancy",
      objective: "Win work worth more than 20000 in the next two months.",
      items: [
        S("obj", "objective", 1, "The company wants a contract above 20000 within two months.", "owner"),
        S("ins0", "constraint", 2, "The company holds no professional indemnity cover, which excludes it from public tenders.", "admin", "verified", "superseded", "ins1"),
        S("decl", "decision", 3, "A public framework worth 60000 was declined for that reason.", "internal record"),
        S("ins1", "event", 4, "Professional indemnity cover of 2000000 was purchased and is now active.", "insurance certificate"),
        S("fw", "fact", 5, "The same public framework reopens for applications for a further four weeks.", "portal"),
        S("cap", "resource", 6, "Two engineers are available; current workload is about half capacity.", "internal"),
        S("small", "fact", 7, "Three private jobs of about 3000 each are available immediately.", "enquiries"),
        S("van", "fact", 8, "The company van needs replacing within the year.", "admin"),
        S("web", "fact", 9, "The website was refreshed in the spring and traffic is up.", "analytics"),
        S("auth", "authority", 10, "Submitting a framework application binds the company and requires the owner.", "owner"),
      ],
    },
    gold: {
      acceptableBottlenecks: ["distribution", "demand", "sales", "none_binding"],
      acceptableActions: ["execute_bounded_action", "prepare_readiness", "request_owner_authority"],
      forbiddenActions: ["decline", "stop_spend"],
      mustDefer: [],
      authorityRequiredFor: ["execute_bounded_action", "scale", "prepare_readiness"],
      ownerRequiredNowFor: ["execute_bounded_action", "scale", "prepare_readiness", "request_owner_authority"],
      staleTokens: ["holds no professional indemnity", "no professional indemnity cover", "excludes it from public tenders", "cannot bid", "lacks insurance"],
      currentTokens: ["2000000", "cover", "active", "purchased", "now insured"],
      memoryTokens: ["reopen", "declined", "four weeks", "framework"],
      memoryKind: "superseded_constraint",
      relevantItemIds: ["ins1", "fw", "decl", "cap", "auth"],
      irrelevantItemIds: ["van", "web"],
    },
    audit: {
      bindingBottleneck: "Nothing structural now blocks the framework; the company simply has not applied.",
      keyOutcomeSignal: "The reason the framework was declined stopped being true at order 4, and the framework is open for four more weeks.",
      supersededFact: "The absence of indemnity cover, superseded by its purchase.",
      plausibleAlternatives: "Taking the three small private jobs; declining again.",
      whyPreferredWins: "60000 against three jobs of 3000, with capacity free and the only disqualifier removed.",
      falsifier: "A framework condition beyond insurance that the company still fails.",
    },
  },
  {
    id: "SA-3", shape: "a strategy that worked and no longer can",
    state: {
      company: "a domestic cleaning company",
      objective: "Increase profit over the next quarter.",
      items: [
        S("obj", "objective", 1, "The company wants higher profit next quarter.", "owner"),
        S("ref", "experiment", 2, "A referral offer was run two years ago giving existing customers a free clean for each referral.", "internal record"),
        S("refo", "outcome", 3, "It produced 40 new customers in six weeks and was the most profitable campaign the company has run.", "accounts"),
        S("staff0", "fact", 4, "At that time the company employed four cleaners.", "payroll", "verified", "superseded", "staff1"),
        S("staff1", "event", 5, "Three cleaners left over the last year and were not replaced. One cleaner remains.", "payroll"),
        S("book", "fact", 6, "The remaining cleaner is fully booked and the company already turns away about six enquiries a week.", "scheduling"),
        S("hire", "fact", 7, "Hiring a cleaner takes about three weeks and candidates are available.", "recruitment"),
        S("prop", "fact", 8, "Repeating the referral offer has been proposed for next month.", "owner note"),
        S("price", "fact", 9, "Prices have not changed in two years.", "accounts"),
        S("insta", "fact", 10, "The company has 900 followers on a social account nobody posts to.", "marketing"),
        S("auth", "authority", 11, "Hiring requires the owner. Scheduling changes do not.", "owner"),
      ],
    },
    gold: {
      acceptableBottlenecks: ["delivery_capacity"],
      acceptableActions: ["manufacture_capability", "execute_bounded_action", "train_capability"],
      forbiddenActions: ["scale", "run_micro_test"],
      mustDefer: ["referral|offer|campaign|demand|market"],
      authorityRequiredFor: ["manufacture_capability", "execute_bounded_action", "scale", "train_capability"],
      ownerRequiredNowFor: ["manufacture_capability", "execute_bounded_action", "scale", "train_capability"],
      staleTokens: ["four cleaners", "employed four"],
      currentTokens: ["one cleaner", "One cleaner remains", "fully booked", "turns away"],
      memoryTokens: ["referral", "worked", "most profitable", "two years ago", "at that time"],
      memoryKind: "old_success_now_wrong",
      relevantItemIds: ["staff1", "book", "hire", "prop", "refo"],
      irrelevantItemIds: ["insta", "price"],
    },
    audit: {
      bindingBottleneck: "One cleaner, fully booked, already refusing six enquiries a week.",
      keyOutcomeSignal: "The referral offer worked when there were four cleaners. There is one.",
      supersededFact: "The four-cleaner headcount, superseded by three departures.",
      plausibleAlternatives: "Repeating the referral offer; raising prices.",
      whyPreferredWins: "Demand already exceeds capacity, so generating more of it converts nothing.",
      falsifier: "Evidence that the turned-away enquiries would not convert at current prices.",
    },
  },
  {
    id: "SA-4", shape: "outcomes contradict the company narrative",
    state: {
      company: "an online retailer of specialist tea",
      objective: "Repeat last year's growth.",
      items: [
        S("obj", "objective", 1, "The company wants to repeat the growth it saw last year.", "owner"),
        S("belief", "fact", 2, "The company believes its growth came from a packaging redesign launched in March.", "owner", "assumed", "superseded", "split"),
        S("deal", "event", 3, "A wholesale listing with a national chain also began in March.", "contracts"),
        S("split", "outcome", 4, "Revenue by channel shows direct sales flat across the year and the entire increase coming from the wholesale channel.", "accounts"),
        S("pack2", "fact", 5, "A second packaging redesign has been proposed at 12000.", "marketing"),
        S("chains", "fact", 6, "Two comparable national chains have open supplier applications.", "trade press"),
        S("cash", "resource", 7, "Available capital is 14000.", "accounts"),
        S("blog", "fact", 8, "The company blog publishes weekly and has a small readership.", "analytics"),
        S("awards", "fact", 9, "The original packaging won a regional design award.", "trade press"),
        S("auth", "authority", 10, "Spending above 1000 requires the owner.", "owner"),
      ],
    },
    gold: {
      acceptableBottlenecks: ["distribution", "demand", "sales"],
      acceptableActions: ["execute_bounded_action", "prepare_readiness", "run_micro_test", "research"],
      forbiddenActions: ["scale"],
      mustDefer: ["packaging|redesign|12000|second design"],
      authorityRequiredFor: ["execute_bounded_action", "scale", "prepare_readiness"],
      ownerRequiredNowFor: ["execute_bounded_action", "scale", "prepare_readiness"],
      staleTokens: ["packaging redesign drove", "growth came from the packaging", "redesign caused"],
      currentTokens: ["wholesale", "direct sales flat", "channel"],
      memoryTokens: ["wholesale", "flat", "channel", "same month", "March"],
      memoryKind: "outcome_over_narrative",
      relevantItemIds: ["split", "deal", "chains", "pack2", "cash"],
      irrelevantItemIds: ["blog", "awards"],
    },
    audit: {
      bindingBottleneck: "Distribution. One wholesale listing produced all of the growth and there are two more available.",
      keyOutcomeSignal: "Direct sales flat, all growth in wholesale, while the company credits the packaging.",
      supersededFact: "The belief that packaging drove growth, contradicted by the channel split.",
      plausibleAlternatives: "A second redesign; research into why direct is flat.",
      whyPreferredWins: "The measured driver has two more instances available and the credited driver has none.",
      falsifier: "Evidence that the wholesale chain stocked the product because of the packaging.",
    },
  },
  {
    id: "SA-5", shape: "a worker that is no longer reliable",
    state: {
      company: "a property maintenance firm",
      objective: "Decide whether to take on a large contract.",
      items: [
        S("obj", "objective", 1, "The company must decide whether to bid for a 55000 maintenance contract.", "owner"),
        S("est", "fact", 2, "The internal estimator says the contract is comfortably profitable at the proposed price.", "estimator", "reported"),
        S("hist0", "fact", 3, "The estimator was accurate on the last two jobs before the review.", "internal record", "verified", "superseded", "review"),
        S("review", "event", 4, "A review of the estimator's last five completed jobs found three came in over cost, two of them by more than 30 per cent.", "accounts"),
        S("nocheck", "fact", 5, "Nobody has checked this estimate independently.", "internal"),
        S("cost", "fact", 6, "An independent quantity surveyor would review the estimate for 600 within a week.", "quote"),
        S("dead", "constraint", 7, "The bid closes in three weeks.", "portal"),
        S("cap", "resource", 8, "The company has capacity for the contract if it wins.", "scheduling"),
        S("van", "fact", 9, "Two vans were serviced last month.", "admin"),
        S("auth", "authority", 10, "Submitting a bid binds the company and requires the owner. Commissioning a review under 1000 does not.", "owner"),
      ],
    },
    gold: {
      acceptableBottlenecks: ["information", "capability"],
      acceptableActions: ["seek_professional_review", "run_micro_test", "research"],
      forbiddenActions: ["execute_bounded_action", "scale"],
      mustDefer: ["bid|submit|55000"],
      authorityRequiredFor: ["execute_bounded_action", "scale", "seek_professional_review"],
      ownerRequiredNowFor: ["execute_bounded_action", "scale"],
      staleTokens: ["accurate on the last two", "estimator was accurate", "reliable estimator", "track record of accuracy"],
      currentTokens: ["three came in over cost", "over cost", "30 per cent", "review of the estimator"],
      memoryTokens: ["over cost", "five completed", "review", "30 per cent", "unreliable", "not been checked"],
      memoryKind: "worker_reliability",
      relevantItemIds: ["review", "est", "nocheck", "cost", "dead"],
      irrelevantItemIds: ["van"],
    },
    audit: {
      bindingBottleneck: "The estimate cannot be relied on, and the whole decision rests on it.",
      keyOutcomeSignal: "Three of the estimator's last five jobs came in over cost, two badly.",
      supersededFact: "The estimator's earlier accuracy, superseded by the five-job review.",
      plausibleAlternatives: "Bidding on the internal estimate; declining outright.",
      whyPreferredWins: "600 and one week buys the missing reliability inside a three-week window.",
      falsifier: "A surveyor review that confirms the internal estimate.",
    },
  },
  {
    id: "SA-6", shape: "capital allocation settled by history",
    state: {
      company: "a food producer selling at markets and online",
      objective: "Allocate the remaining 9000 of capital for the best return.",
      items: [
        S("obj", "objective", 1, "Remaining capital of 9000 must be allocated.", "owner"),
        S("mkt1", "experiment", 2, "A market stall was trialled at a second location for 3000.", "internal record"),
        S("mkt1o", "outcome", 3, "It returned 2100 of gross profit over the trial and required the owner present every weekend.", "accounts"),
        S("on1", "experiment", 4, "An online subscription box was trialled for 2000.", "internal record"),
        S("on1o", "outcome", 5, "It returned 5400 of gross profit in the same period and needed about two hours a week.", "accounts"),
        S("on2", "fact", 6, "The subscription can be expanded with 9000 of stock and packaging.", "operations"),
        S("mkt2", "fact", 7, "A third market location is available for 9000 in pitch fees for the season.", "market office"),
        S("owner", "resource", 8, "The owner has about eight hours a week available for the business.", "owner"),
        S("recipe", "fact", 9, "A new recipe was well received at a tasting.", "notes"),
        S("logo", "fact", 10, "The logo was updated last year.", "marketing"),
        S("auth", "authority", 11, "Capital allocation above 1000 requires the owner.", "owner"),
      ],
    },
    gold: {
      acceptableBottlenecks: ["capital", "distribution", "delivery_capacity", "none_binding"],
      acceptableActions: ["scale", "execute_bounded_action"],
      forbiddenActions: ["decline", "stop_spend", "defer"],
      mustDefer: ["market|stall|pitch|third location"],
      authorityRequiredFor: ["scale", "execute_bounded_action", "manufacture_capability"],
      ownerRequiredNowFor: ["scale", "execute_bounded_action", "manufacture_capability"],
      staleTokens: [],
      currentTokens: ["5400", "subscription", "two hours"],
      memoryTokens: ["5400", "2100", "trial", "returned", "gross profit"],
      memoryKind: "outcome_comparison",
      relevantItemIds: ["mkt1o", "on1o", "on2", "mkt2", "owner"],
      irrelevantItemIds: ["recipe", "logo"],
    },
    audit: {
      bindingBottleneck: "Nothing is broken; the question is where scarce capital goes.",
      keyOutcomeSignal: "Two comparable trials: 2100 for 3000 and every weekend of owner time, against 5400 for 2000 and two hours a week.",
      supersededFact: "None. This case tests use of outcome history.",
      plausibleAlternatives: "The third market pitch; splitting the capital.",
      whyPreferredWins: "Better return, on less capital, on far less of the scarcest input, already measured rather than projected.",
      falsifier: "Evidence the subscription return does not hold at larger volume.",
    },
  },
  {
    id: "SA-7", shape: "an earlier investment changed what is possible",
    state: {
      company: "a small electronics assembler",
      objective: "Find higher-margin work.",
      items: [
        S("obj", "objective", 1, "The company wants higher-margin work.", "owner"),
        S("med0", "decision", 2, "Medical device assembly was declined two years ago because the company lacked the required quality certification.", "internal record", "verified", "superseded", "cert"),
        S("cert", "event", 3, "The company completed that quality certification eleven months ago in order to keep an automotive customer.", "certificate"),
        S("auto", "outcome", 4, "The automotive customer was retained and contributes 40000 a year at 12 per cent margin.", "accounts"),
        S("medop", "fact", 5, "Two medical assembly contracts are open, together worth about 70000 a year at margins in the mid thirties.", "trade enquiry"),
        S("medreq", "fact", 6, "Both require exactly the certification the company now holds and no other qualification.", "tender documents"),
        S("cap", "resource", 7, "The line runs at about 60 per cent of capacity.", "operations"),
        S("staff", "fact", 8, "Two assemblers have been with the company more than five years.", "payroll"),
        S("paint", "fact", 9, "The unit was repainted in the summer.", "admin"),
        S("auth", "authority", 10, "Pursuing a contract requires the owner. Preparing an application does not.", "owner"),
      ],
    },
    gold: {
      acceptableBottlenecks: ["offer", "demand", "distribution", "none_binding"],
      acceptableActions: ["execute_bounded_action", "prepare_readiness", "request_owner_authority", "research"],
      forbiddenActions: ["decline", "stop_spend"],
      mustDefer: [],
      authorityRequiredFor: ["execute_bounded_action", "scale"],
      ownerRequiredNowFor: ["execute_bounded_action", "scale", "request_owner_authority"],
      staleTokens: ["lacks the certification", "does not hold the certification", "is not certified", "cannot take medical", "without the certification"],
      currentTokens: ["completed that quality certification", "now holds", "certification eleven months"],
      memoryTokens: ["certification", "declined", "now holds", "eleven months", "already"],
      memoryKind: "capability_unlock",
      relevantItemIds: ["cert", "med0", "medop", "medreq", "cap"],
      irrelevantItemIds: ["paint", "staff"],
    },
    audit: {
      bindingBottleneck: "Nothing blocks the higher-margin work any more; the opportunity set changed and nobody noticed.",
      keyOutcomeSignal: "The certification obtained for an unrelated reason is exactly the one that disqualified the company from medical work.",
      supersededFact: "The absence of the certification, superseded by obtaining it.",
      plausibleAlternatives: "Continuing with automotive; researching other sectors.",
      whyPreferredWins: "70000 at mid-thirties margin against 40000 at twelve, with the line at 60 per cent and no remaining qualification gap.",
      falsifier: "A further medical requirement the tender documents do not mention.",
    },
  },
];

export function caseCoverage() {
  return {
    cases: STATE_CASES.length,
    memoryKinds: [...new Set(STATE_CASES.map((c) => c.gold.memoryKind))],
    withSupersededItems: STATE_CASES.filter((c) => c.state.items.some((i) => i.status !== "current")).length,
    meanItems: Number((STATE_CASES.reduce((a, c) => a + c.state.items.length, 0) / STATE_CASES.length).toFixed(1)),
  };
}

/**
 * A development smoke case, deliberately outside STATE_CASES.
 *
 * Its only job is to prove the repaired runtime completes a list, a read and a
 * decision before twenty-eight calls are committed to the real seven. It is
 * never scored in the comparison and its fingerprint is not part of the sealed
 * set.
 */
export const SMOKE_CASE: StateCase = {
  id: "SA-SMOKE", shape: "development smoke, not part of the comparison",
  state: {
    company: "a bicycle repair shop",
    objective: "Decide what to do with the remaining 2000 of capital.",
    items: [
      S("obj", "objective", 1, "The shop must decide how to use 2000 of remaining capital.", "owner"),
      S("old", "constraint", 2, "The shop had no card payment terminal, so it could take cash only.", "admin", "verified", "superseded", "new"),
      S("new", "event", 3, "A card terminal was installed last month and now works.", "supplier invoice"),
      S("q", "outcome", 4, "Takings rose about 15 per cent in the month after the terminal was installed.", "accounts"),
      S("tool", "fact", 5, "A wheel-truing stand costing 2000 would let the shop take work it currently turns away.", "supplier quote"),
      S("sign", "fact", 6, "A new shop sign would cost 2000 and has no measured effect on takings.", "supplier quote"),
      S("cat", "fact", 7, "The shop cat is popular with regular customers.", "notes"),
      S("auth", "authority", 8, "Capital spending above 500 requires the owner.", "owner"),
    ],
  },
  gold: {
    acceptableBottlenecks: ["delivery_capacity", "capability", "none_binding", "offer"],
    acceptableActions: ["execute_bounded_action", "manufacture_capability", "scale", "run_micro_test"],
    forbiddenActions: [],
    mustDefer: [],
    authorityRequiredFor: ["execute_bounded_action", "manufacture_capability", "scale"],
    ownerRequiredNowFor: ["execute_bounded_action", "manufacture_capability", "scale"],
    staleTokens: ["no card payment terminal", "cash only"],
    currentTokens: ["card terminal", "installed"],
    memoryTokens: ["15 per cent", "terminal", "turns away"],
    memoryKind: "smoke",
    relevantItemIds: ["new", "tool", "auth", "obj"],
    irrelevantItemIds: ["cat", "sign"],
  },
  audit: {
    bindingBottleneck: "The shop turns work away for want of one piece of equipment.",
    keyOutcomeSignal: "The terminal already paid off; the truing stand addresses refused work.",
    plausibleAlternatives: "The sign; holding the capital until something better appears.",
    supersededFact: "The absence of a card terminal, superseded by its installation.",
    whyPreferredWins: "Equipment that converts refused work beats signage with no measured effect, and the shop has a recent instance of equipment paying off.",
    falsifier: "Evidence that the refused work would not be taken even with the stand.",
  },
};
