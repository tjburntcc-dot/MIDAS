/**
 * Guards for subject identity.
 *
 * The failure this prevents ran for three sessions: certifications that
 * described a bare base model wearing a worker's job title. It survived because
 * no result was required to say what produced it, so every other guard could
 * pass while the answer was wrong.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { repoPath } from "@midas/db";
import {
  classifyPath, auditPaths, certificationEligible, subjectLabel,
  unknownSubject, ACTOR_KINDS, REQUIRED_FOR_CERTIFICATION,
} from "./subject-identity.ts";

function complete(s: Partial<any> = {}) {
  return {
    actorKind: "midas_worker", workerId: "opportunity_qualifier", workerVersion: "oq-v2",
    model: "gpt-4.1", knowledgeVersion: "K-HD-001+", policyVersion: "foundry-promoted",
    tools: ["sandbox"], retrievalConfig: "none", protocolVersion: "workstation-v1",
    evaluationVersion: "academy-v0.2", ...s,
  };
}

describe("a result must be able to say what produced it", () => {
  test("REGRESSION: an undeclared subject cannot certify anything", () => {
    const r = certificationEligible(unknownSubject());
    assert.equal(r.eligible, false);
    assert.match(r.reason, /Unknown subject is not a certifiable subject/);
  });

  test("REGRESSION: a generic baseline can never certify a worker, however complete", () => {
    const r = certificationEligible(complete({ actorKind: "generic_baseline" }));
    assert.equal(r.eligible, false, "a fully-described baseline is still a baseline");
    assert.match(r.reason, /describes the base model, not a MIDAS worker/);
  });

  test("an incomplete subject is refused and says which field is missing", () => {
    const r = certificationEligible(complete({ knowledgeVersion: null }));
    assert.equal(r.eligible, false);
    assert.deepEqual(r.missing, ["knowledgeVersion"]);
  });

  test("a fully identified worker is eligible", () => {
    const r = certificationEligible(complete());
    assert.equal(r.eligible, true);
    assert.match(r.reason, /oq-v2 on gpt-4.1/);
  });

  test("labels cannot be confused between a worker and a baseline", () => {
    assert.match(subjectLabel(complete()), /oq-v2/);
    assert.match(subjectLabel(complete({ actorKind: "generic_baseline" })), /^BASELINE\(/);
    assert.equal(subjectLabel(unknownSubject()), "UNDECLARED");
  });

  test("every required field is one a wrong value would change behaviour", () => {
    for (const f of ["workerVersion", "model", "knowledgeVersion", "protocolVersion"]) {
      assert.ok(REQUIRED_FOR_CERTIFICATION.includes(f), f + " is not required and should be");
    }
  });
});

describe("paths are classified by what they actually execute", () => {
  test("a scenario path without the adapter is undeclared, not assumed harmless", () => {
    const c = classifyPath({ file: "x.mjs", source: "runScenario(s, a); provider.complete({ instructions: 'be a competent professional' })" });
    assert.equal(c.actorKind, "undeclared");
    assert.match(c.why, /would read as worker performance/);
  });

  test("a scenario path with the adapter is a MIDAS worker", () => {
    const c = classifyPath({ file: "x.mjs", source: "adaptWorker(role, S); actorInstructions(a, t); runScenario(s, a); provider.complete({x:1})" });
    assert.equal(c.actorKind, "midas_worker");
  });

  test("a labelled baseline arm alongside the adapter is allowed and named", () => {
    const c = classifyPath({
      file: "x.mjs",
      source: "function baselineActor(){} adaptWorker(r,S); actorInstructions(a,t); runScenario(s,a); provider.complete({x:1}); 'competent professional'",
    });
    assert.equal(c.actorKind, "midas_worker+generic_baseline");
  });

  test("a model used as a tool is not reported as worker performance", () => {
    const c = classifyPath({ file: "search.mjs", source: "provider.complete({ instructions: 'search the web' })" });
    assert.equal(c.actorKind, "non_worker");
    assert.match(c.why, /must not be reported as such/);
  });

  test("every classification is one of the declared kinds", () => {
    const kinds = new Set(ACTOR_KINDS as any);
    for (const src of ["runScenario;adaptWorker;actorInstructions;.complete({", ".complete({", "nothing"]) {
      const c = classifyPath({ file: "f", source: src });
      assert.ok([...kinds].some((k) => c.actorKind.startsWith(k)), "unknown kind " + c.actorKind);
    }
  });
});

describe("the whole repository is audited, not a maintained list", () => {
  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const full = dir + "/" + name;
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (["node_modules", ".git", "var", "dist", ".midas-ui-backups"].includes(name)) continue;
        walk(full, out);
      } else if (/\.(mjs|ts)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
    }
    return out;
  }

  test("REGRESSION: no path runs Academy scenarios against an unresolved actor", () => {
    // A maintained list is what failed: four paths were missed by one believed
    // complete, and one of them measured the number the next mission was built on.
    const files = [...walk(repoPath("tools")), ...walk(repoPath("packages"))];
    const paths = files
      .map((f) => ({ file: f.split(String.fromCharCode(92)).join("/").replace(/^.*\/MIDAS\//, ""), source: readFileSync(f, "utf8") }))
      .filter((p) => /\.complete\(\{/.test(p.source));
    const r = auditPaths(paths);
    assert.ok(r.paths >= 20, "expected many model-executing paths, found " + r.paths);
    assert.deepEqual(r.undeclared.map((u) => u.file), [], r.ruling);
  });
});
