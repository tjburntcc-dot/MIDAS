/**
 * What numbers a case actually puts in front of the worker.
 *
 * `supportedQuantities` used to be a human-authored list, and an independent
 * reviewer was asked whether it was complete. That question does not converge:
 * across two rounds the reviewer named entirely different omissions and included
 * things that are not quantities at all. The list was never wrong about the
 * figures it held -- every numeral in every case was declared -- and it was
 * missing the numbers written as words. "Eleven weeks" is a quantity a worker can
 * read and restate as 11, and a scorer that does not know it flags the restatement
 * as invented economics.
 *
 * So completeness stops being a judgement. This walks the case text and returns
 * every numeric token in it, digits and words alike, with the phrase that follows
 * so a unit can be read. The gold then declares what each one MEANS, which is
 * interpretation and is reviewable, and a structural audit refuses any token the
 * gold has neither typed nor explicitly excluded.
 *
 * Deliberately small. This is a token scanner over controlled case prose, not a
 * general parser: it finds the numbers and says where they are, and the gold
 * still has to say what they are.
 */

/** Numbers a case may write as words. Bounded on purpose. */
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
};

/**
 * Words that are numbers in form and never quantities in use.
 *
 * "a second valeter" and "two thirds done" both contain number words that are
 * ordinal or fractional rather than a count of anything the worker can price.
 */
const ORDINAL_OR_FRACTION = /^(first|second|third|fourth|fifth|half|halves|thirds|quarters)$/i;

export interface NumericToken {
  /** As written. */
  text: string;
  value: number;
  /** Digits or a word. */
  form: string;
  /** Character offset in the source. */
  index: number;
  /** The words immediately following, where a unit usually lives. */
  trailing: string;
  /** The words immediately preceding. */
  leading: string;
  /** True when the shape is an identifier, version or bare date rather than evidence. */
  nonEvidentiary: boolean;
  nonEvidentiaryReason: string | null;
}

const DIGIT = "\\$?\\d[\\d,]*(?:\\.\\d+)?";
const WORD = Object.keys(WORD_NUMBERS).join("|");
const TOKEN = new RegExp("(" + DIGIT + ")|\\b(" + WORD + ")\\b", "gi");

/**
 * Shapes that contain digits and are not evidence.
 *
 * An identifier, a version, or a bare year being used as a date. A year is only
 * excluded when nothing around it makes it a quantity: "1900 a month" is a rate
 * whatever it looks like, and the trailing period check runs first.
 */
function classifyNonEvidentiary(text: string, leading: string, trailing: string) {
  const raw = text.replace(/[$,]/g, "");
  if (/[A-Za-z]-?$/.test(leading.trim().slice(-2)) && /^-\d/.test(text)) return "identifier fragment";
  if (/\b(id|ref|no|number|case|record|version|clause|section|schedule)\s*$/i.test(leading)) return "identifier or document reference";
  if (/^v$/i.test(leading.trim().slice(-1))) return "version number";
  const n = Number(raw);
  const looksLikeYear = Number.isInteger(n) && n >= 1900 && n <= 2100 && !/^\$/.test(text);
  const hasUnit = /^\s*(a|per|an)?\s*(day|week|month|quarter|year|hour|evening|morning|weekend)\b/i.test(trailing)
    || /^\s*[a-z]+s?\b/i.test(trailing);
  if (looksLikeYear && !hasUnit && /\b(in|during|since|from|by)\s*$/i.test(leading)) return "a year used as a date";
  return null;
}

export function numericTokens(text: string) {
  const src = String(text || "");
  const out: NumericToken[] = [];
  for (const m of src.matchAll(TOKEN)) {
    const raw = m[0];
    const index = m.index ?? 0;
    const leading = src.slice(Math.max(0, index - 40), index);
    const trailing = src.slice(index + raw.length, index + raw.length + 40);
    const isWord = Boolean(m[2]);
    if (isWord && ORDINAL_OR_FRACTION.test(raw)) continue;
    // "two thirds", "one third": the leading word is part of a fraction.
    if (isWord && /^\s*(thirds?|quarters?|halves|half)\b/i.test(trailing)) continue;
    const value = isWord ? WORD_NUMBERS[raw.toLowerCase()] : Number(raw.replace(/[$,]/g, ""));
    if (!isFinite(value)) continue;
    const reason = classifyNonEvidentiary(raw, leading, trailing);
    out.push({
      text: raw, value, form: isWord ? "word" : "digits", index,
      trailing: trailing.trim(), leading: leading.trim(),
      nonEvidentiary: Boolean(reason), nonEvidentiaryReason: reason,
    });
  }
  return out;
}

/** The distinct values a case makes available as evidence. */
export function evidentiaryValues(text: string) {
  return [...new Set(numericTokens(text).filter((t) => !t.nonEvidentiary).map((t) => t.value))].sort((a, b) => a - b);
}

export interface CoverageResult {
  tokens: NumericToken[];
  /** Values in the text that the gold neither typed nor excluded. */
  uncovered: Array<{ value: number; text: string; trailing: string }>;
  /** Declared quantities whose value appears nowhere in the text. */
  unfounded: Array<{ id: string; value: number }>;
  excludedAndPresent: number;
}

/**
 * Does the declared quantity list cover what the text supplies?
 *
 * This is the check that replaces the reviewer's enumeration. It is exhaustive,
 * it is the same every time it runs, and it costs nothing.
 */
export function quantityCoverage(
  text: string,
  declared: Array<{ id: string; value: number }>,
  excluded: Array<{ value: number; reason: string }> = [],
) {
  const tokens = numericTokens(text);
  const declaredValues = new Set(declared.map((d) => d.value));
  const excludedValues = new Set(excluded.map((e) => e.value));
  const seen = new Map<number, NumericToken>();
  for (const t of tokens) if (!t.nonEvidentiary && !seen.has(t.value)) seen.set(t.value, t);

  const uncovered = [...seen.entries()]
    .filter(([v]) => !declaredValues.has(v) && !excludedValues.has(v))
    .map(([v, t]) => ({ value: v, text: t.text, trailing: t.trailing.slice(0, 40) }));

  const present = new Set([...seen.keys()]);
  const unfounded = declared.filter((d) => !present.has(d.value)).map((d) => ({ id: d.id, value: d.value }));

  return {
    tokens, uncovered, unfounded,
    excludedAndPresent: [...excludedValues].filter((v) => present.has(v)).length,
  };
}

/** Version of the extraction rules, so a change to them changes the campaign identity. */
export const QUANTITY_EXTRACTION_VERSION = "quantity-extraction-v1-digits-and-word-numbers";
