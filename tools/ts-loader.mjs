/**
 * Local TypeScript ESM loader for Node 20 (no --experimental-strip-types).
 * Built-ins only. Resolves @midas/* and *.js -> *.ts, then strips types.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ALIAS = {
  "@midas/eval": join(ROOT, "packages/eval/src/index.ts"),
  "@midas/db": join(ROOT, "packages/db/src/index.ts"),
  "@midas/domain": join(ROOT, "packages/domain/src/index.ts"),
  "@midas/model": join(ROOT, "packages/model/src/index.ts"),
};

function skipWs(s, i) {
  while (i < s.length && /\s/.test(s[i])) i += 1;
  return i;
}

function skipString(s, i) {
  const q = s[i];
  i += 1;
  while (i < s.length) {
    if (s[i] === "\\") { i += 2; continue; }
    if (s[i] === q) return i + 1;
    i += 1;
  }
  return i;
}

function skipBalanced(s, i, open, close) {
  let d = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") { i = skipString(s, i); continue; }
    if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i += 1; continue; }
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === open) d += 1;
    else if (c === close) {
      d -= 1;
      i += 1;
      if (d === 0) return i;
      continue;
    }
    i += 1;
  }
  return i;
}

function consumeType(s, i) {
  i = skipWs(s, i);
  const one = () => {
    i = skipWs(s, i);
    if (s.startsWith("readonly ", i)) i += 9;
    if (s.startsWith("typeof ", i)) i += 7;
    if (s.startsWith("keyof ", i)) i += 6;
    if (s.startsWith("infer ", i)) i += 6;
    if (s.startsWith("unique ", i)) i += 7;
    if (s.startsWith("asserts ", i)) {
      i += 8;
      i = skipWs(s, i);
      while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) i += 1;
      i = skipWs(s, i);
      if (s.startsWith("is ", i)) { i += 3; one(); }
      return;
    }
    if (s[i] === "(") {
      i = skipBalanced(s, i, "(", ")");
      i = skipWs(s, i);
      if (s.startsWith("=>", i)) { i += 2; one(); }
      return;
    }
    if (s[i] === "{") { i = skipBalanced(s, i, "{", "}"); return; }
    if (s[i] === "[") { i = skipBalanced(s, i, "[", "]"); return; }
    if (s[i] === "'" || s[i] === '"') { i = skipString(s, i); return; }
    while (i < s.length && /[A-Za-z0-9_.]/.test(s[i])) i += 1;
    i = skipWs(s, i);
    if (s.startsWith("is ", i)) { i += 3; one(); return; }
    if (s[i] === "<") i = skipBalanced(s, i, "<", ">");
    i = skipWs(s, i);
    while (s[i] === "[") i = skipBalanced(s, i, "[", "]");
  };
  one();
  i = skipWs(s, i);
  while (s[i] === "|" || s[i] === "&") {
    if (s[i + 1] === s[i]) break;
    i += 1;
    one();
    i = skipWs(s, i);
  }
  return i;
}

function wordAt(s, i, w) {
  if (!s.startsWith(w, i)) return false;
  const a = s[i - 1] || " ";
  const b = s[i + w.length] || " ";
  return !/[A-Za-z0-9_]/.test(a) && !/[A-Za-z0-9_]/.test(b);
}

function prevNonWs(s, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(s[j])) j -= 1;
  return s[j] || "";
}

function consumeUntilSemi(s, i) {
  while (i < s.length) {
    if (s[i] === '"' || s[i] === "'") { i = skipString(s, i); continue; }
    if (s[i] === "{") { i = skipBalanced(s, i, "{", "}"); continue; }
    if (s[i] === "(") { i = skipBalanced(s, i, "(", ")"); continue; }
    if (s[i] === "[") { i = skipBalanced(s, i, "[", "]"); continue; }
    if (s[i] === ";") return i + 1;
    i += 1;
  }
  return i;
}

function consumeDecl(s, i) {
  i = skipWs(s, i);
  while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) i += 1;
  i = skipWs(s, i);
  if (s[i] === "<") i = skipBalanced(s, i, "<", ">");
  i = skipWs(s, i);
  if (s.startsWith("extends", i)) { i += 7; i = consumeType(s, i); i = skipWs(s, i); }
  if (s[i] === "=") { i += 1; i = consumeType(s, i); if (s[i] === ";") i += 1; return i; }
  if (s[i] === "{") { i = skipBalanced(s, i, "{", "}"); if (s[i] === ";") i += 1; }
  return i;
}

function isTernaryColon(s, i) {
  let d = 0;
  for (let j = i - 1; j >= 0; j -= 1) {
    const ch = s[j];
    if (ch === ")" || ch === "}" || ch === "]") d += 1;
    else if (ch === "(" || ch === "{" || ch === "[") {
      d -= 1;
      if (d < 0) return false;
    } else if (d === 0 && ch === "?" && s[j + 1] !== "." && s[j + 1] !== "?") {
      const beforeQ = prevNonWs(s, j);
      if (/[A-Za-z0-9_]/.test(beforeQ) && (s[j + 1] === ":" || /\s/.test(s[j + 1]) && s[skipWs(s, j + 1)] === ":")) {
        return false;
      }
      return true;
    }
  }
  return false;
}

export function stripTypes(source) {
  const s = source.replace(/^\uFEFF/, "");
  let i = 0;
  let out = "";
  const stack = [];
  const n = s.length;

  const emitInterp = (from, to) => {
    out += stripTypes(s.slice(from, to));
  };

  while (i < n) {
    if (s[i] === "/" && s[i + 1] === "/") {
      while (i < n && s[i] !== "\n") { out += s[i]; i += 1; }
      continue;
    }
    if (s[i] === "/" && s[i + 1] === "*") {
      out += "/*"; i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) { out += s[i]; i += 1; }
      if (i < n) { out += "*/"; i += 2; }
      continue;
    }
    const c = s[i];
    if (c === '"' || c === "'") {
      const a = i; i = skipString(s, i); out += s.slice(a, i); continue;
    }
    if (c === "`") {
      out += "`"; i += 1;
      while (i < n) {
        if (s[i] === "\\") { out += s[i] + (s[i + 1] || ""); i += 2; continue; }
        if (s[i] === "`") { out += "`"; i += 1; break; }
        if (s[i] === "$" && s[i + 1] === "{") {
          out += "${";
          i += 2;
          const start = i;
          let d = 1;
          while (i < n && d) {
            if (s[i] === '"' || s[i] === "'") { i = skipString(s, i); continue; }
            if (s[i] === "`") { i = skipString(s, i); continue; }
            if (s[i] === "{") d += 1;
            else if (s[i] === "}") {
              d -= 1;
              if (d === 0) break;
            }
            i += 1;
          }
          out += stripTypes(s.slice(start, i));
          if (s[i] === "}") { out += "}"; i += 1; }
          continue;
        }
        out += s[i]; i += 1;
      }
      continue;
    }

    if (wordAt(s, i, "import") || wordAt(s, i, "export")) {
      const kw = s.startsWith("import", i) ? "import" : "export";
      const save = i;
      let j = skipWs(s, i + kw.length);
      if (s.startsWith("type", j) && !/[A-Za-z0-9_]/.test(s[j + 4] || " ")) {
        i = consumeUntilSemi(s, j + 4);
        continue;
      }
      if (kw === "import") {
        const brace = s.indexOf("{", j);
        const from = s.indexOf("from", j);
        if (brace !== -1 && (from === -1 || brace < from)) {
          const endBrace = skipBalanced(s, brace, "{", "}");
          const inner = s.slice(brace + 1, endBrace - 1);
          const cleaned = inner
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part && !part.startsWith("type "))
            .map((part) => part.replace(/^type\s+/, ""))
            .join(", ");
          if (!cleaned) {
            i = consumeUntilSemi(s, endBrace);
            continue;
          }
        }
      }
      if (kw === "export") {
        if (s.startsWith("interface", j) && !/[A-Za-z0-9_]/.test(s[j + 9] || " ")) {
          i = consumeDecl(s, j + 9); continue;
        }
        if (s.startsWith("type", j) && !/[A-Za-z0-9_]/.test(s[j + 4] || " ")) {
          i = consumeDecl(s, j + 4); continue;
        }
      }
      i = save;
    }

    if (wordAt(s, i, "interface")) { i = consumeDecl(s, i + 9); continue; }
    if (wordAt(s, i, "type")) {
      const p = prevNonWs(s, i);
      if (!p || ";{}".includes(p)) { i = consumeDecl(s, i + 4); continue; }
    }

    {
      const mods = ["declare", "abstract", "override", "public", "private", "protected", "readonly"];
      let hit = false;
      for (const w of mods) {
        if (wordAt(s, i, w)) {
          i += w.length;
          i = skipWs(s, i);
          out += " ";
          hit = true;
          break;
        }
      }
      if (hit) continue;
    }

    if (wordAt(s, i, "as") && /[)\]}\w"'`]/.test(prevNonWs(s, i))) {
      i += 2; i = skipWs(s, i);
      if (s.startsWith("const", i) && !/[A-Za-z0-9_]/.test(s[i + 5] || " ")) { i += 5; continue; }
      i = consumeType(s, i); continue;
    }
    if (wordAt(s, i, "satisfies")) { i += 9; i = consumeType(s, i); continue; }

    if (c === "<" && /[A-Za-z0-9_]/.test(s[i - 1] || "")) {
      const end = skipBalanced(s, i, "<", ">");
      const inner = s.slice(i + 1, end - 1);
      if (end > i && !/\|\||&&/.test(inner) && !/^\s*\d/.test(inner)) {
        i = end; continue;
      }
    }

    if (c === "?" && s[skipWs(s, i + 1)] === ":") {
      const beforeQ = prevNonWs(s, i);
      if (/[A-Za-z0-9_]/.test(beforeQ)) {
        i = skipWs(s, i + 1) + 1;
        i = consumeType(s, i);
        continue;
      }
    }

    if (c === ":") {
      const p = prevNonWs(s, i);
      const top = stack[stack.length - 1];
      if (p === "?") {
        const q = i - 1;
        let k = q;
        while (k >= 0 && s[k] !== "?") k -= 1;
        const beforeQ = prevNonWs(s, k);
        if (/[A-Za-z0-9_]/.test(beforeQ)) {
          i += 1;
          i = consumeType(s, i);
          continue;
        }
      }
      if (isTernaryColon(s, i)) { out += c; i += 1; continue; }
      if (p === ")" || (p && /[A-Za-z0-9_\]]/.test(p) && top !== "object") || (top === "paren" && /[A-Za-z0-9_]/.test(p))) {
        i += 1; i = consumeType(s, i); continue;
      }
    }

    if (c === "!" && s[i + 1] !== "=" && s[i + 1] !== "!" && /[A-Za-z0-9_)\]]/.test(prevNonWs(s, i)) && /[\s.[\]),;}\]]/.test(s[i + 1] || ";")) {
      i += 1; continue;
    }

    if (c === "{") {
      const p = prevNonWs(s, i);
      const before = s.slice(Math.max(0, i - 12), i);
      if (/=>\s*$/.test(before)) stack.push("block");
      else if (p === ")" || /\b(else|try|finally|do)\s*$/.test(before) || p === ";" || p === "}") stack.push("block");
      else if (/[=(:,[?|&!]/.test(p) || /\breturn\s*$/.test(before)) stack.push("object");
      else stack.push("block");
      out += c; i += 1; continue;
    }
    if (c === "}") { stack.pop(); out += c; i += 1; continue; }
    if (c === "(") { stack.push("paren"); out += c; i += 1; continue; }
    if (c === ")") { if (stack[stack.length - 1] === "paren") stack.pop(); out += c; i += 1; continue; }
    if (c === "[") { stack.push("bracket"); out += c; i += 1; continue; }
    if (c === "]") { if (stack[stack.length - 1] === "bracket") stack.pop(); out += c; i += 1; continue; }

    out += c; i += 1;
  }

  return out
    .replace(/import\s*\{\s*\}\s*from\s*["'][^"']+["']\s*;?/g, "")
    .replace(/export\s*\{\s*\}\s*;?/g, "");
}

export async function resolve(specifier, context, nextResolve) {
  if (ALIAS[specifier]) return { url: pathToFileURL(ALIAS[specifier]).href, shortCircuit: true };
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL) {
    const ts = join(dirname(fileURLToPath(context.parentURL)), specifier.replace(/\.js$/, ".ts"));
    if (existsSync(ts)) return { url: pathToFileURL(ts).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && !extname(specifier) && context.parentURL) {
    const ts = join(dirname(fileURLToPath(context.parentURL)), `${specifier}.ts`);
    if (existsSync(ts)) return { url: pathToFileURL(ts).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".ts")) {
    return { format: "module", source: stripTypes(readFileSync(fileURLToPath(url), "utf8")), shortCircuit: true };
  }
  return nextLoad(url, context);
}
