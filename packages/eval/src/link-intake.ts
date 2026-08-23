/* ============================================================================
   DOCUMENT LINK INTAKE
   Pull a link library out of a Google Docs .docx export, a Markdown file, a
   CSV, or pasted text - including hyperlinks hidden behind visible titles.
   No third-party dependency: .docx is a ZIP, and zlib is built into Node.
   ============================================================================ */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export const LINK_INTAKE_VERSION = "link-intake-v1";

function txt(v) { return String(v == null ? "" : v); }

/* ------------------------------------------------------- minimal unzip ---- */
/* Reads the ZIP central directory and inflates only the entries we need. */
export function unzipEntries(buf, wanted) {
  const out = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a readable .docx (no ZIP directory found).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");

    if (!wanted || wanted.includes(name)) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.slice(dataStart, dataStart + compSize);
      try {
        out[name] = method === 0 ? raw.toString("utf8") : inflateRawSync(raw).toString("utf8");
      } catch (e) { /* skip an entry we cannot inflate */ }
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* -------------------------------------------------------- url handling ---- */
const YT_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"];

export function classifyUrl(raw) {
  let u;
  try { u = new URL(txt(raw).trim()); } catch (e) { return { kind: "invalid", reason: "not a URL" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { kind: "unsupported", reason: u.protocol + " links are not supported" };
  }
  const host = u.hostname.toLowerCase();

  if (YT_HOSTS.indexOf(host) >= 0) {
    const listId = u.searchParams.get("list");
    const vid = u.searchParams.get("v");
    if (u.pathname === "/playlist" || (listId && !vid)) {
      return { kind: "playlist", listId,
        reason: "a playlist is not a video; its individual videos were not enumerated" };
    }
    let id = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (u.pathname === "/watch") id = vid;
    else if (u.pathname.indexOf("/shorts/") === 0) id = u.pathname.split("/")[2];
    else if (u.pathname.indexOf("/embed/") === 0 || u.pathname.indexOf("/live/") === 0) id = u.pathname.split("/")[2];
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
      return { kind: "youtube", videoId: id,
        note: listId ? "part of a playlist; the single video was taken, the playlist was not expanded" : null };
    }
    return { kind: "unsupported", reason: "a YouTube link without a recognisable video id" };
  }
  if (/^(docs|drive)\.google\.com$/.test(host)) {
    return { kind: "unsupported", reason: "Google Drive links need their own sharing permissions" };
  }
  return { kind: "article", host };
}

/* Canonical form used for dedup: youtube collapses to the video id. */
export function normalizeUrl(raw, cls) {
  const c = cls || classifyUrl(raw);
  if (c.kind === "youtube") return "https://www.youtube.com/watch?v=" + c.videoId;
  try {
    const u = new URL(txt(raw).trim());
    u.hash = "";
    const strip = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "si"];
    for (const p of strip) u.searchParams.delete(p);
    let s = u.toString();
    if (s.charAt(s.length - 1) === "/" && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch (e) { return txt(raw).trim(); }
}

/* --------------------------------------------------- extract from docx ---- */
function decodeXml(s) {
  return txt(s)
    .split("&lt;").join("<")
    .split("&gt;").join(">")
    .split("&quot;").join('"')
    .split("&apos;").join("'")
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(Number(d)); })
    .split("&amp;").join("&");
}
function runText(xmlChunk) {
  const parts = xmlChunk.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g) || [];
  return decodeXml(parts.map(function (t) { return t.replace(/<[^>]+>/g, ""); }).join(""));
}

export function extractFromDocx(buf) {
  const files = unzipEntries(buf, ["word/document.xml", "word/_rels/document.xml.rels"]);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("That .docx has no word/document.xml - it may not be a Word or Google Docs export.");
  const rels = files["word/_rels/document.xml.rels"] || "";

  /* rId -> external target */
  const relMap = {};
  const relRe = /<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"[^>]*?>/g;
  let rm;
  while ((rm = relRe.exec(rels)) !== null) {
    if (/^https?:/i.test(rm[2])) relMap[rm[1]] = decodeXml(rm[2]);
  }

  const found = [];

  /* hyperlinks: the visible label is the run text inside <w:hyperlink> */
  const hRe = /<w:hyperlink\b[^>]*?r:id="([^"]+)"[^>]*?>([\s\S]*?)<\/w:hyperlink>/g;
  let hm;
  while ((hm = hRe.exec(doc)) !== null) {
    const url = relMap[hm[1]];
    if (!url) continue;
    const label = runText(hm[2]).replace(/\s+/g, " ").trim();
    found.push({ url: url, title: label || null, via: "hyperlink" });
  }

  /* bare URLs typed into the body */
  const bodyText = runText(doc);
  const bare = bodyText.match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  for (const m of bare) found.push({ url: m, title: null, via: "plain_text" });

  return { found: found, bodyText: bodyText.slice(0, 200000), hyperlinkCount: Object.keys(relMap).length };
}

/* --------------------------------------------- extract from plain text ---- */
export function extractFromText(text) {
  const found = [];
  const src = txt(text);
  const claimed = {};

  /* markdown [title](url) keeps the visible title */
  const mdRe = /\[([^\]]{1,200})\]\((https?:\/\/[^\s)]+)\)/g;
  let m;
  while ((m = mdRe.exec(src)) !== null) {
    found.push({ url: m[2], title: m[1].trim() || null, via: "markdown_link" });
    claimed[m[2]] = true;
  }
  /* "title, url" or "title | url" rows */
  for (const line of src.split(/\r?\n/)) {
    const cm = line.match(/^\s*(.+?)\s*[,|\t]\s*(https?:\/\/\S+)\s*$/);
    if (cm && !claimed[cm[2]]) {
      found.push({ url: cm[2], title: cm[1].replace(/^["']|["']$/g, "").trim() || null, via: "delimited_row" });
      claimed[cm[2]] = true;
    }
  }
  const bare = src.match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  for (const u of bare) if (!claimed[u]) found.push({ url: u, title: null, via: "plain_text" });

  return { found: found, bodyText: src.slice(0, 200000), hyperlinkCount: 0 };
}

/* ------------------------------------------------------------ the API ---- */
export function discoverLinks(input) {
  let raw;
  try {
    if (input && input.filePath) {
      const buf = readFileSync(input.filePath);
      raw = /\.docx$/i.test(input.filePath) ? extractFromDocx(buf) : extractFromText(buf.toString("utf8"));
    } else if (input && input.docxBase64) {
      raw = extractFromDocx(Buffer.from(input.docxBase64, "base64"));
    } else if (input && input.text) {
      raw = extractFromText(input.text);
    } else {
      return { ok: false, error: "Supply a file path, a .docx, or some text containing links.", errorStatus: 400 };
    }
  } catch (err) {
    return { ok: false, error: txt(err && err.message).slice(0, 240), errorStatus: 400 };
  }

  const seen = {};
  const links = [];
  const rejected = [];
  let duplicates = 0;

  for (const f of raw.found) {
    const cls = classifyUrl(f.url);
    if (cls.kind === "invalid" || cls.kind === "unsupported" || cls.kind === "playlist") {
      rejected.push({ url: f.url, title: f.title, kind: cls.kind, reason: cls.reason });
      continue;
    }
    const norm = normalizeUrl(f.url, cls);
    const prior = seen[norm];
    if (prior) {
      duplicates++;
      /* a hyperlink's visible title beats a bare repeat of the same URL */
      if (!prior.title && f.title) prior.title = f.title;
      continue;
    }
    const row = {
      url: norm, originalUrl: f.url, title: f.title, kind: cls.kind,
      videoId: cls.videoId || null, host: cls.host || null, via: f.via, note: cls.note || null,
    };
    seen[norm] = row;
    links.push(row);
  }

  const youtube = links.filter(function (l) { return l.kind === "youtube"; });
  const articles = links.filter(function (l) { return l.kind === "article"; });

  return {
    ok: true, built: true, version: LINK_INTAKE_VERSION,
    counts: {
      discovered: raw.found.length,
      unique: links.length,
      youtube: youtube.length,
      articles: articles.length,
      duplicates: duplicates,
      rejected: rejected.length,
      withVisibleTitle: links.filter(function (l) { return Boolean(l.title); }).length,
      hyperlinkTargetsInDocument: raw.hyperlinkCount,
    },
    links: links,
    rejected: rejected,
    note: "Nothing was fetched or processed yet. This is the discovered list only.",
  };
}
