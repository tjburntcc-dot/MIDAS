/* ============================================================
   MIDAS — Company 0 decision console.

   A control surface over the real Shadow runtime. Every consequential
   field on screen came from a worker, a stored record, or arithmetic
   on two dates that shows its working. Nothing is scored, ranked,
   predicted or estimated, and anything not known renders UNKNOWN.

   Presentation only. The chain, the packets and the run store live in
   packages/eval; this file fetches and draws.
   ============================================================ */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s)
  .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const NA = '<span class="na">UNKNOWN</span>';
const val = (v) => (v === null || v === undefined || v === "" || v === "UNKNOWN") ? NA : esc(v);
const get = (u) => fetch(u).then((r) => r.json());
const post = (u, b) => fetch(u, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}),
}).then((r) => r.json());

const STATE = { company: null, opportunities: null, runs: null, attention: null };

/* provenance chips: the semantics survive the redesign, they just stop shouting */
const PROV = {
  midas_verified_primary_source: ["v", "Verified"],
  owner_reported: ["o", "Reported"],
  midas_reported_unverified: ["x", "Unverified"],
  unknown: ["u", "Unknown"],
};
const prov = (k) => {
  const p = PROV[k] || ["x", String(k)];
  return '<span class="prov ' + p[0] + '">' + p[1] + "</span>";
};

const FIT = {
  SUBMISSION_OPEN_BEFORE_OBJECTIVE_DATE: ["ok", "Open"],
  SUBMISSION_CLOSES_AFTER_OBJECTIVE_DATE: ["wait", "After objective"],
  CLOSED_BEFORE_TODAY: ["off", "Closed"],
  UNKNOWN: ["idle", "No date"],
};
const fitBadge = (f) => {
  const b = FIT[f] || FIT.UNKNOWN;
  return '<span class="badge ' + b[0] + '"><i></i>' + b[1] + "</span>";
};
const AUDIT_BADGE = {
  pass: ['<span class="badge ok"><i></i>Cleared</span>', "pass"],
  fail: ['<span class="badge bad"><i></i>Not cleared</span>', "fail"],
  insufficient_evidence: ['<span class="badge wait"><i></i>Undetermined</span>', "undet"],
};
const actionLabel = (a) => String(a || "").replace(/_/g, " ");

function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

/* ------------------------------------------------------------------ shell */

const NAV = [
  ["overview", "Company 0", "#/overview"],
  ["opportunities", "Opportunities", "#/opportunities"],
  ["decisions", "Decisions", "#/decisions"],
  ["outcomes", "Outcomes", "#/outcomes"],
];

function renderShell(active) {
  const open = (STATE.attention || []).filter((a) => !a.analysed).length;
  const counts = {
    opportunities: STATE.opportunities ? STATE.opportunities.length : null,
    decisions: STATE.runs ? STATE.runs.length : null,
    outcomes: STATE.runs ? STATE.runs.filter((r) => r.outcome).length : null,
    overview: open || null,
  };
  let h = '<div class="side-ident"><div class="side-glyph" style="color:var(--gold)">&#9819;</div>'
    + "<div><h2>Company 0</h2><p>Hemmer Digital</p></div></div>"
    + '<div class="side-group"><span class="kicker">Operate</span>';
  for (const [id, label, href] of NAV) {
    const n = counts[id] ? '<span class="n">' + counts[id] + "</span>" : "";
    h += '<a class="side-link' + (active === id ? " on" : "") + '" href="' + href + '">'
      + "<span>" + label + "</span>" + n + "</a>";
  }
  h += "</div>";
  if (STATE.company) {
    h += '<div class="side-group"><span class="kicker">Objective</span>'
      + '<div style="padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:rgba(17,29,49,.5)">'
      + '<div style="font-size:12.4px;line-height:1.5;color:var(--text-2)">First $1,000 of legitimate revenue</div>'
      + '<div class="kicker" style="margin-top:7px">by ' + esc(STATE.company.objectiveDate)
      + " &middot; " + daysBetween(STATE.company.asOf, STATE.company.objectiveDate) + " days</div></div></div>";
  }
  h += '<div class="side-foot"><span class="kicker" style="padding:0 10px 7px">MIDAS</span>'
    + '<a class="side-link" href="/">Portfolio village</a>'
    + '<a class="side-link" href="/diagnostics">Diagnostics</a></div>';
  $("side").innerHTML = h;
}

function renderTop(view) {
  $("topbar").innerHTML = '<div style="min-width:0">'
    + (view.crumbs ? '<div class="crumbs">' + view.crumbs + "</div>" : "")
    + (view.kicker ? '<span class="kicker">' + esc(view.kicker) + "</span>" : "")
    + "<h1>" + esc(view.title || "") + "</h1>"
    + (view.sub ? '<p class="sub">' + view.sub + "</p>" : "")
    + "</div><div class=\"top-right\">" + (view.right || "") + "</div>";
}

/* --------------------------------------------------------------- overview */

function viewOverview() {
  const c = STATE.company;
  const head = c.rows.slice(0, 6);
  const attention = STATE.attention || [];
  const unanalysed = attention.filter((a) => !a.analysed);

  const stats = head.map((r) =>
    '<div class="stat-box"><span>' + esc(r.label) + "</span>"
    + (r.short === "UNKNOWN"
      ? '<b class="na" style="display:block;margin-top:7px">UNKNOWN</b>'
      : "<b" + (String(r.short || "").length > 12 ? ' class="na"' : "") + ">" + esc(r.short || "-") + "</b>")
    + "</div>").join("");

  const detail = c.rows.map((r) =>
    '<div class="fact"><span>' + esc(r.label) + prov(r.knownAs) + "</span><b>"
    + (r.short && r.short !== "UNKNOWN" ? esc(r.short) : NA) + "</b></div>").join("");

  const full = c.rows.map((r) =>
    "<div style=\"padding:10px 0;border-bottom:1px solid rgba(27,43,71,.55)\">"
    + '<div style="font-size:12.5px;color:var(--text-2)"><b style="font-weight:620">' + esc(r.label) + "</b>"
    + prov(r.knownAs) + "</div>"
    + '<div style="margin-top:5px;font-size:12.4px;color:var(--muted);line-height:1.6">' + esc(r.value) + "</div>"
    + (r.note ? '<div class="quote">' + esc(r.note) + "</div>" : "") + "</div>").join("");

  const attnRows = unanalysed.length
    ? unanalysed.map((a) =>
      '<tr onclick="go(\'#/o/' + a.id + '\')"><td><span class="t-name">' + esc(a.title) + "</span>"
      + '<span class="t-sub">' + esc(a.buyer) + "</span></td>"
      + '<td class="t-num">' + esc(a.closes) + "</td>"
      + '<td class="t-dim t-right">Not analysed</td></tr>').join("")
    : '<tr class="tbl-empty"><td colspan="3">Every opportunity that is still open before the objective date has been through MIDAS.</td></tr>';

  return {
    kicker: "Company 0",
    title: "Where the business actually stands",
    sub: 'Every line says how it is known. Nothing here is scored, ranked or estimated; what is not known says <span class="na">UNKNOWN</span>.',
    right: '<a class="btn primary" href="#/opportunities">Opportunities</a>',
    body: '<div class="stat-grid">' + stats + "</div>"
      + '<div class="split">'
      + '<div class="card"><div class="hd"><span class="kicker">Needs looking at</span>'
      + "<h3>Open before " + esc(c.objectiveDate) + ", not yet analysed</h3>"
      + "<p>Two checkable facts, not a ranking: the submission window is still open on or before the objective&rsquo;s date, and MIDAS has not looked at it yet.</p></div>"
      + '<div class="bd"><div class="tbl-wrap"><table class="tbl"><thead><tr>'
      + '<th>Opportunity</th><th>Closes</th><th class="t-right">MIDAS</th></tr></thead><tbody>'
      + attnRows + "</tbody></table></div></div></div>"
      + '<div class="card pad"><span class="kicker">State</span>'
      + '<div class="facts" style="grid-template-columns:1fr;margin-top:12px">' + detail + "</div></div>"
      + "</div>"
      + '<div class="split">'
      + '<div class="card pad"><span class="kicker">Open unknowns</span>'
      + '<h3 style="margin:7px 0 0;font-size:14.5px;font-weight:645">' + c.unknowns.length + " things nobody has established</h3>"
      + '<ul class="bullets warn" style="margin-top:11px">' + c.unknowns.map((u) => "<li>" + esc(u) + "</li>").join("") + "</ul></div>"
      + '<details class="adv"><summary>Owner-reported wording, in full</summary><div class="adv-b">' + full + "</div></details>"
      + "</div>",
  };
}

/* ---------------------------------------------------------- opportunities */

let OPP_FILTER = "open";
const FILTERS = [
  ["open", "Open", (o) => o.objectiveFit === "SUBMISSION_OPEN_BEFORE_OBJECTIVE_DATE"],
  ["later", "Later value", (o) => o.objectiveFit === "SUBMISSION_CLOSES_AFTER_OBJECTIVE_DATE"],
  ["undated", "No date", (o) => o.objectiveFit === "UNKNOWN"],
  ["closed", "Closed", (o) => o.objectiveFit === "CLOSED_BEFORE_TODAY"],
  ["all", "All", () => true],
];

function setFilter(k) { OPP_FILTER = k; render(); }

function viewOpportunities() {
  const all = STATE.opportunities;
  const f = FILTERS.find((x) => x[0] === OPP_FILTER) || FILTERS[0];
  const rows = all.filter(f[2]);
  const seg = FILTERS.map(([k, label, pred]) =>
    '<button class="' + (k === OPP_FILTER ? "on" : "") + '" onclick="setFilter(\'' + k + "')\">"
    + label + " <span class=\"t-dim\">" + all.filter(pred).length + "</span></button>").join("");

  const body = rows.length ? rows.map((o) => {
    const d = o.lastDecision;
    return '<tr onclick="go(\'#/o/' + o.id + '\')">'
      + '<td><span class="t-name">' + esc(o.title) + '</span><span class="t-sub">' + esc(o.buyer) + "</span></td>"
      + "<td>" + fitBadge(o.objectiveFit) + "</td>"
      + '<td class="t-num">' + (o.submission.date ? esc(o.submission.date) : NA) + "</td>"
      + '<td class="t-dim t-clip">'
      + (o.majorBlocker === "UNKNOWN" ? NA : esc(o.majorBlocker)) + "</td>"
      + "<td>" + (o.sourceVerified
        ? '<span class="badge ok"><i></i>200</span>'
        : '<span class="badge idle"><i></i>Unchecked</span>') + "</td>"
      + '<td class="t-right">' + (d && d.action
        ? esc(actionLabel(d.action)) + " " + ((AUDIT_BADGE[d.audit] || ["", ""])[0])
        : '<span class="t-dim">not analysed</span>') + "</td>"
      + "</tr>";
  }).join("")
    : '<tr class="tbl-empty"><td colspan="6">Nothing in this group.</td></tr>';

  return {
    kicker: "Opportunities",
    title: "What MIDAS is holding",
    sub: all.length + " real records, every one from a stored work item with its own evidence. "
      + "Closing dates are parsed from the wording the evidence uses and shown on each record.",
    right: '<div class="seg">' + seg + "</div>",
    body: '<div class="card"><div class="bd" style="padding-top:6px"><div class="tbl-wrap"><table class="tbl tbl-opps"><thead><tr>'
      + '<th>Opportunity</th><th>Objective</th><th>Closes</th><th>Blocker on record</th><th>Source</th><th class="t-right">Last MIDAS decision</th>'
      + "</tr></thead><tbody>" + body + "</tbody></table></div></div></div>",
  };
}

/* ------------------------------------------------------------ opportunity */

let DETAIL = null;

async function viewOpportunity(id) {
  DETAIL = await get("/console/api/opportunities/" + encodeURIComponent(id));
  if (!DETAIL) return { title: "Not found", body: '<div class="empty">No such opportunity.</div>' };
  const d = DETAIL, p = d.packet, fit = d.objectiveFit;

  const evidence = p.evidence.map((e) =>
    "<tr><td class=\"t-num\">" + esc(e.id) + '</td><td class="t-dim" style="white-space:nowrap">' + esc(e.source)
    + '</td><td style="color:var(--text-2);line-height:1.6">' + esc(e.text) + "</td></tr>").join("");

  const history = d.history.length ? d.history.map((h) =>
    '<tr onclick="go(\'#/r/' + h.runId + '\')"><td class="t-num">' + esc(String(h.startedAt).slice(0, 10)) + "</td>"
    + "<td>" + (h.recommendedAction ? esc(actionLabel(h.recommendedAction)) : '<span class="t-dim">' + esc(h.stage) + "</span>") + "</td>"
    + "<td>" + ((AUDIT_BADGE[h.auditDisposition] || ["<span class='t-dim'>&mdash;</span>"])[0]) + "</td>"
    + '<td class="t-dim">' + esc(String(h.ownerDisposition).replace(/_/g, " ").toLowerCase()) + "</td>"
    + "<td>" + (h.outcome ? esc(h.outcome.replace(/_/g, " ").toLowerCase()) : '<span class="t-dim">not recorded</span>') + "</td>"
    + '<td class="t-right">' + (h.historical ? '<span class="badge info"><i></i>Preserved</span>' : "") + "</td></tr>").join("")
    : '<tr class="tbl-empty"><td colspan="6">MIDAS has not run on this opportunity yet.</td></tr>';

  const budget = d.statedBudget.statedAs
    ? esc(d.statedBudget.statedAs) + ' <span class="t-dim">[' + esc(d.statedBudget.evidenceId) + "]</span>"
    : NA + '<div class="quote">No budget is stated in the evidence held, and no figure is estimated.'
      + (d.statedBudget.absenceStatedAs ? " The evidence says so in terms: &ldquo;" + esc(d.statedBudget.absenceStatedAs) + "&rdquo;" : "") + "</div>";

  return {
    crumbs: '<a href="#/opportunities">Opportunities</a><i>&rsaquo;</i><span>' + esc(p.workItemId) + "</span>",
    kicker: p.buyer && p.buyer !== "UNKNOWN" ? esc(p.buyer) : esc(p.workItemId),
    title: p.title,
    sub: esc(fit.why),
    right: fitBadge(fit.fit) + '<button class="btn primary" id="runBtn" onclick="startRun()">Run MIDAS</button>',
    body: '<div id="runArea"></div>'
      + '<div class="split">'
      + '<div class="card pad"><span class="kicker">Decision relevance</span>'
      + '<div class="facts" style="grid-template-columns:1fr;margin-top:10px">'
      + '<div class="fact"><span>Submission closes</span><b>' + (fit.submission.date ? esc(fit.submission.date) : NA) + "</b></div>"
      + '<div class="fact"><span>Objective date</span><b>' + esc(STATE.company.objectiveDate) + "</b></div>"
      + '<div class="fact"><span>Channel</span><b>' + esc(p.channel) + "</b></div>"
      + '<div class="fact"><span>Record state</span><b>' + esc(d.state) + "</b></div>"
      + "</div>"
      + (fit.submission.statedAs ? '<div class="quote">Parsed from [' + esc(fit.submission.evidenceId) + "] &ldquo;" + esc(fit.submission.statedAs) + "&rdquo;</div>" : "")
      + "</div>"
      + '<div class="card pad"><span class="kicker">Known economics</span>'
      + '<div style="margin-top:10px;font-size:12.8px;color:var(--text-2);line-height:1.6">' + budget + "</div></div>"
      + "</div>"
      + '<div class="card"><div class="hd"><span class="kicker">Evidence held</span>'
      + "<h3>" + p.evidence.length + " records</h3><p>" + esc(p.sourceKind) + " &middot; " + esc(p.livenessCheck)
      + (p.sourceUrl && p.sourceUrl !== "UNKNOWN"
        ? ' &middot; <a href="' + esc(p.sourceUrl) + '" target="_blank" rel="noopener" style="color:var(--sky)">source</a>' : "")
      + '</p></div><div class="bd"><div class="tbl-wrap"><table class="tbl"><thead><tr>'
      + "<th>Id</th><th>From</th><th>What it says</th></tr></thead><tbody>" + evidence + "</tbody></table></div></div></div>"
      + '<div class="split">'
      + '<div class="card pad"><span class="kicker">Unknowns</span>'
      + '<ul class="bullets warn" style="margin-top:10px">' + d.unknowns.map((u) => "<li>" + esc(u) + "</li>").join("") + "</ul>"
      + (d.contradictions.length
        ? '<div style="margin-top:16px"><span class="kicker">Contradictions in the record</span>'
          + '<ul class="bullets warn" style="margin-top:8px">' + d.contradictions.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul></div>"
        : "")
      + "</div>"
      + (d.priorQualification
        ? '<div class="card pad"><span class="kicker">Prior MIDAS qualification</span>'
          + '<div class="facts" style="grid-template-columns:1fr;margin-top:10px">'
          + '<div class="fact"><span>Decision</span><b>' + esc(d.priorQualification.decision) + "</b></div>"
          + '<div class="fact"><span>Missing</span><b>' + (d.priorQualification.missing.length ? esc(d.priorQualification.missing.join(", ")) : NA) + "</b></div></div>"
          + '<div class="quote">' + esc(d.priorQualification.rationale) + "</div></div>"
        : "")
      + "</div>"
      + '<div class="card"><div class="hd"><span class="kicker">MIDAS history</span><h3>Previous runs</h3>'
      + "<p>Past results are preserved exactly as they ran. Nothing here is recomputed.</p></div>"
      + '<div class="bd"><div class="tbl-wrap"><table class="tbl"><thead><tr>'
      + '<th>When</th><th>Recommended</th><th>Audit</th><th>Owner</th><th>Outcome</th><th class="t-right"></th>'
      + "</tr></thead><tbody>" + history + "</tbody></table></div></div></div>",
  };
}

/* -------------------------------------------------------------- execution */

const STAGES = ["PREPARING", "RESEARCHING", "DECIDING", "AUDITING", "COMPLETE"];
const STAGE_LABEL = { PREPARING: "Preparing", RESEARCHING: "Researching", DECIDING: "Deciding", AUDITING: "Auditing", COMPLETE: "Complete" };

function rail(stage, failed) {
  const i = STAGES.indexOf(stage);
  return '<div class="rail">' + STAGES.map((s, n) => {
    const cls = failed && n === Math.max(i, 0) ? "failed" : n < i ? "done" : n === i ? "on" : "";
    return '<span class="st ' + cls + '"><i></i>' + STAGE_LABEL[s] + "</span>";
  }).join("") + (failed ? '<span class="st failed"><i></i>Failed</span>' : "") + "</div>";
}

let POLL = null;

async function startRun() {
  const btn = $("runBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Running"; }
  const out = await post("/console/api/runs", { opportunityId: DETAIL.packet.workItemId });
  if (out.error) {
    $("runArea").innerHTML = '<div class="card pad" style="border-color:rgba(244,114,114,.45)">'
      + '<span class="kicker" style="color:#f6a5a5">MIDAS did not start</span>'
      + '<p style="margin:8px 0 0;font-size:12.8px;color:var(--text-2);line-height:1.6">' + esc(out.error) + "</p></div>";
    if (btn) { btn.disabled = false; btn.textContent = "Run MIDAS"; }
    return;
  }
  pollRun(out.runId);
}

function pollRun(runId) {
  if (POLL) clearInterval(POLL);
  const tick = async () => {
    const r = await get("/console/api/runs/" + encodeURIComponent(runId));
    if (r.stage === "COMPLETE" || r.stage === "FAILED") {
      clearInterval(POLL); POLL = null;
      $("runArea").innerHTML = renderResult(r);
      const btn = $("runBtn");
      if (btn) { btn.disabled = false; btn.textContent = "Run MIDAS again"; }
      STATE.runs = null;
      loadRuns().then(() => renderShell("opportunities"));
    } else {
      $("runArea").innerHTML = '<div class="card pad">' + rail(r.stage, false)
        + '<p style="margin:13px 0 0;font-size:12.6px;color:var(--muted);line-height:1.6;max-width:74ch">'
        + "Running the real Researcher, Manager and Auditor against this opportunity and Company 0 as it stands. "
        + "No progress percentage is shown: the chain has three stages of unknown length and a bar would be inventing one.</p></div>";
    }
  };
  tick();
  POLL = setInterval(tick, 2500);
}

/* ----------------------------------------------------------------- result */

function bullets(items, cls) {
  if (!items || !items.length) return '<p class="note">None recorded.</p>';
  return '<ul class="bullets ' + (cls || "") + '">'
    + items.map((i) => "<li>" + esc(typeof i === "string" ? i : JSON.stringify(i)) + "</li>").join("") + "</ul>";
}

function renderResult(r) {
  if (r.stage === "FAILED") {
    return '<div class="card pad">' + rail("FAILED", true)
      + '<p style="margin:13px 0 0;color:#f6a5a5;font-size:12.8px">The run failed: ' + esc(r.error || "unknown error") + "</p></div>";
  }
  const v = r.result, w = r.workers;
  const cls = v.audit.cleared ? "pass" : v.audit.objected ? "fail" : "undet";
  const head = v.audit.cleared ? "Audit cleared this decision"
    : v.audit.objected ? "Audit objected. Not cleared."
      : "Audit could not determine";

  const disagreement = (v.audit.objected || v.audit.undetermined)
    ? '<div class="disagree">'
      + '<div class="dcol"><span class="kicker">Manager recommends</span><b>' + esc(actionLabel(v.recommendedAction)) + "</b>"
      + '<p class="note" style="margin-top:7px">Shown as it was decided. An objection does not delete it.</p></div>'
      + '<div class="dcol"><span class="kicker">Auditor</span><b>' + (v.audit.objected ? "Not cleared" : "Undetermined") + "</b>"
      + (v.audit.defects.length
        ? "<ul>" + v.audit.defects.map((x) => "<li><b>" + esc(x.defectClass) + "</b> &mdash; " + esc(x.claim) + "</li>").join("") + "</ul>"
        : '<p class="note" style="margin-top:7px">' + esc(v.audit.reasoning || "No defect was named.") + "</p>")
      + "</div>"
      + '<div class="dcol"><span class="kicker">Final status</span><b>' + esc(v.finalStatus.replace(/_/g, " ")) + "</b>"
      + '<p class="note" style="margin-top:7px">Nothing was reconciled and no third opinion was taken.</p></div></div>'
    : "";

  const chosen = (v.options || []).find((o) => o.chosen) || {};

  return (r.historical
    ? '<div class="card pad" style="border-color:rgba(90,169,248,.3)"><span class="kicker" style="color:#9db8dc">Preserved result</span>'
      + '<p style="margin:7px 0 0;font-size:12.5px;color:var(--muted);line-height:1.6">' + esc(r.note || "") + "</p></div>"
    : "")
    + '<div class="hero"><div class="hero-main"><span class="kicker">Recommended next action</span>'
    + "<h2>" + esc(actionLabel(v.recommendedAction)) + "</h2>"
    + '<p class="hero-why">' + esc(v.whyThisAction) + "</p></div>"
    + '<div class="hero-side">' + ((AUDIT_BADGE[v.audit.verdict] || ["", ""])[0])
    + '<span class="pill"><i></i>' + esc(v.bindingBottleneck) + " bottleneck</span>"
    + '<span class="pill' + (v.authorityRequired === true ? " wait" : "") + '"><i></i>'
    + (v.authorityRequired === true ? "Authority required" : v.authorityRequired === false ? "No authority needed" : "Authority unknown") + "</span></div></div>"

    + '<div class="verdict ' + cls + '"><div class="vhd"><h4>' + head + "</h4>"
    + '<span class="t-dim" style="font-size:11.5px">opened ' + esc((v.audit.recordsOpened || []).join(", ") || "nothing") + "</span></div>"
    + "<p>" + esc(v.audit.reasoning || "") + "</p>" + disagreement + "</div>"

    + '<div class="split">'
    + '<div class="card pad"><span class="kicker">Binding bottleneck</span>'
    + '<h3 style="margin:7px 0 0;font-size:16px;font-weight:650">' + esc(v.bindingBottleneck) + "</h3>"
    + '<p style="margin:9px 0 0;font-size:12.7px;color:var(--muted);line-height:1.62">' + esc(v.bottleneckReasoning) + "</p>"
    + '<div style="margin-top:16px"><span class="kicker">Why not the alternatives</span>'
    + '<p style="margin:7px 0 0;font-size:12.6px;color:var(--muted);line-height:1.62">' + esc(v.whyNotAlternatives) + "</p></div></div>"
    + '<div class="card pad"><span class="kicker">What it costs, and who must act</span>'
    + '<div class="facts" style="grid-template-columns:1fr;margin-top:10px">'
    + '<div class="fact"><span>Capital at risk</span><b>' + val(v.capitalAtRisk) + "</b></div>"
    + '<div class="fact"><span>Owner time to feedback</span><b>' + val(v.ownerTime) + "</b></div>"
    + '<div class="fact"><span>Reversibility</span><b>' + val(v.reversibility) + "</b></div>"
    + '<div class="fact"><span>Authority required</span><b>'
    + (v.authorityRequired === true ? "Yes" : v.authorityRequired === false ? "No" : NA) + "</b></div>"
    + "</div>"
    + '<div style="margin-top:14px"><span class="kicker">Owner action required</span>'
    + '<p style="margin:7px 0 0;font-size:12.6px;color:var(--text-2);line-height:1.62">' + val(v.ownerActionRequired) + "</p></div></div>"
    + "</div>"

    + '<div class="split">'
    + '<div class="card pad"><span class="kicker">Stop condition</span>'
    + '<p style="margin:8px 0 0;font-size:12.7px;color:var(--text-2);line-height:1.62">' + val(v.falsifier) + "</p>"
    + '<div style="margin-top:14px"><span class="kicker">Reassess when</span>'
    + '<p style="margin:7px 0 0;font-size:12.6px;color:var(--muted);line-height:1.62">' + val(v.reassessmentTrigger) + "</p></div></div>"
    + '<div class="card pad"><span class="kicker">Options considered</span>'
    + '<div class="tbl-wrap" style="margin-top:9px"><table class="tbl"><tbody>'
    + (v.options || []).map((o) => '<tr style="cursor:default"><td style="width:1%">'
      + (o.chosen ? '<span class="badge ok"><i></i>Chosen</span>' : '<span class="badge idle"><i></i>No</span>')
      + '</td><td><span class="t-name">' + esc(actionLabel(o.action)) + "</span>"
      + '<span class="t-sub" style="max-width:46ch;white-space:normal">' + esc(o.reason || o.rationale) + "</span></td></tr>").join("")
    + "</tbody></table></div></div>"
    + "</div>"

    + '<div class="split">'
    + '<div class="card pad"><span class="kicker">Key evidence relied on</span>' + bullets(v.keyEvidence) + "</div>"
    + '<div class="card pad"><span class="kicker">Counterevidence, and what the source does not say</span>'
    + bullets(v.counterEvidence, "dim") + "</div>"
    + "</div>"
    + '<div class="split">'
    + '<div class="card pad"><span class="kicker">Material unknowns</span>' + bullets(v.materialUnknowns, "warn") + "</div>"
    + '<div class="card pad"><span class="kicker">Deferred or ignored</span>' + bullets(v.deferOrIgnore, "dim") + "</div>"
    + "</div>"

    + workerPanels(w)
    + ownerPanel(r)
    + advancedPanel(r);
}

function workerPanels(w) {
  if (!w) return "";
  const facts = w.researcher.facts.map((f) =>
    "<tr style=\"cursor:default\"><td class=\"t-num\">" + esc(f.fact) + "</td><td>"
    + (f.stated ? esc(f.value) : '<span class="na">NOT STATED</span>') + "</td>"
    + '<td class="t-dim" style="line-height:1.6">' + esc(f.quote || "") + "</td></tr>").join("");
  const d = w.manager.decision || {};
  return '<details class="adv"><summary>Researcher &mdash; what the source states, and what it does not</summary><div class="adv-b">'
    + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fact</th><th>Value</th><th>Quoted from the source</th></tr></thead><tbody>'
    + facts + "</tbody></table></div>"
    + '<div><span class="kicker">Scope</span><p class="note" style="margin-top:6px">' + val(w.researcher.scopeSummary) + "</p></div>"
    + '<div><span class="kicker">Not stated anywhere in the source</span>' + bullets(w.researcher.notStated, "dim") + "</div>"
    + '<div><span class="kicker">Still unresolved</span>' + bullets(w.researcher.unresolved, "dim") + "</div>"
    + '<p class="note">' + esc(w.researcher.certificationNote || "") + "</p></div></details>"

    + '<details class="adv"><summary>Manager &mdash; the decision as it was made</summary><div class="adv-b">'
    + '<div><span class="kicker">Treated as fact</span>' + bullets(d.facts) + "</div>"
    + '<div><span class="kicker">Inferred</span>' + bullets(d.inferences, "dim") + "</div>"
    + '<div><span class="kicker">Assumed</span>' + bullets(d.assumptions, "warn") + "</div>"
    + '<div><span class="kicker">Conflicts recorded</span>' + bullets(d.conflicts, "dim") + "</div>"
    + '<div class="facts" style="grid-template-columns:1fr">'
    + '<div class="fact"><span>Success condition</span><b>' + val(d.successCondition) + "</b></div>"
    + '<div class="fact"><span>Failure condition</span><b>' + val(d.failureCondition) + "</b></div></div></div></details>"

    + '<details class="adv"><summary>Auditor &mdash; what it opened, and what it concluded</summary><div class="adv-b">'
    + '<div class="facts" style="grid-template-columns:1fr">'
    + '<div class="fact"><span>Verdict</span><b>' + val(w.auditor.verdict) + "</b></div>"
    + '<div class="fact"><span>Records opened</span><b>' + esc((w.auditor.recordsOpened || []).join(", ") || "none") + "</b></div>"
    + '<div class="fact"><span>Turns used</span><b>' + val(w.auditor.turnsUsed) + "</b></div></div>"
    + '<p class="note">' + val(w.auditor.reasoning) + "</p>"
    + '<div><span class="kicker">Defects named</span>'
    + bullets((w.auditor.defects || []).map((x) => x.defectClass + ": " + x.claim), "warn") + "</div></div></details>";
}

const DISPOSITIONS = [
  ["ACKNOWLEDGED", "Acknowledge"],
  ["MARKED_FOR_ACTION", "Mark for action"],
  ["APPROVED_FOR_PREPARATION", "Approve for preparation"],
];
const OUTCOMES = ["NOT_STARTED", "STARTED", "COMPLETED", "NO_RESPONSE", "RESPONSE", "REJECTED", "MEETING", "SALE", "OTHER"];

function ownerPanel(r) {
  const cur = r.run.ownerDisposition;
  const o = r.run.outcome;
  return '<div class="split">'
    + '<div class="card pad"><span class="kicker">Your decision</span>'
    + '<h3 style="margin:7px 0 0;font-size:14.5px;font-weight:645">' + esc(String(cur).replace(/_/g, " ").toLowerCase()) + "</h3>"
    + '<p class="note" style="margin-top:8px">Recorded inside MIDAS and nowhere else. No state here sends, submits, applies, pays or contacts anyone.</p>'
    + '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:13px">'
    + DISPOSITIONS.map(([k, label]) => '<button class="btn sm' + (cur === k ? " primary" : "") + '" onclick="setDisposition(\''
      + r.run.runId + "','" + k + "')\">" + label + "</button>").join("") + "</div></div>"
    + '<div class="card pad"><span class="kicker">What actually happened</span>'
    + (o ? '<h3 style="margin:7px 0 0;font-size:14.5px;font-weight:645">' + esc(String(o).replace(/_/g, " ").toLowerCase())
      + (r.run.verifiedRevenueUsd !== null ? ' <span class="t-dim">&middot; $' + esc(r.run.verifiedRevenueUsd) + " verified</span>" : "") + "</h3>"
      : '<h3 style="margin:7px 0 0;font-size:14.5px;font-weight:645" class="na">NOT RECORDED</h3>')
    + '<p class="note" style="margin-top:8px">Recorded by you, after the fact. Nothing learns from it yet; it exists so the real result is written down while it is still known.</p>'
    + '<div class="form" style="margin-top:13px;gap:12px">'
    + '<div class="field"><label>Outcome</label><select id="outState">'
    + OUTCOMES.map((s) => "<option" + (o === s ? " selected" : "") + ">" + s + "</option>").join("") + "</select></div>"
    + '<div class="field"><label>Verified revenue in dollars, if any</label>'
    + '<input type="text" id="outRev" inputmode="numeric" placeholder="leave blank if none"/></div>'
    + '<div class="field"><label>What you observed</label><textarea id="outObs" style="min-height:70px"></textarea></div>'
    + '<div class="form-actions"><button class="btn sm" onclick="saveOutcome(\'' + r.run.runId + "')\">Record outcome</button></div>"
    + "</div></div></div>";
}

function advancedPanel(r) {
  const t = r.run;
  return '<details class="adv"><summary>Advanced &mdash; run identity and raw worker output</summary><div class="adv-b">'
    + '<div class="facts">'
    + '<div class="fact"><span>Run</span><b class="t-num">' + esc(t.runId) + "</b></div>"
    + '<div class="fact"><span>Input fingerprint</span><b class="t-num">' + esc(t.inputFingerprint) + "</b></div>"
    + '<div class="fact"><span>Started</span><b class="t-num">' + esc(String(t.startedAt).slice(0, 19).replace("T", " ")) + "</b></div>"
    + '<div class="fact"><span>Final status</span><b>' + esc(r.result.finalStatus.replace(/_/g, " ")) + "</b></div>"
    + "</div>"
    + (r.analysis
      ? '<div><span class="kicker">What MIDAS knows about this run</span><div class="facts" style="grid-template-columns:1fr;margin-top:8px">'
        + '<div class="fact"><span>Material facts the manager dropped</span><b>' + esc((r.analysis.factsLostByManager || []).join(", ") || "none") + "</b></div>"
        + '<div class="fact"><span>Figures with no evidence behind them</span><b>' + esc((r.analysis.inventedFigures || []).join(", ") || "none") + "</b></div>"
        + '<div class="fact"><span>Independent adjudication</span><b>' + val(r.analysis.adjudication) + "</b></div></div>"
        + '<p class="note" style="margin-top:9px">' + val(r.analysis.adjudicationPrimaryFailure) + "</p></div>"
      : "")
    + (r.workers
      ? '<details class="adv"><summary>Raw model output</summary><div class="adv-b">'
        + '<pre class="raw">' + esc(r.workers.researcher.raw || "") + "</pre>"
        + '<pre class="raw">' + esc(r.workers.manager.raw || "") + "</pre>"
        + '<pre class="raw">' + esc((r.workers.auditor.transcript || []).join("\n")) + "\n\n"
        + esc((r.workers.auditor.raw || []).join("\n\n")) + "</pre></div></details>"
      : "")
    + "</div></details>";
}

async function setDisposition(runId, disposition) {
  const out = await post("/console/api/disposition/" + encodeURIComponent(runId), { disposition });
  if (out.error) { alert(out.error); return; }
  STATE.runs = null;
  go("#/r/" + runId);
}

async function saveOutcome(runId) {
  const rev = String($("outRev").value || "").trim();
  const out = await post("/console/api/outcome/" + encodeURIComponent(runId), {
    state: $("outState").value,
    verifiedRevenueUsd: rev === "" ? null : Number(rev),
    observed: $("outObs").value,
  });
  if (out.error) { alert(out.error); return; }
  STATE.runs = null;
  go("#/r/" + runId);
}

/* ------------------------------------------------------- decisions & runs */

function viewDecisions() {
  const runs = STATE.runs || [];
  const rows = runs.length ? runs.map((r) =>
    '<tr onclick="go(\'#/r/' + r.runId + '\')">'
    + '<td class="t-num">' + esc(String(r.startedAt).slice(0, 10)) + "</td>"
    + '<td><span class="t-name">' + esc(r.opportunityId) + "</span></td>"
    + "<td>" + (r.recommendedAction ? esc(actionLabel(r.recommendedAction)) : '<span class="t-dim">' + esc(r.stage) + "</span>") + "</td>"
    + "<td>" + ((AUDIT_BADGE[r.auditDisposition] || ["<span class='t-dim'>&mdash;</span>"])[0]) + "</td>"
    + '<td class="t-dim">' + esc(String(r.ownerDisposition).replace(/_/g, " ").toLowerCase()) + "</td>"
    + "<td>" + (r.outcome ? esc(r.outcome.replace(/_/g, " ").toLowerCase()) : '<span class="t-dim">not recorded</span>') + "</td>"
    + "<td>" + (r.historical ? '<span class="badge info"><i></i>Preserved</span>' : "") + "</td></tr>").join("")
    : '<tr class="tbl-empty"><td colspan="7">No MIDAS runs yet.</td></tr>';
  return {
    kicker: "Decisions",
    title: "Every MIDAS run",
    sub: "Each row is one real Researcher, Manager and Auditor chain. Preserved runs are shown exactly as they ran.",
    body: '<div class="card"><div class="bd" style="padding-top:6px"><div class="tbl-wrap"><table class="tbl"><thead><tr>'
      + "<th>When</th><th>Opportunity</th><th>Recommended</th><th>Audit</th><th>Owner</th><th>Outcome</th><th></th>"
      + "</tr></thead><tbody>" + rows + "</tbody></table></div></div></div>",
  };
}

function viewOutcomes() {
  const runs = (STATE.runs || []).filter((r) => r.ownerDisposition !== "NONE" || r.outcome);
  const rows = runs.length ? runs.map((r) =>
    '<tr onclick="go(\'#/r/' + r.runId + '\')">'
    + '<td class="t-num">' + esc(String(r.startedAt).slice(0, 10)) + "</td>"
    + '<td><span class="t-name">' + esc(r.opportunityId) + '</span><span class="t-sub">'
    + esc(actionLabel(r.recommendedAction || r.stage)) + "</span></td>"
    + '<td class="t-dim">' + esc(String(r.ownerDisposition).replace(/_/g, " ").toLowerCase()) + "</td>"
    + "<td>" + (r.outcome ? esc(r.outcome.replace(/_/g, " ").toLowerCase()) : NA) + "</td>"
    + '<td class="t-num">' + (r.verifiedRevenueUsd !== null && r.verifiedRevenueUsd !== undefined ? "$" + esc(r.verifiedRevenueUsd) : NA) + "</td>"
    + "</tr>").join("")
    : '<tr class="tbl-empty"><td colspan="5">Nothing has been acknowledged or recorded yet.</td></tr>';
  return {
    kicker: "Outcomes",
    title: "What you decided, and what happened",
    sub: "The beginning of the outcome loop. Nothing learns from this yet; it exists so the real result is written down while it is still known.",
    body: '<div class="card"><div class="bd" style="padding-top:6px"><div class="tbl-wrap"><table class="tbl"><thead><tr>'
      + "<th>When</th><th>Run</th><th>Your decision</th><th>Outcome</th><th>Verified revenue</th>"
      + "</tr></thead><tbody>" + rows + "</tbody></table></div></div></div>",
  };
}

async function viewRun(runId) {
  const r = await get("/console/api/runs/" + encodeURIComponent(runId));
  if (r.error) return { title: "Not found", body: '<div class="empty">No such run.</div>' };
  return {
    crumbs: '<a href="#/decisions">Decisions</a><i>&rsaquo;</i><a href="#/o/' + esc(r.run.opportunityId) + '">'
      + esc(r.run.opportunityId) + "</a>",
    kicker: r.historical ? "Preserved decision" : "Decision",
    title: r.run.opportunityTitle || r.run.opportunityId,
    sub: "Run " + esc(r.run.runId) + " &middot; " + esc(String(r.run.startedAt).slice(0, 10)),
    right: '<a class="btn" href="#/o/' + esc(r.run.opportunityId) + '">Open opportunity</a>',
    body: renderResult(r),
  };
}

/* ------------------------------------------------------------------ route */

function go(hash) { window.location.hash = hash; }

async function loadRuns() {
  const d = await get("/console/api/runs");
  STATE.runs = d.runs;
}

async function render() {
  const hash = window.location.hash || "#/overview";
  const [, section, arg] = hash.split("/");
  let view; let active = section || "overview";

  if (!STATE.company) STATE.company = await get("/console/api/company0");
  if (!STATE.opportunities) {
    const d = await get("/console/api/opportunities");
    STATE.opportunities = d.opportunities;
    STATE.attention = d.attention;
  }
  if (!STATE.runs) await loadRuns();

  if (section === "opportunities") view = viewOpportunities();
  else if (section === "o") { view = await viewOpportunity(arg); active = "opportunities"; }
  else if (section === "r") { view = await viewRun(arg); active = "decisions"; }
  else if (section === "decisions") view = viewDecisions();
  else if (section === "outcomes") view = viewOutcomes();
  else { view = viewOverview(); active = "overview"; }

  renderShell(active);
  renderTop(view);
  $("content").innerHTML = view.body || "";
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", () => {
  if (POLL) { clearInterval(POLL); POLL = null; }
  render();
});
render();
