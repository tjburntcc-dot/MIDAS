/**
 * Synthetic support-workflow laboratory adapter.
 *
 * This module has no credentials, network client, campaign import, or access
 * to a real support system. It is development fixture infrastructure only.
 */

export type Money = {
  minorUnits: number;
  currency: string;
};

export type SupportWorld = "viable" | "rejection" | "missing" | "conflict";

export type EnvironmentIdentity = {
  id: string;
  version: string;
};

export type SupportPolicy = {
  id: string;
  version: string;
  status: "active" | "superseded" | "conflicting";
  rule: string;
};

export type SupportOption = {
  id: "high-touch-outreach" | "limited-playbook" | "no-action";
  title: string;
  description: string;
};

export type SupportSnapshot = {
  goals: Array<{ metric: string; direction: "increase" | "decrease"; target: number; horizon: string; priority: number }>;
  claims: Array<{ id: string; proposition: string; evidenceClass: "reported" | "hypothetical" | "contradicted"; confidence: "low" | "medium" | "high"; source: string; valueMinorUnits?: number }>;
  policies: SupportPolicy[];
  options: SupportOption[];
  unknowns: Array<{ id: string; variable: string; decision: string; consequence: string }>;
  rights: Array<{ toolId: string; effectClass: "read" | "reversible_write"; policyVersion: string; requiresExactApproval: boolean }>;
  companyOverlay: { companyId: string; workflow: string; simulated: true; prohibitedInputs: string[] };
};

export type EvidenceRequest = {
  kind?: "information_request";
  variable: "cost_per_case" | "publication_policy";
  decision: string;
  plausibleRange?: { minimum: number; maximum: number; unit: string };
  branches?: Array<{ answer: string; action: string }>;
  source: string;
  maxCost: Money;
  deadline: string;
};

export type EvidenceItem = {
  id: string;
  variable: EvidenceRequest["variable"];
  value: string | number;
  unit?: string;
  source: string;
  observedAt: string;
  evidenceClass: "independently_verified" | "reported" | "contradicted";
  qualification: string;
};

export type EvidenceResponse =
  | { status: "provided"; requested: EvidenceRequest; evidence: EvidenceItem[]; authorized: boolean; retrievalCost: Money }
  | { status: "missing"; requested: EvidenceRequest; authorized: boolean; retrievalCost: Money; reason: string; qualifiedClaim: string }
  | { status: "conflicting"; requested: EvidenceRequest; authorized: boolean; retrievalCost: Money; evidence: EvidenceItem[]; reason: string; qualifiedClaim: string };

export type InformationRequest = {
  kind: "information_request";
  variable: EvidenceRequest["variable"];
  decision: string;
  plausibleRange: { minimum: number; maximum: number; unit: string };
  branches: Array<{ answer: string; action: string }>;
  source: string;
  maxCost: Money;
  deadline: string;
};

export type ExperimentSpec = {
  hypothesis: string;
  competingExplanation: string;
  population: string;
  allocation: string;
  baseline: string;
  endpoint: string;
  exclusions: string[];
  exposureCap: string;
  branches: Array<{ condition: string; nextAction: string }>;
};

export type DecisionAlternative = {
  id: string;
  expectedBenefit: Money;
  cost: Money;
  contribution: Money;
  evidenceIds: string[];
};

export type DecisionProposal = {
  kind: "decision";
  chosenOptionId: SupportOption["id"];
  status: "proposed" | "rejected" | "blocked";
  alternatives: DecisionAlternative[];
  rationale: string;
  assumptions: string[];
  reversalConditions: string[];
  experiment: ExperimentSpec;
};

export type SupportArtifact = {
  title: string;
  policyVersion: string;
  steps: string[];
  answers: Array<{ topic: string; text: string }>;
};

export type OperatorOutput = { kind: "support_artifact"; artifact: SupportArtifact };

export type SimulatedLedger = {
  simulated: true;
  bookings: Money;
  collections: Money;
  recognizedRevenue: Money;
  refunds: Money;
  obligations: Money;
  modeledCustomerSavings: Money;
  note: string;
};

export type PublishAction = {
  toolId: "lab.publish";
  payload: { artifact: SupportArtifact; simulatedLedger: SimulatedLedger };
  estimatedCost: Money;
  effectClass: "reversible_write";
};

export type VerificationInput = {
  artifact?: SupportArtifact;
  receipt?: { toolId: string; status: "confirmed" | "failed" | "unknown"; id?: string };
  observation?: { status: "confirmed" | "failed" | "unknown"; artifact?: SupportArtifact; ledger?: SimulatedLedger; deliveryObserved?: boolean };
  snapshot: SupportSnapshot;
  evidence: EvidenceResponse[];
};

export type VerificationResult = {
  operationalResult: "pass" | "fail" | "inconclusive";
  economicResult: "positive" | "negative" | "unmeasured" | "inconclusive";
  measurements: {
    withheldTicketSet: { evaluated: number; passed: number };
    artifactPolicyVersion: string;
    simulatedLedger: SimulatedLedger;
  };
  failures: string[];
};

export type SupportEnvironmentOverrides = {
  id?: string;
  version?: string;
  activePolicyVersion?: string;
  snapshot?: Partial<SupportSnapshot>;
};

export type SupportEnvironment = {
  id: string;
  version: string;
  identity: EnvironmentIdentity;
  snapshot(): SupportSnapshot;
  evidenceRequests(question: InformationRequest): EvidenceRequest[];
  getEvidence(request: EvidenceRequest): EvidenceResponse;
  validateDecision(snapshot: SupportSnapshot, evidence: EvidenceResponse[], decision: DecisionProposal): { ok: boolean; reason: string };
  actionFor(output: OperatorOutput): PublishAction;
  verify(input: VerificationInput): VerificationResult;
};

export const fixtureManifest = {
  id: "midas-foundry-support-lab-v1",
  version: "1.0.0",
  mode: "fixture",
  synthetic: true,
  externalCalls: false,
  campaignAccess: false,
  developmentFixture: true,
  heldoutCertificationClaim: false,
  intelligenceClaim: "none",
  fixtureDecisionTime: "2026-09-10T00:00:00.000Z",
  description: "Deterministic support-workflow fixtures test engineering behavior; they do not establish model intelligence or role competence.",
} as const;

const USD = "USD";
const FIXTURE_DECISION_TIME = "2026-09-10T00:00:00.000Z";
const zero = (): Money => ({ minorUnits: 0, currency: USD });
const money = (minorUnits: number): Money => ({ minorUnits, currency: USD });

function copy<T>(value: T): T {
  return structuredClone(value);
}

function baseSnapshot(world: SupportWorld, activePolicyVersion: string): SupportSnapshot {
  const policies: SupportPolicy[] = [
    {
      id: "support-publication",
      version: "support-policy-v1",
      status: world === "conflict" ? "conflicting" : "superseded",
      rule: "Do not publish without a human policy review.",
    },
    {
      id: "support-publication",
      version: activePolicyVersion,
      status: world === "conflict" ? "conflicting" : "active",
      rule: "Publish only a reversible internal support playbook after exact fixture approval.",
    },
  ];
  return {
    goals: [{ metric: "repeat-contact rate", direction: "decrease", target: 12, horizon: "30 days", priority: 1 }],
    claims: [
      { id: "claim-repeat-contact", proposition: "Repeat contacts are concentrated in billing-status questions.", evidenceClass: "reported", confidence: "medium", source: "synthetic-ticket-summary-v1" },
      { id: "claim-high-touch-benefit", proposition: "Proactive high-touch outreach may reduce repeat contacts.", evidenceClass: "hypothetical", confidence: "low", source: "synthetic-opportunity-note-v1" },
      { id: "benefit-high-touch", proposition: "Modeled benefit of high-touch outreach before delivery cost.", valueMinorUnits: 180, evidenceClass: "reported", confidence: "medium", source: "synthetic-benefit-model-v1" },
      { id: "benefit-limited-playbook", proposition: "Modeled benefit of the limited playbook before delivery cost.", valueMinorUnits: 180, evidenceClass: "reported", confidence: "medium", source: "synthetic-benefit-model-v1" },
    ],
    policies,
    options: [
      { id: "high-touch-outreach", title: "Proactive high-touch outreach", description: "Contact every billing-status requester individually." },
      { id: "limited-playbook", title: "Limited billing-status playbook", description: "Publish a reviewed internal response playbook for a bounded ticket segment." },
      { id: "no-action", title: "No delivery action", description: "Reject the opportunity and preserve the evidence record." },
    ],
    unknowns: [
      { id: "unknown-cost-per-case", variable: "cost_per_case", decision: "Choose an intervention", consequence: "The high-touch option may have negative contribution." },
      { id: "unknown-publication-policy", variable: "publication_policy", decision: "Publish a playbook", consequence: "A policy conflict blocks the write." },
    ],
    rights: [{ toolId: "lab.publish", effectClass: "reversible_write", policyVersion: activePolicyVersion, requiresExactApproval: true }],
    companyOverlay: {
      companyId: "synthetic-support-co",
      workflow: "support-workflow-laboratory",
      simulated: true,
      prohibitedInputs: ["campaign records", "customer records", "live tool credentials", "scenario truth", "verification tickets"],
    },
  };
}

function fixtureLedger(delivered: boolean): SimulatedLedger {
  return {
    simulated: true,
    bookings: money(delivered ? 1000 : 0),
    collections: money(delivered ? 1000 : 0),
    recognizedRevenue: money(delivered ? 1000 : 0),
    refunds: money(delivered ? 100 : 0),
    obligations: money(delivered ? 0 : 1000),
    modeledCustomerSavings: money(delivered ? 180 : 0),
    note: "All entries are simulated. Modeled customer savings are not MIDAS collections or revenue.",
  };
}

function activePolicy(snapshot: SupportSnapshot): SupportPolicy | undefined {
  return snapshot.policies.find((policy) => policy.status === "active");
}

function isNonnegativeMinorMoney(value: Money): boolean {
  return Boolean(value) && typeof value === "object" && hasOnlyKeys(value, ["minorUnits", "currency"]) && value.currency === USD && Number.isSafeInteger(value.minorUnits) && value.minorUnits >= 0;
}

function isSignedMinorMoney(value: Money): boolean {
  return Boolean(value) && typeof value === "object" && hasOnlyKeys(value, ["minorUnits", "currency"]) && value.currency === USD && Number.isSafeInteger(value.minorUnits);
}

function hasOnlyKeys(value: object, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function assertEvidenceRequest(request: EvidenceRequest): void {
  if (!request || typeof request !== "object" || !hasOnlyKeys(request, ["kind", "variable", "decision", "plausibleRange", "branches", "source", "maxCost", "deadline"])) throw new Error("Unsupported evidence request fields.");
  if (request.kind !== undefined && request.kind !== "information_request") throw new Error("Unsupported evidence request kind.");
  if (request.variable !== "cost_per_case" && request.variable !== "publication_policy") throw new Error("Unsupported evidence variable.");
  if (typeof request.decision !== "string" || request.decision.length === 0 || typeof request.deadline !== "string" || Number.isNaN(Date.parse(request.deadline))) throw new Error("Evidence request must include a decision and ISO deadline.");
  if (!request.maxCost || !isNonnegativeMinorMoney(request.maxCost)) throw new Error("Evidence request maxCost must be a nonnegative safe USD minor-unit amount.");
  const expectedSource = request.variable === "cost_per_case" ? "synthetic-cost-ledger-v1" : "synthetic-policy-registry-v1";
  if (request.source !== expectedSource) throw new Error("Unsupported evidence source for requested variable.");
}

function providedCost(evidence: EvidenceResponse[], id: string): number | undefined {
  for (const result of evidence) {
    if (result.status !== "provided" || result.requested.variable !== "cost_per_case") continue;
    const item = result.evidence.find((candidate) => candidate.id === id && candidate.variable === "cost_per_case");
    if (!item || typeof item.value !== "number" || !Number.isSafeInteger(item.value) || item.value < 0 || item.unit !== "USD cents per contacted or assisted customer") continue;
    return item.value;
  }
  return undefined;
}

function policyEvidenceState(evidence: EvidenceResponse[]): "provided" | "conflicting" | "missing" {
  const results = evidence.filter((result) => result.requested.variable === "publication_policy" && result.requested.source === "synthetic-policy-registry-v1");
  if (results.some((result) => result.status === "conflicting")) return "conflicting";
  if (results.some((result) => result.status === "provided")) return "provided";
  return "missing";
}

function benefit(snapshot: SupportSnapshot, id: string): number | undefined {
  const claim = snapshot.claims.find((candidate) => candidate.id === id);
  return claim && Number.isSafeInteger(claim.valueMinorUnits) && (claim.valueMinorUnits ?? -1) >= 0 ? claim.valueMinorUnits : undefined;
}

function matchesAlternative(option: DecisionAlternative, id: string, expectedBenefit: number, cost: number, evidenceIds: string[]): boolean {
  return Boolean(option) && typeof option === "object" && hasOnlyKeys(option, ["id", "expectedBenefit", "cost", "contribution", "evidenceIds"])
    && option.id === id
    && isNonnegativeMinorMoney(option.expectedBenefit)
    && isNonnegativeMinorMoney(option.cost)
    && isSignedMinorMoney(option.contribution)
    && option.expectedBenefit.minorUnits === expectedBenefit
    && option.cost.minorUnits === cost
    && option.contribution.minorUnits === expectedBenefit - cost
    && option.evidenceIds.length === evidenceIds.length
    && option.evidenceIds.every((evidenceId, index) => evidenceId === evidenceIds[index]);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validArtifact(artifact: unknown): artifact is SupportArtifact {
  if (!artifact || typeof artifact !== "object" || !hasOnlyKeys(artifact, ["title", "policyVersion", "steps", "answers"])) return false;
  const value = artifact as SupportArtifact;
  return typeof value.title === "string" && value.title.length > 0
    && typeof value.policyVersion === "string" && value.policyVersion.length > 0
    && isStringArray(value.steps) && value.steps.length > 0
    && Array.isArray(value.answers) && value.answers.length > 0
    && value.answers.every((answer) => Boolean(answer) && typeof answer === "object" && hasOnlyKeys(answer, ["topic", "text"]) && typeof answer.topic === "string" && answer.topic.length > 0 && typeof answer.text === "string" && answer.text.length > 0);
}

function validOperatorOutput(output: unknown): output is OperatorOutput {
  return Boolean(output) && typeof output === "object" && hasOnlyKeys(output, ["kind", "artifact"]) && (output as OperatorOutput).kind === "support_artifact" && validArtifact((output as OperatorOutput).artifact);
}

function validExperiment(value: unknown): value is ExperimentSpec {
  if (!value || typeof value !== "object" || !hasOnlyKeys(value, ["hypothesis", "competingExplanation", "population", "allocation", "baseline", "endpoint", "exclusions", "exposureCap", "branches"])) return false;
  const experiment = value as ExperimentSpec;
  return [experiment.hypothesis, experiment.competingExplanation, experiment.population, experiment.allocation, experiment.baseline, experiment.endpoint, experiment.exposureCap].every((part) => typeof part === "string" && part.length > 0)
    && isStringArray(experiment.exclusions)
    && Array.isArray(experiment.branches)
    && experiment.branches.every((branch) => Boolean(branch) && typeof branch === "object" && hasOnlyKeys(branch, ["condition", "nextAction"]) && typeof branch.condition === "string" && typeof branch.nextAction === "string");
}

function validDecisionShape(decision: unknown): decision is DecisionProposal {
  if (!decision || typeof decision !== "object" || !hasOnlyKeys(decision, ["kind", "chosenOptionId", "status", "alternatives", "rationale", "assumptions", "reversalConditions", "experiment"])) return false;
  const value = decision as DecisionProposal;
  return value.kind === "decision"
    && ["high-touch-outreach", "limited-playbook", "no-action"].includes(value.chosenOptionId)
    && ["proposed", "rejected", "blocked"].includes(value.status)
    && Array.isArray(value.alternatives)
    && typeof value.rationale === "string"
    && isStringArray(value.assumptions)
    && isStringArray(value.reversalConditions)
    && validExperiment(value.experiment);
}

function validSimulatedLedger(ledger: unknown): ledger is SimulatedLedger {
  if (!ledger || typeof ledger !== "object" || !hasOnlyKeys(ledger, ["simulated", "bookings", "collections", "recognizedRevenue", "refunds", "obligations", "modeledCustomerSavings", "note"])) return false;
  const value = ledger as SimulatedLedger;
  return value.simulated === true && isNonnegativeMinorMoney(value.bookings) && isNonnegativeMinorMoney(value.collections) && isNonnegativeMinorMoney(value.recognizedRevenue) && isNonnegativeMinorMoney(value.refunds) && isNonnegativeMinorMoney(value.obligations) && isNonnegativeMinorMoney(value.modeledCustomerSavings) && typeof value.note === "string";
}

export function createSupportEnvironment(world: SupportWorld = "viable", overrides: SupportEnvironmentOverrides = {}): SupportEnvironment {
  const activePolicyVersion = overrides.activePolicyVersion ?? "support-policy-v2";
  const snapshot = { ...baseSnapshot(world, activePolicyVersion), ...copy(overrides.snapshot ?? {}) } as SupportSnapshot;
  const identity: EnvironmentIdentity = {
    id: overrides.id ?? `support-lab-${world}`,
    version: overrides.version ?? "1.0.0",
  };
  // This evaluator-only data is deliberately not included in snapshot(), model
  // requests, evidence results, the manifest, or action payloads.
  const verificationTickets = [
    { id: "fixture-ticket-opaque-01", topic: "billing-status", requiredTerms: ["invoice", "status"] },
    { id: "fixture-ticket-opaque-02", topic: "payment-timing", requiredTerms: ["business day", "payment"] },
  ];

  return {
    id: identity.id,
    version: identity.version,
    identity,
    snapshot: () => copy(snapshot),
    evidenceRequests(question) {
      assertEvidenceRequest(question);
      return [
        copy(question),
        { ...copy(question), variable: "publication_policy", source: "synthetic-policy-registry-v1" },
      ];
    },
    getEvidence(request) {
      assertEvidenceRequest(request);
      if (request.variable === "cost_per_case") {
        if (world === "missing") {
          return { status: "missing", requested: copy(request), authorized: true, retrievalCost: zero(), reason: "The authorized synthetic cost source has no current observation.", qualifiedClaim: "Cost per case remains unknown; no contribution conclusion is supported." };
        }
        const highCost = 325;
        const narrowCost = world === "rejection" ? 195 : 18;
        return {
          status: "provided",
          requested: copy(request),
          authorized: true,
          retrievalCost: zero(),
          evidence: [
            { id: "evidence-cost-high-touch", variable: "cost_per_case", value: highCost, unit: "USD cents per contacted or assisted customer", source: "synthetic-cost-ledger-v1", observedAt: FIXTURE_DECISION_TIME, evidenceClass: "independently_verified", qualification: "Applies to the high-touch option only." },
            { id: "evidence-cost-playbook", variable: "cost_per_case", value: narrowCost, unit: "USD cents per contacted or assisted customer", source: "synthetic-cost-ledger-v1", observedAt: FIXTURE_DECISION_TIME, evidenceClass: "independently_verified", qualification: "Applies to the limited-playbook option only." },
          ],
        };
      }
      if (world === "conflict") {
        return {
          status: "conflicting",
          requested: copy(request),
          authorized: true,
          retrievalCost: zero(),
          reason: "Two synthetic policy versions disagree about publication authority.",
          qualifiedClaim: "Publication is blocked pending policy resolution; neither policy silently supersedes the other.",
          evidence: [
            { id: "evidence-policy-v1", variable: "publication_policy", value: "human review required", source: "synthetic-policy-registry-v1", observedAt: FIXTURE_DECISION_TIME, evidenceClass: "contradicted", qualification: "Conflicts with v2." },
            { id: "evidence-policy-v2", variable: "publication_policy", value: "exact fixture approval required", source: "synthetic-policy-registry-v1", observedAt: FIXTURE_DECISION_TIME, evidenceClass: "contradicted", qualification: "Conflicts with v1." },
          ],
        };
      }
      return {
        status: "provided",
        requested: copy(request),
        authorized: true,
        retrievalCost: zero(),
        evidence: [{ id: "evidence-policy-v2", variable: "publication_policy", value: "exact fixture approval required", source: "synthetic-policy-registry-v1", observedAt: FIXTURE_DECISION_TIME, evidenceClass: "independently_verified", qualification: "Valid for this synthetic environment version." }],
      };
    },
    validateDecision(inputSnapshot, evidence, decision) {
      if (inputSnapshot.companyOverlay.simulated !== true) return { ok: false, reason: "Laboratory adapter requires a simulated company overlay." };
      if (!validDecisionShape(decision)) return { ok: false, reason: "Decision has unsupported or malformed nested fields." };
      const policyState = policyEvidenceState(evidence);
      if (policyState === "missing") return { ok: false, reason: "A policy decision requires separately retrieved qualified policy evidence." };
      const policyConflict = inputSnapshot.policies.filter((policy) => policy.status === "active").length !== 1 || policyState === "conflicting";
      const highBenefit = benefit(inputSnapshot, "benefit-high-touch");
      const narrowBenefit = benefit(inputSnapshot, "benefit-limited-playbook");
      const highCost = providedCost(evidence, "evidence-cost-high-touch");
      const narrowCost = providedCost(evidence, "evidence-cost-playbook");
      if (highBenefit === undefined || narrowBenefit === undefined) return { ok: false, reason: "Public benefit facts are missing or invalid." };
      if (highCost === undefined || narrowCost === undefined) return { ok: decision.status === "blocked" && decision.chosenOptionId === "no-action", reason: decision.status === "blocked" && decision.chosenOptionId === "no-action" ? "Cost remains qualified as unknown and the action remains blocked." : "A contribution decision requires qualified cost evidence." };
      const high = decision.alternatives.find((option) => option.id === "high-touch-outreach");
      const narrow = decision.alternatives.find((option) => option.id === "limited-playbook");
      const noAction = decision.alternatives.find((option) => option.id === "no-action");
      if (decision.alternatives.length !== 3 || !high || !narrow || !noAction || !matchesAlternative(high, "high-touch-outreach", highBenefit, highCost, ["evidence-cost-high-touch"]) || !matchesAlternative(narrow, "limited-playbook", narrowBenefit, narrowCost, ["evidence-cost-playbook"]) || !matchesAlternative(noAction, "no-action", 0, 0, [])) return { ok: false, reason: "Decision alternatives do not match public benefits, qualified costs, or evidence references." };
      if (policyConflict) return { ok: decision.status === "blocked" && decision.chosenOptionId === "no-action", reason: decision.status === "blocked" && decision.chosenOptionId === "no-action" ? "Conflicting policy facts correctly block delivery." : "Conflicting policy facts block delivery." };
      const best = high.contribution.minorUnits > narrow.contribution.minorUnits ? high : narrow;
      if (best.contribution.minorUnits <= 0) return { ok: decision.status === "rejected" && decision.chosenOptionId === "no-action", reason: decision.status === "rejected" && decision.chosenOptionId === "no-action" ? "All interventions have nonpositive contribution, so the evidence-backed no-go is valid." : "All interventions have nonpositive contribution; delivery must be rejected." };
      return { ok: decision.status === "proposed" && decision.chosenOptionId === best.id, reason: decision.status === "proposed" && decision.chosenOptionId === best.id ? "The proposed option has the best positive contribution from supplied evidence." : "The chosen option is not the highest positive contribution." };
    },
    actionFor(output) {
      if (!validOperatorOutput(output)) throw new Error("Operator output does not match the support artifact schema.");
      const policy = activePolicy(snapshot);
      if (!policy || output.artifact.policyVersion !== policy.version) {
        throw new Error("Artifact does not respect the active synthetic publication policy.");
      }
      return {
        toolId: "lab.publish",
        payload: { artifact: copy(output.artifact), simulatedLedger: fixtureLedger(false) },
        estimatedCost: money(25),
        effectClass: "reversible_write",
      };
    },
    verify(input) {
      const failures: string[] = [];
      const policy = activePolicy(input.snapshot);
      const artifact = input.artifact;
      if (!validArtifact(artifact)) failures.push("Missing or malformed support artifact.");
      if (!input.receipt || input.receipt.toolId !== "lab.publish" || input.receipt.status !== "confirmed") failures.push("No confirmed laboratory publication receipt.");
      if (!input.observation || input.observation.status !== "confirmed" || input.observation.deliveryObserved !== true) failures.push("Durable service observation does not confirm delivery.");
      if (!input.observation?.artifact || !validArtifact(input.observation.artifact) || !artifact || JSON.stringify(input.observation.artifact) !== JSON.stringify(artifact)) failures.push("Durable service observation does not match the submitted artifact.");
      if (!validSimulatedLedger(input.observation?.ledger)) failures.push("Durable service observation lacks a valid simulated ledger.");
      if (!policy || !artifact || artifact.policyVersion !== policy.version || input.observation?.artifact?.policyVersion !== policy.version) failures.push("Artifact or observation does not match the active publication policy.");
      const passed = artifact && validArtifact(artifact) ? verificationTickets.filter((ticket) => artifact.answers.some((answer) => answer.topic === ticket.topic && ticket.requiredTerms.every((term) => answer.text.toLowerCase().includes(term)))).length : 0;
      if (passed !== verificationTickets.length) failures.push("Artifact does not satisfy the evaluator-held synthetic ticket coverage requirement.");
      const uncertainDelivery = input.receipt?.status === "unknown" || input.observation?.status === "unknown";
      const operationalResult = failures.length === 0 ? "pass" : uncertainDelivery ? "inconclusive" : "fail";
      const economicResult = "unmeasured";
      return {
        operationalResult,
        economicResult,
        measurements: { withheldTicketSet: { evaluated: verificationTickets.length, passed }, artifactPolicyVersion: artifact?.policyVersion ?? "missing", simulatedLedger: validSimulatedLedger(input.observation?.ledger) ? copy(input.observation.ledger) : fixtureLedger(false) },
        failures,
      };
    },
  };
}
