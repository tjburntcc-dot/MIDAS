# Protocol-010 sealed opaque grouping custodian

This companion control creates the identity-free two-run grouping required by the Protocol-010 secondary-review planner. It is deliberately separate from Protocol-010 packets, scorecards, validations, replays, provenance, and evidence locks. It does not evaluate, score, compare, select, certify, route, or build a secondary packet.

## Authority and temporal-provenance audit

The authority sources below are frozen pre-evaluation material. Their local creation provenance predates the first Protocol-010 primary scorecard; the packet-factory source also constructs the sealed map before any evaluator invocation. No scorecard is an input to the custodian.

| Role | Schema / role name | SHA-256 or frozen identity | Count | Predates evaluation |
| --- | --- | --- | ---: | --- |
| Frozen campaign registration | campaign state | `a1382d89cff01cfa6d04b0c29fad53ae6229d77611b8592c260efbed1316835f` | two declared arms; two runs per arm | Yes |
| Original arm packets | sealed contestant packet | `e79c37c6b632e49d1bd5caf5bcf6d6f3998ad1c88eb51b51650006654ed9a5a1`; `3c09383b37d84dc284d09acd6e30c11859f2eb292f1d597021d88ab091e7ff42` | two packets, 28 cases each | Yes |
| Migrated source-run provenance | telemetry-v2 source record | four source hashes recorded by the frozen packet manifest | four runs, 28 cases each | Yes |
| Sealed opaque/source map | sealed identity map | `093947c6474e5df74e88a5d016341fa6aea6352787a1337e22b1933d7a805cbb` | four mappings | Yes |
| Primary packet membership lock | Protocol-010 packet manifest | `12a1caf0dced7549db532e47582ef1bc4a0f5377b2caa493132f27fcf009d389` | four contestants, 112 responses | Yes |
| Completed-primary lock | complete primary-evidence manifest | fingerprint `788011a3c1215656f085f9e622f8c63ea80e058af97409570702dc93ff3d0733`; raw `e98c66b5c7af658268001ef7eee8d18f6fc85f179ece104eec6d26070d192878` | 112 responses, 1,008 judgments | No; membership verifier only |
| Deterministic membership verifier | deterministic case-gates record | finding-set `352f9426058c3dc85a6ebe26ed4fa6e51b759e4732d6c329adaed16ad324bca0` | 112 inputs, four opaque runs, zero critical findings | No; membership verifier only |

The minimum sealed fields consumed are: map opaque contestant ID plus source substantive hash; source record substantive hash, explicit arm membership, source packet fingerprint, and case IDs; and original packet arm plus fingerprint. The map’s source reference is schema-checked but never used to infer grouping. The campaign registration supplies the frozen two-runs-per-arm policy. The public packet and evidence locks supply only opaque contestant/case membership verification.

The minimum release is exactly: opaque contestant ID, sorted case IDs, and an opaque comparison-group ID, plus contract-bound hashes. No arm label, source label, source path, model/provider data, response content, score, rationale, signal, telemetry, ranking, or outcome is released.

Plainly: the pairing was fixed before Astra judged anything, so no evaluation result can be used to manipulate it.

## One-way trust boundary

The sealed custodian is the sole component that can parse the identity-aware map and pre-evaluation source provenance. It validates source hashes, matches opaque IDs by frozen substantive hash, cross-checks each source’s explicit arm against its frozen source-packet fingerprint, verifies exactly two members per arm, and only then projects anonymous structure. It does not open any primary scorecard path or consume score/rationale/result fields.

The public adapter in `opportunity-qualification-sealed-grouping-authority.ts` has no filesystem API and no sealed-map type. It only accepts the strict companion artifact and returns its `opaque_structure` for `planSecondaryReview`. A sealed map passed to that adapter fails strict validation.

Plainly: the custodian knows the hidden pairing only long enough to make an anonymous map; the planner gets the map but cannot see how it was discovered.

## Companion contract

`MIDAS-OQ-OPAQUE-GROUPING-AUTHORITY-001` version `1.0.0` permits only contract/version identifiers; Protocol-010, manifest, evidence-lock, gate, sealed-source, and implementation hashes; the derivation-rule identifier; four opaque structure entries; and a canonical artifact fingerprint. Strict unknown-field rejection applies at every level.

Each structure entry has only `opaque_contestant_id`, exactly 28 sorted `case_ids`, and `opaque_comparison_group_id`. The runtime validator requires four contestants, two groups, two contestants per group, 112 unique contestant/case pairs, deterministic canonical serialization, and canonical-fingerprint equality. The custodian additionally compares that pair set exactly with the frozen primary-evidence membership set.

Plainly: this is the smallest anonymous map needed to arrange four runs into two pairs.

## Group identifier

After—not before—the custodian proves membership, it sorts the two opaque contestant IDs and derives the group identifier as the first 16 uppercase hexadecimal characters of SHA-256 over the domain-separated byte sequence `MIDAS-OQ-OPAQUE-GROUP-V1`, a NUL separator, and the sorted IDs separated by NUL. It exposes `G-` plus that prefix.

The identifier is never based on arm names, model/provider names, source labels, filenames, paths, ordering, scorecards, scores, rationales, telemetry, or results.

Plainly: the hash gives a pre-established anonymous pair a stable name; it never guesses the pair.

## Custodian operation and recovery

`tools/opportunity-qualification-sealed-grouping-authority.mjs` validates every required frozen identity and input hash before derivation. It uses a sanitized result boundary: failures return only a stable failure code, never exception text or sealed values. It writes canonical identity-free output atomically, re-reads it, validates exact canonical bytes, scans its full bytes against identity-bearing sealed strings without displaying them, derives a second time in memory, and requires byte equality.

The ignored output is `protocol-010-opaque-grouping-authority-v1.json`. Its non-sensitive validation manifest contains hashes, counts, and booleans only. The recovery directory is dedicated to this companion and contains only that identity-free artifact and validation manifest; both copies must have exact matching SHA-256 bytes.

Plainly: a local machine process can prove the pairings without leaving hidden labels behind.

## Synthetic adversarial proof

The focused tests use synthetic identities and mappings. They cover correct cardinalities and membership, missing/foreign membership, conflicting authority, input/member reordering, changed hidden labels, changed grouping, strict unknown-field rejection, prohibited identity/source/score/signal/telemetry/ranking/winner fields, sanitized errors, sealed-map rejection at the public adapter, and a synthetic planner invocation using only validated identity-free structure.

No synthetic test opens a real scorecard, invokes the real planner, or produces a secondary packet.

Plainly: the design is attacked with fake data before real campaign material is allowed through it.
