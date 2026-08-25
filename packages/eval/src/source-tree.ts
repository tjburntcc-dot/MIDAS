/** Enumerate first-party source files. Used by portability guards. */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "@midas/db";

const ROOTS = ["packages", "apps", "tools"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".turbo", ".cache"]);
const EXTENSIONS = [".ts", ".mjs", ".js"];

export function collectSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let info;
      try { info = statSync(full); } catch { continue; }
      if (info.isDirectory()) { walk(full); continue; }
      if (EXTENSIONS.some((e) => name.endsWith(e))) out.push(full);
    }
  };
  for (const root of ROOTS) walk(repoPath(root));
  return out.sort();
}
