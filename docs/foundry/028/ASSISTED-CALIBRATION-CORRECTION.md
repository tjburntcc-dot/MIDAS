# Mission 028: founder calibration provenance correction

The founder clarified in this chat that all four exported reviews were AI-assisted and that the first two unreliable-timing checkboxes were missed. All four are now recorded as assisted calibration judgments, not independent human validation. No provider calls, baseline changes, challenger development or calibration approval accompanied this correction.

## Preserved evidence and effective interpretation

The original Downloads export is unchanged. Its exact bytes are also preserved under the operational root `var/foundry-bounded-028`:

- `reviews/calibration-original-18b99cc522a8f1b25c87e5d97c645c9c23b1a48d7d6e8c8007456e17889925a3.json`
- Separate amendment: `reviews/calibration-assisted-18b99cc522a8f1b25c87e5d97c645c9c23b1a48d7d6e8c8007456e17889925a3.json`
- Current status: `reports/assisted-calibration-status.json`; tracked snapshot: `docs/foundry/028/post-replacement/assisted-calibration-status.json`.

Original export SHA-256: `18b99cc522a8f1b25c87e5d97c645c9c23b1a48d7d6e8c8007456e17889925a3`.
Original export timestamp: `2026-09-11T02:07:21.423Z`. The amendment has its own actual recording timestamp; it does not backdate the correction.

The amendment verifies the packet hash, authorization and rubric, reviewer identity, unique complete review set and each result hash against its development ledger attempt. It supersedes the original unassisted boilerplate, human-review classification and timing eligibility. Scores, reasons, original timestamps and interruption flags are preserved. It records the founder's explicit correction, not a fabricated review signature. Assistance model, cost and reliable human effort are unknown.

| Case | Original recorded elapsed duration | Effective timing status |
|---|---:|---|
| D-001 | 500.339 seconds | Excluded: AI-assisted |
| D-004 | 233.526 seconds | Excluded: AI-assisted |
| D-007 | Missing | Excluded: AI-assisted; original interruption flag preserved |
| D-013 | Missing | Excluded: AI-assisted; original interruption flag preserved |

First two start/finish timestamps remain intact in the source and amendment's `originalTiming`. Effective correction timestamps, duration and seconds are null for every assisted review. No duration is inferred for the other two. Eligible independent timing observations: **0**. Independent total and mean effort: **unknown/null**, not zero. The two recorded intervals must not enter independent review, correction-time, productivity or cost-per-outcome metrics.

All four assisted judgments accept the original outputs, report no critical failure and request no correction. Those judgments are exploratory calibration evidence only. They establish neither independent human acceptance nor specialist improvement. No `experiment-review` records were imported; the runtime reports zero human reviews and an incomplete calibration gate. The experimental capability record carries the same limitation. Earlier post-replacement reports remain historical snapshots.

## Consequence for the next development decision

Keep baseline-master-v1 unchanged. These observations do not establish a consequential reusable baseline failure that justifies buying or constructing a specialist challenger. In particular, the D-007 substring flag concerns a negated guarantee and is not evidence of a prohibited promise.

The D-001 review explicitly leaves a policy/rubric interpretation unresolved: must a coherently pending invoice with unconfirmed collection be referred immediately, or may the operator verify the evidence and refer conditionally? Resolve that calibration issue against the supplied policy before scoring more cases under an assumed interpretation. Apply any shared clarification equally to both conditions and preserve affected observations.

The existing implementation requires signed measured reviews before its initial four-case gate can be completed. This provenance correction does not satisfy or waive that requirement. Assisted calibration may inform discussion; it must not be relabeled as independent review to unlock execution. No final comparison or correction-time advantage can be inferred with the present missing measurements. Further development remains within the existing authorization, subject to this unresolved review gate; no new spending approval was requested for this correction.

## Prevention and verification

The local review page now requires an explicit manual/AI-assisted method. AI-assisted exports use `assisted-calibration-review`, automatically exclude effective timing even when the interruption checkbox is unchecked, preserve raw timing separately, and carry no blanket assertion that models did not help. All founder exports disclose that they are not independent validation. The original page is retained at `reports/founder-calibration.pre-assistance.html`; the packet and original export were not regenerated or overwritten. Reload the local page only for future reviews; the four completed reviews need not be re-entered to apply this correction.

Six focused offline tests passed: explicit method selection, automatic assisted timing exclusion, interrupted timing, source escaping/no network use, preservation of raw observations, and rejection of wrong scope/result identity or duplicate/missing reviews. Tests execute generated page JavaScript in a simulated DOM, not a full browser. The annotation command also verified the actual four ledger results and unchanged source bytes. The execution-core hash remains `28f764f5df44ff3f667d704ff896153c270ff5bf6a73e6c8ac33e9d5ce47e600`; grants and admission behavior are unchanged.

No new provider activity or billing evidence. Retained exposure remains USD 3.51, including historical reservations exactly once; unused aggregate allowance remains USD 51.49. Provisional inference cost remains USD 0.41 within those reservations, not additional spending. Authoritative settlements remain absent. AI-assistance costs and reliable human labor for these reviews are unmeasured.
