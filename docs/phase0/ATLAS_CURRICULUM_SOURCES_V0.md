# ATLAS STARTER CURRICULUM — SOURCE SELECTION v0

Selection order is binding: the eight development cases and twelve holdout cases were authored before any source in this pack was searched, selected, or added to the curriculum shortlist.

Pre-selection case hashes:

- Development cases: `2092f8da53aa8d5b804fc45f10992e1b16c56a1b1d7f062e3c97f3f7e6284887`.
- Sealed starter cases: `02cd27c709014cea539d1a89aa6e126cfb8b60f3a58543968dba93993be17bca`.

These are source references, not yet ingested immutable snapshots. Before compiling Atlas v1, preserve the fetched source bytes, retrieval date, title, publisher, URL, parser version, content hash, and section/span coordinates. If an external page changes, capture a new source revision; never silently treat a changed web page as the same curriculum snapshot.

## Core qualification curriculum

### SRC-001 — Fit versus engagement scoring

- Publisher: HubSpot.
- Reference: [Build lead scores to qualify contacts, companies, and deals](https://knowledge.hubspot.com/scoring/build-lead-scores).
- Knowledge to extract: distinguish structural ICP fit from demonstrated engagement; define fit criteria with explicit account properties; assign higher weight to stronger behavior; decay stale engagement; separate account suitability from activity level.
- Exclusions: product-navigation instructions, HubSpot-specific automation setup, vendor sales copy, and examples or identifiers overlapping benchmark cases.
- Why it matters: a highly engaged but structurally excluded prospect must not outrank or become a valid account solely because it appears interested.

### SRC-002 — Explicit score/grade qualification model

- Publisher: Salesforce Trailhead.
- Reference: [Explore Lead Qualification Models](https://trailhead.salesforce.com/content/learn/modules/lead-qualification-with-scoring-and-grading/explore-lead-qualification-models).
- Knowledge to extract: separate account grade/fit from behavior/interest score; identify industry, company size, and job title as examples of explicit structural dimensions; establish score thresholds without allowing preference points to erase hard disqualifiers.
- Exclusions: Salesforce product setup and promotional claims.
- Why it matters: Atlas needs a reusable decision procedure, not just persuasive language about lead quality.

### SRC-003 — Qualification, assignment, and routing discipline

- Publisher: Salesforce Trailhead.
- Reference: [Qualify and Route Leads to Your Reps](https://trailhead.salesforce.com/content/learn/modules/opportunity-management/qualify-and-route-leads-to-your-reps).
- Knowledge to extract: make qualification and handoff explicit; separate research-needed records from ready-for-sales records; require account and buyer data before advancing a lead.
- Exclusions: vendor-specific objects, CRM permissions, UI walkthroughs, and any autonomous messaging instruction.
- Why it matters: `qualified`, `needs_research`, and `disqualified` must lead to different safe actions.

### SRC-004 — Buyer-intent interpretation

- Publisher: LinkedIn Sales Solutions.
- Reference: [Guide to Buyer Intent](https://business.linkedin.com/sell/resources/sales-terms/buyer-intent).
- Knowledge to extract: distinguish active from passive buying signals; connect signals to the actual solution category; separate evidence of interest from proof of authority, budget, consent, or current operational fit.
- Exclusions: unsupported vendor marketing claims, generic outreach templates, LinkedIn-only product instructions, and any assertion that funding or a job title automatically proves a buying condition.
- Why it matters: the benchmark intentionally contains attractive but misleading indicators; Atlas must recognize what a signal does and does not establish.

### SRC-005 — Signal recency and timing

- Publisher: LinkedIn Sales Solutions.
- Reference: [How to Engage Prospects at the Right Moment](https://business.linkedin.com/sell/how-to/engage-prospects-at-the-right-moment).
- Knowledge to extract: prioritize relevant current account changes and buying signals over stale lists; distinguish account-level intent from individual-level permission or authority; treat timing as a ranking feature after hard fit is established.
- Exclusions: unverified causal performance claims, sales-message templates, and statements that profile views alone prove purchase readiness.
- Why it matters: stale job boards and older marketing activity must not defeat fresh first-party freezes or closures.

### SRC-006 — Commercial-email opt-out constraint

- Publisher: United States Federal Trade Commission.
- Reference: [CAN-SPAM Act: A Compliance Guide for Business](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).
- Knowledge to extract: recipients can opt out of covered commercial email; opt-out handling is a hard operational constraint rather than a ranking penalty; compliance ownership must remain explicit.
- Exclusions: jurisdiction-specific claims beyond the referenced US guidance, speculative legal conclusions, and any assumption that compliance guidance itself authorizes outreach.
- Why it matters: an otherwise perfect account must still be excluded when the benchmark records an active opt-out or suppression. This is an engineering policy constraint, not individualized legal advice.

## Supporting and later-stage references

### SRC-007 — Lead qualification overview

- Publisher: Salesforce Trailhead.
- Reference: [Lead Qualification: Quick Look](https://trailhead.salesforce.com/content/learn/modules/lead-qualification-quick-look).
- Knowledge to extract: compact terminology and a review checklist for lead qualification.
- Retrieval policy: supporting background only; exclude from a task context when SRC-001/SRC-002 already cover the same principle.

### SRC-008 — Score maintenance and lifecycle controls

- Publisher: HubSpot.
- Reference: [Edit, turn off, or delete lead scores](https://knowledge.hubspot.com/scoring/manage-lead-scores).
- Knowledge to extract: scoring systems have lifecycles and their definitions change; preserve score-model revisions and avoid silently changing evaluation behavior.
- Retrieval policy: compilation/versioning reference only; do not inject score-administration instructions into Atlas prospect-qualification tasks.

### SRC-009 — Email sender operational requirements

- Publisher: Google.
- Reference: [Email sender guidelines](https://support.google.com/mail/answer/81126?hl=en).
- Knowledge to extract: sender authentication, spam-rate controls, and unsubscribe capabilities are future execution-layer responsibilities.
- Retrieval policy: later-stage safety reference only; exclude completely from the first qualification runtime unless a case explicitly concerns a future messaging constraint. MIDAS V0.1 does not send email.

## Compilation and leakage rules

1. Save source revisions before extracting knowledge. A URL alone is not a frozen training input.
2. Extract only bounded, typed knowledge artifacts: `principle`, `decision_rule`, `procedure`, `failure_pattern`, `constraint`, and `example`.
3. Every accepted artifact must link to an original source section/span and state whether the claim is vendor opinion, documented product behavior, regulatory guidance, or benchmark-owner policy.
4. Check each candidate source and extracted item for exact matches to fictional company names, case IDs, case titles, hidden answer keys, unusual benchmark phrases, and case-specific numeric rule combinations.
5. Run semantic similarity checks against both the eight development cases and the twelve owner-controlled holdouts before indexing. A dedicated evaluator performs the holdout-side comparison and returns only pass/fail plus a sanitized contamination report.
6. Reject any direct or close benchmark reproduction. Do not edit the answer key to rescue a contaminated source.
7. Deduplicate overlapping principles across HubSpot and Salesforce; prefer the most precise supported formulation, not two copies of the same advice.
8. Core qualification retrieval is limited to SRC-001 through SRC-006. SRC-007 and SRC-008 are support references; SRC-009 is execution-layer background and is excluded from the first runtime by default.
9. Keep the same model, runtime prompt budget, and output contract across baseline, relevant-curriculum, and matched-placebo comparisons.
10. Re-check legal, vendor, and operational source pages at the time of ingestion because source content may change.

## What has and has not been proven

This selection confirms nine relevant, primary-publisher references were chosen after the benchmark was written. It does not prove they are free of semantic leakage: the definitive leakage scan requires captured source contents and evaluator-only comparison during implementation. It also does not prove that any source improves Atlas; that is the job of the blinded baseline-versus-relevant-versus-placebo evaluation.
