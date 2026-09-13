# Isolated repair after the actual V4 execution stop

This is Mission 031 local engineering after a genuine stop, not a new mission or a completed live experiment. It is based on `ede7739e3400e5a1910dfcd21e57031b3c6c51cc` in the separate `codex/portfolio-handoff-repair-v4-031` worktree. The original signed checkout, grant, source, draft and attempt remain unchanged. No provider/count requests or credentials were used for this repair.

The actual response `p031-da316e4919694723-0` completed on September 13, 2026 at 00:32:49.564 UTC. Its 20,542-byte research report exceeded the explicitly supplied 18,000-byte UTF-8 limit. The write was accepted, then the next context failed with `CURRENT_SOURCE_HANDOFF_TOO_LARGE`, before a second model/count request. Lossless minification still yields 19,636 bytes. This is both a model contract miss and an implementation defect that prevents ordinary correction.

## Focused changes

- `source-handoff.ts` measures the existing service 18,000-byte, operating 9,000-byte, and serialized software 24,000-byte limits. It does not raise them or substitute character counts for provider token admission.
- `tools.ts` applies that same limit before committing candidate source. A rejected write preserves the existing source hash/revision, checks and publication, returns actual bytes, limit, path, current hash and a no-effect correction instruction, and retains a durable idempotent tool observation. Original candidate content stays in the existing model result. A later correction requires a fresh tool identity and ordinary capacity.
- `engine.ts` uses the same measurement as a defensive context check. It also supplies the existing declared descendant product profile to research and decision tasks. Only same-venture, same-plan, frozen descendants qualify; changed frozen definitions fail before inference. Identical profiles appear once, with all task/hash bindings retained. No source solution, evaluator answer or new product feature is added.

The second correction addresses an actual context gap: research proposed a separate accepted-quote/job snapshot experiment, but the existing product stores one record whose status changes from quoted to scheduled. The initial research request lacked that product contract. The unexecuted decision objective does warn against unsupported approval snapshots, so a wrong build decision has not been observed. Giving it the full existing contract is prospective; the historical recommendation is not relabeled.

## Verification

The exact retained live response was replayed through both tool implementations in separate local fixture databases. The frozen implementation accepted it and advanced to source revision 2. The repaired implementation returned `WORKSPACE_HANDOFF_TOO_LARGE`, retained the two-byte blank source at revision 1 and preserved the original current hash. Evidence: `var/handoff-exact-replay.json`.

Focused tests cover publication/check preservation, operation replay and conflicting identity rejection, multibyte and inclusive byte boundaries, serialized software escaping and aggregate file size, unchanged historical unbound profiles, a full mock reject/correct/check/publish/complete path, exact profile context for research/decision, frozen descendant mutation rejection and deduplication. Relevant existing browser, initial-binding, durable-resume and integrated execution regressions also passed: **37 tests, zero failures**. Strict TypeScript 6.0.3 semantic check: **zero errors across 37 source files**, dependency declaration checking skipped. No dependencies installed. These tests demonstrate repaired machinery, not actual model correction or commercial competence.

Commands from this isolated checkout:

```powershell
node --test packages/foundry/test/portfolio-handoff-write.test.ts packages/foundry/test/portfolio-prospective-profile.test.ts packages/foundry/test/portfolio-tools.test.ts packages/foundry/test/portfolio-v4-context.test.ts packages/foundry/test/portfolio-v4-execution.test.ts packages/foundry/test/portfolio-durable-resume.test.ts packages/foundry/test/portfolio-initial-binding.test.ts
node packages/foundry/tools/typecheck-portfolio.mjs C:/Users/14844/AppData/Local/Programs/cursor/resources/app/extensions/node_modules/typescript/lib/typescript.js C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@types
```

## Deliberate limits and continuation boundary

This prevents future oversized writes; it does not automatically repair the oversized source already committed in the live run. No original source was shortened, no task was reset/requeued, no allowance was restored, and no grant was amended. The completed response is not eligible for known-incomplete recovery. This code has a new implementation identity and changes prospective worker context; the old exact V4 approval cannot authorize it.

A future authorized continuation must bind the repaired code/context, record the original attempt and unchanged draft as its parent, explicitly handle the oversized saved source, preserve all consumed admissions and retained exposure, and account for the shared count buffer exactly once. It cannot simply sign another full allowance or pass a changed packet under the historical V4 hash. No such continuation is signed or dispatched here.

The owner dashboard's signed accounting panel correctly shows the live ledger, but legacy preparation text in its model-disabled server can still say approval is absent, and historical completed counts include fixture/developer work. The separate live stop report is the authoritative readable result. This UI limitation was observed and preserved; it does not change grant validity or unlock execution.
