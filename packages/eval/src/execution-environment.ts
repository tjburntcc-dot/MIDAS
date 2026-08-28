/**
 * What a worker is actually acting inside.
 *
 * A certification has always described a worker in an environment, and the
 * target recorded only the worker. When the sandbox protocol was revised two
 * missions ago, an impact analysis found that no fingerprint moved at all: every
 * certification would have carried across a changed environment silently. The
 * revision was rejected for other reasons, so nothing was harmed, but the gap
 * was real and it has now been reached by a repair that IS being adopted.
 *
 * The rule for what belongs here is narrow. A component earns its place only if
 * changing it can change what a worker does. A build hash, a file path or a
 * refactor cannot, and including them would produce fingerprint churn that
 * teaches everyone to ignore the fingerprint.
 */
import { createHash } from "node:crypto";
import { SANDBOX_PROTOCOL_ID } from "./worker-adapter.ts";
import { WORKSTATION_INVENTORY_CONTRACT } from "./sandbox.ts";

/** The action contract every runner sends. Named, not hashed from source. */
export const ACTION_SCHEMA_CONTRACT = "actions-v1-open-kind";

export interface ExecutionEnvironment {
  /** How the worker is told to behave in the workstation. */
  protocolVersion: string;
  /** How objects are listed and how a read miss answers. */
  inventoryContractVersion: string;
  /** The shape of the actions a worker may return. */
  actionSchemaVersion: string;
}

export function currentExecutionEnvironment(): ExecutionEnvironment {
  return {
    protocolVersion: SANDBOX_PROTOCOL_ID,
    inventoryContractVersion: WORKSTATION_INVENTORY_CONTRACT,
    actionSchemaVersion: ACTION_SCHEMA_CONTRACT,
  };
}

/**
 * The environment identity.
 *
 * Canonical over the three material components and nothing else, so the same
 * contracts always produce the same id however the code that implements them is
 * arranged.
 */
export function executionEnvironmentId(env: ExecutionEnvironment = currentExecutionEnvironment()) {
  const canonical = JSON.stringify({
    protocolVersion: env.protocolVersion,
    inventoryContractVersion: env.inventoryContractVersion,
    actionSchemaVersion: env.actionSchemaVersion,
  });
  return "EE-" + createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

/**
 * The environment every measurement before this repair was taken in.
 *
 * Named rather than reconstructed, because the code that produced it no longer
 * exists and a reconstruction would be a guess wearing a hash.
 */
export const LEGACY_ENVIRONMENT: ExecutionEnvironment = {
  protocolVersion: "sandbox-protocol-v1",
  inventoryContractVersion: "workstation-inventory-v1-positional-ids",
  actionSchemaVersion: ACTION_SCHEMA_CONTRACT,
};

/**
 * Which evidence survives a change of environment.
 *
 * Deliberately not a portability engine. Every evidence class in this repository
 * is produced by a worker acting in the workstation, so a change to the
 * workstation contract touches all of them. Saying so is the honest answer;
 * inventing a rule that lets evidence transfer would be manufacturing exactly
 * the kind of portability the Academy has no basis for.
 */
export function evidencePortability(before: ExecutionEnvironment, after: ExecutionEnvironment) {
  const changed: string[] = [];
  if (before.protocolVersion !== after.protocolVersion) changed.push("protocolVersion");
  if (before.inventoryContractVersion !== after.inventoryContractVersion) changed.push("inventoryContractVersion");
  if (before.actionSchemaVersion !== after.actionSchemaVersion) changed.push("actionSchemaVersion");
  if (!changed.length) return { changed, transfers: "all", reEarn: [], reason: "Identical environment." };
  return {
    changed,
    transfers: "none",
    reEarn: ["sealed_exam", "sandbox_tool_use", "simulation", "adversarial", "team_integration", "shadow"],
    reason: "Every evidence class in this repository is produced by a worker acting in the workstation, so a change to " + changed.join(" and ")
      + " touches all of them. The Academy has no representation for partial portability across environments and none is invented here.",
  };
}
