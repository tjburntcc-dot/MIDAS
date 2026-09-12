# Remote continuity preparation — Mission 031

This release implements consistent backup, verified restore, and persisted restart behavior. No remote deployment, remote authority, credential transfer, or unattended operation has been performed. A local restart test is evidence for state continuity; it does not establish a running remote service.

## Implemented backup and restore

`packages/foundry/src/portfolio/continuity.ts` exposes:

```ts
backupPortfolio(store, { sourceRoot, backupRoot });
verifyPortfolioBackup({ backupRoot, expectedManifestHash });
restorePortfolio({ backupRoot, targetRoot, expectedManifestHash });
```

All roots must be trusted absolute paths; existing symbolic links or junctions are rejected. The backup and restore destinations must be new directories beneath an existing parent. The source store must be the specified root's `portfolio.sqlite`. These functions do not delete, overwrite existing destinations, execute work, or copy a directory tree.

Backup runs parameterized `VACUUM INTO` against the open SQLite connection. SQLite documents this as a consistent snapshot of a live database, including committed data; an interrupted snapshot can be incomplete. The implementation flushes the resulting file, verifies database integrity and foreign keys, records schema/version and ordered logical table digests, and writes the complete manifest last. A directory without that manifest is not a valid backup. [SQLite VACUUM documentation](https://sqlite.org/lang_vacuum.html)

The snapshot contains the entire state database: ventures, waiting tasks, dependencies, leases, actor/grant records, workspaces, source revisions, artifacts, observations, immutable evidence, model accounting, and unresolved reservations. It deliberately preserves business data; store and transport the backup with the same access restrictions as the live state.

Only `portfolio.authorization.json` and the public verification key `auth/portfolio-owner.pub` may accompany the database. Inline credential fields and private keys in those authority files are rejected. Provider credentials, private signing keys, arbitrary auth files, browser profiles, and machine environment are not copied. This is a narrow file-copy policy, not a claim that arbitrary preexisting database contents have been scanned for secrets. The application must continue its existing policy of never storing credentials in work/evidence records.

Keep the returned `manifestHash` in an independently controlled log. Verification requires that external hash; accepting the hash next to a tampered backup would not authenticate it. Restore verifies every file hash, logical digest, schema, and the implementation hash before creating its target. It copies to exclusive files and verifies readback. An I/O failure after creating a new destination can leave an incomplete new directory; it never replaces an existing installation. There is no automatic cleanup.

Restored authorization files go under `historical-authority/`. No active `portfolio.authorization.json` is installed. `restore.json` explicitly records that model execution remains disabled and recovery is required. A new path, host, profile, or changed executable source does not inherit the old grant. Preserve the original evidence and obtain a separately approved destination binding before paid execution. Historical actor grants remain in the database for audit and scope checks, not as permission to bypass host or channel authority.

The CLI supports `backup --root <absolute-source-root> --backup <absolute-new-backup-root>` and `restore --backup <absolute-backup-root> --target <absolute-new-root> --manifest-hash <independently-retained-hash>`. Run these without `--live`. Restore validates explicit arguments and does not open or create an ordinary workspace before verifying the backup. The destination must be new.

## Concrete hosting arrangement

Use one durable execution host with local block storage and the exact reviewed code/runtime. Keep SQLite, WAL, and shared worker state on that host; do not mount the SQLite database over a network filesystem or synchronize active database files through a cloud drive. All workers and the dashboard use the same database and trusted control process. Artifact sources remain database records; authored JavaScript runs only in the managed browser execution path. Browser engine, operating system, and dependency versions are deployment prerequisites beyond the source hash.

The existing server binds `127.0.0.1` and enforces a fixed Host, matching Origin, session cookie, and CSRF token. Its session creation endpoint is local-session establishment, not remote user authentication. Never expose that port directly to a shared network. Authenticated SSH forwarding can preserve the existing localhost browser origin for initial supervised administration. A remotely accessible web dashboard requires private TLS plus authenticated access, such as an identity-aware reverse proxy or mutually authenticated TLS, and an explicitly reviewed external-origin/proxy integration. The current localhost origin checks must not be weakened by blindly trusting forwarded headers. That integration and a browser test through the authenticated route remain deployment prerequisites.

Use an operating-system service manager (systemd on the intended Linux host, or the host's supported service manager) to supervise the Node process under a dedicated unprivileged account. Pin its working directory, absolute state root, Node version, memory/process limits, shutdown timeout, and logs. Start `serve` with execution disabled for recovery inspection; `serve --live` requires valid separately signed authority and does not itself dispatch work. The existing explicit `run --live` operation performs bounded queue work. A service manager must not interpret an error as permission to issue another provider request.

There must be one active supervisor identity for queue continuation. On planned migration, stop dispatch, let known in-flight work settle where possible, stop the old supervisor, retain its liveness/shutdown evidence, then take the snapshot. On an unplanned outage, establish that the old execution host cannot resume before allowing another host to claim work. Copying state alone is not fencing.

## Recovery and health

On restart, inspect persisted task/step state and use `PortfolioEngine.recover()` / `Portfolio.recover()` with evidence of old-owner liveness. An expired lease is not proof that a provider call or tool effect did not happen. Durable saved outputs and tool operation receipts can settle already completed steps. An unresolved step remains `needs_reconciliation`; its reservation remains held and the task cannot be claimed. Do not clear reservations or invent negative execution evidence to make the queue move.

Unknown provider or token-count outcomes block fresh paid dispatch in the live wrapper. Known incomplete responses may use only the separately approved, explicitly linked recovery procedure described in the live proposal; they never qualify merely because a process timed out. Relocating unresolved accounting to a new grant is not currently automated: the new loader rejects carry-in and historical authority reuse. Authoritative reconciliation and a reviewed destination account transition are required before further paid work; the historical exposure cannot be hidden by creating a fresh database.

A supervisor heartbeat should report the current process identity, last completed queue transition, active lease age, pending reconciliation, last successful database transaction, last backup verification, and remaining authorized exposure. Alert on stale progress or repeated identical failures even when the process is alive. Suppress unchanged status messages. Host service supervision and this externally observed heartbeat still require authorized deployment and an interruption exercise; no scheduled remote monitor is claimed in this release.

The local acceptance test `portfolio-continuity.test.ts` checks a snapshot of waiting/paused work and an in-flight task, restarts from it, verifies actors/grants/evidence, retains uncertain model and task reservations, and prevents claiming the uncertain task. It also proves that post-snapshot writes are absent, tampered backups fail before destination creation, an occupied destination is preserved, and inline authority credentials are rejected. Before unattended operation, additionally test the selected host's power/process interruption, expired/revoked authority, private authentication path, cross-host fencing, encrypted offsite backup retrieval, and accounting reconciliation under the exact deployment configuration.
