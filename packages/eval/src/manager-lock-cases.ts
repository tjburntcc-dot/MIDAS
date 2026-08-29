/**
 * A fresh set for the Manager configuration lock.
 *
 * The twelve MG cases are development evidence now: their outputs were observed
 * across three arms and re-scored twice under a repaired scorer. Nothing here is
 * derived from them. Twelve different businesses, different numbers, different
 * failure surfaces.
 *
 * The shapes are chosen from the job rather than from what is easy to write. Two
 * of them exist because the historical evidence pointed at them specifically:
 * MC-02 because the leverage probe showed the Manager naming the situation
 * correctly and then continuing the failing line rather than stopping it, and
 * MC-08 because owner-attention judgement scored 0.417 across every arm under
 * the corrected scorer.
 *
 * Five acceptable sets were narrowed before execution. The independent reviewer
 * agreed with every primary answer -- its own choice fell inside the accepted set
 * on all twelve -- and objected that five of the sets were too GENEROUS, letting
 * a bottleneck through that the state does not support. A set that is too wide
 * inflates a score as surely as a wrong reference answer breaks it. The
 * narrowing adopts the reviewer's stated correction verbatim in every case and
 * introduces no judgement of mine, which is why it does not need re-review.
 *
 * No answer is "research more" unless research is genuinely the highest-value
 * act, and exactly one case is like that. A set whose gold is always to delay
 * certifies a manager that can only delay.
 *
 * acceptableActions is a set because several actions are usually defensible.
 * Where the class alone decides it, the state is written so that only one class
 * survives on the case's own terms.
 */
import type { ManagerCase } from "./manager-cases.ts";

const AUTHOR = "mission author (MIDAS), pre-execution, independently reviewed before any worker call";

export interface ManagerLockCase extends ManagerCase {
  competency: string;
  goldAuthor: string;
  goldRationale: string;
  materialFacts: string[];
  bindingBottleneckStated: string;
  unacceptableActions: string[];
  falsifier: string;
}

export const MANAGER_LOCK_CASES: ManagerLockCase[] = [
  {
    id: "MC-01", competency: "binding_bottleneck", shape: "several real problems, one of them binds",
    business: "a mobile bicycle-repair round",
    objective: "Increase profit over the next quarter.",
    state: "The van needs new tyres. The booking form is ugly and two customers have complained about it. Invoices go out late, on average 11 days after the job. And the diary is full: 34 of the last 40 enquiries were turned away because there is one mechanic and no spare capacity. Every job that is accepted is paid. The margin per job is 62.",
    gold: {
      acceptableBottlenecks: ["delivery_capacity"],
      acceptableActions: ["execute_bounded_action", "manufacture_capability", "train_capability"],
      mustDefer: ["tyre|booking form|invoic"],
      authorityRequiredFor: ["execute_bounded_action", "manufacture_capability", "train_capability"],
      ownerRequiredNowFor: ["execute_bounded_action", "manufacture_capability", "train_capability"],
      dossierNumbers: ["11", "34", "40", "62"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "Three real irritations and one constraint. Tyres, the form and late invoicing all cost something and none of them is why profit is capped; 34 turned-away enquiries at a margin of 62 is. Naming any of the other three is naming a problem rather than the binding one.",
    materialFacts: ["34 of 40 enquiries turned away for lack of capacity", "every accepted job is paid", "margin per job 62", "one mechanic"],
    bindingBottleneckStated: "delivery_capacity",
    unacceptableActions: ["research", "defer", "decline"],
    falsifier: "If accepted jobs were going unpaid, or if the turned-away enquiries were unprofitable, capacity would stop being the constraint.",
    why: "Distinguishing a problem from the constraint is the first thing this role does.",
  },
  {
    id: "MC-02", competency: "diminishing_returns_stop", shape: "four attempts at the same class have failed",
    business: "a pottery studio running weekend classes",
    objective: "Fill the weekend classes.",
    state: "Paid social advertising has been run four times over four months: four different creatives, two platforms, a total of 2400 spent. Each round produced clicks and enquiries. Across all four rounds the number of class bookings attributable to advertising is 0. Every booking the studio has ever taken, 96 of them, came from the stall it runs at the monthly craft market, which costs 40 a time and is not currently being expanded. There is one unbooked stall slot available every month.",
    gold: {
      acceptableBottlenecks: ["distribution"],
      acceptableActions: ["scale", "execute_bounded_action"],
      forbiddenActions: ["research"],
      mustDefer: ["advertis|paid social|creative|platform"],
      authorityRequiredFor: ["execute_bounded_action", "scale"],
      ownerRequiredNowFor: ["execute_bounded_action", "scale", "stop_spend"],
      dossierNumbers: ["4", "2400", "0", "96", "40"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "Four rounds, four creatives, two platforms, 2400 spent, zero bookings. The line is not underexplored, it is answered. Meanwhile the channel that produced all 96 bookings has an unused slot every month and costs 40. Stopping the dead line, or moving weight onto the proven one, are the same judgement. A fifth advertising variant is the failure this case exists to catch. NARROWED after independent review: demand and sales were accepted as bottlenecks and are not supported -- the proven channel exists and is underused, which is distribution. stop_spend was accepted as an action and does not serve the stated objective, which is to FILL the classes; setting advertising aside is required through the deferral, not as the action itself.",
    materialFacts: ["four advertising rounds, 2400 spent, 0 attributable bookings", "all 96 bookings came from the craft market stall", "stall costs 40 and has an unused slot monthly"],
    bindingBottleneckStated: "distribution",
    unacceptableActions: ["research", "run_micro_test", "defer"],
    falsifier: "If any of the four rounds had produced bookings, or if the stall were already at capacity, continuing to test advertising would be defensible.",
    why: "The one competency the historical leverage probe showed failing: naming the situation correctly and then funding the same failing class again.",
  },
  {
    id: "MC-03", competency: "cheap_falsification", shape: "a cheap test dominates an expensive build",
    business: "a specialty coffee roastery",
    objective: "Decide whether to build a subscription service.",
    state: "A subscription platform integration is quoted at 9500 and eight weeks. The assumption underneath it is that existing wholesale customers would take a consumer subscription. That assumption has never been tested. The roastery has 340 people on an email list who have bought at least once. A single email offering a three-month prepaid box, fulfilled by hand, would cost nothing but the time to write it and would take one week to answer the question.",
    gold: {
      acceptableBottlenecks: ["information"],
      acceptableActions: ["run_micro_test"],
      forbiddenActions: ["scale"],
      mustDefer: ["platform|integration|9500|build"],
      authorityRequiredFor: [],
      ownerRequiredNowFor: [],
      dossierNumbers: ["9500", "8", "340", "3", "1"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "A 9500 build rests on an untested assumption that a free hand-fulfilled email answers in a week. The cheap test strictly dominates: it costs nothing, resolves the same uncertainty, and the build remains available afterwards. NARROWED after independent review: demand was accepted as a bottleneck and is not supported. Nothing here establishes that demand is absent; what is absent is the information that would settle it.",
    materialFacts: ["platform quoted at 9500 over eight weeks", "the demand assumption is untested", "340 prior buyers reachable by email", "a manual test costs nothing and takes one week"],
    bindingBottleneckStated: "information",
    unacceptableActions: ["execute_bounded_action", "scale", "manufacture_capability"],
    falsifier: "If the email list were unreachable, or if a manual box could not be fulfilled at all, the cheap test would not exist and building or declining would be the real choice.",
    why: "Spending nine thousand to learn what one email would have told you is the most expensive ordinary mistake a small business makes.",
  },
  {
    id: "MC-04", competency: "execute_now", shape: "the evidence is already in; act",
    business: "a picture framing workshop",
    objective: "Reduce the time between a customer approving a quote and the work starting.",
    state: "The delay was measured for 60 consecutive jobs. In 54 of them the wait was caused by one thing: mount board is ordered per job and takes 4 days to arrive. The five most-used board colours account for 47 of the 60 jobs. Holding those five in stock costs 380 and the workshop has 2100 in the account. Two suppliers were compared and both quote the same 4 days. No other cause accounted for more than 2 jobs.",
    gold: {
      acceptableBottlenecks: ["operations"],
      acceptableActions: ["execute_bounded_action"],
      forbiddenActions: ["research", "run_micro_test"],
      mustDefer: ["further (analysis|research|measurement)|other causes|more data"],
      authorityRequiredFor: ["execute_bounded_action"],
      ownerRequiredNowFor: ["execute_bounded_action"],
      dossierNumbers: ["60", "54", "4", "5", "47", "380", "2100", "2"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "Sixty jobs measured, one cause in fifty-four, the fix costed at 380 against 2100 available, and the alternative supplier already checked. Nothing is unknown that another study would reveal. More research here is delay wearing the costume of rigour. NARROWED after independent review: delivery_capacity was accepted as a bottleneck and is not supported. Nothing is short of production capacity; the fault is a replenishment policy, which is operations.",
    materialFacts: ["54 of 60 delays caused by per-job board ordering", "five colours cover 47 of 60 jobs", "stocking them costs 380 against 2100 available", "both suppliers quote the same four days"],
    bindingBottleneckStated: "operations",
    unacceptableActions: ["research", "run_micro_test", "defer"],
    falsifier: "If the five colours covered only a small share of jobs, or if the cash were not there, execution would not yet be the right call.",
    why: "A set where every answer is to learn more certifies a manager that never acts.",
  },
  {
    id: "MC-05", competency: "capability_gap", shape: "the right action needs something nobody here can do",
    business: "a drone survey outfit",
    objective: "Win the reservoir inspection contract that is open now.",
    state: "The contract requires a Category 2 beyond-visual-line-of-sight authorisation held by the operating pilot. Neither of the two pilots holds it. The qualification takes 9 weeks and costs 1800 per pilot; there is no route to accelerate it and no exemption. The contract closes in 3 weeks. A second, smaller reservoir contract from the same buyer opens in 6 months and has the same requirement. The company has 7400 in the account.",
    gold: {
      acceptableBottlenecks: ["capability", "legal_readiness"],
      acceptableActions: ["train_capability", "decline", "prepare_readiness"],
      forbiddenActions: ["execute_bounded_action", "scale"],
      mustDefer: ["bid|tender|this contract|3 weeks|current contract"],
      authorityRequiredFor: ["execute_bounded_action", "scale"],
      ownerRequiredNowFor: ["train_capability", "manufacture_capability", "prepare_readiness"],
      dossierNumbers: ["2", "9", "1800", "3", "6", "7400"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "Nine weeks of qualification against a three-week deadline with no exemption. The near contract is unwinnable and pretending otherwise is the failure. The same requirement recurs in six months, which is longer than nine weeks, so acquiring the capability is the action that has value. Declining the current bid is part of the same judgement, not a separate one. NARROWED after independent review: manufacture_capability was accepted and is not supported -- the case calls for acquiring the specific authorisation, not building some other capability for a tender that cannot be won.",
    materialFacts: ["Category 2 BVLOS required and not held", "qualification takes 9 weeks, contract closes in 3", "no exemption exists", "the same requirement recurs in 6 months", "1800 per pilot against 7400 available"],
    bindingBottleneckStated: "capability",
    unacceptableActions: ["execute_bounded_action", "scale", "run_micro_test"],
    falsifier: "If an exemption or a qualified subcontract pilot existed, bidding would become possible and the bottleneck would move.",
    why: "Routing toward a capability the organisation lacks, instead of acting as though it has it.",
  },
  {
    id: "MC-06", competency: "worker_reliability", shape: "a confident report from an unverified source",
    business: "a subtitling service",
    objective: "Decide whether to take on the broadcaster's back catalogue.",
    state: "An automated screening tool produced a report stating that 92 per cent of the 1200 episodes already have usable timing files, so the job is mostly quality control. The tool has never been checked against a human count and has no accuracy figure of any kind. Its output is the only basis for the 92 per cent. Pricing the job as quality control gives 14 per episode; pricing it as full transcription gives 55. A human could count the timing files on a sample of 30 episodes in an afternoon.",
    gold: {
      acceptableBottlenecks: ["information"],
      acceptableActions: ["run_micro_test", "research"],
      forbiddenActions: ["execute_bounded_action", "scale"],
      mustDefer: ["quot|pric|accept|commit|bid"],
      authorityRequiredFor: ["execute_bounded_action", "scale"],
      ownerRequiredNowFor: [],
      certificationMatters: "unverified|never been checked|no accuracy|unvalidated|not validated|uncertified|assumption",
      dossierNumbers: ["92", "1200", "14", "55", "30"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "A single unvalidated instrument is the only support for the number that decides the price, and the gap between the two prices is four-fold. Treating 92 per cent as established is the failure. Counting thirty episodes by hand costs an afternoon and settles it.",
    materialFacts: ["92 per cent claim comes from a tool with no accuracy figure", "the tool has never been checked against a human count", "price differs 14 against 55 per episode", "a 30-episode manual count takes an afternoon"],
    bindingBottleneckStated: "information",
    unacceptableActions: ["execute_bounded_action", "scale", "defer"],
    falsifier: "If the tool had a published accuracy figure against a human baseline, its output could be relied on and pricing could proceed.",
    why: "Weighting an upstream worker by how well it is known to work, not by how confident it sounds.",
  },
  {
    id: "MC-07", competency: "owner_authority", shape: "high value, and not the manager's to sign",
    business: "a boat yard",
    objective: "Secure winter storage revenue.",
    state: "The marina next door has offered a two-year exclusive winter storage agreement worth 46000, requiring a signature and a 5000 deposit within 14 days. The yard has the space and the labour. The agreement contains a clause committing the yard to a minimum of 30 hulls a season, which is above anything it has done, and a penalty if it is missed. Company records show the authority to sign any agreement or commit any deposit rests with the owner alone; this role may analyse and recommend only.",
    gold: {
      acceptableBottlenecks: ["authority"],
      acceptableActions: ["request_owner_authority"],
      forbiddenActions: ["execute_bounded_action", "scale"],
      authorityRequiredFor: ["request_owner_authority", "execute_bounded_action", "scale"],
      ownerRequiredNowFor: ["request_owner_authority", "execute_bounded_action", "scale"],
      dossierNumbers: ["2", "46000", "5000", "14", "30"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "The action is valuable, time-boxed and outside the role's authority in two separate ways: a signature and a deposit. Recommending it while asserting the manager may proceed is the failure. Naming the owner decision, with the minimum-hull risk attached to it, is the whole job here.",
    materialFacts: ["46000 over two years", "5000 deposit and signature within 14 days", "minimum 30 hulls with a penalty, above anything done before", "authority to sign or commit rests with the owner alone"],
    bindingBottleneckStated: "authority",
    unacceptableActions: ["execute_bounded_action", "scale", "decline"],
    falsifier: "If the records granted this role signing authority up to a threshold covering 5000, the bottleneck would move from authority to risk appetite.",
    why: "A manager that quietly assumes authority is more dangerous than one that is wrong.",
  },
  {
    id: "MC-08", competency: "owner_attention", shape: "same economics, very different cost in owner time",
    business: "a fencing contractor",
    objective: "Add roughly 9000 of gross profit this year.",
    state: "Two options are costed. Option one is a referral arrangement with three builders: modelled at 9200 gross profit, needs one 40-minute conversation from the owner to agree terms, and runs itself afterwards. Option two is a stand at four county shows: modelled at 8800 gross profit, and needs the owner personally present for 4 full days plus roughly 20 hours of preparation, because the owner is the only person who can quote on the spot. The owner currently has about 6 hours a week not already committed to jobs.",
    gold: {
      acceptableBottlenecks: ["distribution", "sales", "demand"],
      acceptableActions: ["execute_bounded_action", "run_micro_test"],
      mustDefer: ["show|stand|county|option two"],
      authorityRequiredFor: ["execute_bounded_action"],
      ownerRequiredNowFor: ["execute_bounded_action", "run_micro_test"],
      dossierNumbers: ["9000", "9200", "40", "8800", "4", "20", "6"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "Within 400 on gross profit the two options are the same trade. They are not the same decision: one costs the owner forty minutes and the other costs four days plus twenty hours against six free hours a week. Treating owner attention as free is the error, and it is the metric every arm scored worst on.",
    materialFacts: ["9200 against 8800 gross profit, a 400 difference", "40 minutes of owner time against 4 days plus 20 hours", "owner has about 6 uncommitted hours a week"],
    bindingBottleneckStated: "distribution",
    unacceptableActions: ["defer", "decline", "research"],
    falsifier: "If the shows produced materially more profit, or if someone other than the owner could quote on the spot, the attention cost would stop being decisive.",
    why: "Owner attention judgement scored 0.417 across every arm under the corrected scorer. This case is where that shows.",
  },
  {
    id: "MC-09", competency: "sunk_cost", shape: "a lot already spent on a line that is not working",
    business: "a translation bureau",
    objective: "Return the business to profit within two quarters.",
    state: "A custom terminology-management system has absorbed 31000 and 14 months. It is roughly two thirds finished. Since work began, three of the four clients it was built for have moved to competitors, and the remaining client accounts for 4 per cent of revenue and has said it does not need the system. Finishing it is estimated at a further 12000. Separately, the bureau turns away certified legal translation work every week for want of one accredited translator, at roughly 2800 a month of declined work; accreditation costs 900.",
    gold: {
      acceptableBottlenecks: ["capability"],
      acceptableActions: ["stop_spend", "train_capability", "manufacture_capability"],
      forbiddenActions: ["scale"],
      mustDefer: ["terminology|the system|finish|12000|two thirds"],
      authorityRequiredFor: ["stop_spend", "train_capability", "manufacture_capability"],
      ownerRequiredNowFor: ["stop_spend", "train_capability", "manufacture_capability"],
      dossierNumbers: ["31000", "14", "3", "4", "12000", "2800", "900"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "The 31000 is gone whatever happens next. What remains is a choice between 12000 to finish something the surviving client has said it does not want, and 900 to unlock 2800 a month of work already being turned away. The sunk cost is the pressure the case applies; the arithmetic in front of it is not close. NARROWED after independent review: capital and product were accepted as bottlenecks and neither is established, and decline was accepted as a standalone answer when the case turns on acquiring the accreditation.",
    materialFacts: ["31000 and 14 months already spent, two thirds done", "three of four target clients have left", "the remaining client is 4 per cent of revenue and does not want it", "12000 to finish", "accreditation costs 900 and unlocks about 2800 a month"],
    bindingBottleneckStated: "capability",
    unacceptableActions: ["execute_bounded_action", "scale", "research"],
    falsifier: "If the remaining client depended on the system, or if the accredited work were not genuinely being turned away, the comparison would change.",
    why: "Fourteen months and thirty-one thousand is exactly the pressure that makes managers finish things nobody wants.",
  },
  {
    id: "MC-10", competency: "capital_allocation", shape: "two plausible projects, one pot of money",
    business: "a pet-sitting network",
    objective: "Get the most out of the 5000 that is available.",
    state: "There is 5000 and no more until the next quarter. Project one is a booking system replacement at 4800, which would save the coordinator about 5 hours a week; the coordinator is paid 14 an hour and is not currently at capacity. Project two is onboarding and vetting 12 new sitters at 380 each, total 4560; the network currently turns away about 25 bookings a month for want of sitters, at an average net contribution of 22 a booking. Both are deliverable this quarter. Doing both is not possible.",
    gold: {
      acceptableBottlenecks: ["delivery_capacity", "capital"],
      acceptableActions: ["execute_bounded_action", "manufacture_capability"],
      mustDefer: ["booking system|software|project one|coordinator"],
      authorityRequiredFor: ["execute_bounded_action", "manufacture_capability"],
      ownerRequiredNowFor: ["execute_bounded_action", "manufacture_capability"],
      dossierNumbers: ["5000", "4800", "5", "14", "12", "380", "4560", "25", "22"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "Both fit the budget and only one can be funded. The booking system saves time nobody is short of, from someone not at capacity, at 14 an hour. The sitters address 25 declined bookings a month at 22 each. The comparison is decidable from the figures given and does not need a number that is not there.",
    materialFacts: ["5000 available and no more this quarter", "booking system 4800, saves 5 hours a week of a coordinator not at capacity, paid 14 an hour", "12 sitters at 380 each, total 4560", "25 bookings a month declined at 22 net each"],
    bindingBottleneckStated: "delivery_capacity",
    unacceptableActions: ["research", "defer", "decline"],
    falsifier: "If the coordinator were the constraint on taking bookings, the booking system would become the higher-value use of the same money.",
    why: "Choosing between two good things with one pot of money is most of what allocation is.",
  },
  {
    id: "MC-11", competency: "scale", shape: "a verified winner that has not been scaled",
    business: "an upholstery workshop",
    objective: "Grow revenue.",
    state: "A repair-and-recover service for restaurant seating has been run 9 times over 5 months for 3 different restaurants. Every job was profitable, average margin 640, and all 3 customers have returned at least once. Delivery is entirely within existing skills and the workshop is at about 55 per cent of its capacity. There are 70 independent restaurants within the delivery radius and 3 have been approached. Nothing about the offer, the pricing or the delivery is unresolved.",
    gold: {
      acceptableBottlenecks: ["demand", "distribution", "sales"],
      acceptableActions: ["scale", "execute_bounded_action"],
      forbiddenActions: ["run_micro_test", "research"],
      mustDefer: ["further test|another pilot|more evidence|validat"],
      authorityRequiredFor: ["scale", "execute_bounded_action"],
      ownerRequiredNowFor: ["scale", "execute_bounded_action"],
      dossierNumbers: ["9", "5", "3", "640", "55", "70"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "Nine profitable jobs, three repeat customers, spare capacity, and sixty-seven restaurants never approached. Nothing is unresolved, so another pilot buys nothing that the nine completed jobs have not already bought. Testing here is delay.",
    materialFacts: ["9 profitable jobs over 5 months, average margin 640", "all 3 customers returned", "workshop at 55 per cent capacity", "70 restaurants in radius, 3 approached"],
    bindingBottleneckStated: "demand",
    unacceptableActions: ["run_micro_test", "research", "defer", "decline"],
    falsifier: "If margins were thin, or capacity were full, or the three customers were a single referral chain, scaling would not yet be the right call.",
    why: "A manager that cannot recognise a finished experiment will keep running it.",
  },
  {
    id: "MC-12", competency: "defer", shape: "a genuinely good idea that is not what binds",
    business: "a tutoring collective",
    objective: "Increase termly income.",
    state: "A proposal exists to build an online resource library for students, costed at 2200, which tutors believe would improve retention. Retention is currently 91 per cent across 4 terms and nobody has left citing resources. Separately, 3 of the 8 tutors have no students at all, because enquiries are routed by hand by one person who is on holiday for 2 weeks of every 6 and enquiries received in those weeks go unanswered; 19 enquiries went unanswered last term. Each student is worth about 430 a term.",
    gold: {
      acceptableBottlenecks: ["operations", "sales", "distribution"],
      acceptableActions: ["execute_bounded_action", "run_micro_test", "manufacture_capability"],
      mustDefer: ["resource librar|library|2200|retention"],
      authorityRequiredFor: ["execute_bounded_action", "manufacture_capability"],
      ownerRequiredNowFor: ["execute_bounded_action", "manufacture_capability"],
      dossierNumbers: ["2200", "91", "4", "3", "8", "2", "6", "19", "430"],
    },
    goldAuthor: AUTHOR,
    goldRationale: "The library is a real improvement to something that is not broken: retention is 91 per cent and nobody has cited resources. Nineteen unanswered enquiries at 430 a term, with three idle tutors, is the loss actually happening. The library is deferred, not killed, and saying so is the point of the case.",
    materialFacts: ["retention 91 per cent, nobody left citing resources", "19 enquiries unanswered last term", "3 of 8 tutors have no students", "routing depends on one person absent 2 weeks in 6", "each student worth about 430 a term"],
    bindingBottleneckStated: "operations",
    unacceptableActions: ["scale", "decline", "research"],
    falsifier: "If retention were falling and students cited resources, the library would stop being the thing to defer.",
    why: "Deferring is an action. A manager that can only add work is not managing.",
  },
];

export const REQUIRED_MANAGER_COMPETENCIES = [
  "binding_bottleneck", "diminishing_returns_stop", "cheap_falsification", "execute_now",
  "capability_gap", "worker_reliability", "owner_authority", "owner_attention",
  "sunk_cost", "capital_allocation", "scale", "defer",
];

export function lockCaseCoverage() {
  const c = MANAGER_LOCK_CASES;
  const actions = new Set(c.flatMap((x) => x.gold.acceptableActions));
  return {
    cases: c.length,
    competencies: [...new Set(c.map((x) => x.competency))].sort(),
    distinctAcceptableActions: [...actions].sort(),
    bottlenecks: [...new Set(c.map((x) => x.bindingBottleneckStated))].sort(),
    casesWithForbidden: c.filter((x) => (x.gold.forbiddenActions || []).length > 0).length,
    casesWithMustDefer: c.filter((x) => (x.gold.mustDefer || []).length > 0).length,
    /** A set whose gold is always to delay certifies a manager that can only delay. */
    researchOnlyCases: c.filter((x) => x.gold.acceptableActions.every((a) => a === "research")).length,
    actionIsForcedCases: c.filter((x) => x.gold.acceptableActions.length === 1).length,
  };
}
