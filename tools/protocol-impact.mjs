/**
 * What changing shared infrastructure actually touches.
 *
 * The sandbox protocol reaches every role through one function, so revising it
 * is not a Researcher change. This enumerates the paths mechanically from source
 * and reports which recorded measurements stop being comparable, so that nobody
 * later reads a v1 number as a v2 number. It runs no model.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { SANDBOX_PROTOCOL_V1, SANDBOX_PROTOCOL_V2, SANDBOX_PROTOCOL_V1_ID, SANDBOX_PROTOCOL_V2_ID, adaptWorker, adaptedTarget, SANDBOX_TOOLING } from "../packages/eval/src/worker-adapter.ts";
import { targetId, recertificationScope } from "../packages/eval/src/academy.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { AUDITOR_DOCTRINE, AUDITOR_VERSION_ID } from "../packages/eval/src/auditor.ts";

const roots = ["packages/eval/src", "tools"];
const paths = [];
for (const root of roots) {
  for (const f of readdirSync(repoPath(root))) {
    if (!/\.(ts|mjs)$/.test(f)) continue;
    const rel = root + "/" + f;
    const src = readFileSync(repoPath(rel), "utf8");
    const receives = /SANDBOX_PROTOCOL|actorInstructions/.test(src);
    if (!receives) continue;
    paths.push({
      path: rel,
      isTest: /\.test\.ts$/.test(f),
      viaAdapter: src.includes("actorInstructions"),
      referencesProtocolDirectly: /SANDBOX_PROTOCOL\b/.test(src),
      pinsV1: src.includes("SANDBOX_PROTOCOL_V1"),
      runsModel: /\.complete\(\{/.test(src),
    });
  }
}

const SOURCES = {
  researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3",
  qualifierKnowledge: HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE), qualifierVersionId: QUALIFIER_V2_ID,
  auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID,
};

console.log("PROTOCOL REVISION IMPACT");
console.log("  " + SANDBOX_PROTOCOL_V1_ID + " -> " + SANDBOX_PROTOCOL_V2_ID);
console.log("  characters " + SANDBOX_PROTOCOL_V1.length + " -> " + SANDBOX_PROTOCOL_V2.length);
console.log("");

const executable = paths.filter((p) => !p.isTest);
console.log("paths that receive the protocol: " + paths.length + " (" + executable.filter((p) => p.runsModel).length + " execute a model)");
for (const p of paths) {
  console.log("   " + (p.isTest ? "test " : p.runsModel ? "RUN  " : "lib  ") + p.path.padEnd(52)
    + (p.viaAdapter ? "adapter " : "        ") + (p.pinsV1 ? "pins-v1" : ""));
}

console.log("");
console.log("ROLE TARGETS");
const roleRows = [];
for (const role of ["researcher", "qualifier", "auditor", "sales", "manager", "technical"]) {
  const a = adaptWorker(role, SOURCES);
  const t = adaptedTarget(a, "gpt-4.1", SANDBOX_TOOLING);
  roleRows.push({ role, midasWorker: a.midasWorker, versionId: a.versionId, targetId: targetId(t) });
  console.log("   " + role.padEnd(12) + (a.midasWorker ? "MIDAS " + a.versionId : "no worker").padEnd(16) + targetId(t));
}

/**
 * The finding that matters more than the list.
 *
 * CertificationTarget records role, worker version, model, knowledge, tools,
 * policy, retrieval and workflow. It does not record the protocol. So the target
 * id is unchanged by this revision, and every certification would carry across a
 * change to the environment the worker acts in without any fingerprint moving.
 */
const before = adaptedTarget(adaptWorker("researcher", SOURCES), "gpt-4.1", SANDBOX_TOOLING);
const after = { ...before };
const scope = recertificationScope(before, after);
console.log("");
console.log("FINGERPRINT CONSEQUENCE");
console.log("   target id before revision: " + targetId(before));
console.log("   target id after revision:  " + targetId(after));
console.log("   recertification scope says: " + scope.scope + " -- " + scope.reason);
console.log("   FINDING: CertificationTarget does not carry the protocol version, so the fingerprint");
console.log("   does not move when the environment does. Certifications are protocol-scoped in fact and");
console.log("   not in the identifier. Recorded, not silently patched: adding the field would change every");
console.log("   historical target id in this repository and rewrite what past results were about.");

const affected = [];
for (const f of ["academy-certification-midas.json", "researcher-certification.json", "research-judgment-cycle.json", "action-selection-microcycle.json", "auditor-foundry-cycle.json", "qualification-procedure-cycle.json"]) {
  const p = repoPath("var", "state", f);
  if (!existsSync(p)) continue;
  const raw = readFileSync(p, "utf8");
  const mentionsEscalation = /escalation_judgment|escalated|escalationRecall/.test(raw);
  affected.push({ file: f, protocolAtTimeOfRun: SANDBOX_PROTOCOL_V1_ID, carriesEscalationMeasurement: mentionsEscalation });
}
console.log("");
console.log("RECORDED RESULTS, ALL PRODUCED UNDER " + SANDBOX_PROTOCOL_V1_ID);
for (const a of affected) {
  console.log("   " + a.file.padEnd(42) + (a.carriesEscalationMeasurement ? "CONTAINS escalation measurement -- NOT comparable across the revision" : "no escalation measurement -- unaffected"));
}
console.log("");
console.log("   None are rewritten. Certification status is unchanged: the Researcher remains");
console.log("   SANDBOX_COMPETENT, earned under v1, and that award is not re-scored. What changes is");
console.log("   that any future escalation_judgment number belongs to v2 and cannot be compared to a v1 one.");

writeFileSync(repoPath("var", "state", "protocol-impact.json"), JSON.stringify({
  at: new Date().toISOString(),
  from: SANDBOX_PROTOCOL_V1_ID, to: SANDBOX_PROTOCOL_V2_ID,
  v1Length: SANDBOX_PROTOCOL_V1.length, v2Length: SANDBOX_PROTOCOL_V2.length,
  paths, roles: roleRows,
  fingerprintConsequence: {
    targetIdChanged: targetId(before) !== targetId(after),
    scope,
    finding: "CertificationTarget does not include the protocol version, so a protocol revision does not move any target id. Recorded rather than patched, because adding the field would change every historical target id and rewrite what past results were about.",
  },
  recordedResults: affected,
  certificationsInvalidated: [],
  note: "No prior result is rewritten or rescored. Prior escalation measurements remain valid evidence about sandbox-protocol-v1 and are not comparable to anything measured under v2.",
}, null, 1));
console.log("");
console.log("written: var/state/protocol-impact.json");
