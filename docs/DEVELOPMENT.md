# Working on MIDAS across machines

## What git carries, and what it does not

| | In the repository | Stays on the machine |
|---|---|---|
| Application source (`apps/`, `packages/`, `tools/`, `evals/`, `contracts/`, `docs/`) | yes | |
| `.env.example` (variable names only) | yes | |
| **API keys / `.env`** | **never** | yes |
| **Companies, employees, approvals, knowledge, training, spend ledger** (`var/`) | **never** | yes |
| Generated artifacts (`var/artifacts/`) | never | yes |
| UI backups (`.midas-ui-backups/`) | never | yes |
| `node_modules/` | never | yes |

GitHub synchronises **source code only**. Your private company data, your API keys, and
the running local server do **not** travel through git. Moving your data to another
machine is a separate, deliberate step (below).

## Clone on another computer

```bash
git clone git@github.com:<your-account>/MIDAS.git
cd MIDAS
pnpm install          # or: npm install
cp .env.example .env  # then fill in real keys
```

Start the server the same way this machine does:

```bash
node --import ./tools/register-ts.mjs apps/api/src/http-server.ts
```

Then open <http://127.0.0.1:3000/> — the village is the homepage.

A fresh clone starts with **no companies**. That is expected: `var/` is not in git.

## Move your private state to the other machine

On the machine that has the data:

```bash
node tools/state/export-state.mjs
# -> midas-state-<timestamp>.json  (manifest + SHA-256 per file)
```

Copy that file across by any private means you trust (USB, private cloud folder,
encrypted transfer). **Do not commit it and do not email it around.**

On the receiving machine:

```bash
node tools/state/import-state.mjs midas-state-<timestamp>.json --dry-run  # verify first
node tools/state/import-state.mjs midas-state-<timestamp>.json            # then restore
```

Import verifies every file's SHA-256 before writing anything, and refuses to overwrite
existing files unless you pass `--force`.

## Letting a coding agent work on the same source

Claude Code, Cursor, or any other authorised agent should:

1. Clone the private repository (they need your GitHub access, not your API keys).
2. Work against the source, commit, and push branches.
3. **Never** be given `.env`, and never be asked to commit `var/`.

Because `var/` is machine-local, two people editing code at once is safe, but they are
each running against **their own separate company data**. There is no shared database.
If you want the same companies on both machines, export and import as above.

## Environment variables

See `.env.example` for the authoritative list. Summary:

| Variable | Required? | What it unlocks |
|---|---|---|
| `OPENAI_API_KEY` | yes, for live work | Employee reasoning, embeddings, lesson extraction |
| `OPENAI_MODEL` | optional | Reasoning model, default `gpt-4.1` |
| `MIDAS_EXTRACTION_MODEL` | optional | Cheaper model for turning sources into lessons |
| `GEMINI_API_KEY` | optional | Watching a public YouTube URL directly |
| `GOOGLE_API_KEY` | optional | Documented fallback if `GEMINI_API_KEY` is unset |
| `TAVILY_API_KEY` | optional | Bounded web search |

The project `.env` **overrides** any machine-wide environment variable of the same name.
That is deliberate: a stale system-wide `OPENAI_API_KEY` from another tool previously
pointed MIDAS at the wrong billing account without any visible sign.

Without `OPENAI_API_KEY` the product still runs; live steps degrade to deterministic
paths and label themselves as such.
