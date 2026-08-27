/**
 * Who was actually evaluated?
 *
 * Three sessions of certifications described a bare base model wearing a MIDAS
 * worker's job title. The previous mission reported that fixed; four more paths
 * were still doing it, including the one measuring the instability that the
 * whole next mission was built on.
 *
 * The class of failure is not "someone forgot to wire a tool". It is that no
 * result was required to say what produced it. Every guard checked whether the
 * examination was sound and whether the scoring was honest. None asked whose
 * behaviour was being scored, so the answer could be wrong for months while
 * every check passed.
 *
 * This module makes the subject a first-class part of a result. A run that
 * cannot say what it executed is not eligible for serious certification, and a
 * deliberate generic baseline is fine as long as it is labelled as one and
 * cannot be mistaken for a worker.
 */

/** What an evaluation path actually put in the chair. */
export const ACTOR_KINDS = [
  "midas_worker",        // a promoted worker version, resolved through the adapter
  "generic_baseline",    // a bare model, deliberately and visibly, for comparison
  "foundry_worker",      // a promoted worker in its native single-shot form
  "non_worker",          // a model used as a tool, not as a certified worker
  "test_fixture",        // scripted, no model
  "undeclared",          // executes a model and does not say what it is
] as const;

/**
 * Enough to know what was evaluated.
 *
 * A missing field is recorded as null rather than defaulted, because a defaulted
 * field is how a result quietly claims a configuration it never ran.
 */
export interface SubjectIdentity {
  actorKind: string;
  workerId: string | null;
  workerVersion: string | null;
  model: string | null;
  knowledgeVersion: string | null;
  policyVersion: string | null;
  tools: string[] | null;
  retrievalConfig: string | null;
  /** The workstation/action protocol, which materially changes behaviour. */
  protocolVersion: string | null;
  evaluationVersion: string | null;
}

export function unknownSubject(): SubjectIdentity {
  return {
    actorKind: "undeclared", workerId: null, workerVersion: null, model: null,
    knowledgeVersion: null, policyVersion: null, tools: null,
    retrievalConfig: null, protocolVersion: null, evaluationVersion: null,
  };
}

/** Fields a certification-grade result cannot omit. */
export const REQUIRED_FOR_CERTIFICATION = ["actorKind", "workerId", "workerVersion", "model", "knowledgeVersion", "protocolVersion", "evaluationVersion"];

/**
 * Whether a result may be used for certification.
 *
 * A generic baseline is explicitly ineligible however complete its identity.
 * Its purpose is comparison, and letting it certify anything is the exact
 * failure this exists to prevent.
 */
export function certificationEligible(s: SubjectIdentity) {
  const missing = REQUIRED_FOR_CERTIFICATION.filter((k) => (s as any)[k] == null);
  if (s.actorKind === "generic_baseline") {
    return {
      eligible: false, missing,
      reason: "A generic baseline is a comparison arm. It describes the base model, not a MIDAS worker, and must never certify one.",
    };
  }
  if (s.actorKind === "undeclared") {
    return { eligible: false, missing, reason: "The result does not say what it executed. Unknown subject is not a certifiable subject." };
  }
  if (missing.length) {
    return { eligible: false, missing, reason: "Incomplete subject identity: " + missing.join(", ") + "." };
  }
  return { eligible: true, missing: [], reason: "Subject fully identified as " + s.workerId + "@" + s.workerVersion + " on " + s.model + "." };
}

/** A stable label for a result, so two subjects cannot be confused in a report. */
export function subjectLabel(s: SubjectIdentity) {
  if (s.actorKind === "generic_baseline") return "BASELINE(" + (s.model || "?") + ")";
  if (s.actorKind === "undeclared") return "UNDECLARED";
  return (s.workerId || "?") + "@" + (s.workerVersion || "?") + " on " + (s.model || "?");
}

// ------------------------------------------------------- path classification

export interface EvalPath {
  file: string;
  source: string;
}

/**
 * Classify what an executable path puts in the chair, from its source.
 *
 * Deliberately conservative: a path that runs a model and shows no sign of
 * resolving a worker is `undeclared` rather than assumed harmless. False alarms
 * here cost a line in a report; a miss costs three sessions of wrong results.
 */
export function classifyPath(p: EvalPath) {
  const s = p.source;
  const runsModel = /\.complete\(\{/.test(s);
  if (!runsModel) return { file: p.file, actorKind: "test_fixture", why: "Executes no model." };

  const usesAdapter = s.includes("adaptWorker") && s.includes("actorInstructions");
  const usesFoundry = /buildQualifierRequest|promptBundle|ensureQualifierVersion|getVersion\(/.test(s);
  const hasScenarios = s.includes("runScenario");
  const hasGeneric = /competent professional/i.test(s);
  const labelledBaseline = /function baselineActor|generic_baseline|GENERIC_BASELINE/.test(s);

  // A sandbox path is one that runs Academy scenarios. Those are the results
  // that get read as worker performance, so they carry the strict rule.
  if (hasScenarios) {
    if (usesAdapter && (!hasGeneric || labelledBaseline)) {
      return {
        file: p.file,
        actorKind: hasGeneric ? "midas_worker+generic_baseline" : "midas_worker",
        why: hasGeneric
          ? "Resolves the worker through the adapter and keeps a labelled baseline arm for comparison."
          : "Resolves the worker through the adapter.",
      };
    }
    return {
      file: p.file, actorKind: "undeclared",
      why: "Runs Academy scenarios against a model without resolving the worker through the adapter. Its results would read as worker performance.",
    };
  }

  if (usesFoundry) {
    return { file: p.file, actorKind: "foundry_worker", why: "Executes a promoted worker in its native single-shot form." };
  }
  return {
    file: p.file, actorKind: "non_worker",
    why: "Uses a model as a tool rather than as a certified worker. Its output is not worker performance and must not be reported as such.",
  };
}

export function auditPaths(paths: EvalPath[]) {
  const classified = paths.map(classifyPath);
  const undeclared = classified.filter((c) => c.actorKind === "undeclared");
  const byKind: Record<string, number> = {};
  for (const c of classified) byKind[c.actorKind] = (byKind[c.actorKind] || 0) + 1;
  return {
    paths: classified.length,
    byKind, classified, undeclared,
    clean: undeclared.length === 0,
    ruling: undeclared.length === 0
      ? "Every path that runs Academy scenarios resolves its worker explicitly."
      : undeclared.length + " path(s) run scenarios against an unresolved actor: " + undeclared.map((u) => u.file).join(", "),
  };
}
