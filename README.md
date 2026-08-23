# MIDAS

Walking slice VS-001. Prospect-qualification evaluation for the Atlas agent.

## Honesty boundaries

- This is an engineering walking slice, not a statistical proof that Atlas improved.
- Sealed holdout cases are not in this repository and must not be added.
- The evaluator-only secret is required for presentation-order and prospect-ID randomization.
- `MIDAS_SEALED_CASES_PATH` is reserved for a future evaluator-only configuration. Do not populate it. Do not add holdout files.
- The semantic evidence judge is not implemented. The evidence dimension therefore cannot exceed 50 until that judge exists. Deterministic citation checks are not a substitute for semantic grounding.
- Fixture model responses are labeled `kind: fixture` and are never presented as live model output.
- No production outreach, no real prospect data, no claim of revenue impact.

## Layout

- `apps/web` — Next.js control room placeholder (not wired)
- `apps/api` — Fastify health route
- `apps/worker` — pg-boss worker placeholder
- `packages/eval` — development-suite evaluator (the working engine)
- `packages/domain` — shared types
- `packages/db` — Drizzle schema stubs (no live database required)
- `packages/model` — OpenAI Responses client plus labeled fixture provider
- `contracts/atlas` — frozen task schemas
- `evals/atlas/v0/development` — eight development cases
- `docs/phase0` — Phase 0 benchmark contract

## Commands

Root scripts: `build`, `test`, `typecheck`, `lint`.

Evaluator tests: filter workspace package `@midas/eval` and run its `test` script.

## What is not here

- Sealed ATLAS-SEALED-* holdout cases
- A calibrated semantic evidence judge
- Live evaluation runs against a model
- Persistent promote/reject decisions
