# Local commercial release demonstration

This is a reproducible development fixture that uses the actual portfolio controller, file tools, source checks, local application runtime, browser, observation bridge and continuity code. Its task choices and output wording are scripted. It provides no evidence of model judgment, independent professional review, merchant engagement, market demand or customer benefit.

The versioned inputs are in `packages/foundry/test/fixtures/commercial-release/`. One context uses permitted FitKitty public excerpts to prepare an exception handoff; it does not represent a relationship with FitKitty. The other is an explicitly hypothetical reporting-readiness service. Both preserve missing facts and the option to keep the existing process.

Run from the repository root with the existing Node installation:

```powershell
node packages/foundry/tools/commercial-release-demo.mjs --fixture
```

The default output directory is `var/commercial-release-demo`. Use `--root` with a fresh absolute directory for a separate run. The demonstration preserves interrupted controller attempts; its scripted worker can recover a known fixture response without contacting a provider. Re-running a completed directory prints its saved receipt.

For each context the actual controller prepares and completes a source-backed response packet and a local handoff application. The browser loads the disclosed case, saves it, reads the export and reloads the page. A scripted adverse usefulness observation then creates a durable next decision, a new mandate and an executable reassessment task carrying that observation in the worker context. The result challenges the choice of work; it does not infer revenue or causation from the owner statement.

`receipt.json` binds the six completed task IDs and artifact hashes, the two saved-record export hashes, ten actual desktop/phone screenshots, and the backup hash. `gallery/index.html` displays those screenshots. The application saves and exports review handoffs; it does not automatically decide return eligibility or reporting definitions.

The demonstration closes its servers before creating the snapshot. It restores into `restored-v1`, starts each restored application, compares the saved export hashes, checks the completed successor decisions and verifies that no live inference authority appeared. The backup format for this demonstration is V2 because it contains functional-project runtime state and no adaptive execution sidecars. The demonstration receipt itself is written after that verified snapshot; the snapshot already contains the business journey and saved application records.

To inspect the retained owner workspace:

```powershell
node packages/foundry/src/pilot/cli.ts serve --root "var/commercial-release-demo" --port 43147
```

Open `http://127.0.0.1:43147/#archive`. In the business selector choose the retail exception sandbox or the reporting-readiness sandbox, then open Outcomes, Results or Work. Fixtures are deliberately hidden from the default new-business selector until the archive is opened. Work contains the locally checked artifacts; Results links the recorded observation to its completed follow-up mandate. Stop the owner server before taking another backup.

## Adaptive continuity V4

V1–3 remain readable with their original hashes and path rules. Existing backup calls retain their previous format selection. For adaptive work with acquired binary material, stopped uncertain command claims or trusted supervisor completion records, select V4 explicitly:

```powershell
node packages/foundry/src/pilot/cli.ts backup --root "C:\absolute\stopped-workspace" --output "C:\absolute\new-backup" --confirm-stopped --format v4
node packages/foundry/src/pilot/cli.ts restore --backup "C:\absolute\new-backup" --target "C:\absolute\new-restore" --hash "<manifest sha256>"
```

V4 permits at most 4096 sidecars and 256 MiB combined sidecar content, with adaptive workspace files up to 16 MiB. Runtime source and execution receipt files keep the 1.5 MiB bound. Path traversal, links and credential or authorization filenames remain rejected. The database retains its separate 512 MiB limit.

Backup requires explicit quiescence and rejects a known live owner or worker process. When temporary WSL services exist, the service controller must have confirmed their stop; the backup gate also checks that the corresponding units are currently inactive. Raw service configurations, runtime handles, lock files and stop-control files are excluded. Sanitized durable records in SQLite remain evidence. A stopped uncertain command claim is retained: restoring it cannot authorize replay, and a genuinely unresolved operation remains unresolved. A bound trusted completion record can be reconciled without dispatching the command again.

SQLite and sidecars are separate snapshots with before/after sidecar hashes. This does not claim an atomic snapshot across all files or permission to resume work. Restores do not copy grant or credential files, start services, or start provider calls.
