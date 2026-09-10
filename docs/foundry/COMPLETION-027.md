# MIDAS Foundry Loop v0.1 — Mission 027 completion packet

**Result:** complete runnable Section M synthetic laboratory, locally implemented and committed. All 18 applicable engineering acceptance conditions have fixture/state evidence below. Actual-model responsiveness, measured role improvement and commercial value remain unmeasured. The supplied architecture is a specification; its resource estimates and proposed expenditures were not treated as spending authorization.

## Verified base, mission mapping and delivery

| Item | Verified value |
|---|---|
| Canonical repository | `C:\Users\14844\Downloads\MIDAS` |
| Canonical branch | `feature/opportunity-qualification-sealed-grouping-authority-v1` |
| Canonical base and preserved HEAD | `8d2c6b3db3fe5d1c63493e2774844eda0af013af` |
| Origin | `https://github.com/tjburntcc-dot/MIDAS.git` |
| Provenance | Exact match to the user's supplied state; canonical working tree clean at preflight and completion audit |
| Dedicated worktree | `C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-027` |
| Dedicated branch | `codex/foundry-loop-v0-027` |
| Mission mapping | Proposed `MIDAS-FOUNDRY-LOOP-V0-017` → implemented `MIDAS-FOUNDRY-LOOP-V0-027`; mission sources 17/18 and checkpoints 19–26 were already present |
| Implementation HEAD before completion documentation | `d80b065e5223949eb170bb6935309a9947dc6979` (`fix(foundry): keep administrative labels out of model prompts`) |
| Final HEAD/status | The final post-commit [local completion receipt](../../var/foundry-completion-027/completion-receipt.json) and completion response record the exact final commit and clean Git status; a commit cannot embed its own hash |
| Source architecture | 977 lines read; SHA-256 `b445289ff9113be8f9621341179468629ba59298049035750107126b35a01b21` |

Local commits were kept by concern: support laboratory, learning gate, integrated durable loop, process fault tests, readable source formatting, authority/reconciliation hardening, bounded model bridge, and documentation/evidence. No push, merge, deployment, customer action, real campaign evaluation, unblinding, certification, evidence reconstruction or shared-infrastructure change occurred. Supporting implementation worktrees remain separate from the canonical checkout; the main worktree contains their reviewed local changes.

All changed files are new files under `packages/foundry/` or `docs/foundry/`. The exact list is in [changed files](evidence/changed-files.txt) and the final receipt. No existing application, campaign, trust-root or recovery file was changed. Native Node avoids installing dependencies or changing the package lock.

## Inventory and runtime decision

The full answers to all **eight Section N questions**, relevant source/symbol references, instruction files and observed capabilities are in [INVENTORY-RUNTIME.md](INVENTORY-RUNTIME.md). They were reported to the user before code changes. In brief:

| Question | Finding and resulting choice |
|---|---|
| 1. Base and governance | Exact clean supplied base; read repository development/Windows/handoff and Mission 016 governance references; preserve campaign-recovery namespace |
| 2. Runtime and tests | TypeScript/ESM, Node 24.19.0, installed pnpm 11.19.0 versus declared 9.15.4, Node test runner; handwritten validation; no dependency install |
| 3. Durable runner | Existing FileStore conductor has plans, waits, retries and cancellation; lacks the required cross-record atomic effect/budget boundary |
| 4. Persistence and versions | Existing app remains FileStore; new isolated native SQLite 3.53.3 domain/service stores, schema version 1, immutable hashed records and scoped artifacts |
| 5. Model/usage interfaces | Existing provider/cost/routing/spend primitives inspected; new scoped ModelPort and bounded Responses bridge with offline tests, no actual call |
| 6. Authority/isolation | Existing content/revision-bound approvals and workspace checks informed exact authenticated fixture grants, atomic reservations and signed service receipts |
| 7. OQ public interfaces | Public qualifier/worker contracts are source references; no broad eval barrel dependency or governed campaign invocation |
| 8. Local capabilities | Native processes/SQLite/loopback HTTP available; no Docker/psql/database service found, WSL not verified; no live API spend authorized |

**Selected runtime:** a finite controller with native SQLite WAL, `synchronous=FULL`, a bounded busy timeout and synchronous `BEGIN IMMEDIATE` transactions. The separate fake business service also persists to SQLite. Actual process-kill and competing-process tests establish the required local behavior. Temporal was not evaluated or installed: the user's clarification made it provisional, and this smaller implementation met the observable requirements. There is no general scheduler or orchestration-framework stack.

The controller records dispatch intent and reserves money before the external call. Restart reconciles an unresolved intent instead of repeating it. The service returns idempotent signed receipts, and an authenticated absence atomically seals an idempotency key against a late dispatch. Each run pins a persisted service identity before dispatch; a substituted database is refused even with the same credential. This is a one-host laboratory, not multi-host workflow durability or a guarantee of exactly-once effects for arbitrary external APIs.

## Run it and inspect the actual episodes

Use the full working PowerShell sequence in [packages/foundry/README.md](../../packages/foundry/README.md), including setup, run, inspect, exact approval, resume, evaluator decision and report. The compact reproducible path is:

```powershell
Set-Location 'C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-027'
node --test packages/foundry/test/*.test.ts packages/foundry/src/lab/*.test.ts
node packages/foundry/tools/acceptance-demo.mjs var/a-fresh-foundry-demo
```

No install is needed. The demo requires a fresh/empty root and invokes the authenticated CLI repeatedly in separate processes. The executed acceptance root is `var/foundry-completion-027`. Its [summary](evidence/acceptance-summary.json) records all six runs, timestamps, raw report hashes and normalized hashes.

| Executed episode | Observed result | Reviewable evidence |
|---|---|---|
| `LAB-001` | Requests missing cost evidence; high-touch contribution −145 USD minor units, limited playbook +162; assigns one operator, waits for exact approval, delivers billing-status artifact, independently verifies receipt/tickets and discharges obligation; learning decision inconclusive | [Full report](../../var/foundry-completion-027/reports/lab-a/support-a/LAB-001/report.json), [delivered artifact](../../var/foundry-completion-027/reports/lab-a/support-a/LAB-001/artifact.json) |
| `LAB-002` | Cost evidence changes limited-playbook contribution to −15; both interventions negative, selects no-action, records justified rejection outcome; zero action/approval/delivery cost | [Rejected report](../../var/foundry-completion-027/reports/lab-a/support-a/LAB-002/report.json) |
| `LAB-003` | Service applies an effect then times out; action unknown and 25 minor units reserved; resume confirms the original single effect and settles once; candidate rejected | [Before reconciliation](../../var/foundry-completion-027/evidence/uncertain-before.json), [final report](../../var/foundry-completion-027/reports/lab-a/support-a/LAB-003/report.json) |
| `LAB-004` | Independent fixture evaluator produces a passing mechanical result; authenticated promoter selects operator 2; later rollback decision restores operator 1 | [Promotion and rollback records](../../var/foundry-completion-027/reports/lab-a/support-a/LAB-004/report.json) |
| `LAB-005` | New run after promotion records operator 2; its provenance still says 2 after rollback | [Pinned report](../../var/foundry-completion-027/reports/lab-a/support-a/LAB-005/report.json) |
| `LAB-006` | New run after rollback uses operator 1 and completes; normalized fixture result equals `LAB-001` while raw identity differs | [Post-rollback report](../../var/foundry-completion-027/reports/lab-a/support-a/LAB-006/report.json) |

Run reports include BusinessSnapshot → InformationRequest → EvidenceBundle → DecisionRecord → TaskPlan/role references → ActionProposal → AuthorityGrant → ActionReceipt → artifact/OutcomeRecord → learning candidate/evaluation/promotion decision links. The returned model note alone cannot verify delivery. The task plan has one accountable analyst coordinator, one eligible operator and a separate verification task. A missing competency produces `waiting_specialist`, not a fabricated credential.

Fixture manifest: `src/lab/support.ts` exposes `fixtureManifest`, included by CLI setup, with worlds `viable`, `rejection`, `missing`, `conflict`; support policy v1 is superseded by v2. Model tape `script-v1`, role versions and data policy `lab-policy-v1` are recorded. The environment's fixed evidence timestamps are fixture facts, not current service time. Task/approval deadlines use runtime time. Scenario truth and verification tickets are kept outside worker input; tape selection is openly deterministic and never presented as reasoning.

## Acceptance matrix

All files below are under `packages/foundry` unless identified as adjacent checks. Assertions inspect persisted state, actual fixture effects, artifact content, cost reservations or failure behavior.

| Section M condition | Evidence and observable result |
|---|---|
| Complete viable episode | `test/episode.test.ts` complete episode plus CLI demo; linked records, artifact, one effect, verified pass, four fixture model calls, final learning decision |
| Valid rejection | Negative contributions from retrieved facts, no delivery proposal/action, known zero delivery cost and persisted rejection outcome |
| Changed hidden fact | `src/lab/support.test.ts` and episode mismatch test exercise both cost worlds; a viable tape against negative-cost evidence is refused by independent arithmetic validation. Actual-model action sensitivity is deferred to F2 |
| Missing/contradictory evidence | Both worlds retain missing/conflicting evidence, qualified blocked decisions, no proposal and no grant |
| Smallest team | One operator selected by declared competency/tools; unavailable competency records explicit specialist/human requirement |
| Approval enforcement | `test/authority.test.ts`: missing, expired, revoked, wrong tenant/payload, stale state/policy, substituted role/task/tool, review limit and task deadline all refuse effects |
| Concurrent budget | Two independent child processes compete for a 25-minor-unit cap; exactly one reservation wins; sum of spent/reserved stays at cap and losing denial persists |
| Restart | `test/process.test.ts`: kill/restart at decision checkpoint and approval wait; kill after dispatch intent; kill worker and service after effect but before local receipt; state/obligation/budget consistent |
| Unknown side effect | Timeout yields unresolved action, held reservation and readback reconciliation; one external effect and one dispatch attempt; fresh service identity is refused |
| Failure classification | Transient reads retry within two-attempt bound with failed-attempt events; exhaustion survives resume; denied authority is not automatically retried; ambiguous writes reconcile |
| False success | Forged/unsigned receipt or swapped receipt ID rejected; missing artifact and surviving obligation produce persisted failed outcome despite a worker completion claim |
| Tenant isolation | Cross-tenant state/evidence/artifact reads fail; compiled contexts/overlays/cache keys include scope and permissions before retrieval; tenant secrets do not cross |
| Injection boundary | Injected source instruction cannot grant authority, inflate cap or change policy; model has no credential/grant capability |
| Economic accounting | Failed reads and model attempts, reserved/unsettled/settled costs, synthetic review time, refunds and obligations remain visible; modeled savings distinct from collections/revenue; unknown/provisional cost never silently zeroed |
| Learning control | `test/learning.test.ts`: proposer/evaluator/promoter separation, immutable source/evaluation references, denied authority and tamper detection; rejected/inconclusive candidates leave incumbent unchanged |
| Promotion/rollback | Authenticated fixture promotion selects declared successor; stale incumbent cannot promote; rollback affects new runs only; historical version numbers/provenance retained |
| Reproducibility | Two independent runs compare equal under explicit semantic normalization; raw run hashes differ. Manifest labels exclusions rather than claiming byte-for-byte replay |
| Campaign separation | New-file prefix audit, clean unchanged canonical checkout, 57 protected hashes, 31 committed-range paths, four grouping companion copies, selected synthetic adjacent checks; missing finding artifact stays a recovery blocker |

There is no omitted applicable fixture acceptance condition. The actual-model portion of changed-fact behavior and all intelligence/commercial conclusions are expressly untested. No model-driven campaign or certification test was substituted for these fixtures.

## Test results and preservation evidence

| Verification | Result |
|---|---|
| Final Foundry suite | **44 passed, 0 failed**, one suite, about 3.00 seconds; [exact output](evidence/foundry-tests.txt) |
| CLI acceptance demo | Six runs validated through setup/run/approve/resume/evaluate/decide/report/rollback; [timed summary](evidence/acceptance-summary.json) |
| Relevant adjacent regression | **26 passed, 0 failed** after explicitly excluding historical-LSE test; [exact output](evidence/adjacent-tests.txt) |
| Historical LSE isolated-base check | **5 passed, 1 failed** at the exact unchanged base because it expects historical records in live FILE_STORE; [baseline output](evidence/baseline-isolation.txt) |
| TypeScript syntax | 20 files, compiler 6.0.3, zero parse diagnostics; [syntax record](evidence/syntax-check.json). No full semantic typecheck was performed |
| Campaign preservation | 57/57 snapshot hashes match, 31 committed-range files unchanged (88-path union); 4/4 original/recovery grouping companion hashes match; canonical HEAD and clean status preserved; [audit](evidence/campaign-preservation.json) |

The adjacent command was:

```powershell
node --import ./tools/register-ts.mjs --test --test-skip-pattern 'historical LSE' packages/eval/src/opportunity-qualification-secondary-governance.test.ts packages/eval/src/opportunity-qualification-sealed-grouping-authority.test.ts packages/eval/src/restart.test.ts packages/eval/src/isolation-structural.test.ts
```

Node's filter excludes the historical case from its 26-test count (it does not count it as a skipped pass). Without the filter, the original adjacent run had 26 passes and that one failure. A separate detached worktree at exact base `8d2c6b3...` reproduced it. No private historical records were imported to change the result. Older tests that read real campaign files, use sealed identities/scorecards, or generate campaign artifacts were not run. This is a selected regression run, not a claim that the entire repository test suite passed.

Grouping authority hash remains `6fced7d4e29064c61cb94f899eb4fe6039af50cc1f605af7c598113baa0f9515`; validation-manifest hash remains `0ac252d90a8bbb1075d652fc4faa9bf5c292e1fd1e8e217898488dedfdc009b9`. Only allowed integrity hashing was used; no campaign payload was parsed for Foundry. The original finding-set artifact with expected hash `352f9426058c3dc85a6ebe26ed4fa6e51b759e4732d6c329adaed16ad324bca0` remains **known missing according to the recovery record**, un-reconstructed and outside this mission's dependencies. Recovery decision semantics/trust roots are unchanged.

## Costs, effort and practical limits

The executed acceptance demo settled **125 simulated USD minor units** for five deliveries against a **500-unit simulated business cap**, with zero final reservation. Each delivered episode has a 25-unit fixture charge and two synthetic review minutes. The rejection has no action charge. Four model calls per delivery plus two for rejection give **22 deterministic ModelPort calls**, zero token/provider cost. The demo's ten review minutes are fixture values, not measured human review. Simulated bookings, collections, recognized revenue, refunds, obligations and modeled customer savings remain separate fields; no actual revenue/value claim follows.

**Actual runtime provider/API spend: USD 0.** No live call or paid service/install was made. Engineering labor hours, founder hours, reviewer valuation, development-session model dollars and host/resource cost were not measured and are reported as unknown/null. The tool-observed task wall interval and demo/test durations are recorded as elapsed time only in the final receipt/summary. Parallel AI work is not converted into staffed engineering hours. The architecture's 56–88 hours remains a planning estimate and is not an observed result.

The lab is a local application trust boundary. Credentials and SQLite files belong to the OS user; it does not defend against arbitrary code with that user's filesystem access. It has no distributed scheduler, production IAM, multi-host failover or untrusted-plugin sandbox. App-level scope checks do not certify secure isolation for real confidential evaluation labels. Reconciliation relies on this fixture service's authenticated idempotency/absence contract; general external APIs need their own evidence rules. Unknown cost remains held, including an unexpectedly excessive bill, until a separately designed reconciliation path resolves it. A process lost during a model call can leave an explicit pending/uncertain attempt; there is no live-provider retry/recovery policy enabled here. Failed/blocked/specialist runs need a fresh authorized plan rather than an invented automatic remedy.

## Exact next mission/input

[F2-HANDOFF.md](F2-HANDOFF.md) specifies the operator task, fair strong baseline, proposed specialization, protected case splits, costs/quality/correction-time/failure instrumentation and decisions to freeze. It also documents the usable `ModelPort` and supported Responses transport, mock-test evidence, credential source, sourced pricing, input/output/deadline limits and atomic model-budget callback requirements.

Next proposed mission: **`MIDAS-FOUNDRY-ROLE-BASELINE-V0-028`**, after rechecking allocation. Required next input is an approved experiment specification: rights-cleared case population and reviewer/custodian; frozen baseline/candidate/rubric/splits and promotion criteria; explicitly authorized API project/model route and credential-access method; verified rate source/effective date, token/deadline limits and maximum smoke/experiment currency exposure; and available measured reviewer time. Mission 027 does not authorize this spend or run the follow-on experiment. Fixture learning results establish the gate mechanics only; a measured improvement decision requires that real-model comparison.
