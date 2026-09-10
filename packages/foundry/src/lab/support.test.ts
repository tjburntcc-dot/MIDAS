/** Engineering fixtures only. Passing these tests makes no intelligence or held-out-certification claim. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createFixtureModel } from "./model-fixture.ts";
import { createSupportEnvironment, fixtureManifest } from "./support.ts";
const request = (task: "investigate" | "decide" | "operate" | "verify", snapshot: unknown, evidence: unknown[] = []) => ({
    role: { id: task === "operate" ? "operator" : "analyst", version: "1.0.0", procedure: "synthetic support procedure" },
    task,
    context: { snapshot, evidence, roleVersion: "analyst-v1", dataPolicyVersion: "synthetic-policy-v1" },
    limits: { maxCost: { minorUnits: 0, currency: "USD" }, maxAttempts: 1, maxHumanMinutes: 1 },
    tools: [{ id: "lab.publish", description: "Synthetic reversible publication tool" }],
});
describe("support laboratory adapter", () => {
    test("viable tape chooses a narrow option only after cost evidence, then creates a verifiable artifact", async () => {
        const environment = createSupportEnvironment("viable");
        const model = createFixtureModel("viable");
        assert.equal(model.kind, "fixture");
        const snapshot = environment.snapshot();
        const initial = await model.run(request("investigate", snapshot));
        assert.equal(initial.output.kind, "information_request");
        const evidenceRequests = environment.evidenceRequests(initial.output);
        assert.deepEqual(evidenceRequests.map((item) => item.variable), ["cost_per_case", "publication_policy"]);
        assert.equal(evidenceRequests[1].source, "synthetic-policy-registry-v1");
        const evidence = environment.getEvidence(evidenceRequests[0]);
        const policyEvidence = environment.getEvidence(evidenceRequests[1]);
        const beforeEvidence = await model.run(request("decide", snapshot));
        assert.equal(beforeEvidence.output.kind, "information_request");
        const proposed = await model.run(request("decide", snapshot, [evidence, policyEvidence]));
        assert.equal(proposed.output.kind, "decision");
        assert.equal(proposed.output.chosenOptionId, "limited-playbook");
        assert.equal(environment.validateDecision(environment.snapshot(), [evidence, policyEvidence], proposed.output).ok, true);
        const artifact = await model.run(request("operate", snapshot, [evidence, policyEvidence]));
        assert.equal(artifact.output.kind, "support_artifact");
        const action = environment.actionFor(artifact.output);
        assert.equal(action.toolId, "lab.publish");
        assert.equal(action.estimatedCost.minorUnits, 25);
        assert.equal(action.payload.simulatedLedger.collections.minorUnits, 1000);
        assert.equal(action.payload.simulatedLedger.recognizedRevenue.minorUnits, 0);
        assert.equal(action.payload.simulatedLedger.obligations.minorUnits, 1000);
        const observedLedger = { ...action.payload.simulatedLedger, bookings: { minorUnits: 1000, currency: "USD" }, collections: { minorUnits: 1000, currency: "USD" }, recognizedRevenue: { minorUnits: 1000, currency: "USD" }, refunds: { minorUnits: 100, currency: "USD" }, obligations: { minorUnits: 0, currency: "USD" }, modeledCustomerSavings: { minorUnits: 180, currency: "USD" } };
        const verification = environment.verify({ artifact: artifact.output.artifact, receipt: { toolId: "lab.publish", status: "confirmed" }, observation: { status: "confirmed", artifact: artifact.output.artifact, ledger: observedLedger, deliveryObserved: true }, snapshot, evidence: [evidence, policyEvidence] });
        assert.equal(verification.operationalResult, "pass");
        assert.equal(verification.economicResult, "unmeasured");
        assert.equal(verification.measurements.simulatedLedger.collections.minorUnits, 1000);
        assert.equal(verification.measurements.simulatedLedger.refunds.minorUnits, 100);
    });
    test("rejection, missing, and conflicting worlds remain qualified and do not produce a blanket positive action", async () => {
        for (const world of ["rejection", "missing", "conflict"] as const) {
            const environment = createSupportEnvironment(world);
            const tape = createFixtureModel(world);
            const snapshot = environment.snapshot();
            const inquiry = await tape.run(request("investigate", snapshot));
            assert.equal(inquiry.output.kind, "information_request");
            const requests = environment.evidenceRequests(inquiry.output);
            const costEvidence = environment.getEvidence(requests[0]);
            const policyEvidence = environment.getEvidence(requests[1]);
            const proposed = await tape.run(request("decide", snapshot, [costEvidence, policyEvidence]));
            assert.equal(proposed.output.kind, "decision");
            if (world === "rejection") {
                assert.equal(proposed.output.status, "rejected");
                assert.equal(proposed.output.chosenOptionId, "no-action");
                assert.equal(environment.validateDecision(snapshot, [costEvidence, policyEvidence], proposed.output).ok, true);
            }
            else {
                assert.equal(proposed.output.status, "blocked");
                assert.equal(environment.validateDecision(snapshot, [costEvidence, policyEvidence], proposed.output).ok, true);
            }
            if (world === "conflict")
                assert.equal(policyEvidence.status, "conflicting");
            if (world === "missing")
                assert.equal(costEvidence.status, "missing");
        }
    });
    test("the supplied costs, not a world switch, determine whether the fixture proposal validates", async () => {
        const viable = createSupportEnvironment("viable");
        const rejected = createSupportEnvironment("rejection");
        const viableSnapshot = viable.snapshot();
        const rejectedSnapshot = rejected.snapshot();
        const inquiry = await createFixtureModel("viable").run(request("investigate", viableSnapshot));
        assert.equal(inquiry.output.kind, "information_request");
        const viableEvidence = viable.evidenceRequests(inquiry.output).map((item) => viable.getEvidence(item));
        const rejectedEvidence = rejected.evidenceRequests(inquiry.output).map((item) => rejected.getEvidence(item));
        const viableDecision = await createFixtureModel("viable").run(request("decide", viableSnapshot, viableEvidence));
        const rejectedDecision = await createFixtureModel("rejection").run(request("decide", rejectedSnapshot, rejectedEvidence));
        assert.equal(viableDecision.output.kind, "decision");
        assert.equal(rejectedDecision.output.kind, "decision");
        assert.equal(viable.validateDecision(viableSnapshot, viableEvidence, viableDecision.output).ok, true);
        assert.equal(rejected.validateDecision(rejectedSnapshot, rejectedEvidence, rejectedDecision.output).ok, true);
        assert.equal(viable.validateDecision(viableSnapshot, viableEvidence, rejectedDecision.output).ok, false);
        assert.equal(rejected.validateDecision(rejectedSnapshot, rejectedEvidence, viableDecision.output).ok, false);
        assert.equal(viable.validateDecision(viableSnapshot, [viableEvidence[0]], viableDecision.output).ok, false);
        const unsafeCost = structuredClone(viableDecision.output);
        unsafeCost.alternatives[1].cost.minorUnits = -1;
        assert.equal(viable.validateDecision(viableSnapshot, viableEvidence, unsafeCost).ok, false);
        const unknownExperimentField = structuredClone(viableDecision.output) as Record<string, unknown>;
        (unknownExperimentField.experiment as Record<string, unknown>).unexpected = true;
        assert.equal(viable.validateDecision(viableSnapshot, viableEvidence, unknownExperimentField as typeof viableDecision.output).ok, false);
    });
    test("request validation, policy history, false receipts, and evaluator data stay inside their boundaries", async () => {
        const environment = createSupportEnvironment("viable");
        const snapshot = environment.snapshot();
        assert.deepEqual(snapshot.policies.map((policy) => policy.status), ["superseded", "active"]);
        assert.equal(environment.id, "support-lab-viable");
        assert.equal(environment.version, "1.0.0");
        const inquiry = await createFixtureModel("viable").run(request("investigate", snapshot));
        assert.equal(inquiry.output.kind, "information_request");
        assert.throws(() => environment.getEvidence({ ...inquiry.output, maxCost: { minorUnits: 1.5, currency: "USD" } }), /safe USD/i);
        assert.throws(() => environment.getEvidence({ ...inquiry.output, source: "unsupported" }), /Unsupported evidence source/i);
        assert.throws(() => (environment.getEvidence as (value: unknown) => unknown)({ ...inquiry.output, unexpected: true }), /Unsupported evidence request fields/i);
        const serializedRequest = JSON.stringify(request("investigate", snapshot));
        assert.doesNotMatch(serializedRequest, /fixture-ticket-opaque|"tape"|"world"/i);
        const evidence = environment.evidenceRequests(inquiry.output).map((item) => environment.getEvidence(item));
        const output = await createFixtureModel("viable").run(request("operate", snapshot, evidence));
        assert.equal(output.output.kind, "support_artifact");
        assert.throws(() => environment.actionFor({ kind: "support_artifact", artifact: { ...output.output.artifact, answers: [{ topic: "billing-status", text: "ok", unexpected: true }] } } as never), /artifact schema/i);
        const changedPolicy = createSupportEnvironment("viable", { activePolicyVersion: "support-policy-v3" });
        assert.throws(() => changedPolicy.actionFor(output.output), /active synthetic publication policy/i);
        const falseReceipt = environment.verify({ artifact: { ...output.output.artifact, answers: [] }, receipt: { toolId: "lab.publish", status: "failed" }, observation: { status: "failed" }, snapshot, evidence });
        assert.equal(falseReceipt.operationalResult, "fail");
        assert.equal(falseReceipt.measurements.simulatedLedger.obligations.minorUnits, 1000);
        const missingArtifact = environment.verify({ receipt: { toolId: "lab.publish", status: "failed" }, observation: { status: "failed" }, snapshot, evidence });
        assert.equal(missingArtifact.operationalResult, "fail");
    });
    test("the manifest labels development fixtures and explicitly declines intelligence and held-out certification claims", () => {
        assert.equal(fixtureManifest.externalCalls, false);
        assert.equal(fixtureManifest.campaignAccess, false);
        assert.equal(fixtureManifest.heldoutCertificationClaim, false);
        assert.equal(fixtureManifest.intelligenceClaim, "none");
        assert.equal(fixtureManifest.fixtureDecisionTime, "2026-09-10T00:00:00.000Z");
    });
});
