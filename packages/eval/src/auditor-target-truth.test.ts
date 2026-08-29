/**
 * The certification target must describe the configuration that produced the
 * evidence. These tests exist because for one award it did not.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { targetId } from "./academy.ts";
import { adaptWorker, adaptedTarget, SANDBOX_TOOLING, NO_TOOLING } from "./worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "./opportunity-researcher.ts";
import { AUDITOR_DOCTRINE, AUDITOR_VERSION_ID } from "./auditor.ts";
import {
  HISTORICAL_MALFORMED_TARGET, correctedNoToolTarget, readOnlyToolTarget,
  portabilityAudit, TARGET_DEFECTS, forensicsFingerprint,
  SINGLE_SHOT_ENVIRONMENT, AUDITOR_READONLY_ENVIRONMENT, AUDITOR_READONLY_TOOLS,
} from "./auditor-target-truth.ts";

const statePath = new URL("../../../var/state/auditor-lock.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const lock = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;

describe("the target constructor can no longer invent a configuration", () => {
  test("REGRESSION: it refuses to build a target without being told the actual tools", () => {
    const a = adaptWorker("auditor", { auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID });
    assert.throws(() => (adaptedTarget as any)(a, "gpt-4.1"), /requires the tools the worker actually had/);
    assert.throws(() => (adaptedTarget as any)(a, "gpt-4.1", {}), /requires the tools the worker actually had/);
  });

  test("the tools it records are the tools it was given, not a default", () => {
    const a = adaptWorker("auditor", { auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID });
    assert.deepEqual(adaptedTarget(a, "gpt-4.1", NO_TOOLING).tools, []);
    assert.deepEqual(adaptedTarget(a, "gpt-4.1", { tools: AUDITOR_READONLY_TOOLS }).tools, AUDITOR_READONLY_TOOLS);
    assert.deepEqual(adaptedTarget(a, "gpt-4.1", SANDBOX_TOOLING).tools, ["sandbox"]);
  });

  test("REGRESSION: every historical id that was truthful is byte-identical", () => {
    // The Researcher genuinely acted in the workstation with sandbox tools, so
    // its recorded target was correct and must not move. If this fails, the
    // repair has rewritten history rather than correcting a falsehood.
    const r = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
    assert.equal(targetId(adaptedTarget(r, "gpt-4.1", SANDBOX_TOOLING)), "CT-44e7595af4a1");
  });
});

describe("what the Auditor lock experiment recorded, and what it ran", () => {
  test("the malformed target is reproduced exactly as it was written", () => {
    assert.equal(targetId(HISTORICAL_MALFORMED_TARGET), "CT-60ca32fb0995");
  });

  test("REGRESSION: the recorded state still carries the malformed target, unrewritten", { skip: !lock }, () => {
    // Historical immutability. The record of what was believed at the time is
    // evidence in its own right and is not edited to match the correction.
    assert.equal(lock.targetId, "CT-60ca32fb0995");
    assert.deepEqual(lock.target.tools, ["sandbox"]);
    assert.equal(lock.target.executionEnvironmentId, "EE-8880ef0d5a0f");
  });

  test("the run itself declared no tools, which is what makes the record false", { skip: !lock }, () => {
    const runtime = lock.manifest?.runtime;
    assert.ok(runtime, "the manifest is not in the record, so the claim cannot be checked");
    assert.deepEqual(runtime.expectedTools, [], "the experiment expected tools after all");
    for (const arm of lock.manifest.arms) assert.deepEqual(arm.tools, [], arm.id + " declared tools");
  });

  test("both misdescriptions are recorded as defects, not as prose", () => {
    assert.deepEqual(TARGET_DEFECTS.map((d) => d.field).sort(), ["executionEnvironmentId", "tools"]);
    for (const d of TARGET_DEFECTS) {
      assert.ok(d.evidence.length > 40, d.id + " has no evidence");
      assert.ok(d.consequence.length > 40, d.id + " does not say what it cost");
    }
  });
});

describe("the corrected target describes the configuration that produced the evidence", () => {
  test("it declares no tools and a single-shot environment", () => {
    const B = correctedNoToolTarget();
    assert.deepEqual(B.tools, []);
    assert.equal(SINGLE_SHOT_ENVIRONMENT.protocolVersion, "none-single-shot");
    assert.notEqual(B.executionEnvironmentId, "EE-8880ef0d5a0f",
      "the corrected target still claims the workstation the run never entered");
  });

  test("it is a new id, so no historical award is silently reinterpreted", () => {
    assert.notEqual(targetId(correctedNoToolTarget()), "CT-60ca32fb0995");
  });

  test("it changes exactly the two fields that were false and nothing else", () => {
    const A: any = HISTORICAL_MALFORMED_TARGET;
    const B: any = correctedNoToolTarget();
    const moved = Object.keys(A).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
    assert.deepEqual(moved.sort(), ["executionEnvironmentId", "tools"]);
  });
});

describe("evidence portability, decided by the live rules and not by argument", () => {
  test("A to B is a relabelling, so no portability rule is invoked", () => {
    const p = portabilityAudit();
    assert.equal(p.A_to_B.relation, "relabelling");
    assert.equal(p.A_to_B.sealedExamSurvives, true);
    assert.match(p.A_to_B.authority, /Not recertificationScope/);
  });

  test("the target rule alone would have let the sealed exam through", () => {
    // recertificationScope treats a tools change as invalidating tool-use,
    // simulation and team-integration evidence, and explicitly not sealed_exam.
    // Reporting only this rule is how invented portability would have happened.
    const p = portabilityAudit();
    assert.equal(p.B_to_C.targetRule.scope, "partial");
    assert.deepEqual(p.B_to_C.targetRule.changed, ["tools"]);
    assert.ok(!p.B_to_C.targetRule.invalidates.includes("sealed_exam"));
  });

  test("BLOCKING: the environment rule overrides it, and the sealed exam does not port", () => {
    const p = portabilityAudit();
    assert.equal(p.B_to_C.environmentRule.transfers, "none");
    assert.deepEqual(p.B_to_C.environmentRule.changed.sort(),
      ["actionSchemaVersion", "inventoryContractVersion", "protocolVersion"]);
    assert.equal(p.B_to_C.sealedExamSurvives, false,
      "twelve sealed cases would have been carried into a configuration that never sat them");
    assert.equal(p.B_to_C.governedBy, "execution-environment");
  });

  test("so the read-only target starts with no sealed-exam evidence at all", () => {
    const p = portabilityAudit();
    assert.equal(p.A_to_C.sealedExamSurvives, false);
    assert.equal(p.B_to_C.sealedExamSurvives, false);
  });

  test("the read-only environment is a genuinely different environment", () => {
    assert.notDeepEqual(AUDITOR_READONLY_ENVIRONMENT, SINGLE_SHOT_ENVIRONMENT);
    assert.notEqual(readOnlyToolTarget().executionEnvironmentId, correctedNoToolTarget().executionEnvironmentId);
  });
});

describe("the forensic claim is pinned", () => {
  test("its fingerprint is stable, so a later run cannot quietly restate it", () => {
    assert.equal(forensicsFingerprint(), "TF-d25bef2e30ac");
    assert.equal(targetId(correctedNoToolTarget()), "CT-367f2d547bf0");
    assert.equal(targetId(readOnlyToolTarget()), "CT-6bfb7037bf36");
  });
});
