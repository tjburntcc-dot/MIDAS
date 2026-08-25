/**
 * Portability and durability guards.
 *
 * MIDAS claims reproducible baselines. That claim is only meaningful if a run can
 * be reproduced on a machine other than the one it was authored on, and if a
 * persisted write either lands completely or fails loudly. Each test here pins a
 * defect that silently broke one of those two properties.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join, isAbsolute } from "node:path";
import { FileStore, repoRoot, repoPath, stateDir, artifactsDir, rehomeLegacyPath, LEGACY_REPO_ROOT } from "@midas/db";
import { stripTypes } from "../../../tools/ts-loader.mjs";
import { collectSourceFiles } from "./source-tree.ts";

describe("filesystem locations resolve to this checkout", () => {
  test("repo root is absolute and contains the workspace manifest", () => {
    const root = repoRoot();
    assert.equal(isAbsolute(root), true);
    assert.equal(existsSync(join(root, "ws.yaml")), true);
    assert.equal(existsSync(join(root, "packages", "eval", "package.json")), true);
  });

  test("state and artifact directories are absolute and inside the checkout by default", () => {
    assert.equal(isAbsolute(stateDir()), true);
    assert.equal(isAbsolute(artifactsDir()), true);
    assert.equal(artifactsDir("ws-demo"), join(artifactsDir(), "ws-demo"));
    assert.equal(repoPath("var", "state"), stateDir());
  });

  test("a relative MIDAS_STATE_DIR resolves against the repo root, not the cwd", () => {
    const previous = process.env.MIDAS_STATE_DIR;
    try {
      process.env.MIDAS_STATE_DIR = "var/state";
      // The nested `var/var/state` shadow store came from resolving this against
      // whatever directory the process happened to start in.
      assert.equal(stateDir(), repoPath("var", "state"));
    } finally {
      if (previous === undefined) delete process.env.MIDAS_STATE_DIR;
      else process.env.MIDAS_STATE_DIR = previous;
    }
  });

  test("legacy container paths rehome onto this checkout", () => {
    assert.equal(rehomeLegacyPath(LEGACY_REPO_ROOT + "/var/state"), stateDir());
    assert.equal(rehomeLegacyPath(LEGACY_REPO_ROOT), repoRoot());
    assert.equal(rehomeLegacyPath("/somewhere/else"), "/somewhere/else");
  });

  test("no source file hardcodes the original container path", () => {
    const offenders = [];
    for (const file of collectSourceFiles()) {
      const text = readFileSync(file, "utf8");
      if (text.includes(LEGACY_REPO_ROOT) && !file.endsWith("locate.ts") && !file.endsWith("portability.test.ts")) {
        offenders.push(file);
      }
    }
    assert.deepEqual(offenders, [], "hardcoded container paths make runs machine-specific");
  });

  test("no source file shells out to Unix-only commands", () => {
    const banned = ['execFileSync("ls"', 'execFileSync("rm"', 'execFileSync("cp"', 'execFileSync("mv"', 'execFileSync("cat"'];
    const offenders = [];
    for (const file of collectSourceFiles()) {
      if (file.endsWith("portability.test.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const b of banned) if (text.includes(b)) offenders.push(file + " :: " + b);
    }
    assert.deepEqual(offenders, []);
  });
});

describe("the TypeScript loader does not silently miscompile", () => {
  test("renamed import specifiers keep their local binding", () => {
    const out = stripTypes('import { repoRoot as midasRepoRoot, stateDir } from "@midas/db";');
    assert.match(out, /repoRoot as midasRepoRoot/);
    assert.match(out, /stateDir/);
  });

  test("type-only imports are removed but value imports beside them survive", () => {
    assert.equal(stripTypes('import type { A } from "x";').trim(), "");
    assert.match(stripTypes('import { type A, b as c } from "x";'), /\{ b as c \}/);
  });

  test("import.meta and dynamic import are expressions, not import clauses", () => {
    const src = 'const HERE = dirname(fileURLToPath(import.meta.url));\nexport function f(): string { return "x"; }';
    const out = stripTypes(src);
    assert.match(out, /import\.meta\.url/);
    assert.equal(out.includes("(): string"), false, "return type should still be stripped");
    assert.match(stripTypes('const m = await import("./x.ts");'), /await import\("\.\/x\.ts"\)/);
  });

  test("a regex containing quote characters does not desynchronise the scanner", () => {
    // /["']/ used to send the scanner into skipString, after which every literal
    // in the rest of the file was mangled -- including HTML test fixtures.
    const src = 'const re = /<div[^>]*class=["\']content["\'][^>]*>/i;\nconst html = "<a>Home</a><h1>T</h1>";';
    const out = stripTypes(src);
    assert.match(out, /<a>Home<\/a><h1>T<\/h1>/);
  });

  test("`type` as an object key or shorthand property is not a type alias", () => {
    assert.match(stripTypes("return { type: type, a: 1 };"), /type: type/);
    assert.match(stripTypes("const o = { type };"), /\{ type \}/);
    assert.equal(stripTypes("type Foo = { a: string };\nconst x = 1;").trim(), "const x = 1;");
  });

  test("modifier keywords used as identifiers survive", () => {
    assert.match(stripTypes("const override = process.env.X;"), /const override = process\.env\.X;/);
    assert.match(stripTypes("const o = { private: true, readonly: 1 };"), /private: true/);
    assert.equal(stripTypes("class K { private x: number = 1; }").includes(": number"), false);
  });

  test("every first-party TypeScript file still parses after type stripping", () => {
    // The loader is the compiler for this whole system. When it desynchronised it
    // did not throw -- it produced a subtly different program. Parsing every
    // stripped file with node itself is the only check that catches that.
    const scratch = mkdtempSync(join(tmpdir(), "midas-parse-"));
    const files = collectSourceFiles().filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
    assert.ok(files.length > 100, "expected the workspace to have TypeScript sources");
    const broken = [];
    files.forEach((file, index) => {
      const stripped = stripTypes(readFileSync(file, "utf8"));
      const scratchFile = join(scratch, "m" + index + ".mjs");
      writeFileSync(scratchFile, stripped, "utf8");
      try {
        execFileSync(process.execPath, ["--check", scratchFile], { stdio: "pipe" });
      } catch (err) {
        broken.push(file + " :: " + String(err.stderr || err.message).split("\n").slice(0, 3).join(" | "));
      }
    });
    rmSync(scratch, { recursive: true, force: true });
    assert.deepEqual(broken, []);
  });
});

describe("FILE_STORE writes are durable", () => {
  test("a completed write leaves no temp file behind", () => {
    const dir = mkdtempSync(join(tmpdir(), "midas-atomic-"));
    const store = new FileStore(dir);
    store.putWorkspace({ id: "ws-atomic", name: "Atomic", createdAt: "2026-08-25T00:00:00.000Z" });
    const leftovers = readdirSync(dir).filter((f) => f.includes(".tmp"));
    assert.deepEqual(leftovers, [], "temp files must be renamed or removed");
    assert.equal(new FileStore(dir).getWorkspace("ws-atomic").name, "Atomic");
  });

  test("temp file names are unique per write so concurrent writers cannot collide", () => {
    const source = readFileSync(repoPath("packages", "db", "src", "file-store.ts"), "utf8");
    assert.equal(source.includes("`${path}.tmp`"), false, "a fixed temp name lets two writers clobber each other");
    assert.match(source, /process\.pid/);
    assert.match(source, /TRANSIENT_RENAME_ERRORS/);
  });

  test("repeated writes to one store stay readable", () => {
    const dir = mkdtempSync(join(tmpdir(), "midas-atomic-loop-"));
    const store = new FileStore(dir);
    for (let i = 0; i < 40; i += 1) {
      store.putWorkspace({ id: "ws-" + i, name: "W" + i, createdAt: "2026-08-25T00:00:00.000Z" });
    }
    assert.equal(new FileStore(dir).listWorkspaces().length, 40);
  });
});
