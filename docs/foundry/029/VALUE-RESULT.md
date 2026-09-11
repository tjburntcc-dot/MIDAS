# Mission 029 value-gated execution: result and shared-contract repair

**Paid execution is blocked after one completed provider response and zero completed workflows.** The expenditure exposed a mismatch between the worker-visible deadline schema and the local validator. This is a shared specification defect, not demonstrated specialist inferiority. The exact defect is repaired prospectively and tested offline. No retry, W-006, team run, approval or fixture effect was performed.

## Verified execution and useful evidence

- Verified starting HEAD: `e39bb9ce0b87cfc6a512a5f71d3e4f18bec1dc14` on `codex/business-workflow-team-v0-029` in `C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-029`.
- Frozen live implementation commit: `4843ab6447f16aced53eeba5f51700b1dc26a6e8`.
- Frozen source hash: `4106dc9999c1aa6f28beee5ca9f0a882218803dd022abc803fc2c7db816af211`.
- Configuration hash: `a56649a379f05594ea78620fd95166df73dddf9af71200604bbc6db5e0443011`.
- Signed grant hash: `dfffefeb8722fdbde32daf1e1354fe5fa2fa48f08e5fda8977dd7f20af8118c9`.
- Attempt: `W-001-single-investigate`, finished `2026-09-11T20:22:58.951Z`.
- Exact request hash: `be23e358c924e97c395e0a35a8413da0c1eb6933c3c1dfa701bb2c8cd9081b8c`.
- Count and inference each returned HTTP200. Exact returned model: `gpt-6-astra`; request High/default. Current official pricing/route support was checked before dispatch.
- Count returned1,688 input tokens; conservative admitted input2,113 after margin, below8,192. Usage:1,688 input,1,667 output including reasoning, cached input0. Recorded attempt latency41,060ms, including count/admission; count latency1,565ms.
- The provider completed JSON output. Local status is failed with `WORKFLOW_OUTPUT_INVALID`; no accepted workflow output. No pending provider attempt or uncertain fixture effect remains.

The actual response formulates a request for cost and policy evidence and proposes conditional branches. These records were **requested, not retrieved**. It did not reach economic decision, initial business draft, review, approval, publication or inspection. The readable gallery therefore shows an information request and diagnostic evidence, not a usable business deliverable or template.

## Confirmed defect and prospective repair

The transmitted v1 deadline schema was `{type:'string',minLength:1}`. The local validator and underlying evidence adapter additionally required `Date.parse(deadline)` to succeed. Neither the schema nor worker brief exposed that representation requirement or supplied an appropriate timestamp. The model returned meaningful prose describing when evidence was needed; the complete preserved JSON passed every other investigate hard contract. Both integration and independent read-only review reproduced the sole rejection.

`synthetic-workflow-v2` / `workflow-context-v2` now supply `evidenceDeadline` derived from persisted run creation plus24hours. The worker-visible rule and schema explicitly require copying that value; the schema exposes UTC `date-time` and a timestamp pattern. Local checks reject prose, impossible calendar dates, noncanonical dates and offsets, and the runner checks exact equality before accepting success. This is a common task contract repair; the excellent single/team procedures remain unchanged. Official [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs) lists `date-time` and `pattern` support; the repaired route has not been tested live.

The actual failed JSON is retained unchanged in the development regression fixture `packages/foundry/test/fixtures/workflow-029-investigate-failure.json`. The test's corrected timestamp is explicitly synthetic and does not relabel the live output. The old signed grant and ledger are unchanged. A byte-preserved copy of the old source under the live root allows historical status/report reproduction after this prospective repair; new source refuses the old implementation hash.

Two other limitations are recorded without manufacturing failures: the required plausible-range numbers had no supplied evidence-based bounds, which the output explicitly noted, and high-touch outreach is modeled as an alternative although customer action is prohibited. All six original high-touch contributions are negative; neither observation caused this rejection or changes any original valid choice. Neither warrants inventing a specialist intervention.

## Configuration recommendation

The pre-observation audit found only role-framing suffixes distinguish the team from the strong single workflow. Both already have the same evidence, tools, stateless context and review opportunity. Call3 can revise/block the artifact but cannot revise the recorded business decision; call4 can inspect/report delivery problems but cannot repair or grant authority. Team spend was deferred before any live output.

**Retain the strong single configuration as the next configuration to test; its end-to-end sufficiency remains unmeasured.** Do not infer team benefit, learned team assembly, specialist superiority, reliability or customer value. The shared contract failure made broader dispatch uninterpretable, and the grant provides zero recovery admissions. Buying other episodes, another model or a verifier would not resolve this prerequisite.

The capability observation records only successful transport, structured JSON generation, durable usage/failure accounting, and the shared contract failure. It is experimental and non-production. Economic reasoning, artifact usefulness, correction, delivery verification, coordination and human effort remain unqualified. Approval and usability remain separate; no founder judgment or review time was invented.

## Accounting

| Quantity | Actual record |
|---|---:|
| Inference admissions / supporting counts | 1 / 1 |
| Completed workflows / fixture effects | 0 / 0 |
| Provisional conservative token-based inference cost | USD0.11 |
| Authoritative settlements recorded | USD0.00; no invoice evidence |
| Retained inference reservation | USD0.52 |
| Retained shared unpriced count buffer | USD5.04 |
| Total locally retained exposure | USD5.56 |
| Uncommitted USD30 allowance | USD24.44 |
| Remaining numerical admissions / counts | 47 / 47, conditional authority does not permit retry |
| Pending attempts / effects | 0 / 0 |
| Independent review/correction time | Unknown |

Actual billed charges remain unknown. Reservations are not spending. The USD0.11 estimate is contained within the USD0.52 reservation, not added to it. The count buffer is unpriced uncertainty, not a sourced fee. The conservative estimate uses the verified cache-write input ceiling rather than assuming a discount. See [Astra official pricing/support](https://developers.openai.com/api/docs/models/gpt-6-astra). No retained exposure was released. Historical Mission028 remains separate: USD8.71 retained, USD1.24 provisional within that amount, no transfer. Engineering/session/host costs and staffed hours are unmeasured.

## Artifacts and reproducible inspection

Live root: `C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-029/var/workflow-029-value-v2`.

- `reports/actual-investigation.html`: readable actual model request, conditional branches, defect and accounting.
- `diagnosis.json`: supported cause, output hash, sanitized HTTP/request IDs and uncertainty.
- `reports/capability-observation.json`: scope-limited, non-production capability evidence.
- `workflow.sqlite`: original durable attempt, business state and events, no counter reset.
- `workflow-after-failure.sqlite`: preserved completed-attempt snapshot, SHA256 `f776d61eab2975ee909ac83e65dd058a7847f7738c74afc674c9a9b33fd14714`.
- `frozen-runtime/src`, `frozen-runtime/manifest.json`: exact source used for the signed execution.
- `authorization.request.json`, `authorization.approved.json`, `authorization.json`, `authorization.provenance.json`: signed scope and user instruction provenance, unchanged.
- `preservation.json`: original proposal/receipt hashes and prior checkout identities.

Use the frozen implementation to inspect the actual historical account. These commands make no provider request:

```powershell
Set-Location C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-029
$old = 'var/workflow-029-value-v2/frozen-runtime/src/workflow/cli.ts'
$live = 'var/workflow-029-value-v2'
node $old status --root $live --run W-001-single
node $old value-report --root $live
```

The frozen generic value report's suggestion to run smoke is superseded by this diagnosis and the actual-investigation gallery: **no retry is authorized**. Do not run a new `prepare` or sign another grant to reset the account. New source is prospective; old runs must not silently inherit its repaired specification.

## Verification and preservation

Before dispatch,154 relevant tests passed, then the final additional profile-binding test and focused gate suite passed. Following the repair,43 workflow tests pass including actual-output regression, timestamp context/copy enforcement, all six offline cases/both configurations, release gates, process faults, authority, ledger competition, and report binding. Scoped strict semantic TypeScript6.0.3 check:0 errors,29 reachable source files, dependency declaration checking skipped. Earlier Foundry/experiment regressions passed; no dependency installation or optional platform expansion occurred. New mock successes are engineering evidence, not actual-model competence. The only actual-model observation is the failed first-stage output above.

Canonical remains `8d2c6b3db3fe5d1c63493e2774844eda0af013af`; Foundry027 `13edfb9796e7d5ed28b86935244ec9917840c0e4`; Mission028 `f6dce49150519ca5551d66ee0eb8a85624cf3c6b`, all clean. Original Mission029 proposal/completion bytes and the executed ledger/grant remain preserved. No campaign evidence, sealed identities, recovery finding-set, shared infrastructure or customer system was touched. No push, merge or deployment.

## One next capability experiment

The smallest useful next test is **one fresh repaired W-001 single workflow through all four stages**, with the explicit timestamp contract and the same strong procedure. It would determine whether the common implementation can support actual evidence retrieval, a useful reviewed artifact, exact founder approval and verified delivery. A pass would permit considering the already proposed W-006 injected-defect/reconciliation test; another shared failure would stop further spending and identify the next specific prerequisite. Neither result warrants a team comparison under the current cosmetic treatment.

Founder action needed before any new provider work: explicitly amend recovery authority for a fresh, linked workflow identity, at most4 inference admissions and4 counts, <=USD2.08 additional inference reservations **inside the existing USD30 total**, preserving the originalUSD0.52 reservation andUSD5.04 count buffer. Route, token limits, timeouts, concurrency and expiry stay unchanged. No such amendment is assumed, signed or executed here. Existing remaining counters do not by themselves authorize recovery. Billing evidence can be supplied separately; it will not make the failed output valid. No artifact approval or large review packet is required now because no artifact was produced.
