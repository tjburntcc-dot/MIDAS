# Mission 031 — execution-loop repair R2

Status: local implementation and offline verification; no new provider activity or competence result. The historical governing outcome remains `LIVE-RESULT-V4-R1.md`: incomplete engineering experiment, not a business rejection.

## Provenance and failure trace

Verified original executed checkout `foundry-worktree-031-handoff-r1`, branch `codex/portfolio-handoff-repair-v4-031`, clean HEAD `ff2e971da6c62d2a7a2a14a4d36acf67114b13d2`. Repairs are isolated in `foundry-worktree-031-finalization-r2`, branch `codex/portfolio-finalization-repair-v4-031`, from that exact base. Original code, requests, outcomes, candidates, grants and publication remain preserved.

The seven R1 admissions are `p031-8c77e4ad0e739a12-0` through `-6`. All provider responses completed. The original parent admission is separate and still consumed.

| R1 index | Calls remaining at request | Authoritative source shown, bytes | New proposed brief bytes | Feedback / action |
|---|---:|---:|---:|---|
| 0 | 7 | 20,542 | 20,447 | Replacement rejected over 18,000 |
| 1 | 6 | 20,542 | 19,148 | Replacement rejected; latest rejected text absent |
| 2 | 5 | 20,542 | 19,240 | Replacement rejected; latest rejected text absent |
| 3 | 4 | 20,542 | 18,473 | Replacement rejected; latest rejected text absent |
| 4 | 3 | 20,542 | 17,908 | Replacement accepted; latest rejected text absent |
| 5 | 2 | 17,908 | — | Current deterministic checks passed |
| 6 | 1 | 17,908 | — | Authenticated local publication succeeded |

Every request identified the original source and its hash, the 18,000-byte rule, current remaining calls, and `afterWriteReserve:3` for check → publish → complete. Later requests included rejection size/error feedback but did not include the latest full rejected candidate or a separately addressable repair target. No executable finishing-feasibility gate prevented the fifth write from entering a state that needed three more decisions with only two left. Publication exhausted the cap before the separate completion response; no build-or-stop judgment, application, product review or operating delivery was executed.

`tools/audit-portfolio-r1.mjs` compares each canonical Responses and count payload against its actual admitted digest. The database retains exact structured request/schema/route and hashes; it does **not** claim separate retained wire bytes. Audit exports are explicitly hash-verified reconstructions, not invented original files. Complete trace and feedback: `var/finalization-repair-audit/seven-admission-trace.json`.

## Shared repair, not a larger limit

`workspace.replace` rejects oversized content without changing the accepted files, checks, publication or workspace revision. It retains the complete candidate and its hash, base-source hash, base-manifest hash and rejection evidence in scoped immutable records. Context identifies the active rejected target separately from authoritative source. When full content cannot fit, an explicit chunk reader exposes the complete candidate without silent truncation.

`workspace.patch` applies at most 12 literal, uniquely matched edits to an exact source/candidate hash. Candidate bases must still match the current manifest. It cannot evaluate code or infer a repair. Optional `compact-json` is explicitly selected by the worker, preserves the model-edited proposal separately from deterministic serialization, and rejects unsafe integer conversion. Empty edits are allowed only for that explicit serialization. New writes retain all existing acceptance checks.

Feedback measures raw UTF-8 `brief.json` bytes (18,000 for research/service, 9,000 for operating) and the JSON-serialized source-file array for software (24,000). It reports exact excess bytes and an 85% target. These are downstream context allowances, not provider token estimates. Outer JSON escaping, combined context and complete-payload token admission are checked separately. Historical acceptance is unchanged; no artifact is silently shortened.

All four historical rejected drafts are regression inputs unchanged. Their explicitly compacted JSON sizes are 19,585 / 18,950 / 18,334 / **17,653** bytes. In the offline replay, four rejected writes, one explicit whitespace-only patch of the fourth candidate, and one finalization submission complete within six decisions. This shows a usable repair mechanism, not evidence that a live model will choose it. The actual historical accepted 17,908-byte brief is not replaced by this fixture result.

## What completion still means

Legacy completion checked current checks/publication/readback, published the portfolio artifact, propagated dependent bindings, and recorded outcome feedback. Its `reason` also supplied the worker's summary; software review requires substantive fitness judgment. The separate build-or-stop and later reassessment proposals are consequential model decisions and remain model-driven.

Under versioned `bounded-finalize-v1`, `complete` is the worker's explicit current-source submission with rationale and limitations. A bounded controller operation performs current checks, authorized **local** publication, authenticated readback, artifact registration and task closure, recording each phase and unresolved obligations. It does not declare independent semantic acceptance, customer usefulness or demand. Failed checks return actionable feedback.

For software, current browser/DOM observations must have been supplied to the worker before publication. An early completion request executes checks but returns a review-required state. The next response must assess that actual evidence; it may correct source, complete unchanged or block. Successful deterministic publication is never substituted for this judgment. Current browser evidence remains in context despite intervening reads.

Before a fresh admission, the controller computes a minimum finishing path from actual source/check/publication state and remaining ordinary/local-tool capacity. A valid service needs one submission; an invalid service needs at least repair + submission; blank/failed software needs at least edit + browser observation + reviewed submission. Insufficient capacity is recorded before another admission. Held recovery is not ordinary repair capacity; no task borrowing or retries are introduced. These are lower bounds, not guarantees of model success.

Stable phase-specific tool identities and durable results make interruption recoverable. Unknown model completion cannot be resubmitted. A committed publication is recovered by readback; source changes fail stale checks. Recovery of an already atomically closed task only completes its finalization receipt, never repeats execution.

## Remaining engineering execution

The fresh continuation imports the authenticated 17,908-byte publication as a historical input artifact. It leaves the original investigation **blocked**, and does not invent its missing completion decision. The new decision receives the accepted report, preserved sources and current prospective product contract, and retains authority to reject the build. No investigation admissions or hosted searches are proposed.

| Stage | Ordinary ceiling | Minimum useful path under repaired protocol |
|---|---:|---|
| Build-or-stop | 1 | Actual model decision from preserved research; rejection cancels dependents |
| Implementation | 10 | Unseeded source edit → real browser checks → reviewed submission; remaining capacity for observed repair |
| Product review | 6 | Actual authoritative source/checks → current browser observation → review submission, or targeted correction + recheck |
| Operating deliverable | 6 | Produce complete contract-bound packet for actual reviewed product → finalize; repair if needed |
| Reassessment | 1 | Actual model allocation decision from delivered evidence and obligations |
| Held recovery | 2 | Existing known-incomplete eligibility only; fresh linked identities, no uncertain/access retry |

The illustrative no-defect lower bound is nine ordinary decisions across these stages; it is not a live estimate. All 24 ordinary caps remain independent. The proposed 26 total admissions/counts reserve at most $31.98 new, plus $13.84 historical retained once = $45.82 combined, leaving $6.00 outside the new proposal and under the original $51.82 ceiling. No allowance is released because a provisional estimate is lower than its reservation.

The preserved operator-interview package remains a separate commercial opportunity. It is not a prerequisite or substitute for this engineering result.

## Verification and limits

Focused tests exercise preserved candidates, exact Unicode sizes, literal repair, stale candidate/source rejection, check failure, finishing shortage, current browser review, real process exit after committed publication and safe resumption. Positive and rejecting continuation integrations, authority limits, browser owner journey and scoped semantic typecheck are recorded in the final handoff after completion.

Mobile report rendering wraps long evidence IDs/URLs. The workspace surfaces authenticated locally published artifacts even when task closure is blocked and no portfolio artifact row exists. Read-only view entries do not alter historical evidence or imply semantic acceptance. Raw original publication downloads remain unchanged.

No new provider/count requests, credential access, signatures, external actions, metered cost or independent human correction measurements occur during this repair. Offline mocks cannot fall through to a provider. Live model success and product quality remain unmeasured until separately authorized execution.

## Route and reservation evidence (checked 2026-09-13)

Official [Astra documentation](https://developers.openai.com/api/docs/models/gpt-6-astra) lists Responses, strict structured outputs and max reasoning. Published per-million rates are $10 input, $12.50 cache-write input and $50 output. The unchanged conservative reservation prices all 32,768 admitted input tokens at the cache-write rate, plus 16,384 output/reasoning tokens: `ceil((32768*12.50 + 16384*50)/1000000*100) = 123 USD cents`. It remains below the existing per-attempt ceiling. Default service tier, no fallback and finite existing deadlines remain pinned. [Responses documentation](https://developers.openai.com/api/reference/python/resources/responses/methods/create) defines output capacity as including reasoning tokens; request construction uses the retained Responses bridge and strict JSON schema.

No new account-access probe has been made. Prior successful requests establish historical access only. The documentation does not establish a distinct immutable Astra snapshot for this route; exact returned identity and times remain required, without claiming immutability. Token-count exposure is still an unpriced $4 reserve, not an asserted provider fee or settled bill. No subscription usage is treated as API credit.
