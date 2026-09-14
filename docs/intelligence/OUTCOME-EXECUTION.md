# Signed outcome execution

`packages/foundry/src/pilot/outcome-cli.ts` is a separate entry point for one
persisted `pilot-outcome-mandate`. It is not wired into the ordinary owner UI or
the shared pilot CLI. It creates local artifacts only. It has no command for
accounts, sending, payments, customer contact, deployment, signing without an
explicit supplied key, or provider fallback.

Run it from `packages/foundry` with an absolute execution root that contains
`pilot.sqlite`. The root is also where a signed envelope is installed.

```powershell
node src/pilot/outcome-cli.ts prepare \
  --root C:/absolute/pilot-root \
  --outcome outcome-EXISTING-MANDATE-ID \
  --id outcome-034-owner-approved-name \
  --project proj_OWNER_CONFIRMED \
  --credential-file C:/protected/location/openai.key \
  --expires-at 2026-09-15T18:00:00.000Z \
  --count-reserve 301 \
  --mode live \
  --output C:/absolute/review/outcome-packet
```

Preparation is safe to perform before approval. It produces the exact unsigned
proposal, exact initial planner request, and execution requirements under the
specified output directory. It reads no credential and makes no count or model
request. It freezes the current mandate, original business/source IDs, source
hashes and permissions, numeric call/repair caps, procedures, schemas, tools,
and every loaded `packages/foundry/src/**/*.ts` source file.

The packet must be regenerated after any source, procedure, schema, tool,
worker-development, execution, check, or Foundry source-code change. Do not
freeze or sign a final packet while the product worktree is still changing.

After the owner has reviewed the exact proposal hash and supplied a principal
and approval reference, use explicit protected key files:

```powershell
node src/pilot/outcome-cli.ts sign \
  --root C:/absolute/pilot-root \
  --proposal C:/absolute/review/outcome-packet/pilot.outcome.authorization.request.json \
  --approve-proposal-hash EXACT_HASH_PRINTED_BY_PREPARE \
  --principal owner-identifier \
  --approval-reference OWNER_REVIEW_REFERENCE \
  --owner-public-key C:/protected/location/owner.pub \
  --owner-private-key C:/protected/location/owner.key
```

Signing writes exactly one `pilot.outcome.authorization.json` and pins the
matching `auth/portfolio-owner.pub`. The unsigned proposal itself has no
execution authority. The command verifies the supplied key pair locally and
does not read the provider credential or contact a provider.

Only a signed, current `mode: live` grant can use the normal run command:

```powershell
node src/pilot/outcome-cli.ts run --root C:/absolute/pilot-root
node src/pilot/outcome-cli.ts resume --root C:/absolute/pilot-root
```

`run` first performs the single admitted planner decision, accepts a persisted
prepare or reject decision, then continues the permitted dependency graph until
it completes, blocks, requires correction, pauses, or reaches its bounded
capacity. It does not pause after each stage. `resume` follows the same route;
it can only retrieve an already admitted response by its original response ID.
It never creates a replacement request for unknown creation, cancellation,
failed terminal state, changed scope, or exhausted capacity.

Use the local status and control commands with the outcome ID:

```powershell
node src/pilot/outcome-cli.ts status --root C:/absolute/pilot-root --outcome outcome-EXISTING-MANDATE-ID
node src/pilot/outcome-cli.ts control --root C:/absolute/pilot-root --outcome outcome-EXISTING-MANDATE-ID --action pause
```

`status` reads persisted outcome state without loading a credential or making a
provider request. `control` still requires the signed grant and accepts only
`pause`, `resume`, or `cancel`. A later owner correction must stay within the
grant’s declared repair reserve and original source scope; it receives a fresh
stable correction task ID while historical admissions remain retained.

`--mode mock` exists solely for injected test transports. The standalone CLI
does not accept a mock transport argument, so it cannot accidentally turn a
plaintext mock proposal into a live or fixture execution path.
