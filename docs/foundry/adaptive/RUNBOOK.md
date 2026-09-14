# Adaptive Operator — open and exercise the integrated release

This continues verified Mission034 (`15cb7731803e03344deee97f8608a14426f7d4dd`) on `codex/adaptive-operator-integration`. It uses the existing MIDAS owner workspace, task controller, evidence store, authorization, provider ledger and local finalizer.

## Launch the working owner experience

From the repository root with Node 24.19 or newer:

```sh
node packages/foundry/src/adaptive/demo.ts --root var/adaptive-release --fixture
node packages/foundry/src/pilot/cli.ts serve --root var/adaptive-release --port 43146
```

Open `http://127.0.0.1:43146/#adaptive` **on the machine running that server**. This address is not a hosted deployment. The current ChatGPT environment cannot expose its loopback server to your browser; run these commands in your checkout. Existing Windows Mission034 data need not be moved or overwritten: the commands create a separate local root. Commands work without provider credentials or inference requests.

1. Select **Adaptive import lab — scripted fixture**.
2. Open **Adaptive**. Inspect the failed first command, diagnosed delimiter mismatch, exact file patch, passing check, parent resumption and retained candidate.
3. Open **Work**. Inspect both completed supplier-normalization operating packets. The first synthetic total is 3700 minor units; the second is 1300. The shared finalizer preserved actual checked source and local publications.
4. Return to **Adaptive**. Inspect the second task's candidate import, observed precondition and later successful check. Its provenance remains **fixture**, and the candidate remains **unqualified**.
5. Choose **Prepare adaptive work**. Set an objective, acceptance details, output type and baseline or lean instructions. Saving creates a persisted new assignment; it grants no spending or command execution beyond its declared scope.
6. Refresh/restart the server. Task records, failed attempts, files and candidate evidence remain available.

The fixture transformer really processes its synthetic records, but its choices and injected executor are scripted. It does not execute arbitrary generated code and does not establish unfamiliar-obstacle competence or transfer. It is deliberately unsuitable as a live worker backend.

## Runtime boundary

A new adaptive task receives the original business objective, permitted evidence, delivery tools and a scoped multi-file workbench through `adaptive.perform`. The worker chooses intermediate methods within the declared model/tool ceilings. It can make targeted edits, inspect retained receipts, execute permitted isolated commands, record a capability episode, verify current files against observed checks, resume parent work, and retain/import an unqualified candidate. Required delivery checks and review still apply.

The production command backend requires **Linux Bubblewrap with functioning namespaces** and a compatible project runtime. Host execution is never a fallback. This host denies those namespaces. Current commands have networking disabled, a 60-second maximum and no persistent service lifecycle. Dependencies can be constructed in the workbench or used when already available inside its environment; arbitrary internet package installation and documentation browsing are not connected to this adaptive tool. The existing public discovery workflow remains separate.

The owner UI itself can run without this command backend. Existing MIDAS managed application previews remain the route for delivered application interaction. Browser acceptance requires a working local browser installation.

The former Windows grants and unsigned Mission034/R5 packets do not authorize these changed files. Use existing pilot proposal/signing tools for a **fresh exact task and implementation binding** only after scope and resources are supplied. No new live proposal, signature, provider credential access or spending occurred in this release.

## Verification

```sh
node --test packages/foundry/test/adaptive-*.test.ts
node --test packages/foundry/test/pilot-continuity-runtime.test.ts packages/foundry/test/pilot-diagnosis-authorized.test.ts
```

The signed integration test uses ephemeral test keys and an injected mock provider transport. Its counted/create/retrieve messages are not real provider requests. Tests need no customer data. Semantic TypeScript checking additionally requires installed TypeScript and Node type definitions.

See [COMPLETION.md](COMPLETION.md), [VERIFICATION.json](VERIFICATION.json), [EXECUTOR-CHOICE.md](EXECUTOR-CHOICE.md), and [WORKER-AUDIT.md](WORKER-AUDIT.md). The existing durable next-action ledger remains [the operating execution plan](../../intelligence/EXECUTION.md).
