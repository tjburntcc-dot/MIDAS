# Opportunity Qualifier qualification campaign v1

`MIDAS-FOUNDRY-004` is a frozen, blind campaign for deciding whether the MIDAS Opportunity Adversary/Qualifier provides practical business value over direct use of a strong frontier model. It is an evaluation system, not evidence that either contestant has run.

The campaign has 12 development cases and 28 sealed cases: one for each required family. Each case distinguishes deterministic facts, required evidence, acceptable disposition range, prohibited claims, fatal errors, and judgment dimensions. Sealed gold stays solely in the ignored local campaign state. The exported packets carry evidence and case IDs only.

The versioned contract freezes the role, output schema, dimensions and weights, critical gates, minimum score (75), two clean runs per arm, maximum run spread (8), a five-point quality margin, a 20% cost/correction or 25% latency tie-break margin, pricing provenance, evaluator policy, and invalidation conditions. The semantic evidence judge remains advisory and cannot certify or select a worker.

## Local workflow

Run these commands from the repository root. They make no network call and do not spend money.

```powershell
node --import ./tools/register-ts.mjs ./tools/opportunity-qualification-campaign.mjs freeze
node --import ./tools/register-ts.mjs ./tools/opportunity-qualification-campaign.mjs export
node --import ./tools/register-ts.mjs ./tools/opportunity-qualification-campaign.mjs validate <packet.json> <response.json>
node --import ./tools/register-ts.mjs ./tools/opportunity-qualification-campaign.mjs score <response.json>
```

The first two commands create ignored local artifacts under `var/state/sealed/` and `var/artifacts/`. There is one 28-case packet per contestant, the minimum run count while retaining full family balance. The export command reports serialized packet bytes; an external operator must verify the clean session has enough input and response capacity before using that one-packet layout. If it does not, make a fresh packet manifest with balanced batches; do not edit a packet after execution begins.

For each contestant, open a clean session with no access to MIDAS, the campaign state, any evaluator material, or the other contestant. Paste the packet's `clean_session_prompt` and evidence. Return only the response JSON—no prose and no changed case IDs. Record actual model/version, timestamps, latency, tokens, actual sourced cost or `null`, pricing source or `null`, and human correction minutes. Recommended frontier contestant: GPT-6 Astra, only if the clean session verifies access; otherwise record the actually used strongest practical model without relabeling it.

Validate and score the returned response before any qualitative evaluation. Then independently blind the two response sets for human/evaluator scoring. Submit repeated, evaluator-backed run projections to `recordQualificationEvidence`; it preserves `FRONTIER_SELECTED`, `NO_MATERIAL_DIFFERENCE`, `INSUFFICIENT_EVIDENCE`, and `CAMPAIGN_INVALID` rather than forcing a specialist win. The managed-venture loop blocks high-consequence qualifier work until completed real campaign evidence exists. Fixture demonstrations retain their explicit synthetic status.
