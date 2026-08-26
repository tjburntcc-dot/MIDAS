/**
 * Frontier arena for the Opportunity Qualifier.
 *
 * The question is the one the programme doctrine names: can a MIDAS specialist be
 * trusted more for its job than simply opening the best generic AI available and
 * asking it to do the same work?
 *
 * Fairness rules applied here, because a rigged arena is worse than no arena:
 *
 *   - Frontier arms receive the SAME company policy the MIDAS worker holds.
 *     Withholding the value floor and the capability boundary would make the
 *     baseline lose on information it was never given, which measures nothing.
 *   - The strong-prompt arm is written to be genuinely strong. It states the
 *     decision procedure, the taxonomy, the estimation rules and the failure
 *     modes, and it is longer and more explicit than the MIDAS prompt.
 *   - Every arm sees the identical case record, uses the identical output schema,
 *     and gets no gold and no tools. No arm has retrieval the others lack.
 *   - Model names are discovered at run time, never hardcoded into the doctrine.
 *
 * The separating arm is `midas_prompt_on_frontier`: MIDAS's own prompt run on the
 * frontier model. Without it, a MIDAS win or loss cannot be attributed between the
 * specialisation and the base model.
 */

/** A basic role instruction: what a competent person would type without effort. */
export const FRONTIER_BASIC_PROMPT = {
  system:
    "You qualify inbound work opportunities for a small digital services business. " +
    "Decide whether to pursue, hold for more information, or decline, and estimate the value, the share an AI can do, and the human time required.",
  developer: "Return one JSON object matching the supplied schema.",
};

/**
 * A strong, manually engineered prompt. This is the arm MIDAS has to beat, so it
 * is written to win: explicit procedure, explicit taxonomy, explicit estimation
 * method, and the named failure modes an experienced operator would guard.
 */
export function frontierStrongPrompt(policyBlock: string) {
  return {
    system: [
      "You are an experienced operator qualifying a single inbound work opportunity for a small digital services business.",
      "Your judgement is used to decide where a scarce founder spends their time, so a confident wrong answer is more costly than an honest uncertain one.",
      "",
      policyBlock,
      "",
      "Work through the record in this order.",
      "1. Establish what is actually stated. Separate what the record says from what you are inferring. Never invent a budget, a deadline, a client identity, or a capability.",
      "2. Check the hard disqualifiers before anything else, because they end the analysis regardless of how attractive the work looks. Consider each in turn: an advance fee demanded from the contractor; a push to pay off platform, by wire, crypto or personal account; an identity that cannot be checked against a verified payment method, company record or contract history; unpaid speculative work offered as a condition of selection; a value below the engagement floor; work outside the capability boundary; deceptive or illegal work; no route to the person who signs; and an opportunity whose submission window has already closed.",
      "3. Judge expiry against the stated deadline, not the age of the posting. A deadline that has passed is expired. A deadline that is merely soon, even today or tomorrow, is live and should be pursued if otherwise sound. A posting with no deadline, a rolling window, or an explicit statement that it remains open is live however old it is. Being old is not the same as being closed.",
      "4. Distinguish two different risks that are easy to conflate. Counterparty fraud risk is the risk that this buyer defrauds you or does not pay. The deceptive or prohibited nature of the requested work is separate: a buyer with a verified payment history can ask for work you must refuse, and in that case you decline the work while counterparty fraud risk stays low.",
      "5. Estimate the numbers by decomposition rather than impression. For value, start from any stated budget and give a band around it; where no figure is stated, price the scope against the market range for that kind of work; where neither is possible, return null rather than a guess. For the AI share and the human time, decompose the work into its parts, judge which parts a system can do unaided, and give a band. Return null for any figure the record genuinely cannot support: an absent figure is not a low figure, and a fabricated number is worse than an admitted gap.",
      "6. Name the specific missing fields that would change your decision.",
      "",
      "Cite only evidence ids that appear in the record. Do not contact anyone, quote a price, or commit to anything.",
    ].join("\n"),
    developer:
      "Return one JSON object matching the supplied schema and nothing else. " +
      "You are not told the correct answer and must not request one.",
  };
}

/** Arms are constructed by the runner; this only names and documents them. */
export const ARENA_ARM_KINDS = {
  frontier_basic: "Strongest accessible frontier model with a basic role instruction.",
  frontier_strong: "Strongest accessible frontier model with an expertly engineered prompt carrying the same company policy MIDAS holds.",
  midas_prompt_on_frontier: "The MIDAS champion's own prompt, run on the frontier model. Separates the specialisation from the base model.",
  midas_champion: "The promoted MIDAS worker on its own model.",
  midas_previous: "The previous MIDAS champion, for continuity.",
};

/** Verdict tiers. FRONTIER_EXCEEDING is not awarded on a single run or a tie. */
export const CERTIFICATION_TIERS = [
  "UNTRAINED", "DEVELOPMENT", "COMPETENT", "PRODUCTION_ELIGIBLE",
  "FRONTIER_COMPETITIVE", "FRONTIER_EXCEEDING", "ELITE_CERTIFIED",
];

/**
 * Award a tier from evidence.
 *
 * Deliberately conservative. Beating the best frontier arm by less than the
 * observed trial spread is a tie, and a tie is FRONTIER_COMPETITIVE, not
 * exceeding. Losing on the base model while winning on prompt is not a MIDAS win
 * at all, which is what the separating arm exists to reveal.
 */
export function awardTier(args: {
  midasMean: number;
  bestFrontierMean: number;
  midasSpread: number;
  frontierSpread: number;
  midasCriticalFailures: number;
  productionSafe: boolean;
}) {
  const noise = Math.max(args.midasSpread, args.frontierSpread, 0.5);
  const delta = args.midasMean - args.bestFrontierMean;
  if (!args.productionSafe) return { tier: "DEVELOPMENT", delta, noise };
  if (delta > noise) return { tier: "FRONTIER_EXCEEDING", delta, noise };
  if (Math.abs(delta) <= noise) return { tier: "FRONTIER_COMPETITIVE", delta, noise };
  return { tier: "PRODUCTION_ELIGIBLE", delta, noise };
}
