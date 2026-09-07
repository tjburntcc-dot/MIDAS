# Opportunity Qualifier telemetry contract v2

## Amendment record

**MIDAS-OQ-TELEMETRY-V2-005** corrects a defect discovered after the four
contestant sessions executed and before any scoring, import, unblinding, or
substantive comparison. The frozen v1 response validator requires finite
`latency_ms`, although the interactive Astra outputs truthfully carry `null`.
The v1 selector also reads latency numerically as a 25% quality-tie-break. A
zero sentinel was rejected: it would create a fabricated apparent speed
advantage.

This amendment leaves the v1 campaign, packets, source outputs, case judgments,
quality dimensions, critical gates, and frozen quality margin unchanged. It
creates a separate v2 path whose sole change is telemetry representation and
telemetry eligibility. The same rule applies to both Terra High and Astra
Medium runs. The four completed runs do not need rerunning to preserve their
business judgments; they can support a later quality-only blind evaluation.

## V2 run-scoped schema

The canonical v2 artifact has its response judgments under `responses` and one
`run` object. `run.model_identity` records an operator-attested selected model,
optional provider-reported model, optional exact version, and a provenance
status. It deliberately does not promote a contestant's self-description into
provider verification.

`run.telemetry` has `latency_ms`, `input_tokens`, `output_tokens`,
`actual_cost_usd`, and `human_correction_minutes`. Every metric is an object:

```json
{
  "status": "measured | unknown_unmeasured_interactive_session | not_applicable",
  "value": null,
  "provenance": null
}
```

For `measured`, `value` must be finite and nonnegative and provenance must name
the measurement source, basis, unit, scope, and an observation timestamp or
reference. The expected units are milliseconds, tokens, USD, and minutes.
`unknown_unmeasured_interactive_session` and `not_applicable` require a null
value and null measured provenance. Numeric unknowns and null measured values
are invalid. A deterministic presentation adapter may project this run telemetry
onto responses, but it never makes the per-case projection canonical.

For this four-run migration every operational metric is
`unknown_unmeasured_interactive_session` with null value. No provider/API
latency, token count, billed cost, or independently observed correction effort
was captured. Any self-generated operational claim remains unmeasured. Existing
case text, including its human-correction statements where present, is retained
unchanged as a case judgment rather than misrepresented as measured telemetry.

## V2 selection eligibility

Quality and critical-quality/safety gates remain first. A telemetry tie-breaker
is eligible only when every relevant run has a finite measured value with the
same unit, measurement basis, and measurement scope and complete provenance.
The selector records each metric as eligible or excluded with its exact reason.
Cost, latency, and correction effort retain their frozen v1 thresholds only
when eligible; unavailable metrics have no numeric value and their weights are
not transferred to quality or another metric. Tokens are recorded and checked
for comparability but are not a new tie-breaker.

If quality is within the frozen margin and no comparable frozen tie-breaker can
decide, v2 returns `INSUFFICIENT_COMPARABLE_EVIDENCE`; if comparable evidence
exists but does not decide, it returns `TIE`. Neither outcome selects a winner,
and iteration order cannot decide it. Unknown telemetry can therefore neither
improve nor reduce certification or routing.

## Local, deterministic migration

Run only from the repository root:

```powershell
node --import ./tools/register-ts.mjs ./tools/opportunity-qualification-telemetry-v2.mjs migrate
node --import ./tools/register-ts.mjs ./tools/opportunity-qualification-telemetry-v2.mjs validate
node --import ./tools/register-ts.mjs ./tools/opportunity-qualification-telemetry-v2.mjs validate specialist-run-1
```

The tool reads the two preserved specialist responses and the two preserved
frontier raw responses, writes new ignored projections in
`var/artifacts/opportunity-qualifier-qualification-v2/`, and emits a manifest.
It records each source SHA-256, migrated-file SHA-256, response/result
fingerprints, per-case substantive hashes, aggregate pre/post hashes, model
attestation, and the zero-difference result. It never modifies an input,
imports a response, invokes a scorer, unblinds a packet, or selects a winner.

## Certification limits and future evidence

This campaign can establish decision quality and run-to-run consistency only
after the separately authorized blind scoring process. It cannot establish
latency efficiency, token efficiency, monetary efficiency, or economic routing
for either model family. Economic certification requires a future, separately
frozen campaign with external provider/API collection of run-level timing,
tokens, billed cost, model/version identity, source/basis/scope, and correction
effort. Interactive sessions without that collection must remain explicitly
unknown, never zero, estimated, averaged, or penalized.
