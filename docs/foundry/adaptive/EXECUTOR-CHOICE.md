# Adaptive executor choice — observed compatibility

Checked 14 September 2026. This release keeps the existing MIDAS business/task controller and adds a scoped executor port. It does not start a second agent controller or silently route to a helper model.

## Decision

The implemented `AdaptiveWorkspace` / `BubblewrapBackend` boundary is retained. Actual isolated command execution is blocked in this host environment: the probe returned `bwrap: open /proc/20/ns/ns failed: No such file or directory` and was terminated at its deadline. Other namespace probes reported `Operation not permitted`. These are environment observations, not successful isolated execution. No unrestricted host fallback was used.

A compatible sandbox environment is required before the live unfamiliar-obstacle demonstration can establish worker command execution, capability acquisition and transfer. Injected executor backends test the shared mechanics and remain explicitly fixture evidence.

## Maintained alternatives considered

| Option | Relevance | Decision for this release |
| --- | --- | --- |
| Existing shared MIDAS executor port with Bubblewrap | Scoped task files, bounded commands, receipts, no competing controller | Implemented; real namespace execution blocked on this host |
| Codex app-server `command/exec` | Maintained command execution without starting a thread or turn | Evaluated; installed stable protocol lacks required restricted read-access fields |
| Codex SDK | Programmatic coding-agent threads and resumption | Useful future worker adapter; not used as an unmetered hidden model helper |
| Agents API | Managed Codex harness, saved sessions and optional hosted/self-hosted sandbox | Candidate managed execution route; current access, authority and integration remain untested |
| Agents SDK | Application-managed agent loop, tools and handoffs | Does not itself establish this host's isolation; no second loop added |

The SDK and managed-runtime distinctions above follow the fetched [Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk) and [official agent runtime comparison](https://developers.openai.com/api/docs/guides/agents). Selecting a different runtime would require explicit model, identity, permission, accounting and lifecycle bindings to MIDAS's existing state.

## Codex app-server: documentation versus installed protocol

The fetched [official app-server documentation](https://learn.chatgpt.com/docs/app-server) describes `command/exec` under the server sandbox without a thread/turn. It documents restricted `readOnlyAccess` roots for `workspaceWrite`; the default is full read access. It separately identifies `process/*` as unsandboxed. Neither unsandboxed process control nor `externalSandbox` without an actual enclosing sandbox is an acceptable substitute.

The public package was installed project-scoped, without lifecycle scripts, under ignored `var/adaptive-codex-toolchain`. Installed package and CLI version: **0.154.0**. No global installation occurred.

The actual executable generated both standard and experimental protocol schemas. In both, `SandboxPolicy`'s `workspaceWrite` properties were exactly:

```text
excludeSlashTmp
excludeTmpdirEnvVar
networkAccess
type
writableRoots
```

Neither generated schema contains `readOnlyAccess`, `readableRoots` or `includePlatformDefaults` for this policy. The experimental schema exposes `permissionProfile`; a documented compatible restricted-read configuration was not established. Supplying unsupported fields and assuming enforcement would be unsafe.

| Generated local evidence | SHA-256 of exact schema bytes |
| --- | --- |
| `var/adaptive-codex-schema/v2/CommandExecParams.json` | `e4f20080b92c6199cf132941840c4bd0fb9a90e3fec197ceb0e1ce9084346e18` |
| `var/adaptive-codex-schema-experimental/v2/CommandExecParams.json` | `fd034b4c85d7b6f466e30a3cbb73db86be1263aca3f81b89b547f14817dfb62e` |

Read access to the full host would expose unrelated businesses, protected material and receipt state outside the task workspace. Writable-root restrictions alone do not satisfy MIDAS's required read isolation. Therefore no speculative Codex backend was shipped and no `command/exec` request was dispatched with weaker permissions.

## What actually ran and what did not

- Public documentation retrieval, public package metadata/install, `codex --version`, app-server help and protocol-schema generation ran.
- The existing executor's real Bubblewrap availability test ran and failed closed.
- Codex app-server authentication, thread, turn, model and sandbox-command calls: **zero**.
- Provider inference/count/retrieval calls for this evaluation: **zero**. No provider credentials were read or copied.
- No model superiority, live adaptive capability or transfer was established by this executor evaluation.

The next execution environment must prove task-only reads/writes, denied unrelated host access, network policy and bounded process lifecycle before receiving business material or a live worker. Once that environment is available, the existing executor port and durable broker can use it without replacing MIDAS's business state, authority or learning records.
