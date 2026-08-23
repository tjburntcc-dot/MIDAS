/** Substantive HTML extraction. Prefer main content. Not a universal production parser. */
export const EXTRACTOR_VERSION = "midas-html-extract-v0.1.0";
export const EXTRACTOR_DISCLOSURE =
  "Deterministic HTML main-content extractor for permitted public pages. Not a universal production parser. Quality checks are heuristic.";

const CHROME_PHRASES = [
  "skip to content",
  "skip to main content",
  "skip navigation",
  "official website of",
  "here is how you know",
  "the .gov means it's official",
  "the site is secure",
  "an official website",
  "share sensitive information",
  "we use cookies",
  "accept all cookies",
  "accept cookies",
  "cookie settings",
  "cookie policy",
  "manage cookies",
  "privacy policy",
  "terms of service",
  "follow us",
  "sign in",
  "subscribe to",
];

function nowIso() {
  return new Date().toISOString();
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTagsKeepBreaks(html) {
  return decodeEntities(String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|main|blockquote|dt|dd)>/gi, "\n")
    .replace(/<(h[1-6]|li|p|dt)(\s[^>]*)?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim());
}

function dropTag(html, tag) {
  const re = new RegExp("<" + tag + "\\b[\\s\\S]*?<\\/" + tag + ">", "gi");
  return String(html || "").replace(re, " ");
}

function dropByAttr(html, attr, values) {
  let out = String(html || "");
  for (const v of values) {
    const re = new RegExp(
      "<([a-z0-9]+)([^>]*" + attr + "\\s*=\\s*[\"'][^\"']*" + v + "[^\"']*[\"'][^>]*)>([\\s\\S]*?)<\\/\\1>",
      "gi"
    );
    out = out.replace(re, " ");
  }
  return out;
}

function firstMatch(html, patterns) {
  for (const re of patterns) {
    const m = String(html || "").match(re);
    if (m && m[0] && m[0].length > 40) return m[0];
  }
  return null;
}

function sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 20);
}

function contentWords(text) {
  return String(text || "").toLowerCase().match(/[a-z][a-z]{3,}/g) || [];
}

function isChromeLine(line) {
  const t = String(line || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (t.length < 8) return true;
  for (const p of CHROME_PHRASES) if (t.includes(p)) return true;
  if (/^menu$|^home$|^search$|^login$|^sign in$|^skip/.test(t)) return true;
  return false;
}

export function looksLikeA11yChrome(text) {
  const t = String(text || "").toLowerCase();
  return /skip to (main )?content/.test(t)
    || (/official website/.test(t) && /here is how you know/.test(t))
    || /the \.gov means it's official/.test(t);
}

export function looksLikeCookieBanner(text) {
  const t = String(text || "").toLowerCase();
  return /we use cookies|accept (all )?cookies|cookie (consent|banner|settings|policy)|manage cookies/.test(t);
}

export function looksLikeVideoPlaceholder(text) {
  const t = String(text || "").toLowerCase().replace(/\s+/g, " ");
  return /please enable javascript to play this video/.test(t)
    || /enable javascript to play this video/.test(t)
    || /javascript to play this video/.test(t)
    || /your browser does not support (the )?video/.test(t);
}

export function looksLikeBoilerplate(text) {
  return looksLikeA11yChrome(text) || looksLikeCookieBanner(text) || looksLikeVideoPlaceholder(text);
}

export function extractSubstantiveHtml(html, opts) {
  const rawHtml = String(html || "");
  const titleM = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? decodeEntities(titleM[1]).replace(/\s+/g, " ").trim() : "";
  let sanitized = rawHtml.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "noscript", "svg", "iframe", "button"]) {
    sanitized = dropTag(sanitized, tag);
  }
  // Unwrap <form> rather than dropping it — some public calendars (e.g. Trumba print) wrap events in a form.
  sanitized = String(sanitized).replace(/<\/?(form)\b[^>]*>/gi, " ");
  sanitized = dropByAttr(sanitized, "role", ["navigation", "banner", "contentinfo", "complementary", "search"]);
  sanitized = dropByAttr(sanitized, "id", ["header", "footer", "nav", "navigation", "menu", "sidebar", "cookie", "consent", "banner", "masthead"]);
  sanitized = dropByAttr(sanitized, "class", ["header", "footer", "nav", "navigation", "menu", "sidebar", "cookie", "consent", "banner", "skip", "usa-banner", "social"]);
  for (const tag of ["nav", "header", "footer", "aside"]) sanitized = dropTag(sanitized, tag);

  const mainHtml = firstMatch(sanitized, [
    /<main\b[\s\S]*?<\/main>/i,
    /<article\b[\s\S]*?<\/article>/i,
    /<(?:div|section)[^>]*(?:id|class)=["'][^"']*(?:main-content|primary-content|article-body|page-content|body-content|content-main)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/i,
    /<(?:div|section)[^>]*(?:id|class)=["'](?:content|main|primary|article)["'][^>]*>[\s\S]*?<\/(?:div|section)>/i,
    /<(?:div|section)[^>]*(?:id|class)=["'][^"']*(?:^|["'\s])(?:content|main|primary|article)(?:["'\s])[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/i,
  ]);
  const usedRegion = mainHtml ? "main_or_article" : "sanitized_full_document";
  const regionHtml = mainHtml || sanitized;

  const blocks = [];
  const pushBlock = (kind, inner) => {
    const text = stripTagsKeepBreaks(inner).replace(/\s+/g, " ").trim();
    if (!text || isChromeLine(text)) return;
    if (text.length < 8) return;
    blocks.push({ kind: kind, text: text });
  };
  const hre = /<(h[1-6]|p|li|td|th|blockquote|caption)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = hre.exec(regionHtml))) {
    const tag = String(m[1] || "").toLowerCase();
    const kind = /^h[1-6]$/.test(tag) ? "heading" : (tag === "li" ? "list" : (tag === "td" || tag === "th" ? "table" : "paragraph"));
    pushBlock(kind, m[3]);
  }
  // Calendar / tile UIs often put titles in spans (e.g. Trumba twTitle) or role=heading.
  if (blocks.length < 4) {
    const spanRe = /<(?:span|div)([^>]*role\s*=\s*["']heading["'][^>]*)>([\s\S]*?)<\/(?:span|div)>/gi;
    while ((m = spanRe.exec(regionHtml))) pushBlock("heading", m[2]);
    const titleRe = /<(?:span|div|a)([^>]*class\s*=\s*["'][^"']*(?:twTitle|event-title|eventTitle|summary)[^"']*["'][^>]*)>([\s\S]*?)<\/(?:span|div|a)>/gi;
    while ((m = titleRe.exec(regionHtml))) pushBlock("heading", m[2]);
    const multiRe = /<(?:span|div)([^>]*class\s*=\s*["'][^"']*(?:multiLine|twDescription|description|event-desc)[^"']*["'][^>]*)>([\s\S]*?)<\/(?:span|div)>/gi;
    while ((m = multiRe.exec(regionHtml))) pushBlock("paragraph", m[2]);
    const locRe = /<(?:span|div)([^>]*class\s*=\s*["'][^"']*(?:twLocation|location)[^"']*["'][^>]*)>([\s\S]*?)<\/(?:span|div)>/gi;
    while ((m = locRe.exec(regionHtml))) pushBlock("paragraph", m[2]);
  }
  if (!blocks.length || blocks.filter((b) => b.kind !== "heading").length < 2) {
    const fallback = stripTagsKeepBreaks(regionHtml);
    for (const para of fallback.split(/\n{2,}|\n/)) {
      const t = para.replace(/\s+/g, " ").trim();
      if (t.length >= 24 && !isChromeLine(t)) blocks.push({ kind: "paragraph", text: t });
    }
  }

  const ordered = [];
  const seen = new Set();
  for (const b of blocks) {
    const key = b.text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(b);
  }

  const substantiveText = ordered.map((b) => (b.kind === "heading" ? b.text : b.text)).join("\n");
  const fullSanitizedText = stripTagsKeepBreaks(sanitized);
  const quality = evaluateExtractionQuality({
    title: title,
    substantiveText: substantiveText,
    sanitizedText: fullSanitizedText,
    usedRegion: usedRegion,
    objectiveText: opts && opts.objectiveText,
    workspaceText: opts && opts.workspaceText,
    maxChars: (opts && opts.maxChars) || 12000,
  });
  const clipped = substantiveText.length > quality.maxChars
    ? substantiveText.slice(0, quality.maxChars)
    : substantiveText;
  return {
    extractorVersion: EXTRACTOR_VERSION,
    disclosure: EXTRACTOR_DISCLOSURE,
    title: title,
    rawHtml: rawHtml,
    sanitizedHtml: sanitized,
    sanitizedText: fullSanitizedText,
    substantiveText: clipped,
    blocks: ordered.slice(0, 80),
    usedRegion: usedRegion,
    quality: quality,
    createdAt: nowIso(),
    notUniversalParser: true,
  };
}

export function evaluateExtractionQuality(args) {
  const title = String((args && args.title) || "");
  const text = String((args && args.substantiveText) || "");
  const sanitized = String((args && args.sanitizedText) || text);
  const maxChars = (args && args.maxChars) || 12000;
  const sents = sentences(text).filter((s) => !isChromeLine(s) && s.split(/\s+/).length >= 6);
  const words = contentWords(text);
  const sanitizedWords = contentWords(sanitized);
  const linkish = (sanitized.match(/\b(home|menu|login|subscribe|follow|share|next|previous)\b/gi) || []).length;
  const navRatio = sanitizedWords.length ? linkish / sanitizedWords.length : 1;
  const domainTerms = [];
  const domainSrc = String(((args && args.objectiveText) || "") + " " + ((args && args.workspaceText) || "")).toLowerCase();
  const domainToks = domainSrc.match(/[a-z][a-z]{3,}/g) || [];
  const stop = new Set(["this", "that", "with", "from", "using", "these", "those", "have", "been", "will", "your", "their", "about", "into", "only", "then", "evaluate", "research", "public", "source", "sources", "permitted"]);
  const wanted = [...new Set(domainToks.filter((t) => !stop.has(t)))].slice(0, 24);
  let domainHits = 0;
  for (const t of wanted) if (text.toLowerCase().includes(t)) { domainHits += 1; domainTerms.push(t); }
  const uniqueWords = new Set(words);
  const contentDensity = words.length ? uniqueWords.size / words.length : 0;
  const titleOnly = Boolean(title) && text.replace(/\s+/g, " ").trim().toLowerCase() === title.toLowerCase();
  const emptyMain = !text.trim() || sents.length === 0;
  const a11y = looksLikeA11yChrome(text) || looksLikeA11yChrome(text.slice(0, 400));
  const cookie = looksLikeCookieBanner(text.slice(0, 400));
  const videoPh = looksLikeVideoPlaceholder(text) || looksLikeVideoPlaceholder(text.slice(0, 400));
  const nonPlaceholderSents = sents.filter((s) => !looksLikeVideoPlaceholder(s));
  const repeated = /(\b\w+\b)(?:\s+\1){4,}/i.test(text);
  const flags = [];
  if (emptyMain) flags.push("empty_main");
  if (titleOnly) flags.push("title_only");
  if (a11y) flags.push("a11y_chrome");
  if (cookie) flags.push("cookie_banner");
  if (videoPh) flags.push("video_placeholder");
  if (nonPlaceholderSents.length < 2) flags.push("too_few_substantive_sentences");
  if (wanted.length && domainHits < 1) flags.push("few_domain_terms");
  if (navRatio > 0.18) flags.push("high_nav_link_ratio");
  if (repeated) flags.push("repeated_boilerplate");
  const leadChrome = looksLikeA11yChrome(text.slice(0, 280)) || looksLikeCookieBanner(text.slice(0, 280));
  if (leadChrome) flags.push("boilerplate_lead");
  const failFlags = flags.filter((f) => f !== "video_placeholder");
  const pass = failFlags.length === 0 && nonPlaceholderSents.length >= 2 && !emptyMain && !titleOnly && !a11y;
  return {
    pass: pass,
    flags: flags,
    substantiveSentenceCount: nonPlaceholderSents.length,
    videoPlaceholder: videoPh,
    minSubstantiveSentences: 2,
    domainTermHits: domainHits,
    domainTerms: domainTerms.slice(0, 8),
    navLinkRatio: Number(navRatio.toFixed(4)),
    maxNavLinkRatio: 0.18,
    contentDensity: Number(contentDensity.toFixed(4)),
    titleOnly: titleOnly,
    a11yChrome: a11y,
    cookieBanner: cookie,
    emptyMain: emptyMain,
    repeatedBoilerplate: repeated,
    maxChars: maxChars,
    usedRegion: (args && args.usedRegion) || null,
    note: pass
      ? "Substantive main-content extract passed heuristic quality checks."
      : "Extract failed heuristic quality: " + flags.join(", "),
  };
}

export const HTML_EXTRACT_FIXTURES = {
  article_main: {
    name: "article_main",
    html: "<html><head><title>Widget Guide</title></head><body><header>Company</header><nav>Home About</nav><a href='#main'>Skip to Content</a><main><h1>How contractors estimate jobs</h1><p>Contractors produce estimates from measurements of area, pitch, and materials.</p><p>Software can turn those measurements into material lists and proposals.</p><ul><li>Repeat residential work is common.</li></ul></main><footer>Privacy policy</footer></body></html>",
    expectSubstantive: ["Contractors produce estimates", "Software can turn"],
    reject: ["Skip to Content", "Privacy policy"],
  },
  nav_heavy: {
    name: "nav_heavy",
    html: "<html><body><nav><a>Home</a><a>Products</a><a>Login</a><a>Subscribe</a></nav><header>Brand</header><div id='sidebar'>Follow us Sign in</div><div class='content'><h1>Pricing notes</h1><p>This product is sold per seat to businesses that already run a weekly estimating meeting.</p><p>It does not publish a conversion rate or average revenue.</p></div><footer>Cookie settings</footer></body></html>",
    expectSubstantive: ["sold per seat", "does not publish a conversion rate"],
    reject: ["Follow us", "Cookie settings"],
  },
  cookie_and_banner: {
    name: "cookie_and_banner",
    html: "<html><body><div class='cookie'>We use cookies. Accept all cookies. Cookie policy.</div><div class='usa-banner'>An official website of the Example agency. Here is how you know. The .gov means it's official.</div><article><h1>Apprenticeship hours</h1><p>Apprentices complete classroom and on-the-job hours before they become journey workers.</p><p>Employers sometimes use software to track those hours and related proposals.</p></article></body></html>",
    expectSubstantive: ["Apprentices complete classroom", "track those hours"],
    reject: ["Accept all cookies", "The .gov means"],
  },
  empty_main: {
    name: "empty_main",
    html: "<html><head><title>Empty</title></head><body><nav>Home Menu Login</nav><main>  </main><footer>Terms of service</footer></body></html>",
    expectSubstantive: [],
    reject: ["Home Menu"],
    expectFlags: ["empty_main"],
  },
};

export function runExtractFixtures() {
  return Object.values(HTML_EXTRACT_FIXTURES).map((fix) => {
    const out = extractSubstantiveHtml(fix.html, { objectiveText: "research operational buying signals for contractors" });
    const text = out.substantiveText;
    const missing = (fix.expectSubstantive || []).filter((s) => !text.includes(s));
    const leaked = (fix.reject || []).filter((s) => text.includes(s));
    return {
      name: fix.name,
      ok: missing.length === 0 && leaked.length === 0,
      missing: missing,
      leaked: leaked,
      flags: out.quality.flags,
      pass: out.quality.pass,
      textPreview: text.slice(0, 180),
    };
  });
}
