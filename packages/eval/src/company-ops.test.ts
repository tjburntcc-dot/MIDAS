/**
 * Guards for the company operating system.
 *
 * These pin the properties that make the difference between an operating company
 * and a populated table: that a state change cannot happen without provenance,
 * that work types do not share one sales-shaped lifecycle, that the capability
 * analysis is company-shaped rather than a template, that ranking never deletes,
 * and that reading the approval queue cannot advance work.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, repoPath } from "@midas/db";
import {
  WORK_TYPES, WORK_STATES, TRANSITIONS, newWorkItem, transition, allowedNext,
  workItemFingerprint, upsertDiscovered, listWorkItems, putWorkItem,
  expectedValueScore, rankWorkItems, workItemSummary,
} from "./work-item.ts";
import { requiredCapabilities, assessCompany, VALUE_CHAINS } from "./capability-needs.ts";
import { buildApprovalQueue, companySummary } from "./approval-queue.ts";

function tmpStore() { return new FileStore(mkdtempSync(join(tmpdir(), "midas-ops-"))); }
function seedItem(over = {}) {
  return { ...newWorkItem({ workspaceId: "ws-t", type: "commercial_opportunity", title: "t" }), ...over };
}

describe("work is general, not lead-shaped", () => {
  test("more than one work class exists and they are not all commercial", () => {
    assert.ok(WORK_TYPES.length >= 10);
    for (const t of ["engineering", "fulfilment", "finance", "support", "experiment", "management", "research"]) {
      assert.ok(WORK_TYPES.includes(t), "missing work type " + t);
    }
  });

  test("sales states are not forced onto engineering work", () => {
    // The moment an engineering task can be `quoted`, the abstraction has become
    // a CRM wearing a general name.
    const eng = TRANSITIONS.engineering;
    const reachable = new Set(Object.keys(eng).concat(Object.values(eng).flat()));
    for (const s of ["quoted", "payment_ready", "paid", "replied", "scoping"]) {
      assert.equal(reachable.has(s), false, "engineering should not reach the sales state " + s);
    }
    const comm = TRANSITIONS.commercial_opportunity;
    const commReachable = new Set(Object.keys(comm).concat(Object.values(comm).flat()));
    for (const s of ["quoted", "payment_ready", "paid"]) assert.ok(commReachable.has(s));
  });

  test("the downstream cash path exists so the system does not dead-end at outreach", () => {
    const comm = TRANSITIONS.commercial_opportunity;
    const chain = [["executed", "waiting_external"], ["waiting_external", "replied"], ["replied", "scoping"],
      ["scoping", "quoted"], ["quoted", "payment_ready"], ["payment_ready", "paid"], ["paid", "fulfilling"],
      ["fulfilling", "delivered"], ["delivered", "won"]];
    for (const [from, to] of chain) assert.ok((comm[from] || []).includes(to), from + " -> " + to + " must exist");
  });
});

describe("a state change cannot happen without provenance", () => {
  test("a transition without an actor or a reason is refused", () => {
    const item = seedItem();
    assert.throws(() => transition(item, { to: "qualifying", by: "", reason: "x" }), /actor and a reason/);
    assert.throws(() => transition(item, { to: "qualifying", by: "worker", reason: "  " }), /actor and a reason/);
  });

  test("an illegal transition is refused rather than silently accepted", () => {
    const item = seedItem();
    assert.throws(() => transition(item, { to: "paid", by: "worker", reason: "skip ahead" }), /illegal transition/);
    assert.deepEqual(allowedNext(item).sort(), ["blocked", "declined", "expired", "qualifying", "under_research"]);
  });

  test("history records who moved it, on what evidence, and what it cost", () => {
    const item = seedItem();
    const moved = transition(item, {
      to: "qualifying", by: "worker", reason: "started",
      workerRoleId: "opportunity_qualifier", workerVersionId: "oq-v2",
      evidenceRefs: ["E1"], costUsd: 0.01, modelCalls: 1, model: "gpt-4.1",
    });
    const last = moved.history[moved.history.length - 1];
    assert.equal(last.workerRoleId, "opportunity_qualifier");
    assert.equal(last.workerVersionId, "oq-v2");
    assert.deepEqual(last.evidenceRefs, ["E1"]);
    assert.equal(last.model, "gpt-4.1");
    assert.equal(moved.cost.usd, 0.01);
    assert.equal(moved.cost.modelCalls, 1);
    // qualified must never be able to mean "some agent once said yes"
    assert.ok(last.reason.length > 0 && last.by.length > 0);
  });

  test("cost accumulates across the chain rather than being overwritten", () => {
    let item = seedItem();
    item = transition(item, { to: "qualifying", by: "w", reason: "r", costUsd: 0.01, modelCalls: 1 });
    item = transition(item, { to: "qualified", by: "w", reason: "r", costUsd: 0.02, modelCalls: 1 });
    assert.equal(Number(item.cost.usd.toFixed(4)), 0.03);
    assert.equal(item.cost.modelCalls, 2);
  });
});

describe("scale is storage, never semantics", () => {
  test("deduplication is by fingerprint and retains everything new", () => {
    const store = tmpStore();
    const mk = (url, title) => ({
      ...newWorkItem({ workspaceId: "ws-t", type: "commercial_opportunity", title, source: { kind: "web_search", url } }),
      fingerprint: workItemFingerprint({ workspaceId: "ws-t", type: "commercial_opportunity", url, title }),
    });
    const a = upsertDiscovered(store, [mk("https://x.test/1", "one"), mk("https://x.test/2", "two")]);
    assert.equal(a.inserted.length, 2);
    // Trailing slash and query differences are the same posting.
    const b = upsertDiscovered(store, [mk("https://x.test/1/", "one"), mk("https://x.test/3", "three")]);
    assert.equal(b.inserted.length, 1);
    assert.equal(b.duplicates.length, 1);
    assert.equal(listWorkItems(store, "ws-t").length, 3);
  });

  test("ranking orders without deleting", () => {
    const items = Array.from({ length: 250 }, (_, i) => seedItem({
      id: "WI-" + i,
      economics: { expectedValueUsd: 100 + i, closeProbabilityPct: 40, paymentProbabilityPct: 90, aiFulfilmentPct: 70, humanMinutes: 120 },
    }));
    const ranked = rankWorkItems(items);
    assert.equal(ranked.length, items.length, "ranking must not drop a single viable item");
    for (let i = 1; i < ranked.length; i += 1) assert.ok(ranked[i - 1].ev.score >= ranked[i].ev.score);
  });

  test("a fast cheap job can outrank a large slow speculative one", () => {
    // Nominal price is not the objective; expected cash per founder hour is.
    const small = seedItem({ id: "small", economics: { expectedValueUsd: 400, closeProbabilityPct: 80, paymentProbabilityPct: 95, aiFulfilmentPct: 90, humanMinutes: 30, daysToCash: 3 } });
    const big = seedItem({ id: "big", economics: { expectedValueUsd: 40000, closeProbabilityPct: 3, paymentProbabilityPct: 60, aiFulfilmentPct: 30, humanMinutes: 3000, daysToCash: 120 } });
    const ranked = rankWorkItems([big, small]);
    assert.equal(ranked[0].item.id, "small");
  });

  test("missing economics make an item uncertain rather than optimistic", () => {
    const known = seedItem({ economics: { expectedValueUsd: 1000, closeProbabilityPct: 60, paymentProbabilityPct: 95, aiFulfilmentPct: 80, humanMinutes: 60 } });
    const unknown = seedItem({ economics: { expectedValueUsd: 1000 } });
    assert.ok(expectedValueScore(known).score > expectedValueScore(unknown).score);
    assert.ok(expectedValueScore(unknown).inputsMissing.length >= 3);
  });
});

describe("capability analysis is company-shaped, not a template", () => {
  test("unrelated business models require substantially different capabilities", () => {
    const sets = ["services", "saas", "local_physical_service", "ecommerce"]
      .map((m) => new Set(requiredCapabilities(m).map((c) => c.id)));
    for (let i = 0; i < sets.length; i += 1) {
      for (let j = i + 1; j < sets.length; j += 1) {
        const inter = [...sets[i]].filter((x) => sets[j].has(x)).length;
        const union = new Set([...sets[i], ...sets[j]]).size;
        assert.ok(inter / union < 0.34, "business models " + i + " and " + j + " overlap too much: the analysis is emitting a template");
      }
    }
  });

  test("a physical service names a capability software cannot satisfy", () => {
    const local = requiredCapabilities("local_physical_service");
    const onsite = local.find((c) => c.id === "cap.on_site_delivery");
    assert.ok(onsite, "a mobile service must require physical presence");
    assert.match(onsite.alternatives.external || "", /no AI substitute/i);
  });

  test("every capability states its economic outcome and what happens if absent", () => {
    for (const model of Object.keys(VALUE_CHAINS)) {
      for (const c of requiredCapabilities(model)) {
        assert.ok(c.economicOutcome && c.economicOutcome.length > 12, c.id + " needs an economic outcome");
        assert.ok(c.ifAbsent && c.ifAbsent.length > 12, c.id + " needs a consequence");
        assert.ok(c.inputs.length && c.outputs.length, c.id + " needs inputs and outputs");
      }
    }
  });

  test("the bottleneck is derived from work actually stuck, not asserted", () => {
    const store = tmpStore();
    const ws = { id: "ws-t", name: "T", goal: "g" };
    const stuck = seedItem({ state: "qualifying", economics: { expectedValueUsd: 5000, closeProbabilityPct: 50, paymentProbabilityPct: 90, aiFulfilmentPct: 60, humanMinutes: 120 } });
    const idle = assessCompany({ workspace: ws, businessModel: "services", objective: "g", workItems: [], workers: [], evScore: expectedValueScore });
    assert.equal(idle.bottleneck, null, "with no work stuck there is no active bottleneck");
    assert.ok(idle.latentGaps.length > 0, "gaps still exist even when nothing is blocked");

    const active = assessCompany({ workspace: ws, businessModel: "services", objective: "g", workItems: [stuck], workers: [], evScore: expectedValueScore });
    assert.ok(active.bottleneck, "work stuck in qualifying must surface a bottleneck");
    assert.ok(active.bottleneck.blockedItems > 0);
    assert.ok(active.bottleneck.blockedExpectedCashUsd > 0);
    assert.ok(active.bottleneck.alternatives, "a gap must name the cheaper alternatives to rule out before building a worker");
  });

  test("only a production-eligible worker counts as coverage", () => {
    const ws = { id: "ws-t", name: "T", goal: "g" };
    const dev = assessCompany({
      workspace: ws, businessModel: "services", objective: "g", workItems: [],
      workers: [{ roleId: "r", versionId: "v", capabilities: ["cap.qualification"], productionStatus: "development_verified" }],
      evScore: expectedValueScore,
    });
    assert.ok(dev.partial.includes("cap.qualification"));
    assert.equal(dev.covered.includes("cap.qualification"), false, "unverified coverage is not coverage");
  });
});

describe("the approval queue is a decision surface, not a send button", () => {
  function seedAwaiting(store) {
    let item = newWorkItem({ workspaceId: "ws-q", type: "commercial_opportunity", title: "Real posting", source: { kind: "web_search", url: "https://x.test/rfp" } });
    item.economics = { expectedValueUsd: 4000, closeProbabilityPct: 50, paymentProbabilityPct: 90, aiFulfilmentPct: 70, humanMinutes: 120 };
    item = transition(item, { to: "qualifying", by: "worker", reason: "start", workerRoleId: "opportunity_qualifier", workerVersionId: "oq-v2" });
    item = transition(item, { to: "qualified", by: "worker", reason: "in scope", workerRoleId: "opportunity_qualifier", workerVersionId: "oq-v2", output: { decision: "pursue", rationale: "budget stated", disqualifiers: [] } });
    item = transition(item, { to: "ready_for_work", by: "worker", reason: "ranked" });
    item = transition(item, { to: "working", by: "worker", reason: "drafted", workerRoleId: "commercial_drafter", workerVersionId: "cd-v0", output: { channel: "email", subject: "s", message: "m", scope_offered: "so", price_basis: "pb", next_action: "na", claims_made: ["c"], assumptions: [] } });
    item = transition(item, { to: "awaiting_approval", by: "worker", reason: "audit passed", workerRoleId: "commercial_auditor", workerVersionId: "au-v0", output: { verdict: "pass", unsupported_claims: [], fabrications: [], compliance_issues: [], reasons: "checked" }, auditStatus: "passed", externalActionStatus: "pending_owner_approval" });
    putWorkItem(store, item);
    return item;
  }

  test("an entry carries what a fast decision needs, including how it got there", () => {
    const store = tmpStore();
    seedAwaiting(store);
    const [e] = buildApprovalQueue(store, "ws-q");
    assert.ok(e.sourceUrl && e.whatTheyNeed && e.proposedAction.message);
    assert.equal(e.audit.verdict, "pass");
    assert.ok(e.expectedCashUsd > 0 && e.founderHours > 0);
    assert.ok(e.provenance.length >= 5, "the queue must show the chain that produced the action");
    assert.ok(e.provenance.every((p) => p.by && p.reason !== undefined));
    assert.ok(e.claimsMade.length >= 1, "claims must be listed so they can be checked");
  });

  test("reading the queue does not advance any work", () => {
    const store = tmpStore();
    const before = seedAwaiting(store);
    buildApprovalQueue(store, "ws-q");
    buildApprovalQueue(store, "ws-q");
    const after = listWorkItems(store, "ws-q")[0];
    assert.equal(after.state, before.state);
    assert.equal(after.history.length, before.history.length);
    assert.equal(after.externalActionStatus, "pending_owner_approval");
  });

  test("awaiting_approval cannot become executed without passing through approved", () => {
    const store = tmpStore();
    const item = seedAwaiting(store);
    assert.throws(() => transition(item, { to: "executed", by: "worker", reason: "send it" }), /illegal transition/);
    assert.deepEqual(allowedNext(item).sort(), ["approved", "blocked", "declined"]);
  });

  test("revenue is only counted when cash was actually received", () => {
    const store = tmpStore();
    seedAwaiting(store);
    const s = companySummary(store, "ws-q");
    assert.equal(s.verifiedRevenueUsd, 0, "nothing was sent, so nothing can be revenue");
    assert.equal(s.outboundActionsTaken, 0);
    assert.ok(s.expectedCashInPipelineUsd > 0, "expected pipeline cash is a forecast and is reported separately");
  });
});

describe("Company 0 uses the general abstraction", () => {
  test("no bespoke company type was introduced", () => {
    const src = readFileSync(repoPath("tools", "company-setup.mjs"), "utf8");
    assert.match(src, /putWorkspace/);
    for (const bad of ["class Company", "HemmerCompany", "BusinessWorkspaceV2", "NewCompany"]) {
      assert.equal(src.includes(bad), false, "a bespoke company abstraction appeared: " + bad);
    }
  });

  test("the chain has no transport, so it cannot send", () => {
    const src = readFileSync(repoPath("tools", "company-chain.mjs"), "utf8");
    assert.equal(/nodemailer|smtp|sendMail|twilio|sendgrid/i.test(src), false, "no outbound transport may exist in the chain");
    assert.match(src, /awaiting_approval/);
  });
});
