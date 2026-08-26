/**
 * The assurance run.
 *
 * Composes the pieces in the order that makes each one useful: validate the
 * decision's shape before generating questions from it, read the source before
 * trusting the generators to have covered it, then check what is still
 * unaddressed and refuse the verdict if the process did not actually run.
 *
 * The ordering is the substance. Generating questions from a declared shape that
 * was never checked produces a confident, complete-looking, wrong question set,
 * which is the failure mode this whole layer exists to catch.
 */
import { generateQuestions, processCoverageAudit, requiredStages } from "./decision-assurance.ts";
import type { DecisionDescriptor, GeneratedQuestion } from "./decision-assurance.ts";
import {
  validateDecisionShape, questionsFromSource, detectCoverageGaps, probesFor,
} from "./question-discovery.ts";
import type { SourceSegment } from "./question-discovery.ts";

export interface AssuranceInput {
  decision: DecisionDescriptor;
  /** How the decision was described in prose. Used to check the declared shape. */
  descriptionText: string;
  /** The governing source, if one exists. Parsed structurally, not summarised. */
  sourceSegments?: SourceSegment[];
  completedStages?: string[];
  questionsUnresolvedMaterial?: number;
  verdictProposed?: boolean;
}

export function runAssurance(input: AssuranceInput) {
  // 1. The declared shape is checked before anything is built on it.
  const shape = validateDecisionShape({ declared: input.decision.attributes, descriptionText: input.descriptionText });

  // 2. Questions are generated from the reconciled shape, never the declared one.
  const reconciledDecision: DecisionDescriptor = { ...input.decision, attributes: shape.reconciled as any };
  const questions: GeneratedQuestion[] = generateQuestions(reconciledDecision);

  // 3. The source speaks for itself, in parallel with the generators rather than
  //    through them, so a clause no generator anticipates still raises a question.
  const sourceQuestions = questionsFromSource(input.sourceSegments || []);

  // 4. What is still unaddressed after both.
  const categories = [...questions.map((q) => q.category), ...sourceQuestions.map((q) => "requirements")];
  const gaps = detectCoverageGaps({
    attributes: shape.reconciled,
    questionCategories: categories,
    stakesTier: input.decision.stakesTier,
  });

  const probes = probesFor(input.decision.stakesTier);

  const audit = processCoverageAudit({
    stakesTier: input.decision.stakesTier,
    completedStages: input.completedStages || [],
    questionsGenerated: questions.length + sourceQuestions.length,
    questionsUnresolvedMaterial: input.questionsUnresolvedMaterial ?? 0,
    verdictProposed: input.verdictProposed ?? false,
  });

  // A coverage gap is not a stage, so it would otherwise pass the stage audit
  // silently. It blocks here, because an unaddressed dimension is exactly the
  // condition that produced a fluent wrong answer before.
  const blocking = [
    ...audit.problems,
    ...gaps.map((g) => "Unaddressed dimension: " + g.dimension + ". " + g.reason),
  ];
  // Under-declaration was repaired in this run by interrogating the union, so it
  // does not block. It is still reported: a caller who repeatedly mis-describes
  // decisions is a pattern worth seeing, and the repair only works when the
  // description is honest even where the declaration was not.
  const notices = shape.underDeclared.map((u) => "Shape under-declared: " + u.attribute + ". " + u.consequence);
  const verdictReady = audit.verdictReady && gaps.length === 0;

  return {
    decisionId: input.decision.id,
    shape,
    questions,
    sourceQuestions,
    gaps,
    probes,
    requiredStages: requiredStages(input.decision.stakesTier),
    audit,
    verdictReady,
    blocking,
    notices,
    ruling: verdictReady
      ? "Process complete. A verdict may be formed."
      : "VERDICT REFUSED. " + blocking.length + " condition(s) unmet.",
    counts: {
      generated: questions.length,
      fromSource: sourceQuestions.length,
      probes: probes.length,
      gaps: gaps.length,
    },
  };
}
