# Mission 016: Protocol-010 secondary governance hardening

`MIDAS-OQ-SECONDARY-GOVERNANCE-HARDENING-016` is an engineering-only control layer around the existing deterministic secondary-review planner. It supplies a strict planner façade, immutable policy binding, canonical plan bytes, an independently validated minimal-packet builder, an external strict packet manifest, adversarial tests, and semantic-equivalence tests.

This mission did not execute real planning, generate a real secondary packet, call an evaluator, inspect real scores or rationales, access the sealed identity map, unblind a contestant, compare real contestants, select or certify a worker, route work, or make a business qualification decision. All new behavioral tests use synthetic data.

## Preflight and frozen-state audit

The execution base was verified before editing:

| Requirement | Verified value |
| --- | --- |
| Repository | `C:\Users\14844\Downloads\MIDAS` |
| Branch | `feature/opportunity-qualification-sealed-grouping-authority-v1` |
| Starting HEAD | `1eb032e8cf368f41c12b69e7a44737a24b0ed90c` |
| Origin | `https://github.com/tjburntcc-dot/MIDAS.git` |
| Starting tracked/untracked status | clean |

The established Mission 014 preservation inventory was used rather than replaced with a new tree snapshot:

1. Load the 57 path/SHA-256 entries already recorded in `var/protocol-010-grouping-preservation-snapshot.json`.
2. Hash those exact paths as raw bytes with SHA-256 and compare each value to the recorded value.
3. Account for the 31 committed Opportunity Qualification mission files in the frozen committed range `2bbe3074344966a057da6fc9738509b497070af5..1eb032e8cf368f41c12b69e7a44737a24b0ed90c` using Git's path inventory and the clean required HEAD.
4. Require the union count to be exactly 88.

Result: 57 preserved artifact entries plus 31 committed mission files equals exactly 88 files; zero preserved paths were missing and zero hashes mismatched. The later identity-free grouping companion and its recovery copies were checked separately because they deliberately postdate the frozen preservation snapshot:

| Artifact | Raw SHA-256 |
| --- | --- |
| Grouping authority artifact and recovery copy | `6fced7d4e29064c61cb94f899eb4fe6039af50cc1f605af7c598113baa0f9515` |
| Grouping validation manifest and recovery copy | `0ac252d90a8bbb1075d652fc4faa9bf5c292e1fd1e8e217898488dedfdc009b9` |

No frozen Protocol-007, Protocol-009, Protocol-010, scorecard, evidence, grouping, recovery, sealed-map, or preservation file was modified.

## Policy provenance and immutable binding

Mission 016 does not create economic policy. The bound values are the exact values already present in the original campaign defaults, Protocol-009 planner defaults, Protocol-009 frozen policy, and Protocol-010 frozen policy:

| Policy field | Frozen value |
| --- | ---: |
| Minimum competence | 75 |
| Maximum run-quality spread | 8 |
| Practical quality margin | 5 |
| Runs per arm | 2 |
| Cases per run | 28 |
| Critical failures allowed | none |

The policy is exported as `FROZEN_SECONDARY_POLICY`. The façade requires exact structural equality between this policy, the trusted Protocol-010 object, and the approved planner result. It rejects a changed policy even when a caller recomputes a new internally consistent protocol hash.

The pre-existing campaign's cost, latency, correction-time, and tie-break logic is not imported into the secondary-review planner. Those values were never inputs to `planSecondaryReview`, and adding them here would change planner semantics and blindness.

## Trust model and evidence bindings

The official entrypoint uses the committed `PROTOCOL_010_SECONDARY_TRUST_ROOT`; candidate input cannot nominate or replace this root. Its exact bindings are:

| Role | Bound identity |
| --- | --- |
| Trust root | `MIDAS-OQ-PROTOCOL-010-SECONDARY-TRUST-ROOT-016` |
| Protocol-010 canonical hash | `17bbb5d31caf2c8b4c726178a8233dd90f0990ecb076df47faa96b61d4022a22` |
| Packet manifest hash | `12a1caf0dced7549db532e47582ef1bc4a0f5377b2caa493132f27fcf009d389` |
| Complete primary evidence canonical fingerprint | `788011a3c1215656f085f9e622f8c63ea80e058af97409570702dc93ff3d0733` |
| Complete primary evidence raw SHA-256 | `e98c66b5c7af658268001ef7eee8d18f6fc85f179ece104eec6d26070d192878` |
| Exact membership-set SHA-256 | `9b2d5f10bb289a3e94cd4bfdf50a92cf0be893638ea3b5b846061f29783be815` |
| Deterministic-gate record canonical fingerprint | `7a3382345889f297d98bdc8a46d3301feba799835d6e7ad2c5b583b8ea958ed5` |
| Deterministic-gate record raw SHA-256 | `8044eb610ba14869f11cf3331f5e79ce1e7bee780441632ea0fc304a616dbc1e` |
| Deterministic finding-set SHA-256 | `352f9426058c3dc85a6ebe26ed4fa6e51b759e4732d6c329adaed16ad324bca0` |
| Opaque grouping canonical fingerprint | `dcbfcd52ade8b8865f9e4fff418fc514bd91b95cdbee083879d63948af2f1d1f` |
| Opaque grouping raw SHA-256 | `6fced7d4e29064c61cb94f899eb4fe6039af50cc1f605af7c598113baa0f9515` |
| Custodian implementation hash | `7ae0678dbd51c76fd73077bc3ad4860f68e5cc84541fc93641dc214f9de8c275` |

A fingerprint is only an integrity relationship to a trust anchor. It is not proof that the creator of an artifact was authorized. The official façade gets its expected identities from committed code outside the candidate evidence bundle. `governSecondaryPlanAgainstTrustedRoot` exists for synthetic testing and future separately authorized roots; its trust-root argument must be supplied by an authority independent of the evidence being evaluated. A caller that computes an artifact and a matching trust root has demonstrated internal consistency, not authorized origin.

The façade validates more than individual fingerprints:

- Protocol ID, semantic version, canonical protocol-hash derivation, and exact frozen policy.
- Complete-primary manifest raw bytes, canonical validation fingerprint, protocol and packet-manifest relationships, five scorecard admissions, five packet contributions, 112 unique contestant/case pairs, and 1,008 evaluator-dimension judgments.
- Every packet and scorecard raw-byte hash against the trusted complete-primary manifest.
- Every Protocol-010 scorecard through the existing strict field-aware validator.
- Exact equality among scorecard membership, packet membership, the 112-member evidence lock, and the validated opaque grouping artifact.
- The established membership-set derivation: SHA-256 of sorted `opaque_contestant_id|case_id` records joined with line-feed bytes.
- Deterministic-gate record raw and canonical identities, the exact finding-set preimage, and a projection limited to records whose `deterministic_evaluator_conflict` is exactly `true`.
- Grouping contract, derivation, cardinality, primary-evidence, gate, custodian, and Protocol-010 relationships.
- Approved planner identity and exact result policy.

## Approved planner identity and semantic preservation

The approved implementation remains the unchanged `planSecondaryReview` export in `opportunity-qualification-evaluator-v2-1.ts`:

| Identity field | Value |
| --- | --- |
| Planner version | `oq-voi-planner-1.0.0` |
| Planner-declared hash | `0e234ca0c996b788cb37085c88fc7a8ece2beede2326a9b4af8d223771590b40` |
| Frozen baseline source SHA-256 | `2995090332741bc87003304a4c063ea44c4eba3e0a7abd3939ec85f36d88d6a7` |

Mission 016 canonicalizes only semantically irrelevant input/output ordering, calls the existing function, and wraps its decision. It does not recalculate, reinterpret, or replace decision sensitivity. Synthetic equivalence tests assert deep equality between the governed decision and a direct approved-planner call on the same canonical input for a material-review case. A second test proves that a no-material-review decision cannot be converted into a packet.

## Canonical artifacts and non-self-referential hashing

Replay-critical artifacts contain no current execution time.

The governed plan is exact canonical UTF-8 JSON. It contains input identities, policy identity, approved-planner identity, and the planner decision, but it does not contain its own raw hash. `plan_raw_sha256` is returned outside the plan bytes and is validated as an external expected value.

The existing secondary packet retains its already-defined `packet_hash`, whose derivation explicitly excludes the `packet_hash` field. Mission 016 additionally computes a raw SHA-256 over the complete canonical packet bytes and stores that value in the separate strict packet manifest.

The strict packet manifest contains the plan raw hash, packet content fingerprint, packet raw hash, response count, requested-dimension count, and exact coverage hash. The manifest does not contain its own raw hash. `manifest_raw_sha256` is returned outside its canonical bytes.

Operational receipts, if a later authorized mission needs them, must remain separate non-replay artifacts. An execution timestamp must not be inserted into the governed plan, packet, or strict packet manifest.

## Strict secondary-packet construction

`buildGovernedSecondaryPacket` accepts canonical governed plan bytes plus the original evidence bundle. It does not accept an arbitrary parsed primary packet collection. Before building, it re-runs the complete evidence validation and governed planning path and requires byte-identical plan replay.

It then calls the unchanged `buildFinalMinimalSecondaryPacket` and independently verifies:

- A secondary packet exists only for `SECONDARY_REVIEW_AUTHORIZED` with at least one requested review.
- Every governed response appears exactly once, and no foreign or duplicate response appears.
- Requested dimension IDs exactly match the governed plan; a blocking case with no dimension-level request remains explicitly represented as a blocking case.
- The response-local blocking flag is an exact projection of the approved planner reason.
- Protocol, response contract, clean-session boundary, content fingerprint, and canonical bytes are exact.
- Primary evaluator judgments, scores, rationales, confidence, sufficiency, and review signals are not packet-entry fields.
- Manifest counts and coverage hash derive independently from the emitted packet.

The packet contains the originally validated identity-free case evidence and contestant response required by the existing secondary contract. It never contains a primary evaluator scorecard.

## Public governed entrypoints

The following are exported from `@midas/eval`:

- `governProtocol010SecondaryPlan(evidence)` — the official façade fixed to the committed Protocol-010 trust root.
- `governSecondaryPlanAgainstTrustedRoot(evidence, trustedRoot)` — generic engine for synthetic fixtures or a separately authorized, independently supplied future trust root.
- `validateGovernedSecondaryPlan(raw, expectedRawSha256, root?)` — exact canonical plan and external-hash validator.
- `buildGovernedSecondaryPacket({ plan_raw, plan_raw_sha256, evidence }, root?)` — evidence-replaying strict packet builder.
- `validateStrictSecondaryPacket(packet, governedPlan, protocol)` — exact packet coverage and schema validator.
- `validateStrictSecondaryPacketManifest(raw, expectedRawSha256, packetRaw, planRawSha256, root?)` — external manifest, plan, packet, and coverage validator.
- `canonicalSecondaryGovernanceJson` and `canonicalSecondaryGovernanceBytesSha256` — deterministic serialization utilities for this contract.

The implementation contract is `MIDAS-OQ-SECONDARY-GOVERNANCE-016` version `1.0.0`. The implementation source raw SHA-256 at completion is `ce241a274d56eb53f368f6f63ca5e0694c6be0fe122b18c97d1d00b5ad1afb72`. This source hash identifies bytes; the committed branch and review history establish authorization provenance.

## Synthetic verification

The focused synthetic suite covers the complete requested path:

> validated evidence → governed planner → canonical plan → evidence-replaying governed packet builder → strict packet manifest → exact response/dimension coverage → independent validation → deterministic replay

It also covers direct semantic equivalence, batch reordering, no-material-review behavior, official-root rejection of a coherent self-computed fixture, policy substitution with a recomputed protocol hash, missing gate-finding preimage, strict grouping unknown fields, a synthetic sealed-identity canary, raw-byte tampering, missing membership, scorecard tampering, canonical-plan tampering, missing packet source coverage, changed requested dimensions, and replay-payload timestamp exclusion.

Focused command:

```powershell
node --import ./tools/register-ts.mjs --test packages/eval/src/opportunity-qualification-secondary-governance.test.ts
```

Result: 12 tests passed, 0 failed.

Adjacent regression command:

```powershell
node --import ./tools/register-ts.mjs --test packages/eval/src/opportunity-qualification-campaign.test.ts packages/eval/src/opportunity-qualification-telemetry-v2.test.ts packages/eval/src/opportunity-qualification-evaluator-v2.test.ts packages/eval/src/opportunity-qualification-evaluator-v2-1.test.ts packages/eval/src/opportunity-qualification-evaluator-v2-2.test.ts packages/eval/src/opportunity-qualification-sealed-grouping-authority.test.ts packages/eval/src/opportunity-qualification-secondary-governance.test.ts
```

Result: 67 tests passed, 0 failed. The post-test 88-file preservation audit still reported zero missing or mismatched frozen files.

TypeScript's compiler package is not installed in the local dependency tree, so no compiler command was invented and no dependency installation was attempted. The repository's existing TypeScript loader executed the new module and all tests successfully.

## Engineering correctness is not business qualification

The tests establish contract validation, deterministic replay, trust-root relationships, planner-semantic preservation, and exact packet coverage for synthetic fixtures. They do not certify any real score, rationale, contestant, evaluator, worker, business opportunity, or qualification result.

## Remaining real-execution blocker

The deterministic case-gate record commits to 89 finding records with finding-set SHA-256 `352f9426058c3dc85a6ebe26ed4fa6e51b759e4732d6c329adaed16ad324bca0`, but it stores only the summary and hash. No file in the Protocol-010 artifact or recovery directories has that raw SHA-256. The official façade therefore cannot safely substitute `[]`: a noncritical `deterministic_evaluator_conflict` record would authorize immediate targeted review in the approved planner.

The engineering implementation is complete. Real evidence-only planning remains stopped until the planning/audit authority supplies the exact finding-set bytes already committed by that hash, or supplies a separately approved derivation artifact and trust-root update that proves an exact projection from the frozen gate evidence. Recomputing a convenient empty feed, changing the hash, or asserting that zero critical findings means zero evaluator conflicts is not permitted.

## Successor evidence-only execution handoff

Do not execute these steps during Mission 016. In the next separately authorized evidence-only planning mission:

1. Reverify the exact repository, branch, Mission 016 completion commit, origin, clean tracked state, the established 88-file preservation procedure, and all trust-root hashes above. Stop on any mismatch.
2. Obtain the exact 89-record deterministic finding-set bytes whose raw SHA-256 is `352f9426058c3dc85a6ebe26ed4fa6e51b759e4732d6c329adaed16ad324bca0` from the planning/audit authority. Record its authorized provenance separately. Do not synthesize, normalize, or reserialize it. Stop if it is unavailable or its raw hash differs.
3. Provide the following roles to `governProtocol010SecondaryPlan`: the Protocol-010 object embedded identically in the frozen primary packets; raw complete-primary manifest bytes; raw deterministic-gate summary bytes; the exact raw deterministic finding-set bytes; raw identity-free grouping-authority bytes; and the five raw primary packet/scorecard pairs matched by `packet_id`.
4. Do not provide the sealed identity map, real model/provider identity, telemetry, source paths, rankings, outcomes, or any untrusted caller-selected trust root. Do not display score or rationale content during assembly.
5. If the façade returns `ok: false`, preserve the sanitized validation errors and stop. Do not weaken a validator or change a frozen hash.
6. If it returns `ok: true`, write `canonical_plan_bytes` exactly once as the governed plan and store `plan_raw_sha256` in a separate execution receipt or later strict packet manifest. Re-run from the same inputs and require byte equality.
7. If the plan status is `NO_SECONDARY_REVIEW_MATERIAL`, do not build or execute a secondary packet. Preserve the canonical plan and stop for audit review.
8. If the status is `SECONDARY_REVIEW_AUTHORIZED`, call `buildGovernedSecondaryPacket` with the canonical plan bytes, external plan raw hash, and the same evidence bundle. Write the returned canonical packet and canonical strict manifest bytes exactly. Store `manifest_raw_sha256` externally. Revalidate with both strict validators and require exact response/dimension coverage.
9. Stop after the evidence-only plan and packet artifacts are validated. Do not call an evaluator, unblind, reconcile, select, certify, route, or claim any real worker is qualified without new authorization.

Expected output roles are: one canonical governed plan; one external plan raw-byte hash/operational receipt; zero secondary packet when no review is material, otherwise one canonical targeted secondary packet; one canonical strict packet manifest; and one external manifest raw-byte hash/operational receipt. None of these outputs is a business qualification result.
