/**
 * Run the discovery layer over the captured primary source of a live pursuit.
 *
 * This is the honest test of the claim that the system can now find a question
 * class nobody pointed it at. It is given the document text and nothing else:
 * no hint about which clause mattered, no domain knowledge, no memory of the
 * earlier failure. Whatever it raises, it raised on structure alone.
 *
 * Read-only. No outbound action of any kind.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { questionsFromSource } from "../packages/eval/src/question-discovery.ts";

const dir = repoPath("var", "state", "pursuit", "idaho-aeyc");
const body = readFileSync(dir + "/RFP_body.txt", "utf8");

// Segment on numbered headings, keeping the heading with its text so a raised
// question can say where in the document it came from.
// The capture contains repeated page content, so identical text is collapsed
// before parsing. Counting the same clause twice would inflate the result.
const seen = new Set();
const parts = body.split(/(?=(?:1[0-9]|[1-9])\.\s+[A-Z])/)
  .map((p) => p.trim())
  .filter((p) => p.length > 40)
  .filter((p) => {
    // The two text layers differ in whitespace, so normalise before comparing.
    const k = p.replace(/\s+/g, "").toLowerCase().slice(0, 160);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
const segments = parts.map((p, i) => {
  const m = p.match(/^((?:1[0-9]|[1-9])\.\s+[A-Za-z& ]{3,40}?)\s+(?=[A-Z])/);
  return { id: "sec-" + (i + 1), heading: m ? m[1].trim() : undefined, text: p.trim() };
});

const questions = questionsFromSource(segments);
const byKind = {};
for (const q of questions) byKind[q.elementKind] = (byKind[q.elementKind] || 0) + 1;

console.log("segments:", segments.length);
console.log("sections:", segments.map((s) => s.heading || "(untitled)").join(" | "));
console.log("questions raised:", questions.length, JSON.stringify(byKind));
console.log("");
console.log("--- PERMISSIONS (the class whose absence produced the wrong verdict) ---");
for (const q of questions.filter((x) => x.elementKind === "permission")) {
  console.log("[" + (q.heading || "?") + "] " + q.excerpt);
}
console.log("");
console.log("--- PROHIBITIONS ---");
for (const q of questions.filter((x) => x.elementKind === "prohibition")) {
  console.log("[" + (q.heading || "?") + "] " + q.excerpt);
}

writeFileSync(dir + "/source-derived-questions.json", JSON.stringify({
  at: new Date().toISOString(),
  documentSha256: "377813e838a00b251ffefd529a6a2e872ef4456843a39b4b791f5a2b0b6bb45f",
  note: "Generated from document structure alone. No domain knowledge, no hint about which clause mattered.",
  segments: segments.length, counts: byKind, questions,
}, null, 1));
console.log("\nwrote source-derived-questions.json");
