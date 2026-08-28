/**
 * Does the live path actually resolve a MIDAS Auditor?
 *
 * This file began as the opposite assertion. Before the worker existed, the
 * same call returned:
 *
 *   midasWorker: false
 *   "No MIDAS worker has been manufactured for the auditor role. A result for
 *    this role describes the base model, not MIDAS, and must be read that way."
 *
 * That absence was proved mechanically before anything was built, because a
 * worker that exists only as a file is not a worker. What is asserted now is
 * that the adapter resolves the real configuration, that the resolution is not
 * accidental, and that the roles which still have no worker still say so.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { adaptWorker } from "./worker-adapter.ts";
import { AUDITOR_DOCTRINE, AUDITOR_VERSION_ID } from "./auditor.ts";

const SOURCES = { auditorKnowledge: AUDITOR_DOCTRINE as any, auditorVersionId: AUDITOR_VERSION_ID };

describe("the auditor resolves on the live path", () => {
  test("adaptWorker returns the real MIDAS auditor", () => {
    const a = adaptWorker("auditor", SOURCES);
    assert.equal(a.midasWorker, true);
    assert.equal(a.versionId, AUDITOR_VERSION_ID);
    assert.equal(a.knowledgeIds.length, AUDITOR_DOCTRINE.length);
    assert.ok(a.knowledgeBlock.includes("Unread is not missing"));
    assert.equal(a.absenceReason, undefined);
  });

  test("REGRESSION: the knowledge block carries every doctrine item verbatim", () => {
    const a = adaptWorker("auditor", SOURCES);
    for (const d of AUDITOR_DOCTRINE) {
      assert.ok(a.knowledgeBlock.includes(d.text), d.id + " did not reach the worker");
      assert.ok(a.knowledgeIds.includes(d.id), d.id + " is not declared");
    }
  });

  test("resolution requires the sources, so a caller cannot get a worker by naming one", () => {
    const bare = adaptWorker("auditor", {});
    assert.equal(bare.midasWorker, false);
    assert.ok(bare.absenceReason);
  });

  test("the roles that still have no worker still say so", () => {
    for (const role of ["sales", "manager", "technical"]) {
      const r = adaptWorker(role, SOURCES);
      assert.equal(r.midasWorker, false, role + " must not resolve from auditor sources");
      assert.match(r.absenceReason || "", /No MIDAS worker has been manufactured/);
    }
  });
});
