#!/usr/bin/env node
/**
 * MIDAS -> MIDAS-OX-SAFE sanitizer.
 *
 * Builds a physically separate directory containing ONLY an allowlisted subset,
 * intended for an untrusted model that retains everything it sees.
 *
 *   node tools/ox/export-safe.mjs <profile> [--out DIR] [--force]
 *   node tools/ox/export-safe.mjs --list
 *
 * Design rules:
 *   - allowlist only. Nothing is exported unless a profile names it.
 *   - denylist is a second, independent veto that runs after the allowlist.
 *   - no .git, no .env, no var/, no backups, ever, regardless of profile.
 *   - symlinks and any path escaping the repo root are refused outright.
 *   - every file is scanned for secrets AND for sensitive business patterns.
 *   - a manifest with SHA-256 per file is written.
 *   - the script exits non-zero on FAIL and writes nothing on a hard failure.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const DEFAULT_OUT = "C:/Users/14844/Downloads/MIDAS-OX-SAFE";

/* ─────────────────────────── denylist (absolute veto) ─────────────────────── */
const DENY_DIRS = [".git", "var", ".midas-ui-backups", "node_modules", "dist", "build", ".turbo", ".cache", ".vscode", ".idea"];
const DENY_FILE_RE = [
  /^\.env/i, /\.pem$/i, /\.key$/i, /secret/i, /credential/i, /token/i,
  /^auth\.json$/i, /\.sqlite$/i, /\.db$/i, /\.log$/i,
];

/* ───────────────────── sensitive content patterns (scanned) ───────────────── */
const SECRET_RE = [
  { id: "openai_key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/ },
  { id: "openrouter_key", re: /\bsk-or-v1-[A-Za-z0-9]{24,}/ },
  { id: "google_key", re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { id: "github_token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { id: "aws_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "private_key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "bearer", re: /bearer\s+[A-Za-z0-9._-]{24,}/i },
];
/* Business-sensitive, not a credential, but must not leave. */
const SENSITIVE_RE = [
  { id: "workspace_id", re: /\bws-(?:own-\d+|ridgeline|iso-[a-z]+)\b/ },
  { id: "employee_id", re: /\bEMP-\d{3}\b/ },
  { id: "approval_id", re: /\bAPR-\d{3}\b|\bTPK-\d{3}\b/ },
  { id: "real_company", re: /Harbor Oak|Finch & Copper|Cedar Path|Linden Lane|Maple & Twine|RidgeLine/i },
  { id: "owner_identity", re: /tjburntcc|14844/i },
];

/* ────────────────────────────── export profiles ───────────────────────────── */
/* Each profile is a minimum-necessary slice for one class of Ox mission. */
const PROFILES = {
  "schema-guard": {
    why: "Harden the server-side JSON validator that protects MIDAS from a non-schema-enforcing model.",
    files: ["packages/eval/src/schema-guard.ts"],
    fixtures: ["schema-guard"],
  },
  "link-intake": {
    why: "Harden and extend the .docx/URL link extractor. Pure parsing, no business logic.",
    files: ["packages/eval/src/link-intake.ts"],
    fixtures: ["link-intake"],
  },
  "html-extract": {
    why: "Improve readability-style article extraction against adversarial pages.",
    files: ["packages/eval/src/html-extract.ts"],
    fixtures: ["html-extract"],
  },
  "egress-guard": {
    why: "Red-team the outbound secret scanner. Deliberately exposes the patterns so they can be attacked.",
    files: ["packages/model/src/openrouter.ts"],
    fixtures: ["egress-guard"],
  },
};

/* ─────────────────────────────── path safety ──────────────────────────────── */
function assertSafePath(rel) {
  if (rel.includes("..")) throw new Error("path traversal refused: " + rel);
  const abs = resolve(ROOT, rel);
  if (!abs.startsWith(resolve(ROOT) + sep)) throw new Error("path escapes repo root: " + rel);
  if (!existsSync(abs)) throw new Error("allowlisted file does not exist: " + rel);
  const st = lstatSync(abs);
  if (st.isSymbolicLink()) throw new Error("symlink refused: " + rel);
  /* defence in depth: the resolved real path must also stay inside the root */
  const real = realpathSync(abs);
  if (!real.startsWith(realpathSync(ROOT) + sep)) throw new Error("realpath escapes repo root: " + rel);
  const parts = rel.split(/[\\/]/);
  for (const p of parts.slice(0, -1)) if (DENY_DIRS.includes(p)) throw new Error("denied directory in path: " + rel);
  const base = parts[parts.length - 1];
  for (const re of DENY_FILE_RE) if (re.test(base)) throw new Error("denied filename: " + rel);
  return abs;
}

function scan(text, rel) {
  const findings = [];
  for (const p of SECRET_RE) if (p.re.test(text)) findings.push({ severity: "FAIL", kind: "secret", id: p.id, file: rel });
  for (const p of SENSITIVE_RE) {
    const m = text.match(new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g"));
    if (m) findings.push({ severity: "WARN", kind: "sensitive", id: p.id, file: rel, occurrences: m.length, sample: null });
  }
  return findings;
}

/* ──────────────────────────── synthetic fixtures ──────────────────────────── */
/* Real company records never leave. Ox gets invented equivalents. */
const FIXTURES = {
  "schema-guard": {
    "fixtures/cases.json": JSON.stringify({
      note: "Synthetic. No real company, employee, or approval identifiers.",
      schema: {
        name: "widget_report", strict: true,
        schema: {
          "type": "object", additionalProperties: false,
          required: ["summary", "citations", "unknowns"],
          properties: {
            summary: { "type": "string" },
            citations: { "type": "array", items: { "type": "string" } },
            unknowns: { "type": "array", items: { "type": "string" } },
          },
        },
      },
      mustAccept: [
        '{"summary":"ok","citations":["S-1"],"unknowns":[]}',
        '```json\n{"summary":"ok","citations":["S-1"],"unknowns":[]}\n```',
        'Sure!\n{"summary":"ok","citations":["S-1"],"unknowns":[]}\nDone.',
      ],
      mustReject: [
        '{"summary":"ok","citations":["S-1"]}',
        '{"summary":"ok","citations":"S-1","unknowns":[]}',
        'I cannot help with that.',
        '',
      ],
    }, null, 2),
  },
  "link-intake": {
    "fixtures/links.md": [
      "# Synthetic link list (invented, not a real library)",
      "[Widget Basics](https://www.youtube.com/watch?v=AAAAAAAAAA1)",
      "[Same video, mobile share](https://youtu.be/AAAAAAAAAA1?si=xyz)",
      "https://www.youtube.com/shorts/BBBBBBBBBB2",
      "https://www.youtube.com/playlist?list=PLsynthetic",
      "Guide, https://example.org/widgets/guide?utm_source=news",
      "https://example.org/widgets/guide",
      "https://docs.google.com/document/d/synthetic/edit",
    ].join("\n"),
  },
  "html-extract": {
    "fixtures/README.md": "Supply your own synthetic HTML fixtures here. Do not paste real fetched pages that may contain personal data.",
  },
  "egress-guard": {
    "fixtures/attack-strings.md": [
      "# Synthetic strings for red-teaming the egress guard.",
      "# All values below are FAKE and must never be replaced with real ones.",
      "sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "sk-or-v1-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "AIzaCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      "ghp_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
      "AKIAEEEEEEEEEEEEEEEE",
    ].join("\n"),
  },
};

/* ──────────────────────────────── the export ──────────────────────────────── */
const args = process.argv.slice(2);
if (args.includes("--list")) {
  console.log("profiles:");
  for (const [k, v] of Object.entries(PROFILES)) console.log("  " + k.padEnd(16) + v.why);
  process.exit(0);
}
const profileName = args.find((a) => !a.startsWith("--"));
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : DEFAULT_OUT;
const force = args.includes("--force");

const profile = PROFILES[profileName];
if (!profile) {
  console.error("Unknown profile. Run with --list to see the options.");
  process.exit(2);
}

const findings = [];
const manifest = [];
const staged = [];

try {
  for (const rel of profile.files) {
    const abs = assertSafePath(rel);
    const text = readFileSync(abs, "utf8");
    findings.push(...scan(text, rel));
    staged.push({ rel, text });
  }
} catch (err) {
  console.error("FAIL (path safety): " + err.message);
  process.exit(1);
}

for (const key of profile.fixtures || []) {
  for (const [rel, text] of Object.entries(FIXTURES[key] || {})) {
    findings.push(...scan(text, rel));
    staged.push({ rel, text });
  }
}

const fails = findings.filter((f) => f.severity === "FAIL");
const warns = findings.filter((f) => f.severity === "WARN");

console.log("profile: " + profileName);
console.log("files staged: " + staged.length);
console.log("secret findings (FAIL): " + fails.length);
console.log("sensitive findings (WARN): " + warns.length);
for (const w of warns) console.log("   WARN " + w.id + " x" + w.occurrences + " in " + w.file);
for (const f of fails) console.log("   FAIL " + f.id + " in " + f.file);

if (fails.length) {
  console.error("\nRESULT: FAIL — a credential pattern was found. Nothing was written.");
  process.exit(1);
}
if (warns.length && !force) {
  console.error("\nRESULT: FAIL — real business identifiers found in an allowlisted file.");
  console.error("Either sanitize the file, swap it for an interface/spec, or re-run with --force if the");
  console.error("identifiers are genuinely harmless. Nothing was written.");
  process.exit(1);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const s of staged) {
  const dest = join(OUT, s.rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, s.text);
  manifest.push({ path: s.rel.split("\\").join("/"), bytes: Buffer.byteLength(s.text), sha256: createHash("sha256").update(s.text).digest("hex") });
}

const readme = [
  "# MIDAS-OX-SAFE",
  "",
  "Generated by `tools/ox/export-safe.mjs`. **Do not edit by hand and do not add files.**",
  "Regenerate instead: `node tools/ox/export-safe.mjs " + profileName + "`",
  "",
  "## What this is",
  "",
  "An allowlisted slice of a private codebase, prepared for a model that **retains",
  "everything it is shown**. Treat every byte here as public.",
  "",
  "## Rules for anything working in this directory",
  "",
  "- This is the whole world. There is no parent repository to look at.",
  "- Do not ask for, infer, or request credentials, environment files, or application state.",
  "- Do not invent claims about revenue, customers, deployments, or capabilities.",
  "- Fixtures are synthetic. They are not real records and must not be treated as real.",
  "",
  "## Profile",
  "",
  "`" + profileName + "` — " + profile.why,
  "",
  "## Contents",
  "",
  ...manifest.map((m) => "- `" + m.path + "` (" + m.bytes + " bytes)"),
  "",
].join("\n");
writeFileSync(join(OUT, "README.md"), readme);

const manifestDoc = {
  kind: "midas-ox-safe-manifest",
  profile: profileName,
  why: profile.why,
  generatedAt: new Date().toISOString(),
  sourceRepoNotIncluded: true,
  denyDirs: DENY_DIRS,
  denyFilePatterns: DENY_FILE_RE.map(String),
  secretScan: { patterns: SECRET_RE.map((p) => p.id), findings: fails.length },
  sensitiveScan: { patterns: SENSITIVE_RE.map((p) => p.id), findings: warns.length, forced: force && warns.length > 0 },
  symlinkCheck: "every allowlisted path lstat'd and realpath-confirmed inside the repo root",
  files: manifest.concat([{ path: "README.md", bytes: Buffer.byteLength(readme), sha256: createHash("sha256").update(readme).digest("hex") }]),
  result: "PASS",
};
writeFileSync(join(OUT, "MANIFEST.json"), JSON.stringify(manifestDoc, null, 2));

console.log("\nRESULT: PASS");
console.log("written to: " + OUT);
console.log("files: " + (manifest.length + 1) + " (including README.md, plus MANIFEST.json)");
