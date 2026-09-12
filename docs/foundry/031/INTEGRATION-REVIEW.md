# Mission 031 integration review

Reviewed 2026-09-12 by the independent development-assistant reviewer, then corrected within delegated file ownership. This is implementation and deterministic test evidence. It does not establish actual-model competence, a useful owner decision, buyer demand, customer acceptance, or provider access.

The material blockers found in the release preparation → investigation → review → planning path have been resolved in the current source. The connected local path passes its focused regression checks. Paid execution still requires the separately reviewed exact proposal and its authority; this review did not use a provider account.

| Finding reproduced | Result after correction |
| --- | --- |
| The decision task received artifact references and a completion summary, but none of the actual reviewed recommendation. It had no tool with which to read that report. | Planning context includes the full current checked service report, its artifact version and hash. The integration test compares the received report with the complete persisted `brief.json`, then exercises the planner's resulting tasks. |
| One allowed 24,000-character public source exceeded the 56,000-byte context limit because its text was repeated in sources, workspace inputs and tool feedback. | Sources appear once as explicitly marked previews. Workspace inputs retain the permitted source IDs; `research.read` retrieves preserved source chunks with offsets, source hash and provenance. Older chunk bytes are omitted with a readable explanation. A real engine test fetches a long page through an injected local reader, reads both chunks, quotes the final paragraph and passes the unchanged service checks. |
| Derived work had no dependency on the decision that created it, so a later correction could stale the decision while leaving its proposed work runnable. | Every derived task depends on its parent planning task. The integration test executes a new service task and quality review, then changes the earlier reviewed artifact and verifies that queued downstream work becomes stale. The quality-review preparer distinguishes the planning artifact from the one authoritative deliverable and refuses unpublished source changes. |
| Ordinary planning accepted priority and cancellation fields but did not apply them. | `Portfolio.applyPlanning` applies the decision, permitted unstarted cancellations, priority, child plan and checked completion in one transaction. Core tests verify rollback and independent-reader visibility. The real engine test confirms the requested cancellation and priority persist. |
| CLI signing populated only the inner approval reference, making the signed envelope fail its own loader. | Both references are populated before signing. An isolated CLI test runs prepare → propose → sign-proposal → preflight with ephemeral test keys and a deliberately nonexistent provider credential path. Both signatures load, the references match and no provider credential or provider request is needed. |

The versioned release uses the declared decision task to consume initial investigation/review feedback. Those two operations retain their observations without creating redundant reassessment calls. Subsequent work still retains its ordinary observation and reassessment behavior. The release-chain test checks this distinction.

Validation from the worktree root:

```powershell
node --test packages/foundry/test/portfolio-engine.test.ts packages/foundry/test/portfolio-core.test.ts packages/foundry/test/portfolio-preparation.test.ts packages/foundry/test/portfolio-integration-review.test.ts
```

Result: **30 tests passed, 0 failed**. The independent integration file contains four tests: the complete release and derived-work lineage; long-source retrieval and quotation; oversized-report rejection before model admission; and the isolated proposal/signing CLI path. Tests use temporary databases, explicitly injected fixtures and ephemeral keys. They do not mutate the owner workspace or historical Mission 030 state.

Practical limits remain explicit. Full dependency reports have an aggregate 18,000-byte planning-context allowance; a larger report produces `DEPENDENCY_REPORT_TOO_LARGE_FOR_PLANNING` before another model admission, rather than silently presenting a partial recommendation. Source previews are incomplete when marked and require further local read actions within the task's finite allowance. The implemented software execution profile remains the bounded quote-to-job product; a capability name cannot add a new trusted application profile. Semantic recommendation quality, independent correction time, actual provider behavior and commercial results require separate observations.
