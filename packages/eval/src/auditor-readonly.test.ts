/**
 * The tool contract, and the sealed set that will be run inside it.
 *
 * Every one of these runs before any model is called. The point of the last
 * mission was that harness and gold defects, not workers, have been the dominant
 * failure mode; a tool environment that is wrong is a harness defect that would
 * be indistinguishable from an incompetent worker.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  applyReadOnlyTool, runReadOnlyAudit, readingDiscipline, readOnlyPrompt, renderEvidenceEntry,
  AUDITOR_READONLY_TOOL_SET, FORBIDDEN_TOOLS, AUDITOR_READONLY_PROTOCOL, AUDITOR_READONLY_PROTOCOL_ID,
} from "./auditor-readonly.ts";
import { AUDITOR_TOOL_CASES, toolCaseCoverage } from "./auditor-tool-cases.ts";
import { AUDITOR_LOCK_CASES } from "./auditor-lock-cases.ts";
import { AUDIT_SEALED_CASES } from "./auditor-cases.ts";
import { DEFECT_CLASSES, AUDIT_VERDICTS, scoreAudit } from "./auditor.ts";

const CASE = AUDITOR_TOOL_CASES[0];

describe("the environment offers exactly what the role needs and nothing else", () => {
  test("both tools resolve", () => {
    assert.equal(applyReadOnlyTool(CASE.store, "list_evidence", {}).ok, true);
    assert.equal(applyReadOnlyTool(CASE.store, "read_evidence", { id: "company-record" }).ok, true);
  });

  test("REGRESSION: every tool that could change or transmit anything is refused", () => {
    for (const t of FORBIDDEN_TOOLS) {
      const r = applyReadOnlyTool(CASE.store, t, { id: "company-record", text: "x" });
      assert.equal(r.ok, false, t + " resolved in a read-only environment");
      assert.match(r.output, /Tool not available/);
    }
  });

  test("the refusal does not disclose the tool list, so it is not a second instruction channel", () => {
    const r = applyReadOnlyTool(CASE.store, "search", { query: "x" });
    for (const t of AUDITOR_READONLY_TOOL_SET) assert.ok(!r.output.includes(t), "the refusal named " + t);
  });

  test("the inventory labels its fields, so the id cannot be confused with the label", () => {
    // The workstation format cost a Researcher a whole run: it read a bracketed
    // kind as the identifier, called read with it, and never recovered. That
    // format is not reproduced here and this test is why.
    const out = applyReadOnlyTool(CASE.store, "list_evidence", {}).output;
    for (const r of CASE.store.records) {
      assert.ok(out.includes("id=" + r.id), "the id is not labelled for " + r.id);
      assert.ok(out.includes("label=" + r.label));
    }
    assert.equal(renderEvidenceEntry(CASE.store.records[0]).split(" | ").length, 2);
  });

  test("a read miss names the ids that exist, so a worker can correct itself", () => {
    const r = applyReadOnlyTool(CASE.store, "read_evidence", { id: "brand guide" });
    assert.equal(r.ok, false);
    for (const rec of CASE.store.records) assert.ok(r.output.includes(rec.id));
  });

  test("a read returns the whole body and never a summary", () => {
    for (const rec of CASE.store.records) {
      assert.equal(applyReadOnlyTool(CASE.store, "read_evidence", { id: rec.id }).output, rec.body);
    }
  });

  test("nothing a worker does mutates the store", () => {
    const before = JSON.stringify(CASE.store);
    for (const t of [...AUDITOR_READONLY_TOOL_SET, ...FORBIDDEN_TOOLS]) applyReadOnlyTool(CASE.store, t, { id: "company-record", body: "tampered" });
    assert.equal(JSON.stringify(CASE.store), before);
  });

  test("the protocol tells the worker the truth about what it has", () => {
    assert.equal(AUDITOR_READONLY_PROTOCOL_ID, "auditor-readonly-v1");
    for (const t of AUDITOR_READONLY_TOOL_SET) assert.ok(AUDITOR_READONLY_PROTOCOL.includes(t), "the protocol never mentions " + t);
    for (const t of FORBIDDEN_TOOLS) assert.ok(!new RegExp("\\b" + t + "\\(").test(AUDITOR_READONLY_PROTOCOL), "the protocol offers " + t);
    assert.match(AUDITOR_READONLY_PROTOCOL, /The id is the value after id=/);
  });

  test("the prompt withholds the evidence, which is the whole change", () => {
    for (const c of AUDITOR_TOOL_CASES) {
      const p = readOnlyPrompt(c);
      assert.ok(p.includes(c.output), c.id + " does not show the output under audit");
      for (const r of c.store.records) {
        assert.ok(!p.includes(r.body), c.id + " leaks the body of " + r.id + " into the prompt");
      }
    }
  });
});

describe("the run loop behaves as the measurement assumes", () => {
  const gather = [{ kind: "tool_call", tool: "list_evidence", args: {} }, { kind: "tool_call", tool: "read_evidence", args: { id: "company-record" } }];
  const done: any = { kind: "finish", verdict: "fail", criticalDefects: [{ defectClass: "fabrication", claim: "eleven engagements", why: "record says zero" }] };

  test("a full run records the reads and the verdict", async () => {
    const r = await runReadOnlyAudit(CASE, async ({ turn }) => (turn === 1 ? gather : [done]));
    assert.equal(r.report?.verdict, "fail");
    assert.equal(r.turnsUsed, 2);
    const d = readingDiscipline(CASE, r.log);
    assert.equal(d.listedInventory, true);
    assert.equal(d.decisiveComplete, true);
    assert.equal(d.recordsOpened, 1);
  });

  test("REGRESSION: a verdict reached without opening the decisive record is not credited", async () => {
    const r = await runReadOnlyAudit(CASE, async () => [done]);
    assert.equal(r.report?.verdict, "fail", "the verdict itself is still correct");
    assert.equal(scoreAudit(r.report as any, CASE.gold).detected, true, "and the scorer still calls it a detection");
    assert.equal(readingDiscipline(CASE, r.log).decisiveComplete, false,
      "so reading discipline is the only thing separating a guess from an audit");
  });

  test("actions after finish are not executed", async () => {
    const r = await runReadOnlyAudit(CASE, async () => [done, { kind: "tool_call", tool: "read_evidence", args: { id: "brand-guide" } }]);
    assert.equal(r.log.filter((a) => a.kind === "tool_call").length, 0);
  });

  test("a run that never finishes has no verdict and is not defaulted to a pass", async () => {
    const r = await runReadOnlyAudit(CASE, async () => [{ kind: "tool_call", tool: "list_evidence", args: {} }], 3);
    assert.equal(r.report, null);
    assert.equal(r.turnsUsed, 3);
  });

  test("reads after the finish do not count toward discipline", () => {
    const log: any = [
      { step: 1, kind: "finish", verdict: "fail" },
      { step: 2, kind: "tool_call", tool: "read_evidence", args: { id: "company-record" }, ok: true },
    ];
    assert.equal(readingDiscipline(CASE, log).decisiveComplete, false);
  });

  test("a control case with nothing to open reports null rather than a free pass", () => {
    const c = AUDITOR_TOOL_CASES.find((x) => x.decisiveEvidenceIds.length === 0)!;
    assert.equal(readingDiscipline(c, []).decisiveComplete, null);
  });
});

describe("the sealed set, audited before it is used", () => {
  test("it has the shape the design claims", () => {
    const c = toolCaseCoverage();
    assert.equal(c.cases, 8);
    assert.equal(c.requireReading, 7);
    assert.equal(c.decidableWithoutReading, 1);
  });

  test("BLOCKING: no gate can be satisfied by a single case", () => {
    // Preflight refused the first draft of this experiment because one must-pass
    // case and one underdetermined case each carried their own gate outright.
    // This is the third time that resolution defect has appeared, so it is now
    // asserted in the set rather than discovered in the manifest.
    const c = toolCaseCoverage();
    // The invariant is per verdict class: either the set exercises it with at
    // least two cases, or it does not exercise it at all and no gate may be
    // declared on it. After the gold repair the ambiguous count is zero, and
    // preflight refuses the corrected experiment for its now-unexercised gate.
    assert.ok(c.resolution.mustPassCases >= 2, "one case decides the false-accusation gate");
    assert.ok(c.resolution.ambiguousCases === 0 || c.resolution.ambiguousCases >= 2,
      "one case decides the ambiguity gate");
  });

  test("no case reappears from either earlier set", () => {
    const prior = new Set([...AUDITOR_LOCK_CASES, ...AUDIT_SEALED_CASES].map((c: any) => c.id));
    const priorOutputs = [...AUDITOR_LOCK_CASES, ...AUDIT_SEALED_CASES].map((c: any) => String(c.output));
    for (const c of AUDITOR_TOOL_CASES) {
      assert.ok(!prior.has(c.id), c.id + " collides with an earlier set");
      assert.ok(!priorOutputs.includes(c.output), c.id + " reuses an earlier audited output verbatim");
    }
  });

  test("every gold verdict and class is one the schema can express", () => {
    for (const c of AUDITOR_TOOL_CASES) {
      assert.ok(AUDIT_VERDICTS.includes(c.gold.verdict as any), c.id + " gold verdict is unreachable");
      if (c.gold.defectClass) assert.ok(DEFECT_CLASSES.includes(c.gold.defectClass as any), c.id + " gold class is unreachable");
      for (const a of c.gold.alsoAcceptable || []) assert.ok(DEFECT_CLASSES.includes(a as any), c.id + " lists an unreachable alternative: " + a);
    }
  });

  test("BLOCKING: every decisive record actually exists in its own store", () => {
    for (const c of AUDITOR_TOOL_CASES) {
      for (const id of c.decisiveEvidenceIds) {
        assert.ok(c.store.records.some((r) => r.id === id), c.id + " requires reading " + id + ", which is not in the store");
      }
    }
  });

  test("BLOCKING: the decisive record is genuinely decisive and the prompt does not give it away", () => {
    // If the verdict could be reached from the prompt alone, the case measures
    // nothing about tool use and would score as a detection for a worker that
    // never opened anything.
    for (const c of AUDITOR_TOOL_CASES.filter((x) => x.decisiveEvidenceIds.length)) {
      const p = readOnlyPrompt(c).toLowerCase();
      for (const id of c.decisiveEvidenceIds) {
        const body = c.store.records.find((r) => r.id === id)!.body;
        const sentences = body.split(". ").filter((s) => s.length > 30);
        for (const s of sentences) assert.ok(!p.includes(s.toLowerCase()), c.id + " leaks a decisive sentence into the prompt");
      }
    }
  });

  test("no store is a single record, so listing is never the whole audit", () => {
    for (const c of AUDITOR_TOOL_CASES) assert.ok(c.store.records.length >= 2, c.id + " has nothing to choose between");
  });

  test("every case explains what it is for", () => {
    for (const c of AUDITOR_TOOL_CASES) assert.ok(c.why.length > 60, c.id + " has no stated purpose");
  });
});
