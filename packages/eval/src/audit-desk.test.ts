/**
 * The desk, and the set that will be certified on it.
 *
 * Everything here runs before a model is called. Harness and gold defects, not
 * workers, remain the dominant recorded failure mode, and GOLD_DEFECT is now the
 * single most common category. A tool environment that is wrong, or a reference
 * answer that is wrong, is indistinguishable from an incompetent worker once the
 * money is spent.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  applyDeskTool, runDeskAudit, readingDiscipline, deskPrompt, renderIndex,
  AUDIT_DESK_TOOL_SET, FORBIDDEN_TOOLS, AUDIT_DESK_PROTOCOL, AUDIT_DESK_PROTOCOL_ID,
  derivedTurnFloor, turnsWithSlack,
} from "./audit-desk.ts";
import { AUDIT_DESK_CASES, deskCoverage, REQUIRED_COMPETENCIES } from "./audit-desk-cases.ts";
import { AUDITOR_TOOL_CASES } from "./auditor-tool-cases.ts";
import { AUDITOR_LOCK_CASES } from "./auditor-lock-cases.ts";
import { AUDIT_SEALED_CASES } from "./auditor-cases.ts";
import { DEFECT_CLASSES, AUDIT_VERDICTS } from "./auditor.ts";
import { finalAuditorTarget, readOnlyToolTarget, AUDIT_DESK_ENVIRONMENT } from "./auditor-target-truth.ts";
import { targetId } from "./academy.ts";

const CASE = AUDIT_DESK_CASES[0];

describe("the desk offers one tool and it does exactly one thing", () => {
  test("a batch read returns every named body, whole and labelled by id", () => {
    const r = applyDeskTool(CASE.packet, "read_evidence", { ids: ["job-rules", "enquiry"] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.opened, ["job-rules", "enquiry"]);
    for (const rec of CASE.packet.records) assert.ok(r.output.includes(rec.body), rec.id + " came back truncated");
  });

  test("bodies come back in the order asked for, so nothing is ranked for the auditor", () => {
    const a = applyDeskTool(CASE.packet, "read_evidence", { ids: ["enquiry", "job-rules"] }).output;
    const b = applyDeskTool(CASE.packet, "read_evidence", { ids: ["job-rules", "enquiry"] }).output;
    assert.notEqual(a, b, "the order the auditor asked in was reordered for it");
    assert.ok(a.indexOf("enquiry") < a.indexOf("job-rules"));
    assert.ok(b.indexOf("job-rules") < b.indexOf("enquiry"));
  });

  test("REGRESSION: the read adds nothing of its own -- no summary, no score, no hint", () => {
    const r = applyDeskTool(CASE.packet, "read_evidence", { ids: CASE.packet.records.map((x) => x.id) });
    const scaffold = r.output.split("\n").filter((l) => !l.startsWith("=== id=")).join("\n");
    for (const rec of CASE.packet.records) {
      assert.ok(scaffold.includes(rec.body));
    }
    // Everything returned is either a body or an id/label header. Nothing else.
    const bodies = CASE.packet.records.map((x) => x.body).join("\n");
    const residue = scaffold.split("\n").filter((l) => l.trim() && !bodies.includes(l.trim()));
    assert.deepEqual(residue, [], "the tool returned commentary of its own: " + JSON.stringify(residue));
    // The headers are the only text the tool authors. They must carry identity
    // and nothing evaluative: a header that called a record relevant would be
    // doing the auditor's job for it.
    const headers = r.output.split(String.fromCharCode(10)).filter((l) => l.startsWith("=== id="));
    assert.equal(headers.length, CASE.packet.records.length);
    for (const h of headers) {
      assert.match(h, /^=== id=[a-z0-9-]+ \| label=.+$/);
      assert.doesNotMatch(h.replace(/label=.*/, ""), /relevan|important|key |recommend|suggest|first|primary/i);
    }
  });

  test("an arbitrary subset is readable, so choosing is real", () => {
    const c = AUDIT_DESK_CASES.find((x) => x.packet.records.length >= 4)!;
    for (const rec of c.packet.records) {
      const r = applyDeskTool(c.packet, "read_evidence", { ids: [rec.id] });
      assert.equal(r.ok, true);
      assert.deepEqual(r.opened, [rec.id]);
      for (const other of c.packet.records) {
        if (other.id !== rec.id) assert.ok(!r.output.includes(other.body), "reading one record leaked " + other.id);
      }
    }
  });

  test("one bad id does not cost the auditor the rest of the call", () => {
    const r = applyDeskTool(CASE.packet, "read_evidence", { ids: ["enquiry", "not-a-record"] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.opened, ["enquiry"]);
    assert.match(r.output, /No such record/);
    assert.ok(r.output.includes(CASE.packet.records[0].body));
  });

  test("REGRESSION: every tool that could change, send or search is refused", () => {
    for (const t of FORBIDDEN_TOOLS) {
      const r = applyDeskTool(CASE.packet, t, { ids: ["enquiry"], id: "enquiry", query: "x", text: "x" });
      assert.equal(r.ok, false, t + " resolved at a read-only desk");
      assert.match(r.output, /Tool not available/);
      assert.deepEqual(r.opened, []);
    }
  });

  test("the refusal does not teach the tool list", () => {
    const r = applyDeskTool(CASE.packet, "search", { query: "x" });
    for (const t of AUDIT_DESK_TOOL_SET) assert.ok(!r.output.includes(t), "the refusal named " + t);
  });

  test("nothing a worker does mutates the packet", () => {
    const before = JSON.stringify(CASE.packet);
    for (const t of [...AUDIT_DESK_TOOL_SET, ...FORBIDDEN_TOOLS]) {
      applyDeskTool(CASE.packet, t, { ids: ["enquiry"], body: "tampered", id: "enquiry" });
    }
    assert.equal(JSON.stringify(CASE.packet), before);
  });

  test("an empty or missing id list fails helpfully rather than silently", () => {
    for (const args of [{}, { ids: [] }, { ids: null }]) {
      const r = applyDeskTool(CASE.packet, "read_evidence", args as any);
      assert.equal(r.ok, false);
      assert.match(r.output, /Records that exist/);
    }
  });

  test("the contents page carries id and label and nothing else", () => {
    const idx = renderIndex(CASE.packet);
    for (const rec of CASE.packet.records) {
      assert.ok(idx.includes("id=" + rec.id));
      assert.ok(idx.includes("label=" + rec.label));
      assert.ok(!idx.includes(rec.body), "the contents page leaks a body");
    }
    assert.equal(idx.split("\n").length, CASE.packet.records.length);
  });

  test("the protocol describes the desk truthfully", () => {
    assert.equal(AUDIT_DESK_PROTOCOL_ID, "audit-desk-v1");
    assert.match(AUDIT_DESK_PROTOCOL, /read_evidence\(\{ids/);
    assert.match(AUDIT_DESK_PROTOCOL, /You may open any number of records in one call/);
    for (const t of FORBIDDEN_TOOLS) {
      assert.ok(!new RegExp("\\b" + t + "\\(").test(AUDIT_DESK_PROTOCOL), "the protocol offers " + t);
    }
  });

  test("the prompt withholds every body, which is the whole measurement", () => {
    for (const c of AUDIT_DESK_CASES) {
      const p = deskPrompt(c);
      assert.ok(p.includes(c.output), c.id + " does not show the output under audit");
      for (const rec of c.packet.records) {
        assert.ok(p.includes("id=" + rec.id), c.id + " hides " + rec.id + " from the contents page");
        assert.ok(!p.includes(rec.body), c.id + " leaks the body of " + rec.id);
      }
    }
  });
});

describe("the run loop behaves as the measurement assumes", () => {
  const gather = [{ kind: "tool_call", tool: "read_evidence", args: { ids: ["enquiry", "job-rules"] } }];
  const done: any = { kind: "finish", verdict: "pass", criticalDefects: [] };

  test("a complete audit takes two turns on this interface", async () => {
    const r = await runDeskAudit(CASE, async ({ turn }) => (turn === 1 ? gather : [done]), turnsWithSlack());
    assert.equal(r.report?.verdict, "pass");
    assert.equal(r.turnsUsed, 2);
    const d = readingDiscipline(CASE, r.log);
    assert.equal(d.materialComplete, true);
    assert.equal(d.readCalls, 1, "two records took two calls; the batch read is not batching");
  });

  test("REGRESSION: the derived floor is two, and the budget is three", () => {
    // D-30. The previous interface ran at its floor and every case ended on a
    // forced finish. The floor is derived from the tool set, and the slack turn
    // is deliberate rather than generous.
    assert.equal(derivedTurnFloor(), AUDIT_DESK_TOOL_SET.length + 1);
    assert.equal(derivedTurnFloor(), 2);
    assert.equal(turnsWithSlack(), 3);
  });

  test("a verdict reached without opening the material records is visible as such", async () => {
    const r = await runDeskAudit(CASE, async () => [done], 3);
    assert.equal(r.report?.verdict, "pass");
    assert.equal(readingDiscipline(CASE, r.log).materialComplete, false);
  });

  test("a wasted first turn still leaves room to finish", async () => {
    const r = await runDeskAudit(CASE, async ({ turn }) => (
      turn === 1 ? [{ kind: "tool_call", tool: "read_evidence", args: { ids: ["typo"] } }]
        : turn === 2 ? gather : [done]
    ), turnsWithSlack());
    assert.equal(r.report?.verdict, "pass", "one wasted turn consumed the case");
    assert.equal(readingDiscipline(CASE, r.log).materialComplete, true);
  });

  test("actions after finish are not executed", async () => {
    const r = await runDeskAudit(CASE, async () => [done, ...gather], 3);
    assert.equal(r.log.filter((a) => a.kind === "tool_call").length, 0);
  });

  test("a run that never finishes has no verdict and is not defaulted to a pass", async () => {
    const r = await runDeskAudit(CASE, async () => gather, 3);
    assert.equal(r.report, null);
    assert.equal(r.turnsUsed, 3);
  });

  test("reads after the finish do not count toward discipline", () => {
    const log: any = [
      { step: 1, kind: "finish", verdict: "pass" },
      { step: 2, kind: "tool_call", tool: "read_evidence", args: { ids: ["enquiry", "job-rules"] }, ok: true, opened: ["enquiry", "job-rules"] },
    ];
    assert.equal(readingDiscipline(CASE, log).materialComplete, false);
  });
});

describe("the fresh set, audited before it is used", () => {
  test("it is the exact size the Academy requires and no larger", () => {
    const c = deskCoverage();
    assert.equal(c.cases, 18);
    assert.equal(c.sealed, 12);
    assert.equal(c.tool, 6);
  });

  test("BLOCKING: every required competency is exercised", () => {
    const c = deskCoverage();
    const missing = REQUIRED_COMPETENCIES.filter((k) => !c.competencies.includes(k));
    assert.deepEqual(missing, [], "unexercised competencies: " + missing.join(", "));
  });

  test("BLOCKING: the two evidence classes are a real distinction, not a label", () => {
    const c = deskCoverage();
    assert.equal(c.sealedAllMaterial, true, "a sealed case has a distractor, so it is measuring gathering");
    assert.equal(c.toolHasDistractors, true, "a tool case has nothing to choose, so it is not measuring gathering");
  });

  test("BLOCKING: no gate can be decided by a single case", () => {
    const c = deskCoverage();
    assert.ok(c.mustPass >= 2, "one case would decide the false-accusation gate");
    assert.ok(c.underdetermined >= 2, "one case would decide the ambiguity gate");
    assert.ok(c.mustFail >= 4);
  });

  test("BLOCKING: nothing here reappears from any earlier set", () => {
    const prior = [...AUDITOR_TOOL_CASES, ...AUDITOR_LOCK_CASES, ...AUDIT_SEALED_CASES] as any[];
    const priorIds = new Set(prior.map((c) => c.id));
    const priorOutputs = prior.map((c) => String(c.output));
    for (const c of AUDIT_DESK_CASES) {
      assert.ok(!priorIds.has(c.id), c.id + " collides with an earlier set");
      assert.ok(!priorOutputs.includes(c.output), c.id + " reuses an earlier audited output");
    }
  });

  test("BLOCKING: no earlier subject or organisation name is reused", () => {
    const prior = [...AUDITOR_TOOL_CASES, ...AUDITOR_LOCK_CASES, ...AUDIT_SEALED_CASES] as any[];
    const priorText = prior.map((c) => JSON.stringify(c)).join(" ").toLowerCase();
    const names = ["aldworth", "kessler", "brantley", "halberd", "hartlow", "marchbank", "calderwood", "aldermere", "harrow"];
    const used = names.filter((n) => AUDIT_DESK_CASES.some((c) => JSON.stringify(c).toLowerCase().includes(n)));
    for (const n of used) {
      assert.ok(!priorText.includes(n), n + " appears in an earlier set and is reused here");
    }
  });

  test("every gold verdict and class is one the schema can express", () => {
    for (const c of AUDIT_DESK_CASES) {
      assert.ok(AUDIT_VERDICTS.includes(c.gold.verdict as any), c.id + " gold verdict is unreachable");
      if (c.gold.defectClass) assert.ok(DEFECT_CLASSES.includes(c.gold.defectClass as any), c.id + " gold class is unreachable");
      for (const k of c.gold.acceptableDefectClasses) {
        assert.ok(DEFECT_CLASSES.includes(k as any), c.id + " lists an unreachable class: " + k);
      }
      for (const v of c.gold.acceptableVerdicts) {
        assert.ok(AUDIT_VERDICTS.includes(v as any), c.id + " lists an unreachable verdict: " + v);
      }
      assert.ok(c.gold.acceptableVerdicts.includes(c.gold.verdict), c.id + " excludes its own verdict");
      if (c.gold.defectClass) {
        assert.ok(c.gold.acceptableDefectClasses.includes(c.gold.defectClass), c.id + " excludes its own class");
      }
    }
  });

  test("BLOCKING: every material record exists, and is genuinely material", () => {
    for (const c of AUDIT_DESK_CASES) {
      assert.ok(c.materialEvidenceIds.length > 0, c.id + " declares nothing material");
      for (const id of c.materialEvidenceIds) {
        assert.ok(c.packet.records.some((r) => r.id === id), c.id + " needs " + id + ", which is not in the packet");
      }
    }
  });

  test("BLOCKING: no material sentence leaks into the prompt", () => {
    for (const c of AUDIT_DESK_CASES) {
      const p = deskPrompt(c).toLowerCase();
      for (const id of c.materialEvidenceIds) {
        const body = c.packet.records.find((r) => r.id === id)!.body;
        for (const s of body.split(". ").filter((x) => x.length > 30)) {
          assert.ok(!p.includes(s.toLowerCase()), c.id + " leaks a material sentence for " + id);
        }
      }
    }
  });

  test("every case carries its full gold provenance", () => {
    for (const c of AUDIT_DESK_CASES) {
      assert.ok(c.goldAuthor.length > 10, c.id + " has no gold author");
      assert.ok(c.goldRationale.length > 60, c.id + " has no rationale");
      assert.ok(c.falsifier.length > 30, c.id + " states nothing that would change the gold");
      assert.match(c.falsifier, /^If /, c.id + " falsifier is not stated as a condition");
    }
  });

  test("the underdetermined cases are about auditability, not about the business fact", () => {
    // D-29, made structural. Both prior underdetermined cases were wrong because
    // they asked whether the subject matter was knowable. These must say, in the
    // packet itself, that nothing establishes whether the output is sound.
    const u = AUDIT_DESK_CASES.filter((c) => c.gold.verdict === "insufficient_evidence");
    assert.equal(u.length, 2);
    for (const c of u) {
      assert.match(c.goldRationale, /whether THE OUTPUT is sound|auditability of the output|cannot show the output is sound/,
        c.id + " justifies its verdict from the business fact rather than from the audit");
      const packetText = c.packet.records.map((r) => r.body).join(" ");
      assert.match(packetText, /Nothing (here )?indicates|nothing (else )?establishes|no correspondence|nothing establishes/i,
        c.id + " does not state in the packet that the point cannot be settled");
    }
  });
});

describe("the final target", () => {
  test("it declares the desk and nothing it does not have", () => {
    const t = finalAuditorTarget();
    assert.deepEqual(t.tools, ["read_evidence"]);
    assert.equal(t.policyVersionId, "auditor-doctrine-v1");
    assert.equal(t.workerVersionId, "au-v1");
    assert.equal(t.baseModel, "gpt-4.1");
    assert.equal(t.retrievalConfigId, "none");
  });

  test("REGRESSION: it is pinned, so the campaign cannot silently run against another configuration", () => {
    assert.equal(targetId(finalAuditorTarget()), "CT-677749cd2035");
    assert.equal(finalAuditorTarget().executionEnvironmentId, "EE-ab6da07f1924");
  });

  test("it is a different target from the superseded read-only one", () => {
    assert.notEqual(targetId(finalAuditorTarget()), targetId(readOnlyToolTarget()));
  });

  test("REGRESSION: changing any material runtime component moves the identity", () => {
    const base = finalAuditorTarget();
    const variants: Array<[string, any]> = [
      ["a second tool", { ...base, tools: [...base.tools, "search"] }],
      ["a different protocol", { ...base, executionEnvironmentId: "EE-different" }],
      ["a different policy", { ...base, policyVersionId: "auditor-doctrine-v2" }],
      ["a different model", { ...base, baseModel: "gpt-5.5" }],
      ["a different worker", { ...base, workerVersionId: "au-v2" }],
    ];
    for (const [what, v] of variants) {
      assert.notEqual(targetId(v), targetId(base), what + " did not move the target id");
    }
  });

  test("the environment names the desk, not an ambient default", () => {
    assert.equal(AUDIT_DESK_ENVIRONMENT.protocolVersion, AUDIT_DESK_PROTOCOL_ID);
    assert.equal(AUDIT_DESK_ENVIRONMENT.inventoryContractVersion, "evidence-packet-v1-indexed-batch-read");
  });
});
