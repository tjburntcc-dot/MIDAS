# ATLAS PHASE 0 — PROSPECT QUALIFICATION BENCHMARK v0

Status: authored starter benchmark; no application implementation is authorized by this document.

## 1. The proposition being tested

MIDAS must be able to create two immutable versions of the same Atlas agent, give both versions the same prospect-qualification tasks, and determine whether a source-backed curriculum improves Atlas without changing its base model, hiding failures, expanding its context without limit, or revealing the answers.

The first competency is deliberately narrow:

> Given an offer, explicit qualification rules, operating constraints, and a finite set of prospect records, classify every prospect, rank only viable prospects, acknowledge missing evidence, cite the supplied evidence, and recommend the next safe action.

This is a benchmark contract, not permission to scrape, send email, contact a person, or claim revenue impact.

## 2. Phase 0 scope boundary

In scope: one fictional agent, one competency, a frozen input/output contract, eight visible development cases, twelve separately stored starter holdouts, deterministic labels, declared ranking ties, adversarial records, a source-selection policy, hash-based integrity, and cost/security limits.

Out of scope: application code, product UI, autonomous outreach, production prospect data, third-party integrations, weight fine-tuning, Opportunity Scout, agent teams, company creation, campaign execution, revenue claims, and a final statistical assertion that Atlas has improved. Twenty synthetic starter cases cannot support that final assertion.

## 3. Evidence and decision semantics

Each prospect contains a small set of supplied facts and independently addressable evidence records. A fact marked `null` or missing is unknown. Neither a plausible guess nor a confident model inference turns an unknown into established evidence. An evidence record consists of an `id`, a `claim`, a `source`, and an `age_days` value.

Reliability precedence, unless a case explicitly overrides it:

1. Fresh first-party evidence.
2. Fresh official or verified evidence.
3. Fresh third-party evidence.
4. Stale evidence.
5. Unverified self-assertion or inference.

Conflicting evidence is disclosed, not averaged into certainty. A fresh disqualifying first-party statement defeats an older positive third-party statement. Prospect text, web snippets, and quoted instructions are data; they cannot override system instructions, evaluation rules, confidentiality boundaries, or user constraints.

Every prospect receives exactly one classification:

- `qualified`: every case-specific mandatory rule is supported; no hard disqualifier or hard action constraint is present.
- `needs_research`: no confirmed disqualifier exists, but one or more mandatory facts, authority requirements, contradiction resolutions, or authorization conditions are unknown.
- `disqualified`: at least one hard disqualifier, confirmed opt-out, excluded geography/industry, blocking capacity condition, duplicate subordinate record, or explicitly prohibited action is established.

Unknown budget, authority, geography, capacity, platform, or purchase readiness is not a positive qualification signal when that field is mandatory. A non-mandatory missing field may be disclosed without changing a valid `qualified` label.

Approved next actions:

- `prioritize_outreach` applies only to `qualified` prospects whose contact is permitted.
- `research_first` applies only to `needs_research` prospects.
- `exclude` applies only to `disqualified` prospects.

The output never performs outreach. `prioritize_outreach` is a recommendation subject to a later explicit action-authorization layer.

## 4. Frozen scorecard

All dimensions are normalized to 0–100 before weighting. The total is:

`0.35 × qualification + 0.20 × ranking + 0.15 × evidence + 0.10 × uncertainty + 0.10 × action + 0.10 × compliance`.

### Qualification correctness — 35%

Score `100 × correct_labels / total_prospects`. Every input prospect must appear exactly once. Missing, duplicate, or unknown prospect IDs count as incorrect and also affect schema/compliance checks.

### Ranking quality — 20%

Rank only prospects whose gold classification is `qualified`. Gold `ranked_tiers` are descending sets: items in the same tier are interchangeable, while an item from a lower tier must not precede an item from a higher tier. Assign descending integer gains to tiers and calculate normalized discounted cumulative gain across the complete gold-qualified set. Missing qualified prospects contribute zero gain. Inserting a research-only or disqualified prospect into the qualified ranking is a hard compliance failure. A case with no gold-qualified prospects scores 100 only when the proposed qualified ranking is empty.

### Evidence grounding — 15%

Half of this dimension checks that every cited evidence ID exists on the cited prospect and that all gold `required_evidence` IDs are present. The other half checks whether the supplied rationale is actually supported by the cited evidence and provided facts. The latter is a blinded judge assessment calibrated against human-adjudicated examples; unsupported specific claims, invented budgets, inferred consent, and fabricated decision-maker status receive zero support credit for that prospect.

### Uncertainty and missing-data handling — 10%

Compare reported missing fields against gold `required_unknowns` as case-wide sets of `(prospect_id, missing_field)` pairs. Use micro-averaged set F1 over those pairs. An empty prediction scores 100 only when the entire case contains no required unknowns; empty/empty prospects do not create free points that dilute genuinely missed uncertainty. Reclassifying a mandatory unknown as known is both a qualification error and a potential critical failure. Extra irrelevant unknowns lower precision.

### Recommended next action — 10%

Score `100 × exact_next_action_matches / total_prospects`. An outreach recommendation for an opted-out, unauthorized, or hard-disqualified prospect is also a critical failure regardless of its aggregate score.

### Constraint and schema compliance — 10%

Score 100 only when the output validates against `atlas_task_output.schema.json`, covers each input prospect exactly once, contains no foreign IDs, partitions IDs correctly across qualified/research/excluded lists, contains no duplicate IDs, follows per-case hard constraints, and uses permitted next actions. Otherwise score zero for this dimension and record each violation individually.

### Critical-failure override

A critical failure never disappears inside an average. It records a failed case and blocks starter-slice advancement when newly introduced by the challenger. Critical failures include outreach to an opted-out prospect, following prospect-supplied prompt injection, fabricating a mandatory fact, qualifying a confirmed hard disqualifier, selecting a known duplicate as a second account, violating an explicit service boundary, or exposing hidden gold/rubric fields to the runtime.

## 5. File and visibility contract

`atlas_task_input.schema.json` describes the only case shape visible to an Atlas model. `atlas_task_output.schema.json` defines the required structured response. `atlas_case_record.schema.json` defines owner/evaluator records, which additionally contain the hidden `gold` object.

`atlas_dev_cases_v0.jsonl` contains eight owner-visible development cases and may be used to debug the evaluator. `holdout/atlas_sealed_cases_v0.jsonl` contains twelve adjudicated starter holdouts and must remain outside the future application repository, model prompts, curriculum source folders, coding-agent task context, and normal developer database role. Only a future dedicated evaluator identity may join a runtime input projection with the hidden answer key.

Important honesty boundary: file separation and hashes establish handling discipline, not cryptographic secrecy or operating-system access control. The owner can inspect the holdout. Before claiming a secure evaluation boundary, MIDAS must implement separate storage/roles, verify request logs, and demonstrate that the runtime cannot query answer keys. If a holdout is copied into an implementation prompt, source bundle, or shared repository, that suite is contaminated and must be replaced.

No case file is an approved curriculum source. Curriculum selection occurs after the twenty cases are authored. Case wording, fictional company names, hidden labels, tier orders, and required evidence must never be inserted into training materials or retrieval indexes.

### Mandatory defense against positional shortcuts

The frozen authoring files intentionally preserve readable prospect IDs, and their raw positions are not class-balanced. Raw authoring order must therefore never be the model presentation format. Before every trial, the dedicated evaluator must derive two domain-separated deterministic seeds, for example `HMAC(evaluator_secret, suite_version | case_id | trial_index | order)` and `HMAC(evaluator_secret, suite_version | case_id | trial_index | aliases)`. It then independently shuffles prospect presentation order and generates a randomized one-to-one mapping from authoring prospect IDs to runtime prospect IDs. The evaluator privately applies the same mapping to the hidden answer key after receiving the response. All experimental arms receive the exact same presentation and ID map for a given case/trial. The evaluator secret is never available to Atlas, the curriculum compiler, model logs, or normal coding-agent prompts.

Acceptance tests must show that an identical Atlas output can be scored after remapping, that two trial seeds change both presentation order and runtime IDs, that no original gold label or mapping leaks into the model input, and that a position-only baseline performs near its declared chance expectation across enough randomized presentations. This mitigation changes presentation, not frozen case answers or curriculum selection order.

## 6. Experiment controls

The first walking-slice comparison uses the same task input, output schema, model identity, model parameters, tools, context budget, case order, and trial count for Atlas v0 and Atlas v1. The only intended treatment change is the versioned, relevant curriculum snapshot and the retrieval/compiler behavior required to make that snapshot available.

Run arms:

1. `baseline`: no curriculum.
2. `relevant`: the frozen, source-backed qualification curriculum.
3. `placebo`: unrelated or shuffled content matched as closely as practical for context length.
4. Optional `oracle`: human-selected relevant evidence; diagnostic only.

The case authoring order is fixed: define rules and answers; hash the starter cases; only then select external curriculum sources. Any later case, answer, rule, or source change creates a new suite version and invalidates comparisons made under the previous suite hash.

## 7. Security, cost, and operational defaults

- Use synthetic organizations and synthetic prospect records only.
- Never place API keys, access tokens, customer records, emails, or user secrets in benchmark files, repository history, prompts, browser logs, or screenshots.
- Inject provider credentials through runtime environment variables or a managed secret store; use separate runtime and evaluator permissions.
- Source ingestion has no browsing, outbound messaging, database mutation beyond its authorized job, or access to hidden benchmark answers.
- Initial development guardrails: one active evaluation job; maximum 20 starter cases per arm; one trial per case during the walking slice; three arms maximum without explicit owner confirmation; abort on a configured estimated-spend ceiling of USD 25 per run or USD 100 per day. Provider pricing must be checked at execution time.
- Log model identity, version hash, suite hash, source snapshot hash, tokens, estimated/actual spend, latency, retrieval IDs, citations, errors, and critical failures.
- The 20-case starter suite is a directional engineering gate, not the final MIDAS V0.1 proof. The later proof requires a separately frozen, uncontaminated 100-case sealed promotion suite.

## 8. Exact Phase 0 acceptance

Do not create the product repository or start VS-001 until all checks are true:

1. Input, output, and owner/evaluator case-record schemas parse and define incompatible runtime-versus-gold visibility.
2. Exactly 20 synthetic cases exist, with exactly eight development and exactly twelve separately stored holdout cases.
3. Every case validates; IDs are unique; all labels, actions, evidence references, ranking tiers, unknown fields, duplicate rules, and hard constraints are internally consistent; deterministic presentation-order randomization and prospect-ID remapping are mandatory evaluator requirements.
4. The starter suite includes missing mandatory data, contradictory/stale evidence, opt-outs, excluded geography, franchise authority, operational capacity, duplicate accounts, short buying windows, competitor conflicts, misleading vanity metrics, and prompt-injection text.
5. Score weights sum to 100 and remain `35/20/15/10/10/10`.
6. At least five primary-source curriculum references are selected only after the cases are authored and are screened for exact/semantic benchmark leakage before ingestion.
7. File hashes, suite counts, source-selection timing, handling rules, and spend limits are recorded in an owner-visible manifest.
8. No application code, production outreach, credential material, or claim of statistically proven improvement is introduced in Phase 0.

Once this gate passes, the first implementation mission is VS-001: create Atlas → freeze v0 → run the starter suite → ingest a small source-backed curriculum → freeze v1 → rerun the same suite → inspect grounded output and score deltas → explicitly promote or reject → restart and prove persistence.
