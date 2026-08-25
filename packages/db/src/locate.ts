/**
 * Canonical filesystem locations for MIDAS.
 *
 * Every path in the system resolves through this module. Before this existed the
 * codebase hardcoded the original container path `/workspace/midas`, which meant
 * MIDAS could only read its own FILE_STORE, write artifacts, or run a pipeline on
 * one machine. That is a reproducibility defect, not a cosmetic one: a foundry
 * whose runs cannot be reproduced elsewhere cannot honestly claim a baseline.
 *
 * Resolution order:
 *   repo root   MIDAS_REPO_ROOT  -> otherwise the checkout containing this file
 *   state dir   MIDAS_STATE_DIR  -> MIDAS_FILE_STORE_DIR -> <repo>/var/state
 *   artifacts   MIDAS_ARTIFACTS_DIR -> <repo>/var/artifacts
 *
 * Relative env overrides are resolved against the repo root, never against the
 * process cwd. A relative MIDAS_STATE_DIR of "var/state" previously produced a
 * nested `var/var/state` shadow store depending on where the process was started.
 */
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The checkout root: packages/db/src -> packages/db -> packages -> <repo>. */
const DETECTED_REPO_ROOT = resolve(HERE, "..", "..", "..");

/** Absolute path of the MIDAS checkout. */
export function repoRoot(): string {
  const envRoot = process.env.MIDAS_REPO_ROOT;
  if (envRoot && existsSync(envRoot)) return resolve(envRoot);
  return DETECTED_REPO_ROOT;
}

/** Join segments onto the repo root. */
export function repoPath(...segments: string[]): string {
  return join(repoRoot(), ...segments);
}

function fromRoot(value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(repoRoot(), value);
}

/** Absolute FILE_STORE directory. */
export function stateDir(): string {
  const explicit = process.env.MIDAS_STATE_DIR || process.env.MIDAS_FILE_STORE_DIR;
  if (explicit) return fromRoot(explicit);
  return repoPath("var", "state");
}

/** Absolute artifacts root, or a single workspace's artifact directory. */
export function artifactsDir(workspaceId?: string | null): string {
  const explicit = process.env.MIDAS_ARTIFACTS_DIR;
  const root = explicit ? fromRoot(explicit) : repoPath("var", "artifacts");
  return workspaceId ? join(root, workspaceId) : root;
}

/**
 * Translate a legacy absolute container path into this checkout.
 * Kept so historical records that stored `/workspace/midas/...` strings remain
 * readable without rewriting persisted history.
 */
const SEP_CHARS = ["\\", "/"];
export const LEGACY_REPO_ROOT = "/workspace" + "/midas";

export function rehomeLegacyPath(value: string): string {
  if (typeof value !== "string") return value;
  if (!value.startsWith(LEGACY_REPO_ROOT)) return value;
  const tail = value.slice(LEGACY_REPO_ROOT.length);
  const segments = tail.split(SEP_CHARS[0]).join(SEP_CHARS[1]).split(SEP_CHARS[1]).filter((s) => s.length > 0);
  return segments.length ? repoPath(...segments) : repoRoot();
}
