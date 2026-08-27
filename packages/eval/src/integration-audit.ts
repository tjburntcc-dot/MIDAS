/**
 * Integration audit.
 *
 * A capability that exists and is not called is not a capability. The foundry
 * promoted a qualifier carrying an expiry disqualifier, a discovery path was
 * built that never called it, and a dead listing reached an approval queue that
 * a trained worker would have rejected. Nothing was broken. Everything passed.
 * The wiring was simply absent, and absence is invisible to every test that
 * checks whether the parts work.
 *
 * So the check here is not "does the capability work" but "does the path that
 * needs it reach it". Those are different questions and only one of them was
 * being asked.
 *
 * The audit is static and deliberately crude: it looks for the capability's
 * module being imported and its export being mentioned. A crude check that runs
 * on every path beats a precise one that requires executing them, because the
 * failure mode is a path nobody thought about rather than a subtle call-graph
 * question.
 */

export interface Capability {
  id: string;
  /** Module that implements it, as it would appear in an import specifier. */
  module: string;
  /** Exports whose presence indicates the capability is actually invoked. */
  exports: string[];
  /**
   * A pipeline artifact this capability writes, and the provenance check a
   * consumer must perform.
   *
   * Consuming an artifact is legitimate wiring only when the consumer verifies
   * the artifact describes its own input. Without that check the stage is
   * reading a file that may predate the data it is reasoning about, which is a
   * quieter version of the same bypass.
   */
  artifact?: { file: string; provenanceCheck: string };
  /** Why bypassing it costs something. */
  whyItMatters: string;
  /** Whether it went through the foundry, which raises the cost of ignoring it. */
  promoted: boolean;
}

export interface ProductionPath {
  id: string;
  file: string;
  source: string;
  /** Capabilities this path is required to use, by capability id. */
  requires: string[];
  /** What the path does, so a reader can judge whether the requirement is right. */
  purpose: string;
}

export interface WiringFinding {
  pathId: string;
  file: string;
  capabilityId: string;
  status: string;
  detail: string;
  severity: string;
}

function usesCapability(source: string, cap: Capability) {
  // Direct wiring is checked first. A producer names its own output file, and
  // treating that as artifact consumption reported the stage that actually calls
  // the worker as the one bypassing it.
  if (source.includes(cap.module) && cap.exports.some((e) => source.includes(e))) {
    return { status: "wired", detail: "Imports " + cap.module + " and calls it directly." };
  }
  if (cap.artifact && source.includes(cap.artifact.file)) {
    const verified = new RegExp(cap.artifact.provenanceCheck).test(source);
    if (verified) {
      return { status: "wired", detail: "Consumes " + cap.artifact.file + " and verifies its provenance." };
    }
    return {
      status: "artifact_unverified",
      detail: "Consumes " + cap.artifact.file + " without checking it describes this input. A stale artifact would pass unnoticed.",
    };
  }
  const importsModule = source.includes(cap.module);
  const namesExport = cap.exports.some((e) => new RegExp("\\b" + e + "\\b").test(source));
  if (importsModule && namesExport) return { status: "wired", detail: "Imports " + cap.module + " and references " + cap.exports.filter((e) => new RegExp("\\b" + e + "\\b").test(source)).join(", ") + "." };
  if (importsModule) return { status: "imported_not_called", detail: "Imports " + cap.module + " but does not reference any of: " + cap.exports.join(", ") + "." };
  if (namesExport) return { status: "referenced_without_import", detail: "Mentions " + cap.exports.join("/") + " without importing " + cap.module + ". Likely reimplemented locally." };
  return { status: "bypassed", detail: "Does not reach " + cap.module + " at all." };
}

/**
 * Modules a path pulls in, so a capability reached through a wrapper counts as
 * reached.
 *
 * Without this the audit reports a path as bypassing a capability it uses via
 * one intermediate module, and an audit that cries wolf is an audit nobody
 * reads -- which would leave the real bypasses hidden among the false ones.
 */
export interface ModuleSource {
  module: string;
  source: string;
}

function reachableSource(path: ProductionPath, modules: ModuleSource[]) {
  const seen = new Set<string>();
  let combined = path.source;
  // One level of indirection. Deeper chains exist, but each level costs
  // precision, and every real bypass found so far was direct or one hop.
  for (const m of modules) {
    if (seen.has(m.module)) continue;
    if (path.source.includes(m.module)) { combined += " " + m.source; seen.add(m.module); }
  }
  return { combined, via: [...seen] };
}

/**
 * Audit which production paths reach the capabilities they are required to use.
 *
 * A promoted capability bypassed is graded higher than an unpromoted one,
 * because the foundry spent measured effort earning behaviour that is now being
 * reimplemented by hand somewhere -- and the hand version has no evidence behind
 * it at all.
 */
export function auditWiring(paths: ProductionPath[], capabilities: Capability[], modules: ModuleSource[] = []): WiringFinding[] {
  const byId: Record<string, Capability> = {};
  for (const c of capabilities) byId[c.id] = c;

  const findings: WiringFinding[] = [];
  for (const p of paths) {
    for (const capId of p.requires) {
      const cap = byId[capId];
      if (!cap) {
        findings.push({ pathId: p.id, file: p.file, capabilityId: capId, status: "unknown_capability", detail: "No capability declared with id " + capId + ".", severity: "declaration_error" });
        continue;
      }
      const direct = usesCapability(p.source, cap);
      if (direct.status === "wired") continue;

      // Reached through a wrapper is still reached, and is reported as such
      // rather than silently passing, because an indirect dependency is a real
      // thing to know about when the wrapper changes.
      const reach = reachableSource(p, modules);
      const indirect = usesCapability(reach.combined, cap);
      if (indirect.status === "wired") {
        findings.push({
          pathId: p.id, file: p.file, capabilityId: capId, status: "wired_indirectly",
          detail: "Reached through " + reach.via.join(", ") + " rather than directly.",
          severity: "informational",
        });
        continue;
      }
      findings.push({
        pathId: p.id, file: p.file, capabilityId: capId, status: direct.status,
        detail: direct.detail + " " + cap.whyItMatters,
        severity: cap.promoted ? "promoted_capability_bypassed" : "capability_bypassed",
      });
    }
  }
  return findings;
}

/**
 * Capabilities nothing requires.
 *
 * Separate from a bypass and often more informative: a capability no path
 * declares a need for was either built speculatively or quietly abandoned, and
 * both are worth knowing before it is maintained for another year.
 */
export function orphanedCapabilities(paths: ProductionPath[], capabilities: Capability[]) {
  const required = new Set(paths.flatMap((p) => p.requires));
  return capabilities.filter((c) => !required.has(c.id)).map((c) => ({
    capabilityId: c.id, promoted: c.promoted,
    note: c.promoted
      ? "Promoted through the foundry and required by no production path. The measured effort is currently buying nothing."
      : "No production path declares a need for it.",
  }));
}

export function wiringReport(paths: ProductionPath[], capabilities: Capability[], modules: ModuleSource[] = []) {
  const findings = auditWiring(paths, capabilities, modules).filter((f) => f.severity !== "informational");
  const indirect = auditWiring(paths, capabilities, modules).filter((f) => f.severity === "informational");
  const orphans = orphanedCapabilities(paths, capabilities);
  const promotedBypassed = findings.filter((f) => f.severity === "promoted_capability_bypassed");
  return {
    pathsAudited: paths.length,
    capabilitiesDeclared: capabilities.length,
    findings,
    indirect,
    promotedBypassed,
    orphans,
    clean: findings.length === 0,
    ruling: findings.length === 0
      ? "Every path reaches the capabilities it requires."
      : findings.length + " wiring gap(s), " + promotedBypassed.length + " of them bypassing a capability the foundry earned.",
  };
}
