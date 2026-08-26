/**
 * Build the Opportunity Researcher instrument from real fetched pages.
 *
 * This instrument has a property the earlier ones did not: its gold is
 * objectively checkable. A case supplies the actual page text, and the question
 * is whether a stated fact appears in that text. Presence of a string in a
 * supplied document is not a matter of author judgement, which is what went
 * wrong with the qualifier's numeric gold.
 *
 * Gold is therefore derived mechanically:
 *   - a fact is `present` if a deterministic pattern finds it in the page text,
 *     and the matched span is recorded as the expected evidence;
 *   - a fact is `absent` if no pattern finds it.
 * The worker must recover the present ones and refuse to invent the absent ones.
 *
 * Pages are captured once and frozen into the case set, so evaluation is
 * reproducible and costs no network calls.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/build-researcher-cases.mjs
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { FileStore, stateDir, repoPath } from "@midas/db";
import { listWorkItems } from "../packages/eval/src/work-item.ts";

const store = new FileStore(stateDir());

/**
 * HTML to text.
 *
 * Entity decoding is done properly rather than for the two commonest entities.
 * The first version left numeric entities intact, so a redaction placeholder
 * written as "email&#160;protected" survived into the reference text as garbage.
 * Every quote the worker offered on those pages was then judged unfaithful while
 * being 82 to 89 per cent literally present: the worker quoted what it was shown
 * and the reference text was the thing that was corrupted.
 */
const NAMED_ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'",
  ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: "-", mdash: "-", hellip: "...",
};

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const v = NAMED_ENTITIES[String(name).toLowerCase()];
      return v === undefined ? m : v;
    });
}

function textOf(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic fact detectors.
 *
 * Strengthened after the first evaluation showed the detector, not the worker,
 * was wrong on half the disputed facts: it missed a budget phrased "at $5,000 and
 * $10,000" and an address written with a space before the domain suffix. Both are
 * general page-formatting realities, not properties of those two pages.
 *
 * Redaction is handled explicitly. Many boards replace addresses with a
 * placeholder such as an asterisk run or the literal words "email protected".
 * A redacted address is NOT a usable contact, so it counts as absent, and a
 * worker that reports it as the contact is making a real error rather than
 * reading carefully.
 */
const REDACTION = /\*{2,}@|\[email\s*protected\]|email\s+protected|@\s*\*{2,}/i;

const DETECTORS = {
  budget: [
    /(?:budget|not to exceed|estimated cost|price range|contract value|compensation)[^.]{0,140}?\$\s?[0-9][0-9,]{2,}(?:\s?(?:-|to|and)\s?\$?\s?[0-9][0-9,]{2,})?/i,
    // "accomplish at $5,000 and $10,000" -- an amount offered for the work, without the word budget.
    /(?:at|up to|between|around|approximately)\s?\$\s?[0-9][0-9,]{2,}(?:\s?(?:-|to|and)\s?\$?\s?[0-9][0-9,]{2,})?/i,
    /\$\s?[0-9][0-9,]{3,}(?:\s?(?:-|to|and)\s?\$?\s?[0-9][0-9,]{3,})?[^.]{0,90}?(?:budget|contract|project|award|engagement|fee)/i,
  ],
  deadline: [
    /(?:due (?:by|on|date)|deadline|proposals?\s+(?:are\s+)?due|submissions?\s+(?:close|due)|no later than|closes on|questions are due)[^.]{0,140}/i,
  ],
  contact: [
    // Addresses survive HTML-to-text with stray spaces around the dots.
    /[a-z0-9._%+-]+@[a-z0-9.\- ]{2,40}\.\s?[a-z]{2,}/i,
    /(?:contact|questions?)[^.]{0,50}(?:should be )?(?:directed|sent|addressed|submitted)[^.]{0,100}/i,
  ],
};

function detect(text) {
  const out = {};
  for (const [fact, patterns] of Object.entries(DETECTORS)) {
    let span = null;
    for (const re of patterns) {
      const m = text.match(re);
      if (m) { span = m[0].trim().slice(0, 220); break; }
    }
    // A redacted address is not a contact anyone can use, so the fact is absent
    // and a worker reporting the placeholder is wrong rather than thorough.
    if (fact === "contact" && span && REDACTION.test(span)) {
      const alt = text.match(/[a-z0-9._%+-]+@[a-z0-9.\- ]{2,40}\.\s?[a-z]{2,}/gi) || [];
      const usable = alt.find((a) => !REDACTION.test(a));
      span = usable || null;
    }
    out[fact] = span ? { present: true, span } : { present: false, span: null, redacted: fact === "contact" && REDACTION.test(text) };
  }
  return out;
}

const items = listWorkItems(store, "ws-hemmer").filter((w) => w.source && w.source.url);
console.log("capturing", items.length, "real pages");

const cases = [];
for (const w of items) {
  let html = "";
  let status = 0;
  try {
    const r = await fetch(w.source.url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    status = r.status;
    if (r.ok) html = await r.text();
  } catch { status = 0; }
  if (!html) { console.log("  skip (unfetchable " + status + "): " + w.title.slice(0, 50)); continue; }

  // Trim to a workable window. The whole point is that the worker must read a
  // real page, so nav and boilerplate stay in rather than being cleaned away.
  const text = textOf(html).slice(0, 12000);
  if (text.length < 400) { console.log("  skip (too little text): " + w.title.slice(0, 50)); continue; }

  const facts = detect(text);
  cases.push({
    case_id: "OR-" + createHash("sha256").update(w.source.url).digest("hex").slice(0, 6).toUpperCase(),
    title: w.title,
    url: w.source.url,
    workItemId: w.id,
    page_text: text,
    gold: {
      facts,
      presentFacts: Object.entries(facts).filter(([, v]) => v.present).map(([k]) => k),
      absentFacts: Object.entries(facts).filter(([, v]) => !v.present).map(([k]) => k),
    },
  });
  console.log("  captured " + Object.entries(facts).filter(([, v]) => v.present).map(([k]) => k).join(",").padEnd(24) + w.title.slice(0, 50));
}

// Split by hash so the assignment is stable and not chosen to flatter a result.
const sorted = cases.slice().sort((a, b) => a.case_id.localeCompare(b.case_id));
const dev = sorted.filter((_, i) => i % 3 === 0);
const sealed = sorted.filter((_, i) => i % 3 !== 0);

function pack(id, list, note) {
  return { id, version: id, n: list.length, synthetic: false, realPages: true, note, cases: list };
}
const devDoc = pack("hemmer-opportunity-researcher-dev-v0", dev,
  "Development cases. Real captured pages; gold derived by deterministic detection of fact spans in the supplied text.");
const sealedDoc = pack("hemmer-opportunity-researcher-sealed-v0", sealed,
  "Sealed holdout. Real captured pages, private state only, never committed.");

mkdirSync(repoPath("evals", "opportunity-researcher", "v0"), { recursive: true });
const devPath = repoPath("evals", "opportunity-researcher", "v0", "dev_cases_v0.json");
writeFileSync(devPath, JSON.stringify(devDoc, null, 2) + "\n", "utf8");

mkdirSync(join(stateDir(), "sealed"), { recursive: true });
const sealedPath = join(stateDir(), "sealed", "opportunity-researcher-sealed-v0.json");
writeFileSync(sealedPath, JSON.stringify(sealedDoc, null, 2) + "\n", "utf8");

const devSha = createHash("sha256").update(readFileSync(devPath)).digest("hex");
const sealedSha = createHash("sha256").update(readFileSync(sealedPath)).digest("hex");
const factMix = {};
for (const c of sealed) for (const f of c.gold.presentFacts) factMix[f] = (factMix[f] || 0) + 1;

writeFileSync(repoPath("evals", "opportunity-researcher", "v0", "manifest.json"), JSON.stringify({
  id: "hemmer-opportunity-researcher-v0",
  dev: { path: "evals/opportunity-researcher/v0/dev_cases_v0.json", n: dev.length, sha256: devSha },
  sealed: { id: sealedDoc.id, path: "var/state/sealed/opportunity-researcher-sealed-v0.json", n: sealed.length, sha256: sealedSha, committed: false },
  goldMethod: "Deterministic span detection over the captured page text. A fact is present only if a pattern matched, and the matched span is the expected evidence. Presence of a string in a supplied document is objectively checkable, unlike an author's numeric estimate.",
  sealedPresentFactMix: factMix,
  sealedAbsentFactCount: sealed.reduce((a, c) => a + c.gold.absentFacts.length, 0),
  note: "Pages are real and captured once. Evaluation replays the frozen text and makes no network calls.",
}, null, 2) + "\n", "utf8");

console.log("\ndev " + dev.length + " | sealed " + sealed.length + " " + sealedSha.slice(0, 16));
console.log("sealed present-fact mix:", JSON.stringify(factMix), "| absent-fact slots:", sealed.reduce((a, c) => a + c.gold.absentFacts.length, 0));
