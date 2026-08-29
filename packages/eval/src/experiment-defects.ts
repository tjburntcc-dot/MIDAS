/**
 * Every experiment defect this repository has recorded, as data.
 *
 * These are not recollections. Each row names the mission, the commit record or
 * document that reports it, and whether it was caught before or after money was
 * spent. They are here so the preflight can be built from what actually went
 * wrong rather than from what seems prudent, and so the claim "this is the
 * dominant failure mode" can be checked rather than asserted.
 *
 * History is not rewritten. Where a defect changed a verdict, the verdict stands
 * as recorded and the row says so.
 */

export const DEFECT_CATEGORIES = [
  "ACTOR_IDENTITY",
  "GOLD_DEFECT",
  "CASE_DESIGN",
  "SCORER_DEFECT",
  "METRIC_NOT_EXERCISED",
  "POLICY_CONFLICT",
  "TOOL_AFFORDANCE",
  "RUNTIME_TRUNCATION",
  "BUDGET_PLANNING",
  "STATISTICAL_RESOLUTION",
  "INFORMATION_PARITY",
  "SEALED_CONTAMINATION",
  "CONFIGURATION_IDENTITY",
  "POST_HOC_CRITERION_CHANGE",
  "RAW_TRACE_INSUFFICIENCY",
  /**
   * A defect in how a result is displayed, affecting nothing computed from it.
   *
   * Added deliberately rather than by stretching an existing label. The guard
   * that forced this refused an undeclared category on the same day the Auditor
   * answered a case with a defect class the taxonomy does not contain -- the
   * same failure, one caught by a test and one scored as a miss.
   */
  "REPORTING_DEFECT",
] as const;

export interface ExperimentDefect {
  id: string;
  category: string;
  where: string;
  what: string;
  caughtBeforeSpend: boolean;
  changedTheDecision: boolean;
  guard: string | null;
  guardReusable: boolean;
}

export const RECORDED_DEFECTS: ExperimentDefect[] = [
  {
    id: "D-01", category: "ACTOR_IDENTITY", where: "academy certification, three sessions",
    what: "Every certification examined a bare model given a generic professional instruction while reporting the result as a MIDAS worker. Four more paths were found doing the same thing in the following mission.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "subject-identity.ts classifyPath and its repository-wide test", guardReusable: true,
  },
  {
    id: "D-02", category: "GOLD_DEFECT", where: "record-identity-cases.ts DEV-01",
    what: "The reference answer claimed twelve opportunities on a record that states no total. The number was invented by the case author, and a worker returning null was more honest than the gold.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "a regression asserting no gold count exceeds what its record states", guardReusable: false,
  },
  {
    id: "D-03", category: "POLICY_CONFLICT", where: "record-identity.ts routingFor",
    what: "The routing rule required a numeric count above one to decompose, so a worker that honestly declined to invent a total was demoted for it. The rule was wrong on its own terms.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "a regression that an unknown count does not demote an aggregate", guardReusable: false,
  },
  {
    id: "D-04", category: "CASE_DESIGN", where: "academy-scenarios.ts SC-SALES-04",
    what: "A trap fired on the correct answer: booking included matched a pattern for not included.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "exam-audit.ts trap-fires-on-a-correct-answer check", guardReusable: true,
  },
  {
    id: "D-05", category: "CASE_DESIGN", where: "researcher-scenarios.ts, eight of ten sealed exams",
    what: "Every check was a text pattern, so a fluent answer was indistinguishable from work. Also a brief that leaked an expectation through the standard fictional disclaimer.",
    caughtBeforeSpend: true, changedTheDecision: false,
    guard: "exam-audit.ts no_observable_check and brief_leaks_answer", guardReusable: true,
  },
  {
    id: "D-06", category: "SCORER_DEFECT", where: "team-run.ts handoff tracer",
    what: "Any intermediate gap was treated as a loss, reporting 25 per cent fidelity on a chain that was fine.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "absence at the final stage is the loss; misreporting is its own breach", guardReusable: false,
  },
  {
    id: "D-07", category: "STATISTICAL_RESOLUTION", where: "routing cycle qualify-recall gate",
    what: "Four positive cases made the smallest possible regression 0.25, so the gate could not tell slightly more cautious from broken. The candidate was rejected on it.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "none at the time", guardReusable: false,
  },
  {
    id: "D-08", category: "STATISTICAL_RESOLUTION", where: "requirement-channel probe",
    what: "Three required-escalation cases against a 0.33 margin meant one flipped case satisfied the margin exactly. The directional result did not survive a powered rerun.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "a test asserting the margin cannot be met by one case", guardReusable: true,
  },
  {
    id: "D-09", category: "GOLD_DEFECT", where: "auditor-cases.ts AS-05 and AS-27",
    what: "A must-pass case contained a fabrication the author did not notice, and an underdetermined verdict was assigned where the correct answer was a failure. The auditor was right and was scored wrong.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "independent adjudication of reference answers", guardReusable: true,
  },
  {
    id: "D-10", category: "SCORER_DEFECT", where: "manager.ts numeric support",
    what: "Citing a supplied figure in digits, and adding two supplied figures, were both scored as fabrication. All four flags that failed three arms were scorer error and none was a fabricated fact.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "numeric-support.ts with five support classes and its adversarial tests", guardReusable: true,
  },
  {
    id: "D-11", category: "SCORER_DEFECT", where: "manager-cases.ts authority and owner gold",
    what: "Authority and owner involvement were declared per case when both are properties of the action chosen. A manager picking research was marked wrong for saying research needs no signature.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "action-indexed gold fields and a scorer that reads them", guardReusable: true,
  },
  {
    id: "D-12", category: "SCORER_DEFECT", where: "manager.ts ownerActionRequired",
    what: "A free string is scored as a categorical value, so a manager that describes the owner's optional part reads as demanding involvement. Still open.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "recorded as a tracked defect test", guardReusable: false,
  },
  {
    id: "D-13", category: "TOOL_AFFORDANCE", where: "sandbox.ts list_objects",
    what: "The inventory printed the kind unlabelled between the id and the summary. A worker read the kind as the identifier, was told only No such object, re-listed and gave up.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "a repaired format built and tested, deliberately not adopted without a measured comparison", guardReusable: true,
  },
  {
    id: "D-14", category: "TOOL_AFFORDANCE", where: "company-state.ts list_state",
    what: "An unsupported kind filter returned an empty string with no error. A reasonable opening guess cost a turn and taught nothing, and four of seven cases never reached a decision.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "an unknown filter now names the kinds present and how to recover", guardReusable: true,
  },
  {
    id: "D-15", category: "RUNTIME_TRUNCATION", where: "state advantage arm C",
    what: "Three turns was list, read and decide with no slack, so one wasted turn consumed the decision. The arm was structurally handicapped by the harness.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "a turn budget that must survive one wasted turn", guardReusable: true,
  },
  {
    id: "D-16", category: "BUDGET_PLANNING", where: "workstation affordance probe",
    what: "Six cases across two arms were planned as twelve calls. Multi-step reading costs two to three calls per case, so the control arm consumed the whole ceiling and the treatment never ran.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "call-budget.ts planCalls computed from turns, refusing to start", guardReusable: true,
  },
  {
    id: "D-17", category: "BUDGET_PLANNING", where: "state advantage cycle",
    what: "Without per-arm reserves a greedy arm can consume the whole ceiling before another arm runs, which is precisely how the workstation affordance comparison lost its treatment arm.",
    caughtBeforeSpend: true, changedTheDecision: false,
    guard: "per-arm reservations enforced at charge time", guardReusable: true,
  },
  {
    id: "D-18", category: "POST_HOC_CRITERION_CHANGE", where: "state C confirmation smoke gate",
    what: "The smoke gate required the worker to skip a distractor and failed a run in which the runtime plainly worked. The criterion was corrected after seeing the result and recorded as such.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "a test recording the change and why a smoke gate differs from a scored gate", guardReusable: true,
  },
  {
    id: "D-19", category: "CONFIGURATION_IDENTITY", where: "academy.ts CertificationTarget",
    what: "The target did not include the execution environment, so a protocol revision moved no fingerprint and every certification would have carried across a changed environment silently.",
    caughtBeforeSpend: true, changedTheDecision: false,
    guard: "an optional executionEnvironmentId that leaves historical ids byte-identical", guardReusable: true,
  },
  {
    id: "D-20", category: "METRIC_NOT_EXERCISED", where: "auditor certification dimensions",
    what: "Dimensions with no case exercising them had to be reported as null rather than as a flattering default, and nothing enforced that a gate could not be written against one.",
    caughtBeforeSpend: true, changedTheDecision: false,
    guard: "null dimensions are excluded from the weighted score", guardReusable: true,
  },
  {
    id: "D-21", category: "RAW_TRACE_INSUFFICIENCY", where: "state advantage arm C",
    what: "Four cases failed identically and the stored result did not contain the tool calls, so three model calls had to be spent rediscovering what happened.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "none at the time", guardReusable: false,
  },
  {
    id: "D-22", category: "INFORMATION_PARITY", where: "state advantage cycle",
    what: "Three renderings of one fact list could have diverged silently and made the experiment measure information rather than representation.",
    caughtBeforeSpend: true, changedTheDecision: false,
    guard: "parityAudit asserting every item reaches every arm and the listing leaks nothing", guardReusable: true,
  },
  {
    id: "D-23", category: "SEALED_CONTAMINATION", where: "routing and identity sealed sets",
    what: "A sealed set that had informed a diagnosis was no longer a clean holdout for the question that diagnosis raised.",
    caughtBeforeSpend: true, changedTheDecision: false,
    guard: "a test that a new sealed set reuses no record from a set that has already informed a diagnosis", guardReusable: true,
  },
  {
    id: "D-24", category: "CASE_DESIGN", where: "manager-cases.ts",
    what: "A dossier leaked an action class into its own text, and three objectives were too terse to say what was being optimised.",
    caughtBeforeSpend: true, changedTheDecision: false,
    guard: "a pre-spend suite audit over the case set", guardReusable: true,
  },
  {
    id: "D-25", category: "GOLD_DEFECT", where: "state-advantage-cases.ts",
    what: "A belief the outcome data contradicts was marked current rather than superseded, and a stale token also appeared in current state where it would have flagged correct work.",
    caughtBeforeSpend: true, changedTheDecision: false,
    guard: "gold audit asserting stale tokens appear only in superseded items", guardReusable: true,
  },
  {
    id: "D-26", category: "POST_HOC_CRITERION_CHANGE", where: "auditor configuration lock, the first preflight-native experiment",
    what: "A gate applied at decision time -- ambiguous handling, threshold 1.0 -- was never declared in the manifest, so preflight could not check its resolution. It rested on a single case, which is the exact shape preflight refuses when it can see it.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "every metric must be gated in the manifest or marked reportedOnly", guardReusable: true,
  },
  {
    id: "D-27", category: "GOLD_DEFECT", where: "auditor-lock-cases.ts AL-12",
    what: "A case written as underdetermined where the correct answer is a material omission: the task asked whether a deadline was met and the output neither answers nor says it cannot. Independent adjudication and the generic baseline both gave the better answer, and the MIDAS candidate did not.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "independent adjudication of any case that a gate rests on alone", guardReusable: true,
  },
  {
    id: "D-28", category: "CONFIGURATION_IDENTITY", where: "worker-adapter.ts adaptedTarget",
    what: "adaptedTarget hardcodes tools as [\"sandbox\"] for every worker. The auditor lock candidate uses no tools at all, so its certification target misdescribes the configuration it certifies. Recorded rather than repaired: changing the field would move every historical target id.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "recorded; the fix belongs with the next target-set creation", guardReusable: false,
  },
  {
    id: "D-29", category: "GOLD_DEFECT", where: "auditor-tool-cases.ts AT-05 and AT-08",
    what: "Both underdetermined cases asked whether the SUBJECT MATTER could be settled from the records and scored the auditor against that. The audit question is whether THE OUTPUT is sound, and an output that converts silence into a stated absence, or confirms a match against an unreadable record, is defective either way. The auditor answered correctly on both and was scored as missing both. Independent frontier adjudication, blind to my gold and to the auditor answer, returned fail on both at high confidence.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "the case-set audit now asserts what insufficient_evidence means: it is correct only when the auditor cannot tell whether the OUTPUT is sound, never merely when the subject matter is unsettled",
    guardReusable: true,
  },
  {
    id: "D-30", category: "RUNTIME_TRUNCATION", where: "auditor-readonly-certification.mjs manifest.runtime",
    what: "Preflight raised turns_survive_one_wasted_call as an advisory. I silenced it by relabelling workflowShape from three steps to two rather than raising the turn budget. The worker then returned one tool call per turn, so turn one listed, turn two read a single record, and turn three was the forced finish. Cases needing two records opened were unreachable, and the decisiveReadRate gate that failed is confounded as a result.",
    caughtBeforeSpend: false, changedTheDecision: true,
    guard: "the turn floor is now derived from runtime.expectedTools plus one, so a self-declared workflow shape cannot lower it",
    guardReusable: true,
  },
  {
    id: "D-31", category: "RAW_TRACE_INSUFFICIENCY", where: "auditor-readonly-certification.mjs result writer",
    what: "The preflight-refused path wrote its refusal to the same file as a completed run. After the run finished, a later --dry with a raised turn budget was refused and overwrote the result, destroying every row and every raw trace the run had captured. The traces existed because preflight had refused to run without them, and were then lost to a dry run.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "a refusal writes to its own path; the completed result is never the same file",
    guardReusable: true,
  },
  {
    id: "D-32", category: "BUDGET_PLANNING", where: "experiment-preflight.ts ManifestBudget",
    what: "One maxTurnsPerCase cannot describe a set whose cases differ in shape. The Auditor desk set has twelve two-record packets and six four-record ones, and an instrument probe measured the large packets taking a turn longer. Declaring the larger cap for all eighteen inflates the worst case by a third; declaring the smaller one truncates the six that need it, which is exactly how the previous campaign lost its tool-use gate.",
    caughtBeforeSpend: true, changedTheDecision: false,
    guard: "budget.turnsByCase declares a cap per case, the worst case is their sum, and preflight checks every case is covered, within the declared cap, and at or above the derived workflow floor",
    guardReusable: true,
  },
  {
    id: "D-33", category: "BUDGET_PLANNING", where: "audit-desk campaign planning",
    what: "The turn cost per case was about to be assumed from the previous interface rather than measured. A five-call probe on two throwaway cases showed the auditor does batch ids -- which the old interface could not tell us -- but does not gather exhaustively: on a four-record packet it batched two, went back for a third, and finished at the cap with one record unopened. Assuming three turns for every case would have truncated a third of the campaign.",
    caughtBeforeSpend: true, changedTheDecision: true,
    guard: "measure the instrument on throwaway cases before budgeting a campaign whose cost depends on an unobserved behaviour",
    guardReusable: true,
  },
  {
    id: "D-34", category: "REPORTING_DEFECT", where: "audit-desk-decide.mjs and auditor-readonly-certification.mjs tier print",
    what: "Both printed award.tier, and certify() returns awardedTier. The awarded tier displayed as undefined in two campaign reports. Nothing computed from it -- the evidence decision comes from the frozen gates, not from this line -- so no result was affected, but a reader would have seen a blank where the tier belongs.",
    caughtBeforeSpend: false, changedTheDecision: false,
    guard: "recorded as a harmless implementation defect; the campaign it appeared in remains interpretable and is not voided by it",
    guardReusable: false,
  },
];

export function defectSummary() {
  const byCategory: Record<string, number> = {};
  for (const d of RECORDED_DEFECTS) byCategory[d.category] = (byCategory[d.category] || 0) + 1;
  const ranked = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  return {
    total: RECORDED_DEFECTS.length,
    byCategory,
    mostCommon: ranked.slice(0, 3).map(([k, v]) => k + " " + v),
    caughtBeforeSpend: RECORDED_DEFECTS.filter((d) => d.caughtBeforeSpend).length,
    caughtAfterSpend: RECORDED_DEFECTS.filter((d) => !d.caughtBeforeSpend).length,
    changedTheDecision: RECORDED_DEFECTS.filter((d) => d.changedTheDecision).length,
    reusableGuards: RECORDED_DEFECTS.filter((d) => d.guardReusable).length,
    unguarded: RECORDED_DEFECTS.filter((d) => !d.guard).map((d) => d.id),
  };
}