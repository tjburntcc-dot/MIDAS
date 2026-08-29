/**
 * Move the completed Houston ISD Shadow into the console's run store.
 *
 * It is copied, not recomputed. The raw stage outputs, the transcripts, the
 * targets and the token counts are the ones the run actually produced on
 * 2026-08-29, and the record is marked historical so nothing downstream can
 * mistake a preserved result for a fresh one. Re-running it to make a screen
 * render would destroy the only real evidence there is.
 *
 * Idempotent. No model call, no outbound action.
 */
import { readFileSync, existsSync } from "node:fs";
import { repoPath } from "@midas/db";
import { houstonPacket } from "../packages/eval/src/company0-shadow.ts";
import { loadRuns, saveRun, inputFingerprint, runSummary } from "../packages/eval/src/company0-console.ts";

const RAW = repoPath("var", "state", "company0-shadow-raw.json");
if (!existsSync(RAW)) { console.error("No completed Shadow to migrate."); process.exit(1); }
const raw = JSON.parse(readFileSync(RAW, "utf8"));
const packet = houstonPacket();
const runId = "RUN-C0-SHADOW-01";

if (loadRuns().some((r) => r.runId === runId)) {
  console.log("Already migrated: " + runId);
  process.exit(0);
}

const hand = existsSync(repoPath("var", "state", "company0-shadow-handoff.json"))
  ? JSON.parse(readFileSync(repoPath("var", "state", "company0-shadow-handoff.json"), "utf8")) : null;
const adj = existsSync(repoPath("var", "state", "company0-shadow-adjudication.json"))
  ? JSON.parse(readFileSync(repoPath("var", "state", "company0-shadow-adjudication.json"), "utf8")) : null;

const run = {
  runId,
  opportunityId: packet.workItemId,
  opportunityTitle: packet.title,
  startedAt: raw.at,
  finishedAt: raw.at,
  stage: "COMPLETE",
  historical: true,
  note: "The first real Company 0 Shadow, run 2026-08-29 from the command line before this console existed. Preserved exactly as it ran; not recomputed.",
  inputFingerprint: inputFingerprint(packet),
  model: raw.model,
  targets: raw.targets,
  instructionHashes: raw.instructionHashes,
  calls: raw.calls,
  tokens: raw.tokens,
  stages: raw.stages,
  inputs: raw.inputs,
  outboundActionsTaken: 0,
  owner: { disposition: "NONE", note: null, at: null, externalActionAuthorised: false },
  outcome: null,
  analysis: hand
    ? {
      factsLostByManager: hand.survival.manager.lost,
      researcherLost: hand.survival.researcher.lost,
      datesReconciled: hand.dateTrace.bothReconciledInManager,
      inventedFigures: hand.invented.manager,
      provenanceRetention: hand.provenance.provenanceRetentionRate,
      observed: hand.observedFailures.map((o) => o.code),
      adjudication: adj ? adj.adjudication.verdict : null,
      adjudicationPrimaryFailure: adj ? adj.adjudication.primaryLimitingFailure : null,
    }
    : null,
};

saveRun(run);
console.log("Migrated the completed Shadow into the console run store.");
console.log(JSON.stringify(runSummary(run), null, 1));
