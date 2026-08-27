/**
 * Guards for the integration audit.
 *
 * The audit exists because a capability that works and is never called passes
 * every test that checks whether it works. Its own failure mode is crying wolf:
 * an audit that reports paths as broken when they are merely indirect gets
 * ignored, and then the real bypass hides among the false ones.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { auditWiring, wiringReport, orphanedCapabilities } from "./integration-audit.ts";

const CAP = {
  id: "qualifier", module: "qualifier-foundry", exports: ["buildQualifierRequest"],
  promoted: true, whyItMatters: "It carries disqualifiers earned through measured training.",
};
const CAP_WITH_ARTIFACT = {
  ...CAP, id: "qualifier_artifact",
  artifact: { file: "verdicts.json", provenanceCheck: "verdictByUrl" },
};

function path(id: string, source: string, requires: string[]) {
  return { id, file: id + ".mjs", source, requires, purpose: "test" };
}

describe("a bypass is found, and an indirect call is not mistaken for one", () => {
  test("REGRESSION: a path that reimplements a promoted capability is flagged", () => {
    const f = auditWiring([path("queue", "const gone = /410/.test(x); if (gone) decline();", ["qualifier"])], [CAP]);
    assert.equal(f.length, 1);
    assert.equal(f[0].status, "bypassed");
    assert.equal(f[0].severity, "promoted_capability_bypassed",
      "a hand-written version of behaviour the foundry measured has no evidence behind it");
  });

  test("a path that imports and calls the capability is clean", () => {
    const f = auditWiring([path("q", "import { buildQualifierRequest } from '../qualifier-foundry.ts'; buildQualifierRequest(id, c);", ["qualifier"])], [CAP]);
    assert.deepEqual(f, []);
  });

  test("importing without calling is distinguished from not importing", () => {
    const f = auditWiring([path("q", "import { somethingElse } from '../qualifier-foundry.ts';", ["qualifier"])], [CAP]);
    assert.equal(f[0].status, "imported_not_called");
  });

  test("REGRESSION: reaching a capability through a wrapper is informational, not a gap", () => {
    const wrapper = { module: "assurance", source: "import { buildQualifierRequest } from './qualifier-foundry.ts';" };
    const f = auditWiring([path("p", "import { run } from './assurance.ts'; run();", ["qualifier"])], [CAP], [wrapper]);
    assert.equal(f[0].status, "wired_indirectly");
    assert.equal(f[0].severity, "informational");
    const r = wiringReport([path("p", "import { run } from './assurance.ts'; run();", ["qualifier"])], [CAP], [wrapper]);
    assert.equal(r.clean, true, "an audit that reports working paths as broken gets ignored");
    assert.equal(r.indirect.length, 1, "and it still says so, because a wrapper can change");
  });

  test("mentioning the export without importing reads as a local reimplementation", () => {
    const f = auditWiring([path("q", "function buildQualifierRequest(){ return {}; }", ["qualifier"])], [CAP]);
    assert.equal(f[0].status, "referenced_without_import");
  });
});

describe("consuming a pipeline artifact counts only when provenance is checked", () => {
  test("REGRESSION: a producer that calls the capability is not flagged for naming its own output", () => {
    const producer = path("producer", "import { buildQualifierRequest } from '../qualifier-foundry.ts'; write('verdicts.json');", ["qualifier_artifact"]);
    assert.deepEqual(auditWiring([producer], [CAP_WITH_ARTIFACT]), [],
      "direct wiring must win before the artifact fallback, or the stage that does the work is reported as skipping it");
  });

  test("a consumer that verifies provenance is wired", () => {
    const consumer = path("consumer", "const v = read('verdicts.json'); const verdictByUrl = new Map(...);", ["qualifier_artifact"]);
    assert.deepEqual(auditWiring([consumer], [CAP_WITH_ARTIFACT]), []);
  });

  test("a consumer that trusts the artifact blindly is flagged", () => {
    const consumer = path("consumer", "const v = read('verdicts.json'); const r = v.results[i];", ["qualifier_artifact"]);
    const f = auditWiring([consumer], [CAP_WITH_ARTIFACT]);
    assert.equal(f[0].status, "artifact_unverified");
    assert.match(f[0].detail, /stale artifact would pass unnoticed/);
  });
});

describe("capabilities nothing needs are surfaced separately", () => {
  test("an orphan is reported, and a promoted orphan says the effort is buying nothing", () => {
    const o = orphanedCapabilities([path("p", "x", [])], [CAP]);
    assert.equal(o.length, 1);
    assert.match(o[0].note, /buying nothing/);
  });

  test("a capability something requires is not an orphan", () => {
    assert.deepEqual(orphanedCapabilities([path("p", "x", ["qualifier"])], [CAP]), []);
  });
});

describe("a requirement naming an unknown capability is a declaration error", () => {
  test("it is reported rather than silently ignored", () => {
    const f = auditWiring([path("p", "x", ["does_not_exist"])], [CAP]);
    assert.equal(f[0].status, "unknown_capability");
    assert.equal(f[0].severity, "declaration_error");
  });
});
