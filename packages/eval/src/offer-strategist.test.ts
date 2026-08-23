import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runOfferStrategist, OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";

const GOLD = JSON.parse(readFileSync(join(import.meta.dirname, "../fixtures/offer-strategist-dev-gold.json"), "utf8"));

function approvedFinding(workspaceId) {
  return {
    id: "FND-DEV-OS",
    workspaceId: workspaceId,
    reviewStatus: "approved",
    approvalEligible: true,
    kind: "inference",
    claim: "US roofing contractors produce estimates from takeoffs of roof area, pitch, and materials.",
  };
}

function fakeStore(finding) {
  return {
    getScoutFinding: (id) => (finding && finding.id === id ? finding : null),
    listEmployeeRoles: () => [],
  };
}

describe("offer strategist development benchmark (not sealed)", () => {
  test("gold is isolated from the runtime module", () => {
    const runtime = readFileSync(join(import.meta.dirname, "offer-strategist.ts"), "utf8");
    assert.equal(runtime.includes("offer-strategist-dev-gold"), false);
    assert.equal(GOLD.sealedEval, false);
    assert.equal(GOLD.cases.length, 10);
  });

  for (const c of GOLD.cases) {
    test(c.id + " " + c.expect, () => {
      const ws = "ws-dev-os";
      const finding = approvedFinding(ws);
      const input = {
        workspaceId: c.otherWorkspace ? "ws-other" : ws,
        targetWorkspaceId: c.otherWorkspace ? "ws-other" : undefined,
        development: true,
        task: c.task,
        approvedFindingIds: ["FND-DEV-OS"],
        findings: [c.otherWorkspace ? { ...finding, workspaceId: "ws-dev-os" } : finding],
        spendUsd: c.spendUsd || 0,
        spendLimitUsd: 0.5,
      };
      const store = fakeStore(c.otherWorkspace ? { ...finding, workspaceId: "ws-dev-os" } : finding);
      const out = runOfferStrategist(store, input);
      assert.equal(out.status, c.expect);
      assert.equal(out.labels.sealedEval, false);
      if (c.expect === "hypothesis") {
        assert.ok(out.hypotheses.length >= 1);
        assert.equal(out.hypotheses[0].kind, "hypothesis");
        assert.equal(out.hypotheses[0].notFact, true);
        assert.equal(out.hypotheses[0].inventedMarketStat, false);
      } else {
        assert.equal(out.refusals[0].code, c.code);
        assert.equal(out.hypotheses.length, 0);
      }
    });
  }

  test("role id is offer_strategist and not auto-trusted", () => {
    assert.equal(OFFER_STRATEGIST_ROLE_ID, "offer_strategist");
  });
});
