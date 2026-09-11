# Mission 029 value-gated execution v2

This prospective amendment implements Mason's September 11, 2026 instruction. It replaces only the unexecuted live proposal's order and continuation policy. `DESIGN.md`, `LIVE-EXPERIMENT.md`, prior completion, Mission028 evidence and all original configurations remain historical evidence. Verified base: `e39bb9ce0b87cfc6a512a5f71d3e4f18bec1dc14`; no earlier 029 signed grant or actual-model attempt existed. The new account is `var/workflow-029-value-v2`, version `workflow-029-value-v2`.

## Pre-observation value audit and treatment disposition

Read-only independent source review and integration review agreed: **defer every team admission**. Both conditions already receive the excellent master procedure, same stateless context, source corpus, tools, strict contracts, model/settings, ceilings and correction opportunity. Provider input excludes local role IDs. Team instructions add ownership/handoff framing on calls 1–2 and independence/revision framing on calls 3–4. There is no distinct handoff product, reviewer information or demonstrated specialist competence. That suffix could change wording or behavior, but it is insufficient to justify a paid team experiment under this authorization. Neither procedure is strengthened or weakened after observations.

| Stage | Model contribution | Deterministic enforcement / limitation |
|---|---|---|
| 1 investigate | Formulates permitted cost question, branches and explanation | Contract fixes source/variable; adapter retrieves both cost and policy. No general autonomous search claim |
| 2 decide/draft | Produces decision, economic alternatives, rationale and actual initial artifact | Validator checks supplied arithmetic and policy against explicit task. Original cases have uniquely valid choices; prose alone cannot override checks |
| 3 review/revise | Can materially replace the artifact and block publication | Cannot revise the recorded call-2 decision; both arms have the same opportunity. No-effect cases review then terminate |
| 4 inspect | Assesses actual artifact/receipt/readback/obligations, can report failure/unknown | Occurs after publication/reconciliation. Cannot repair, retract, authorize or waive checks. Authenticated delivery checks remain deterministic |

W-006 exposes artifact repair but the existing single procedure already explicitly performs it. Response-loss reconciliation is deterministic; the model inspects confirmed readback. Do not attribute recovery or permission enforcement to model intelligence. Successful single observations favor retaining the simpler sufficient configuration within this synthetic scope; no reliability or comparative superiority follows.

## Frozen scope, release and stop rules

The original `synthetic-workflow-v1` cases, `workflow-role-v1` procedures, `workflow-context-v1` context rules, strict stage schemas, source/tool versions and authority remain pinned by the implementation/case/procedure hashes. New configuration pins the v2 release policy. All six case expectations were traced to taskBrief economicOutcome/sourceRules/artifactRules/acceptance and accessible retrieved evidence. W-004 has explicit unavailable evidence; W-005 unresolved authoritative conflict; both permit a correct block. The inherited W-006 defect and response-loss injection remain labeled. Answer keys stay outside provider context. No hidden operational definition or mandatory gratuitous refusal wording is added.

First release: W-001-single, then W-006-single **only after** W-001 has a usable four-call result, exact approval, authentic single fixture effect, supported inspection, durable usage and no failed/pending attempt. No-action cases later use three calls. An approval wait does not release the next workflow. Advancement also requires a narrow founder usability judgment bound to the actual final artifact, separate from publication approval; assistance is disclosed and independent validation/timing remain unclaimed. Both questions can be answered together asynchronously. Mechanical keyword coverage is insufficient to establish usability. New value profile rejects team admissions and bulk live execution. Completed responses are reused; failed/uncertain attempts cannot be retried.

After both first workflows pass mechanical checks, each remaining single requires a durable pre-observation decision record identifying unresolved decision, why these calls can change it, expected artifact, remaining calls/exposure and why existing evidence is insufficient. Available distinct mechanisms are W-002 changed economics/supersession, W-003 no-action, W-004 inaccessible evidence, W-005 conflict. Stop when no remaining mechanism changes an operating decision. A shared failure blocks broader dispatch; diagnose offline, preserve the result, and version any repair. No retries or allowance resets. Review/approval availability is asynchronous; no 210-minute commitment or independent expertise is asserted.

Seeded-defect detection is distinct from mechanical success. The legacy report's requirement for nonempty call-3 issues/changes can falsely flag an artifact repaired in call 2. The new value report excludes that lexical/self-report heuristic from mechanical acceptance, preserves it as historical triage, and exposes inherited, initial and final artifacts plus normalized artifact hashes. Semantic detection/usefulness requires a provenance-labeled judgment. Only a separate actual founder reply can populate the usability gate; the agent cannot invent it. No raw-byte replay claim follows from normalized artifact equality. Missing independent human timing remains unknown.

## Authorized account and current official evidence

Project `proj_H01ORqdOPQM6vdGwQYsqFL5r`; direct Responses `gpt-6-astra`, High, default tier. Reuse the existing approved protected credential without copying it. Maximum **USD30 new total**, 48 inference admissions/48 counts, 24 per configuration, 4 per workflow; concurrency1; 8192 input tokens including complete payload, 8192 output including reasoning; count10s/inference180s. Zero additional recovery admissions. Expiry September25,2026 22:00UTC.

Official [Astra model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra) rechecked September11: Responses/structured outputs/High supported; USD10 input, USD12.50 cache-write input, USD1 cached input and USD50 output per million. Conservative reservation uses cache-write input: `ceil((8192*1250 + 8192*5000)/1000000)=52` USD cents. 48*52c +504c count uncertainty buffer=3000c. First release <=8*52c +504c=920c. The 504c is **unpriced exposure uncertainty**, not a provider price. Reservations are not actual spending, token costs remain provisional, and a local cap does not guarantee provider billing. No immutable dated model revision is established; record returned identity/time/settings, with no protected evaluation.

A newly signed grant binds this exact root, source hash, configuration, scope, caps and availability. A sibling account registry prevents stacking another v2 grant; existing signed 029 roots require reconciliation before signing. Historical Mission028 retained871c/provisional124c remain separate, transferred0c. Closed provider/project billing evidence is required for authoritative settlement; a local signature alone proves no charge accuracy. Count buffer stays held until explicit closed-account disposition.

## Exact commands and expected records

Run from the Mission029 worktree in PowerShell. Preparation/signing is performed once by the agent under the founder's explicit authorization, not repeated on resume.

```powershell
$wf = 'packages/foundry/src/workflow/cli.ts'
$live = 'var/workflow-029-value-v2'
node $wf prepare-value --mode live --root $live
node $wf preflight --root $live
# Agent writes exact approved copy from current user authorization, then signs once:
node $wf authorize --root $live --file "$live/authorization.approved.json"
node $wf run --root $live --run W-001-single
node $wf approval-view --root $live --run W-001-single
# Mason may approve exact displayed proposal asynchronously in this chat,
# or use the same trusted interactive mechanism:
node $wf approve --root $live --run W-001-single
node $wf resume --root $live --run W-001-single
node $wf run --root $live --run W-006-single
node $wf approve --root $live --run W-006-single
node $wf resume --root $live --run W-006-single
# If response-loss fixture returns reconciling, resume again: no repeat effect.
node $wf resume --root $live --run W-006-single
node $wf value-report --root $live
node $wf status --root $live
# Conditional remaining single: agent records decision before dispatch.
node $wf select-value --root $live --run W-002-single --file "$live/decisions/W-002-single.json"
```

`reports/value-report.html` is the readable synthetic artifact gallery; JSON links exact provenance and accounting. `workflow.sqlite` contains all attempts, business brief/question/evidence/decision/drafts, approval and events. `services/*.sqlite` hold fixture receipt/readback evidence. `releases/*.json` binds each conditional release to the frozen configuration. No credentials are included. Exact asynchronous approval invokes the existing authenticated `approve(root,run,proposalHash,'human',null)` only after Mason's matching response; no mock principal substitutes for human authorization.

This is a value-gated case series, not a completed six-pair comparison. Unexecuted cells are deferred, not failures. Analyze paired workflows only if actually executed under a substantive future treatment; no individual-call pseudo-replication. Preserve all failures and negative/uncertain conclusions. Similar sufficient performance favors single; team benefit requires a mechanism and confirmation; team regression calls for coordination diagnosis; common failure requires shared repair; inconclusive outcome names the missing fact and smallest resolving test. Unknown semantic quality, human effort and billing remain unknown rather than zero. Capability records are experimental/non-production and cannot support learned team assembly, customer validation or specialist superiority.
