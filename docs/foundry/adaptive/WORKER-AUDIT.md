# Adaptive worker scaffold audit

This is an implementation audit of Mission 034's actual `portfolio/worker.ts`, `portfolio/engine.ts`, `portfolio/stage-contracts.ts` and `portfolio/finalization.ts`. The opt-in candidate is in `adaptive/lean-worker.ts`. No historical procedure, request, provider setting, source artifact or execution grant was modified. No provider call or comparative performance measurement was made for this audit.

## What constrains capability today

1. **The tool boundary, more than prompt length, is consequential.** The baseline worker advertises a fixed list of workspace, check and research actions and explicitly prohibits shell execution except supplied trusted tools. Its validator enumerates these names. A model cannot discover/install/run an unadvertised adapter merely because a prompt requests autonomy. The adaptive integration needs real scoped execution tools, fresh schemas, validation and authority bindings. Rewriting the prompt alone would misrepresent capability.
2. **One model action per response and a fixed tool schema impose overhead.** Legacy calls require unrelated fields to be null. This is a testable token/latency concern, not proof of reduced reasoning. Stage-specific schemas already narrow tools and gate response obligations; preserve them for historical execution. A future richer action schema must keep validation and accounting aligned.
3. **Context can be large but contains needed repair evidence.** `engine.context` provides task, source previews, dependencies, accepted source, rejected candidates, checks and budgets. It already deduplicates some identical campaign and software content. Its candidate fallback distinguishes accepted source from rejected drafts and provides read paths when content cannot fit. Removing these to make a “lean” prompt would recreate an observed failure.
4. **Legacy publication advice can disagree with current finishing.** The generic worker mentions separate publication and completion; finalizing and stage procedures override that advice. The engine replaces call economy when bounded finalization is active. The candidate conservatively rewrites only the recognized historical itinerary when an explicit current finalization record exists. It never treats successful publication as substantive review.
5. **Fixed profile and stage allocations restrict adaptation.** Stage contracts prevent extra task scope and cap sharing; these are actual current boundaries, not permission to change a signed run. Prospective adaptive outcome grants should reserve resources for justified acquisition and finishing. Budget changes require the integration owner's prospective authority design.

## Candidate implemented

`LEAN_WORKER_PROCEDURE` gives an objective, relevant evidence, available tools, acceptance and resource boundaries. It allows method selection, capability discovery/build/test, changing approach and return to the parent objective. It retains source distrust, authority, provenance, targeted repair, current checks and substantive review. It does not prescribe three approaches, a deliberate initial failure, a named library or a solved fixture.

`projectLeanContext(context, {approvedTools})` returns a cloned context plus a hashed, byte-measured receipt. It preserves unknown fields. It removes only exact instruction duplication and a recognized obsolete finishing itinerary. It requires complete enabled tool contracts and equality with the caller's approved tool set; it never manufactures tool access. Business/task/evidence/dependency/workspace/observation/authority/resource/tool/finalization fields are asserted unchanged. This is conservative projection, not a promise of dramatic token reduction.

The caller must already have validated the actual grant: supplying an array called `approvedTools` is not authorization. Bind the candidate version, projected context hash, schema and tools prospectively before transport. Keep baseline selection the default. Do not insert this into old frozen requests or overwrite their context on restart.

## Comparison prepared, not executed

`createLeanComparisonProtocol` produces a hashed evaluator-only configuration for three arms: strong direct frontier workflow, preserved MIDAS and adaptive MIDAS. They receive matching evidence/tool/authority bindings and resource ceilings. Model or setting differences must be disclosed, not credited to orchestration. The direct arm receives excellent instructions and comparable discovery/execution tools.

The user has now supplied the original Fable master prompt in the conversation, and identifies Fable 5.1 High effort as the reference. Older claims that the original prompt was never supplied are stale. This does not mean its bytes, screenshots or exact historical connector/configuration record are present in this repository; import and bind permitted source files before claiming reproduction. Missing historical configuration does not block engineering or a clearly declared new strong baseline.

Declare task selection, repetition/order policy, rubric and independent reviewer before later execution. Separate acquisition and unseen transfer cases. Do not show workers evaluator solutions or the other arms' answers. Reset environments. Retain failures, all relevant resource costs and interventions. Measure verified task completion, artifact usefulness, commercial judgment, critical omissions, unfamiliar-obstacle resolution, recovery, transfer, owner attention, latency and observed/unknown costs. A single development success creates a candidate, not general competence or a certified worker.

## Integration priorities

1. Supply the adaptive runner's actual scoped commands, documentation retrieval, package acquisition and multi-file workspace contracts. Keep enforcement outside model-authored skill text.
2. Retain the parent objective and accepted/rejected revisions through acquisition, failure and restart; resume from durable observations rather than treating every obstacle as a fresh independent job.
3. Bind lean selection explicitly and record both original/projected context hashes. Run the same business acceptance requirements against current artifacts after returning from acquisition.
4. Execute live comparison only under applicable authority. Offline tests establish projection/manifest mechanics. They cannot establish that lean scaffolding improves a frontier model.

Focused verification: `node --test packages/foundry/test/adaptive-lean-worker.test.ts`.
