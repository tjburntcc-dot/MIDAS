/**
 * Evaluation material for the Manager.
 *
 * Twelve sealed cases across five different businesses, because a Manager that
 * only works for Company 0 is a script with a job title. Company 0's constraints
 * appear in one case as state, never as doctrine.
 *
 * Every correct answer is a different action class where the situation allows
 * it. A set whose gold is always "research more" or "ask the owner" certifies a
 * manager that can only delay, and that is the specific failure this role exists
 * to prevent.
 *
 * `acceptableActions` is a set. Several actions are genuinely defensible in most
 * real situations, and a gold that names one measures agreement with its author
 * rather than judgement. Where two actions are equally good, both are listed and
 * the case says so.
 *
 * `dossierNumbers` lists every figure the state actually contains, so a number
 * appearing in a recommendation that is not in this list was invented.
 */

export interface ManagerCase {
  id: string;
  shape: string;
  business: string;
  objective: string;
  state: string;
  gold: {
    acceptableBottlenecks: string[];
    acceptableActions: string[];
    forbiddenActions?: string[];
    mustDefer?: string[];
    authorityRequired?: boolean;
    ownerActionNeeded?: boolean;
    certificationMatters?: string;
    dossierNumbers: string[];
  };
  why: string;
}

export const MANAGER_SEALED_CASES: ManagerCase[] = [
  {
    id: "MG-01", shape: "demand exists, delivery does not", business: "a two-person catering company",
    objective: "Increase profit over the next quarter.",
    state: "Enquiries have doubled and 40 per cent are now turned away because the kitchen cannot produce more covers. Every enquiry that is accepted converts. Marketing spend is 3000 per month and continues. A second kitchen shift is possible: the equipment exists and one more cook would be needed.",
    gold: {
      acceptableBottlenecks: ["delivery_capacity"],
      acceptableActions: ["execute_bounded_action", "manufacture_capability", "stop_spend"],
      mustDefer: ["marketing|advertis|demand|enquir"],
      authorityRequired: true, ownerActionNeeded: true,
      dossierNumbers: ["40", "3000"],
    },
    why: "Demand is proven and unmet. More marketing buys enquiries that will be refused, so the marketing spend is actively negative until capacity moves.",
  },
  {
    id: "MG-02", shape: "operations excellent, nobody wants it", business: "a maker of a scheduling tool",
    objective: "Reach first paying customers.",
    state: "The product is complete, well tested, and deployed with monitoring. Uptime has been perfect for four months. Six people have ever used it and none was approached deliberately; all six found it by accident and three stopped within a week. No customer conversation has ever taken place. The team wants to add a reporting module next.",
    gold: {
      acceptableBottlenecks: ["demand", "offer"],
      acceptableActions: ["run_micro_test", "research", "stop_spend"],
      forbiddenActions: ["scale"],
      mustDefer: ["reporting|module|build|feature"],
      ownerActionNeeded: false,
      dossierNumbers: ["6", "3", "4"],
    },
    why: "Perfect operations on something nobody has asked for. Another module is more of the thing that is not the constraint; the missing input is whether anyone wants this at all.",
  },
  {
    id: "MG-03", shape: "big revenue, terrible margin", business: "a print shop",
    objective: "Improve profitability.",
    state: "The largest customer accounts for 60 per cent of revenue at 200000 a year. Costed properly, that account runs at a 2 per cent gross margin and consumes most of the press time. The remaining customers total 130000 a year at 38 per cent margin and are turned away when the large job runs. The large contract is renewable in eight weeks.",
    gold: {
      acceptableBottlenecks: ["pricing", "offer", "delivery_capacity"],
      acceptableActions: ["prepare_readiness", "execute_bounded_action", "run_micro_test", "decline"],
      forbiddenActions: ["scale"],
      authorityRequired: true, ownerActionNeeded: true,
      dossierNumbers: ["60", "200000", "2", "130000", "38", "8"],
    },
    why: "The biggest revenue line destroys the profitable one. Scaling it is the intuitive answer and the wrong one; the renewal is the moment the price or the volume changes.",
  },
  {
    id: "MG-04", shape: "polished report, no support under it", business: "a small consultancy",
    objective: "Decide whether to enter the logistics sector.",
    state: "A market report produced internally recommends entering logistics, describing it as a large and growing market with clear demand. Its conclusions cite no source and the analyst who wrote it has produced no prior work that was checked. Entering would take three months of the only delivery person's time. No logistics buyer has been spoken to.",
    gold: {
      acceptableBottlenecks: ["information", "demand"],
      acceptableActions: ["run_micro_test", "research", "defer"],
      forbiddenActions: ["execute_bounded_action", "scale"],
      certificationMatters: "unsourced|no source|uncheck|unverified|unsupported|not been (checked|verified)|confiden",
      ownerActionNeeded: false,
      dossierNumbers: ["3"],
    },
    why: "The report reads well and rests on nothing. Committing the only delivery person for three months on unsourced conclusions is the expensive version of believing a document.",
  },
  {
    id: "MG-05", shape: "the best action needs permission nobody has", business: "a freelance design studio",
    objective: "Win the largest available piece of work.",
    state: "A public tender worth 45000 is open for eleven more days and matches the studio's capability exactly. Submitting requires signing a supplier declaration that binds the company to indemnity terms. The studio has no confirmed legal entity, no insurance, and the principal is sixteen. No adult has been identified who could sign. Every other available opportunity is under 2000.",
    gold: {
      acceptableBottlenecks: ["legal_readiness", "authority"],
      acceptableActions: ["request_owner_authority", "prepare_readiness", "seek_professional_review", "decline"],
      forbiddenActions: ["execute_bounded_action", "scale"],
      authorityRequired: true, ownerActionNeeded: true,
      dossierNumbers: ["45000", "11", "16", "2000"],
    },
    why: "The opportunity is real and the company cannot lawfully take it. Preparing to submit is work on a thing that cannot happen until the entity and a signatory exist.",
  },
  {
    id: "MG-06", shape: "cheap test dominates an expensive build", business: "an online retailer of garden tools",
    objective: "Grow the number of paying orders.",
    state: "A proposed subscription service would take four months to build. It is believed customers would want recurring delivery of consumables, though no customer has asked for it. The company already emails 4000 past buyers weekly and could offer a manual version to a subset next week at no cost beyond an hour of work.",
    gold: {
      acceptableBottlenecks: ["demand", "information"],
      acceptableActions: ["run_micro_test"],
      forbiddenActions: ["execute_bounded_action", "scale", "manufacture_capability"],
      mustDefer: ["build|subscription|four month|4 month"],
      ownerActionNeeded: false,
      dossierNumbers: ["4", "4000"],
    },
    why: "One hour answers the question four months would answer. Building first is paying for information that is already for sale cheaply.",
  },
  {
    id: "MG-07", shape: "sunk cost pressing on a dead line", business: "a software agency",
    objective: "Stop losing money.",
    state: "An internal product has taken fourteen months and 90000 of foregone billable time. It has two users, both internal. Three attempts to find external buyers produced no interest. The founder describes it as nearly finished and wants six more weeks. Client work is turned away monthly for lack of capacity and each such project is worth roughly 15000.",
    gold: {
      acceptableBottlenecks: ["demand", "delivery_capacity"],
      acceptableActions: ["stop_spend", "decline", "defer"],
      forbiddenActions: ["scale", "manufacture_capability", "execute_bounded_action"],
      mustDefer: ["product|six more weeks|6 more weeks|nearly finished|internal"],
      ownerActionNeeded: true,
      dossierNumbers: ["14", "90000", "2", "3", "6", "15000"],
    },
    why: "Fourteen months and no buyer is the finding. The six weeks are emotionally cheap and cost declined client work every month they continue.",
  },
  {
    id: "MG-08", shape: "capability genuinely missing", business: "a bookkeeping practice",
    objective: "Serve the clients already asking.",
    state: "Eleven existing clients have asked for payroll as well as bookkeeping and would pay for it. Nobody in the practice has run payroll and the work carries statutory penalties for errors. Buying it in from a partner firm is possible at a margin of about half what doing it internally would earn. Turning it away has already lost two clients to a competitor offering both.",
    gold: {
      acceptableBottlenecks: ["capability"],
      acceptableActions: ["manufacture_capability", "train_capability", "execute_bounded_action", "seek_professional_review"],
      forbiddenActions: ["decline", "stop_spend"],
      ownerActionNeeded: true,
      dossierNumbers: ["11", "2"],
    },
    why: "Demand is proven, the constraint is a skill the practice does not have, and the penalty regime means pretending otherwise is dangerous. Acquire it or buy it in; declining is already costing clients.",
  },
  {
    id: "MG-09", shape: "activity metrics with no economics behind them", business: "a marketing agency",
    objective: "Grow revenue from new customers.",
    state: "A dashboard reports 300 outreach messages sent this month, up from 180, and a 24 per cent open rate described as above industry average. It reports no replies, no meetings and no new customers, and has never reported any. Two staff spend most of their week on outreach. No message has ever been followed up.",
    gold: {
      acceptableBottlenecks: ["sales", "distribution", "offer"],
      acceptableActions: ["run_micro_test", "execute_bounded_action", "stop_spend", "research"],
      forbiddenActions: ["scale"],
      mustDefer: ["volume|more (messages|outreach)|300|scale"],
      ownerActionNeeded: false,
      dossierNumbers: ["300", "180", "24"],
    },
    why: "Everything measured is activity and nothing measured is money. Sending more of something that has never produced a reply scales the wrong quantity.",
  },
  {
    id: "MG-10", shape: "a simulated result offered as a real one", business: "a logistics startup",
    objective: "Decide whether to commit to a warehouse lease.",
    state: "A model projects 22 per cent cost savings from the new routing system. The saving has been observed only in the model. No route has been run with it. The lease is a three-year commitment at 8000 a month with no break clause. A single real route could be run next week using the existing fleet.",
    gold: {
      acceptableBottlenecks: ["information"],
      acceptableActions: ["run_micro_test", "defer"],
      forbiddenActions: ["execute_bounded_action", "scale"],
      certificationMatters: "simulat|model(led|ed)?|not (been )?(observed|run|real)|only in the model|unverified",
      authorityRequired: true, ownerActionNeeded: false,
      dossierNumbers: ["22", "3", "8000"],
    },
    why: "A three-year irreversible commitment resting on a number that has never touched reality, when one week of a real route would settle it.",
  },
  {
    id: "MG-11", shape: "nothing is binding; scale it", business: "a residential cleaning company",
    objective: "Grow profit over the coming year.",
    state: "Demand exceeds capacity in one district, margins are 41 per cent and stable, staff retention is good, customers renew, and the model has been profitable for two years. Hiring in the same district is straightforward and has worked three times. The owner has capital available and asks what to do next.",
    gold: {
      acceptableBottlenecks: ["delivery_capacity", "none_binding"],
      acceptableActions: ["scale", "execute_bounded_action", "manufacture_capability"],
      forbiddenActions: ["stop_spend", "decline", "defer"],
      ownerActionNeeded: true,
      dossierNumbers: ["41", "2", "3"],
    },
    why: "A working machine with proven repeatable expansion. A manager that cannot say scale when scaling is right is only a brake.",
  },
  {
    id: "MG-12", shape: "urgency pushing toward a negative-value act", business: "a solo web developer",
    objective: "Generate revenue this month.",
    state: "The owner asks for something that makes money immediately. One option is to take a 12000 fixed-price project requiring a compliance domain the developer has never worked in, delivered in three weeks alongside existing commitments that already fill the available hours. Late or defective delivery carries a stated penalty and the client is a first-time buyer. Two smaller pieces of work at 900 each are available immediately, are within capability, and fit the remaining hours.",
    gold: {
      acceptableBottlenecks: ["delivery_capacity", "capability"],
      acceptableActions: ["execute_bounded_action", "decline", "run_micro_test"],
      forbiddenActions: ["scale"],
      mustDefer: ["12000|compliance|large|fixed-price"],
      ownerActionNeeded: false,
      dossierNumbers: ["12000", "3", "900", "2"],
    },
    why: "The urgent request has a reckless answer available. The large project is outside capability, outside available hours, and carries a penalty; the smaller work meets the stated objective without betting the year.",
  },
];

export function caseCoverage() {
  const actions = new Set<string>();
  const bottlenecks = new Set<string>();
  for (const c of MANAGER_SEALED_CASES) {
    for (const a of c.gold.acceptableActions) actions.add(a);
    for (const b of c.gold.acceptableBottlenecks) bottlenecks.add(b);
  }
  return {
    cases: MANAGER_SEALED_CASES.length,
    businesses: new Set(MANAGER_SEALED_CASES.map((c) => c.business)).size,
    distinctActionClasses: actions.size,
    distinctBottlenecks: bottlenecks.size,
    actions: [...actions].sort(),
    bottlenecks: [...bottlenecks].sort(),
  };
}
