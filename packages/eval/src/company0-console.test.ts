/**
 * The decision console, held to the one promise that matters: it is a control
 * surface over real capability, and it displays nothing it did not get from a
 * worker, a stored record, or arithmetic on two dates.
 *
 * The tests that earn their place here are the negative ones. That the chain
 * the console starts is the same chain the command line starts, byte for byte
 * on identical inputs. That a preserved result is preserved rather than
 * recomputed. That an auditor's objection cannot quietly delete the
 * recommendation it objected to. That no owner control, anywhere, authorises
 * anything external.
 *
 * Nothing here calls a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import {
  companyView, listOpportunities, opportunityDetail, opportunityPacketFor,
  submissionDate, objectiveFit, statedBudget, resultView, runSummary, loadRuns, runsFor, attentionList,
  OWNER_DISPOSITIONS, OUTCOME_STATES, FORBIDDEN_CONSOLE_FIELDS, OBJECTIVE_DATE, CONSOLE_VERSION,
} from "./company0-console.ts";
import { runShadowChain, SHADOW_STAGES, shadowTargets, shadowInstructions } from "./company0-shadow-chain.ts";
import { houstonPacket, opportunityPacketText, companyPacketText, DECISION_QUESTION } from "./company0-shadow.ts";

const repoFile = (rel: string) => new URL("../../../" + rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const load = (f: string) => (existsSync(repoFile(f)) ? JSON.parse(readFileSync(repoFile(f), "utf8")) : null);
const raw = load("var/state/company0-shadow-raw.json");
const runs = loadRuns();
const historical = runs.find((r) => r.runId === "RUN-C0-SHADOW-01") || null;
const consoleHtml = existsSync(repoFile("apps/api/src/company0-console.html"))
  ? readFileSync(repoFile("apps/api/src/company0-console.html"), "utf8") : null;
const consoleApp = existsSync(repoFile("apps/api/src/console-app.js"))
  ? readFileSync(repoFile("apps/api/src/console-app.js"), "utf8") : null;
const consoleCss = existsSync(repoFile("apps/api/src/company0-console.css"))
  ? readFileSync(repoFile("apps/api/src/company0-console.css"), "utf8") : null;
const villageCss = existsSync(repoFile("apps/api/src/village.css"))
  ? readFileSync(repoFile("apps/api/src/village.css"), "utf8") : null;
const serverSrc = existsSync(repoFile("apps/api/src/http-server.ts"))
  ? readFileSync(repoFile("apps/api/src/http-server.ts"), "utf8") : null;

describe("Company 0 renders as it is, not as it would look better", () => {
  const view = companyView();

  test("every row says how it is known", () => {
    assert.ok(view.rows.length >= 15);
    for (const r of view.rows) {
      assert.ok(r.label && r.value, JSON.stringify(r));
      assert.ok(["owner_reported", "midas_verified_primary_source", "midas_reported_unverified", "unknown"].includes(r.knownAs), r.label + " -> " + r.knownAs);
      assert.ok(String(r.source).length > 3, r.label + " names no source");
    }
  });

  test("REGRESSION: unknowns are shown as unknown and not buried", () => {
    const entity = view.rows.find((r) => r.label === "Legal entity")!;
    assert.equal(entity.knownAs, "unknown");
    assert.match(entity.value, /UNKNOWN/);
    const adult = view.rows.find((r) => r.label === "Adult involvement")!;
    assert.equal(adult.knownAs, "unknown");
    assert.ok(view.unknowns.length >= 5, "the open unknowns list emptied");
    assert.ok(view.unknownCount >= 7);
  });

  test("REGRESSION: payment capability is not displayed as legal readiness", () => {
    const pay = view.rows.find((r) => r.label === "Payment readiness")!;
    assert.match(String(pay.note), /does not establish LLC readiness/i);
  });

  test("REGRESSION: an outreach sample with no replies carries its own warning", () => {
    const out = view.rows.find((r) => r.label === "Outreach so far")!;
    assert.match(String(out.note), /too small to support any conclusion/i);
  });

  test("the objective and its date are the real ones", () => {
    assert.equal(OBJECTIVE_DATE, "2026-10-01");
    assert.match(view.objective, /\$1,000/);
    assert.equal(CONSOLE_VERSION, "company0-console-v0");
  });
});

describe("opportunities are real records, shown without invention", () => {
  const rows = listOpportunities();

  test("every row comes from a stored work item", () => {
    assert.ok(rows.length >= 10, "the opportunity store emptied");
    for (const r of rows) {
      assert.match(r.id, /^WI-/);
      assert.ok(r.title.length > 3, r.id);
      assert.ok(r.evidenceCount >= 1, r.id + " has no evidence");
    }
  });

  test("REGRESSION: no scored, ranked or predicted field is exposed", () => {
    const json = JSON.stringify(rows) + JSON.stringify(companyView()) + JSON.stringify(opportunityDetail(rows[0].id));
    for (const f of FORBIDDEN_CONSOLE_FIELDS) {
      assert.ok(!json.includes('"' + f + '"'), "the console exposed " + f);
    }
    assert.ok(!/"score"|"rank"|"rating"/.test(json), "a score reached the console");
  });

  test("a closing date is parsed only from the clause that states a closing", () => {
    const houston = submissionDate(houstonPacket().evidence);
    assert.equal(houston.date, "2026-12-18", "the posting date was taken for the closing date");
    assert.match(String(houston.statedAs), /December 18/);
    assert.equal(houston.evidenceId, "E2");
  });

  test("REGRESSION: a date the console cannot check is not asserted", () => {
    const none = submissionDate([{ id: "X", text: "No dates here at all.", source: "posting", capturedAt: "2026-01-01" }]);
    assert.equal(none.date, null);
    assert.equal(objectiveFit([{ id: "X", text: "Nothing.", source: "p", capturedAt: "2026-01-01" }]).fit, "UNKNOWN");
  });

  test("the objective comparison is arithmetic, and says what it does not know", () => {
    const after = objectiveFit(houstonPacket().evidence);
    assert.equal(after.fit, "SUBMISSION_CLOSES_AFTER_OBJECTIVE_DATE");
    assert.match(after.why, /Nothing submitted here can be awarded or paid before the objective/i);

    const open = objectiveFit([{ id: "E2", text: "Deadline or posting date as stated: Proposals due by September 15, 2026.", source: "posting", capturedAt: "2026-08-01" }]);
    assert.equal(open.fit, "SUBMISSION_OPEN_BEFORE_OBJECTIVE_DATE");
    assert.match(open.why, /When an award would be made, and when it would pay, is UNKNOWN/,
      "an open submission window was allowed to read as revenue");

    const closed = objectiveFit([{ id: "E2", text: "Deadline: Closes August 18, 2026.", source: "posting", capturedAt: "2026-08-01" }]);
    assert.equal(closed.fit, "CLOSED_BEFORE_TODAY");
  });

  test("REGRESSION: a stated absence of budget is not displayed as known economics", () => {
    const absent = statedBudget([{ id: "E3", text: "Budget as stated: Not stated in summary.", source: "posting", capturedAt: "2026-08-01" }]);
    assert.equal(absent.statedAs, null, "a line saying the budget is unstated was shown as a budget");
    assert.match(String(absent.absenceStatedAs), /Not stated/);

    const real = statedBudget([{ id: "E3", text: "Budget: not to exceed $15,000 combination of Cash/Trade", source: "posting", capturedAt: "2026-08-01" }]);
    assert.equal(real.statedAs, "Budget: not to exceed $15,000 combination of Cash/Trade");
    assert.equal(real.absenceStatedAs, null);
  });

  test("the detail carries evidence, contradictions and unknowns rather than a summary", () => {
    const d = opportunityDetail("WI-9d7f9d70")!;
    assert.ok(d.packet.evidence.length >= 6);
    assert.equal(d.contradictions.length, 1, "the recorded qualifier disagreement stopped being surfaced");
    assert.match(d.contradictions[0], /model estimates/);
    assert.ok(d.unknowns.length >= 2);
    assert.ok(d.history.length >= 1, "the preserved run is not reachable from its opportunity");
  });

  test("an unknown opportunity is refused rather than improvised", () => {
    assert.equal(opportunityPacketFor("WI-does-not-exist"), null);
    assert.equal(opportunityDetail("WI-does-not-exist"), null);
  });
});

describe("the console runs the real chain, not a copy of it", () => {
  test("REGRESSION: the chain reproduces the historical run byte for byte", { skip: !raw }, async () => {
    // The only defence against a console that slowly drifts from the command
    // line is that there is one implementation and this proves it.
    const replies = [
      raw.stages.researcher.modelResponse,
      raw.stages.manager.modelResponse,
      ...raw.stages.auditor.trace.map((t: any) => t.modelResponse),
    ];
    let i = 0;
    const seen: string[] = [];
    const out = await runShadowChain({
      opportunity: houstonPacket(),
      call: async ({ input }) => { seen.push(input); return { text: replies[i++], usage: {} }; },
    });
    assert.equal(seen[0], raw.stages.researcher.input, "the researcher prompt moved");
    assert.equal(seen[1], raw.stages.manager.input, "the manager prompt moved");
    assert.equal(seen[2], raw.stages.auditor.trace[0].input, "the audit desk prompt moved");
    assert.deepEqual(out.instructionHashes, raw.instructionHashes);
    assert.deepEqual(out.targets, raw.targets);
    assert.equal(out.stages.manager.parsed.selectedAction, "research");
    assert.equal(out.stages.auditor.report.verdict, "pass");
  });

  test("the chain is pointed at the same worker configurations the campaigns certified", () => {
    const t = shadowTargets();
    assert.equal(t.manager.shadow, "CT-767e9f1e6f89");
    assert.equal(t.auditor.shadow, "CT-677749cd2035");
    assert.equal(t.researcher.certified, "CT-44e7595af4a1");
    assert.notEqual(t.researcher.shadow, t.researcher.certified);
    assert.match(t.researcher.truthful, /produces no certification evidence/,
      "the researcher's environment difference stopped being stated");
  });

  test("REGRESSION: stage names are stages, and none of them is a percentage", () => {
    assert.deepEqual([...SHADOW_STAGES], ["PREPARING", "RESEARCHING", "DECIDING", "AUDITING", "COMPLETE", "FAILED"]);
    assert.ok(consoleApp, "the console app is missing");
    const app = String(consoleApp);
    assert.ok(!/<progress/i.test(app), "a progress element appeared");
    assert.ok(!/\d+\s*%\s*(complete|done)/i.test(app), "a completion percentage appeared");
    assert.ok(!/\*\s*100\s*\)/.test(app), "something computed a percentage");
    assert.match(app, /No progress percentage is shown/,
      "the console stopped saying why it shows no progress bar");
  });

  test("the manager is told the constraints that actually apply", () => {
    const inst = shadowInstructions();
    assert.match(inst.manager, /You recommend; you do not execute|recommend/i);
    assert.ok(inst.hashes.manager.length === 16);
  });
});

describe("the result is arranged for a decision, not for a dashboard", () => {
  test("recommendation, bottleneck, audit and falsifier all come from the worker", { skip: !historical }, () => {
    const v = resultView(historical);
    assert.equal(v.recommendedAction, historical.stages.manager.parsed.selectedAction);
    assert.equal(v.bindingBottleneck, historical.stages.manager.parsed.bindingBottleneck);
    assert.equal(v.falsifier, historical.stages.manager.parsed.falsifier);
    assert.equal(v.audit.verdict, historical.stages.auditor.report.verdict);
    assert.equal(v.finalStatus, "CLEARED_BY_AUDIT");
    assert.ok(v.keyEvidence.length >= 1);
    assert.ok(v.materialUnknowns.length >= 1);
  });

  test("REGRESSION: an absent field says UNKNOWN rather than being filled in", () => {
    const empty = resultView({ stages: { manager: { parsed: {} }, auditor: { report: null }, researcher: { parsed: {} } } });
    assert.equal(empty.recommendedAction, "UNKNOWN");
    assert.equal(empty.capitalAtRisk, "UNKNOWN");
    assert.equal(empty.authorityRequired, "UNKNOWN");
    assert.equal(empty.falsifier, "UNKNOWN");
    assert.equal(empty.audit.verdict, "UNKNOWN");
    assert.equal(empty.finalStatus, "AUDIT_UNDETERMINED");
  });

  test("REGRESSION: an objection does not delete the recommendation it objects to", () => {
    const objected = resultView({
      stages: {
        manager: { parsed: { selectedAction: "execute_bounded_action", whyThisWinsNow: "because" } },
        auditor: { report: { verdict: "fail", criticalDefects: [{ defectClass: "fabrication", claim: "a figure", why: "not in evidence" }] } },
        researcher: { parsed: {} },
      },
    });
    assert.equal(objected.recommendedAction, "execute_bounded_action", "the recommendation vanished when the audit failed");
    assert.equal(objected.finalStatus, "NOT_CLEARED");
    assert.equal(objected.audit.objected, true);
    assert.equal(objected.audit.defects.length, 1);
    assert.match(String(consoleApp), /Manager recommends/,
      "the disagreement view does not show what the manager recommended");
    assert.match(String(consoleApp), /Not cleared/);
    assert.match(String(consoleApp), /An objection does not delete it/,
      "the disagreement view stopped saying the recommendation survives an objection");
  });

  test("REGRESSION: an undetermined audit is shown as unresolved, not as a pass", () => {
    const undet = resultView({
      stages: {
        manager: { parsed: { selectedAction: "defer" } },
        auditor: { report: { verdict: "insufficient_evidence", criticalDefects: [] } },
        researcher: { parsed: {} },
      },
    });
    assert.equal(undet.finalStatus, "AUDIT_UNDETERMINED");
    assert.equal(undet.audit.cleared, false);
    assert.equal(undet.audit.undetermined, true);
  });
});

describe("owner control stops where it should", () => {
  test("REGRESSION: no disposition authorises anything external", () => {
    assert.deepEqual([...OWNER_DISPOSITIONS], ["NONE", "ACKNOWLEDGED", "MARKED_FOR_ACTION", "APPROVED_FOR_PREPARATION"]);
    for (const d of OWNER_DISPOSITIONS) {
      assert.ok(!/send|submit|apply|pay|purchase|contact|sign/i.test(d), "an outbound disposition appeared: " + d);
    }
  });

  test("REGRESSION: the console offers no route that could act outside", () => {
    assert.ok(serverSrc, "the server source is missing");
    const consoleBlock = String(serverSrc).split("// ---------------------------------------------------------------- console")[1] || "";
    const routes = consoleBlock.split('if (method === "GET" && (path === "/diagnostics"')[0];
    for (const bad of ["sendMail", "nodemailer", "smtp", "twilio", "fetch(", "outreach", "submitApplication"]) {
      assert.ok(!routes.includes(bad), "a console route contains " + bad);
    }
    assert.ok(!/externalActionAuthorised:\s*true/.test(String(serverSrc)), "something authorised an external action");
  });

  test("every recorded disposition states that nothing external was authorised", { skip: !runs.length }, () => {
    for (const r of runs) {
      if (!r.owner) continue;
      assert.equal(r.owner.externalActionAuthorised, false, r.runId);
    }
    for (const r of runs) assert.equal(r.outboundActionsTaken, 0, r.runId);
  });
});

describe("outcomes are durable and history is history", () => {
  test("the outcome vocabulary is the owner's, and revenue is a real number or nothing", () => {
    assert.deepEqual([...OUTCOME_STATES],
      ["NOT_STARTED", "STARTED", "COMPLETED", "NO_RESPONSE", "RESPONSE", "REJECTED", "MEETING", "SALE", "OTHER"]);
  });

  test("a recorded outcome survives in the store", { skip: !runs.length }, () => {
    const withOutcome = runs.filter((r) => r.outcome);
    for (const r of withOutcome) {
      assert.ok((OUTCOME_STATES as readonly string[]).includes(r.outcome.state), r.runId);
      assert.ok(r.outcome.recordedAt, r.runId + " has an outcome with no timestamp");
      assert.equal(r.outcome.recordedBy, "owner");
      const rev = r.outcome.verifiedRevenueUsd;
      assert.ok(rev === null || (typeof rev === "number" && rev >= 0), r.runId + " has an unreal revenue figure");
    }
  });

  test("REGRESSION: the preserved first Shadow is preserved, not recomputed", { skip: !historical || !raw }, () => {
    assert.equal(historical.historical, true);
    assert.match(String(historical.note), /not recomputed/i);
    assert.equal(historical.startedAt, raw.at, "the preserved run acquired a new timestamp");
    assert.deepEqual(historical.stages.manager.parsed, raw.stages.manager.parsed);
    assert.deepEqual(historical.stages.auditor.report, raw.stages.auditor.report);
    assert.equal(historical.inputs.opportunity, opportunityPacketText());
    assert.equal(historical.inputs.company, companyPacketText());
    assert.equal(historical.inputs.question, DECISION_QUESTION);
  });

  test("what MIDAS already knows about that run travels with it", { skip: !historical }, () => {
    assert.ok(historical.analysis, "the handoff analysis was dropped");
    assert.equal(historical.analysis.datesReconciled, false);
    assert.ok(historical.analysis.observed.includes("MANAGER_UNDER_COMMITMENT"));
    assert.deepEqual(historical.analysis.inventedFigures, []);
  });

  test("history is listed newest first and each entry names its input", { skip: !runs.length }, () => {
    const h = runsFor("WI-9d7f9d70").map(runSummary);
    assert.ok(h.length >= 1);
    for (const r of h) {
      assert.match(String(r.inputFingerprint), /^[0-9a-f]{12}$/);
      assert.ok(r.startedAt, r.runId + " has no timestamp");
    }
    for (let i = 1; i < h.length; i++) {
      assert.ok(String(h[i - 1].startedAt) >= String(h[i].startedAt), "history is not in order");
    }
  });
});

describe("the shell is MIDAS, not a page of its own invention", () => {
  test("the console renders on the product design system rather than a private one", () => {
    assert.ok(consoleHtml && villageCss && consoleCss, "a stylesheet is missing");
    assert.match(String(consoleHtml), /href="\/village\.css"/, "the console stopped using the MIDAS design system");
    assert.match(String(consoleHtml), /href="\/console\.css"/);
    // The page is a shell. If markup starts accumulating here, the two files
    // have started to diverge from the rest of the product again.
    assert.ok(String(consoleHtml).length < 1200, "the console page is growing its own markup");
    assert.match(String(consoleHtml), /class="shell"/);
    assert.match(String(consoleHtml), /class="side"/);
    assert.match(String(consoleHtml), /class="topbar"/);
  });

  test("REGRESSION: the console defines no colour, font or radius of its own", () => {
    const css = String(consoleCss);
    // Every colour must come from a token in village.css. A raw hex here is a
    // second palette, which is how the last version drifted into olive serif.
    const rootBlock = /:root\s*\{/.test(css);
    assert.equal(rootBlock, false, "the console redefined the design tokens");
    assert.ok(!/font-family:\s*(Georgia|serif|"Iowan)/i.test(css), "a serif body face came back");
    for (const token of ["--line", "--dim", "--gold", "--mono", "--radius"]) {
      assert.ok(css.includes("var(" + token + ")"), "the console stopped using " + token);
    }
  });

  test("the historical design system it reuses is the one that was already there", () => {
    const v = String(villageCss);
    assert.match(v, /--bg:#05080f/, "the MIDAS palette moved");
    assert.match(v, /--sans:Inter/);
    assert.match(v, /\.shell\{display:grid;grid-template-columns:250px 1fr/);
  });

  test("REGRESSION: nothing on the primary surface is a score, a rank or a percentage", () => {
    const app = String(consoleApp);
    for (const bad of ["roi", "readinessScore", "fitScore", "healthScore", "winProbability", "confidenceScore"]) {
      assert.ok(!app.includes(bad), "the console started rendering " + bad);
    }
    assert.ok(!/toFixed\(\d\)\s*\+\s*"%"/.test(app), "a percentage was formatted for display");
  });

  test("the provenance vocabulary survived the redesign", () => {
    const app = String(consoleApp);
    for (const k of ["midas_verified_primary_source", "owner_reported", "midas_reported_unverified", "unknown"]) {
      assert.ok(app.includes(k), "provenance class " + k + " is no longer rendered");
    }
    assert.match(app, /const NA = .*UNKNOWN/, "UNKNOWN stopped being a rendered value");
  });

  test("technical identity is present but behind an expander", () => {
    const app = String(consoleApp);
    const adv = app.slice(app.indexOf("function advancedPanel"));
    for (const field of ["inputFingerprint", "runId"]) {
      assert.ok(adv.includes(field), field + " left the advanced panel");
      const primary = app.slice(0, app.indexOf("function advancedPanel"));
      assert.ok(!primary.includes("Fingerprint"), "a fingerprint reached the primary surface");
    }
    assert.match(adv, /details class="adv"/, "advanced details stopped being collapsible");
  });

  test("closed opportunities do not dominate the working list", () => {
    const app = String(consoleApp);
    assert.match(app, /let OPP_FILTER = "open"/, "the list stopped defaulting to what is still open");
    for (const k of ["open", "later", "undated", "closed", "all"]) {
      assert.ok(app.includes('"' + k + '"'), "the " + k + " group disappeared from the filter");
    }
  });

  test("a sentence is not a buyer", () => {
    // Two legacy records carry a provenance sentence where a buyer name goes.
    const legacy = opportunityPacketFor("WI-2ff56ff6")!;
    assert.equal(legacy.buyer, "UNKNOWN");
    assert.match(String(legacy.sourceNote), /Preserved from the recommendation-mode/);
    const real = opportunityPacketFor("WI-9d7f9d70")!;
    assert.match(real.buyer, /Houston Independent School District/);
  });

  test("what needs looking at is two facts, not a ranking", () => {
    const list = attentionList();
    for (const a of list) {
      assert.ok(a.closes, a.id + " is in the attention list with no closing date");
      assert.match(a.why, /Open before the objective date/);
      assert.ok(!("score" in a) && !("rank" in a), "the attention list acquired a score");
    }
    const ids = listOpportunities().filter((o) => o.objectiveFit === "SUBMISSION_OPEN_BEFORE_OBJECTIVE_DATE").map((o) => o.id);
    assert.deepEqual(list.map((a) => a.id).sort(), ids.sort());
  });

  test("REGRESSION: the page stamps its own assets", () => {
    // A browser will happily serve last week's stylesheet against this week's
    // markup, and the result is indistinguishable from a layout bug in the
    // current code. Cost an hour once; now it is asserted.
    const src = String(serverSrc);
    assert.match(src, /href="\/console\.css\?v=/, "the stylesheet is served unstamped");
    assert.match(src, /src="\/console-app\.js\?v=/, "the app script is served unstamped");
    assert.match(src, /cache-control": "no-store/, "the console page may be cached");
  });

  test("every run carries the title of what it decided on", () => {
    for (const r of runs) {
      const sum = runSummary(r);
      assert.ok("opportunityTitle" in sum, r.runId + " cannot say what it was about");
    }
  });
});
