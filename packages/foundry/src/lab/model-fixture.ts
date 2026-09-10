/** Deterministic development fixture ModelPort; it is not an intelligence evaluation. */
import type { DecisionProposal, InformationRequest, Money, OperatorOutput } from "./support.ts";

export type FixtureTape = "viable" | "rejection" | "missing" | "conflict";

export type ModelRequest = {
  role: { id: string; version: string; procedure: string };
  task: "investigate" | "decide" | "operate" | "verify";
  context: { snapshot: unknown; evidence: unknown[]; roleVersion: string; dataPolicyVersion: string };
  limits: { maxCost: Money; maxAttempts: number; maxHumanMinutes: number };
  tools: Array<{ id: string; description: string }>;
};

export type FixtureModelResponse = {
  output: InformationRequest | DecisionProposal | OperatorOutput | { kind: "verification_note"; text: string };
  usage: { inputTokens: 0; outputTokens: 0; cost: { status: "known"; money: { minorUnits: 0; currency: "USD" }; basis: "fixture" } };
  route: { provider: "fixture"; model: "script-v1"; kind: "fixture" };
};

export type FixtureModel = { readonly kind: "fixture"; run(request: ModelRequest): Promise<FixtureModelResponse> };

const ZERO = { minorUnits: 0, currency: "USD" } as const;

function informationRequest(): InformationRequest {
  return {
    kind: "information_request",
    variable: "cost_per_case",
    decision: "Whether to choose a narrow support intervention, reject the opportunity, or remain blocked.",
    plausibleRange: { minimum: 18, maximum: 425, unit: "USD cents per assisted or contacted customer" },
    branches: [
      { answer: "High-touch contribution is negative while playbook contribution is positive", action: "Propose the limited playbook." },
      { answer: "Both contributions are negative", action: "Reject the opportunity without delivery." },
      { answer: "Cost is unavailable or contradictory", action: "Block the consequential choice and retain the qualified unknown." },
    ],
    source: "synthetic-cost-ledger-v1",
    maxCost: ZERO,
    deadline: "2026-09-10T01:00:00.000Z",
  };
}

function experiment(): DecisionProposal["experiment"] {
  return {
    hypothesis: "A bounded billing-status response playbook reduces repeat contacts with positive modeled contribution.",
    competingExplanation: "The apparent repeat-contact reduction is caused by normal ticket mix variation.",
    population: "Synthetic billing-status tickets received during the fixture episode.",
    allocation: "A bounded fixture segment uses the playbook; the baseline segment keeps the existing response.",
    baseline: "Existing synthetic response flow.",
    endpoint: "Repeat-contact rate after the response window.",
    exclusions: ["Tickets requiring account changes", "Cases without billing-status intent"],
    exposureCap: "No more than 20 synthetic tickets.",
    branches: [
      { condition: "Endpoint improves and policy remains current", nextAction: "Continue only with a fresh exact approval." },
      { condition: "Endpoint does not improve or an obligation/refund appears", nextAction: "Stop and reconcile the simulated ledger." },
      { condition: "Evidence becomes missing or contradictory", nextAction: "Block the action and request resolution." },
    ],
  };
}

function alternatives(world: FixtureTape): DecisionProposal["alternatives"] {
  const narrowCost = world === "rejection" ? 195 : 18;
  const narrowContribution = 180 - narrowCost;
  return [
    { id: "high-touch-outreach", expectedBenefit: { minorUnits: 180, currency: "USD" }, cost: { minorUnits: 325, currency: "USD" }, contribution: { minorUnits: -145, currency: "USD" }, evidenceIds: ["evidence-cost-high-touch"] },
    { id: "limited-playbook", expectedBenefit: { minorUnits: 180, currency: "USD" }, cost: { minorUnits: narrowCost, currency: "USD" }, contribution: { minorUnits: narrowContribution, currency: "USD" }, evidenceIds: ["evidence-cost-playbook"] },
    { id: "no-action", expectedBenefit: ZERO, cost: ZERO, contribution: ZERO, evidenceIds: [], },
  ];
}

function decision(world: FixtureTape): DecisionProposal {
  const blocked = world === "missing" || world === "conflict";
  const rejection = world === "rejection";
  return {
    kind: "decision",
    chosenOptionId: blocked ? "no-action" : rejection ? "no-action" : "limited-playbook",
    status: blocked ? "blocked" : rejection ? "rejected" : "proposed",
    alternatives: alternatives(world),
    rationale: blocked
      ? "This deterministic fixture retains a qualified block because the requested cost or policy evidence is unresolved."
      : rejection
        ? "Qualified synthetic cost evidence makes both intervention alternatives negative; reject this opportunity without a delivery action."
        : "Qualified synthetic cost evidence makes high-touch outreach negative while the narrow playbook remains viable.",
    assumptions: ["Synthetic observations apply only to this fixture episode.", "Modeled savings are not collections or revenue."],
    reversalConditions: ["A newer qualified cost observation changes contribution.", "The active policy version changes.", "The endpoint fails or a simulated obligation appears."],
    experiment: experiment(),
  };
}

function operatorOutput(world: FixtureTape): OperatorOutput {
  const policyVersion = "support-policy-v2";
  return {
    kind: "support_artifact",
    artifact: {
      title: "Billing-status response playbook",
      policyVersion,
      steps: ["Confirm that the question is about billing status.", "Check the internal invoice-status record.", "State the next expected payment timing without promising an account change.", "Escalate requests that require a refund, correction, or account modification."],
      answers: [
        { topic: "billing-status", text: "Confirm the invoice status from the internal record and explain the current status plainly." },
        { topic: "payment-timing", text: "Explain that payment processing can take one business day and state the next review point." },
      ],
    },
  };
}

function hasEvidence(request: ModelRequest): boolean {
  return request.context.evidence.length > 0;
}

/**
 * The tape is selected by the caller outside every worker request. The model
 * never receives a scenario label, environment truth, or verification tickets.
 */
export function createFixtureModel(tape: FixtureTape = "viable"): FixtureModel {
  return {
    kind: "fixture",
    async run(request) {
      let output: FixtureModelResponse["output"];
      if (request.task === "investigate") output = informationRequest();
      else if (request.task === "decide") output = hasEvidence(request) ? decision(tape) : informationRequest();
      else if (request.task === "operate") output = operatorOutput(tape);
      else output = { kind: "verification_note", text: "Fixture output is not verification; the laboratory evaluator requires a receipt and independent observation." };
      return {
        output,
        usage: { inputTokens: 0, outputTokens: 0, cost: { status: "known", money: ZERO, basis: "fixture" } },
        route: { provider: "fixture", model: "script-v1", kind: "fixture" },
      };
    },
  };
}
