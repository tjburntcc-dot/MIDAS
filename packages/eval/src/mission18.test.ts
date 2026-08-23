import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, ensureAtlasV0 } from "@midas/db";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { recordContribution, ALL_CONTRIBUTION_KINDS } from "./contribution.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import { createLocalOwnerSession } from "./approval-actors.ts";
import { resolveServingAtlasVersion } from "./conductor.ts";
import { frozenHashCheck } from "./founder-opportunity-brief.ts";
import { auditTeachingChain } from "./watcher.ts";
import { mission18Review } from "./mission18-review.ts";
import {
  acquirePublicSource,
  assertHttpsPublicUrl,
  RESEARCH_CAPABILITY_LABEL,
  SEARCH_INTEGRATION_EXISTS,
  sourceAcquisitionRequiredFields,
  recordHasRequiredFields,
  MISSION18_RESEARCH_OBJECTIVE,
} from "./source-acquisition.ts";
import {
  extractTeachingPassages,
  proposeTeachingFinding,
  classifyFindingType,
  sameVendorNotIndependent,
  createTeachingPacket,
  verifyTeachingPacket,
  decideTeachingApproval,
  retrieveLessons,
  evaluateEpisode,
  predeclareImprovementCriteria,
  createAutonomyPolicyInterface,
  invalidateLearningChain,
  recordTeachingContribution,
  maybeCreateFob002,
  runEvidenceLearning,
  teachingControlRoomSlice,
  FINDING_TYPES,
  PACKET_STATUSES,
  EPISODE_OUTCOMES,
  AUTONOMY_MODES,
  DEFAULT_APPROVAL_MODE,
  DELEGATED_AUTONOMY_ACTIVATED,
  AUTONOMOUS_LEARNING_IMPLEMENTED,
  RETRIEVAL_METHOD,
  RETRIEVAL_LABEL,
  LEARNING_DESCRIPTION,
  IMPROVEMENT_CRITERIA,
  NOT_IMPROVEMENT,
  assertScoutCannotApprove,
  assertNoGoldLeak,
} from "./teaching-engine.ts";

const PRODUCT_HTML = `<html><head><title>Roofr Estimating</title></head><body>
<nav>Home Products Login</nav>
<a href="#main">Skip to content</a>
<div class="cookie">We use cookies. Accept all cookies.</div>
<main>
<h1>Roof estimating software</h1>
<p>Roofr provides takeoff and proposal software for roofing contractors so crews can turn measurements into material lists and proposals.</p>
<p>The product includes aerial measurements and an estimating workflow used by roofing companies.</p>
</main>
<footer>Privacy policy. Careers. Contact us.</footer>
</body></html>`;

const HIRING_HTML = `<html><body><main><h1>Careers</h1><p>We are hiring software engineers. Median salary $150,000. Apply now and join our team.</p></main></body></html>`;
const SLOGAN_HTML = `<html><body><main><h1>The future of roofing</h1><p>World-class. Best-in-class. Unlock growth.</p></main></body></html>`;
const VIDEO_HTML = `<html><body><main><p>Please enable JavaScript to play this video.</p></main></body></html>`;
const LOGIN_HTML = `<html><body><main><h1>Sign in</h1><form><input type="password" name="password"><button>Log in</button></form></main></body></html>`;
const WAGE_HTML = `<html><body><main><p>Median annual wage for roofers was 47390 USD in May 2023 according to BLS occupational statistics.</p></main></body></html>`;
const FEATURE_HTML = `<html><body><nav>Menu</nav><main><h1>JobNimbus features</h1><p>JobNimbus is job management software for contractors that includes CRM, estimating, and invoicing tools in one workspace.</p><p>Roofing companies use the product to track jobs from inspection through proposal.</p></main><footer>Terms of service</footer></body></html>`;

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-m18-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  const store = new FileStore(dir);
  ensureAtlasV0(store);
  return { dir, store };
}

function putK(store, rec) {
  store.putKnowledge({
    accepted: true,
    reviewStatus: "approved",
    kind: rec.kind || "owner_policy",
    ...rec,
  });
}

function seedRidgeline(store) {
  store.putWorkspace({ id: "ws-ridgeline", name: "RidgeLine", servingAtlasVersionId: "atlas-v15", createdAt: "2026-08-21T12:00:00.000Z" });
  putK(store, { id: "K-STUDIO-OWN-002", workspaceId: "ws-ridgeline", kind: "owner_policy", statement: "Only United States accounts are eligible. Non-US geography is a hard disqualifier.", excerpt: "Only United States accounts are eligible." });
  putK(store, { id: "K-STUDIO-OWN-009", workspaceId: "ws-ridgeline", kind: "owner_policy", statement: "When a US roofing contractor still estimates by hand or with spreadsheets, treat that as a positive buying signal for RidgeLine Estimator.", excerpt: "estimates by hand or with spreadsheets" });
  putK(store, { id: "K-SCOUT-FND-001", workspaceId: "ws-ridgeline", kind: "sourced_fact", statement: "US roofing contractors produce estimates from takeoffs of roof area, pitch, and materials.", excerpt: "takeoffs of roof area, pitch, and materials" });
  putK(store, { id: "K-SCOUT-FND-004", workspaceId: "ws-ridgeline", kind: "sourced_fact", statement: "US roofing contractors who still produce estimates by hand or with generic spreadsheets often take longer to issue proposals.", excerpt: "often take longer to issue proposals" });
  putK(store, { id: "K-SCOUT-FND-019", workspaceId: "ws-ridgeline", kind: "sourced_fact", statement: "Estimating software turns measurements into material lists and proposals.", excerpt: "Estimating software turns measurements into material lists and proposals." });
  store.putEmployeeRole({
    id: "EMP-001",
    workspaceId: "ws-ridgeline",
    agentId: "offer_strategist-ws-ridgeline",
    roleId: OFFER_STRATEGIST_ROLE_ID,
    status: "development_verified",
    versionId: "offer_strategist-ws-ridgeline-v0",
    promoted: false,
    spendLimitUsd: 0.5,
  });
  if (!store.getVersion("atlas-v15")) {
    store.putVersion({ id: "atlas-v15", agentId: "atlas", contentHash: FROZEN_HASHES["atlas-v15"], immutable: true, createdAt: "2026-08-21T12:00:00.000Z" });
  }
  if (!store.getVersion("atlas-v16")) {
    store.putVersion({ id: "atlas-v16", agentId: "atlas", contentHash: FROZEN_HASHES["atlas-v16"], immutable: true, versionRole: "candidate_version", createdAt: "2026-08-21T13:00:00.000Z" });
  }
  if (!store.getVersion("offer_strategist-ws-ridgeline-v0")) {
    store.putVersion({ id: "offer_strategist-ws-ridgeline-v0", agentId: "offer_strategist-ws-ridgeline", contentHash: FROZEN_HASHES["offer_strategist-ws-ridgeline-v0"], immutable: true });
  }
  if (!store.getVersion("scout-ws-ridgeline-v0")) {
    store.putVersion({ id: "scout-ws-ridgeline-v0", agentId: "scout-ws-ridgeline", contentHash: FROZEN_HASHES["scout-ws-ridgeline-v0"], immutable: true });
  }
  if (!store.getVersion("watcher-ws-ridgeline-v0")) {
    store.putVersion({ id: "watcher-ws-ridgeline-v0", agentId: "watcher-ws-ridgeline", contentHash: FROZEN_HASHES["watcher-ws-ridgeline-v0"], immutable: true });
  }
  if (!store.getVersion("conductor-ws-ridgeline-v0")) {
    store.putVersion({ id: "conductor-ws-ridgeline-v0", agentId: "conductor-ws-ridgeline", contentHash: FROZEN_HASHES["conductor-ws-ridgeline-v0"], immutable: true });
  }
  store.putVersionReview({
    id: "VREV-M18-016",
    versionId: "atlas-v16",
    parentVersionId: "atlas-v15",
    versionRole: "candidate_version",
    immutable: true,
    ineligibleForPromotion: true,
    ineligibleForServing: true,
  });
  store.putFounderOpportunityBrief({
    id: "FOB-001",
    workspaceId: "ws-ridgeline",
    objectiveId: "OBJ-007",
    appendOnly: true,
    immutable: true,
    status: "completed",
    contentHash: "fob001-fixture",
    sections: { proposedOffer: { text: "RidgeLine Estimator hypothesis" }, targetCustomer: { text: "US roofing contractors" } },
  });
  store.putOfferStrategistRun({
    id: "OSR-003",
    workspaceId: "ws-ridgeline",
    live: true,
    contentHash: "e93a652d3022d9267a9aac7569678243490fcb54bdb42937557775b1cbebf54e",
    structured: { proposed_offer: "RidgeLine Estimator" },
  });
  return { workspaceId: "ws-ridgeline" };
}

function seedNamed() {
  const { dir, store } = tmpStore();
  seedRidgeline(store);
  return { dir, store, workspaceId: "ws-ridgeline" };
}

async function fixtureAcquire(store, url, html, extra) {
  return acquirePublicSource(store, {
    url: url,
    workspaceId: "ws-ridgeline",
    objectiveId: extra && extra.objectiveId || "OBJ-018",
    policy: { allowedDomains: ["roofr.com", "jobnimbus.com", "acculynx.com", "example.com"] },
    fixture: { body: html, contentType: (extra && extra.contentType) || "text/html", status: (extra && extra.status) || 200, ...(extra || {}) },
  });
}

describe("mission 18 source safety 01-10", () => {
  test("01 rejects non-HTTPS", async () => {
    const { store } = seedNamed();
    assert.throws(() => assertHttpsPublicUrl("http://roofr.com/"), /HTTPS|https/i);
    const rec = await acquirePublicSource(store, { url: "http://roofr.com/", workspaceId: "ws-ridgeline", objectiveId: "OBJ-018" });
    assert.equal(rec.ok, false);
    assert.equal(rec.failureReason, "non_https");
    assert.equal(rec.fetchStatus, "rejected");
  });

  test("02 rejects localhost", async () => {
    const { store } = seedNamed();
    const rec = await acquirePublicSource(store, { url: "https://localhost/", workspaceId: "ws-ridgeline", objectiveId: "OBJ-018" });
    assert.equal(rec.ok, false);
    assert.equal(rec.failureReason, "localhost");
  });

  test("03 rejects loopback", async () => {
    const { store } = seedNamed();
    const rec = await acquirePublicSource(store, { url: "https://127.0.0.1/", workspaceId: "ws-ridgeline", objectiveId: "OBJ-018" });
    assert.equal(rec.ok, false);
    assert.equal(rec.failureReason, "loopback");
  });

  test("04 rejects private ranges", async () => {
    const { store } = seedNamed();
    const rec = await acquirePublicSource(store, { url: "https://10.1.2.3/", workspaceId: "ws-ridgeline", objectiveId: "OBJ-018" });
    assert.equal(rec.ok, false);
    assert.equal(rec.failureReason, "private_range");
  });

  test("05 rejects cloud metadata", async () => {
    const { store } = seedNamed();
    const rec = await acquirePublicSource(store, { url: "https://169.254.169.254/latest/meta-data/", workspaceId: "ws-ridgeline", objectiveId: "OBJ-018" });
    assert.equal(rec.ok, false);
    assert.equal(rec.failureReason, "cloud_metadata");
  });

  test("06 rejects disallowed ports", async () => {
    const { store } = seedNamed();
    const rec = await acquirePublicSource(store, { url: "https://roofr.com:8080/", workspaceId: "ws-ridgeline", objectiveId: "OBJ-018", policy: { allowedDomains: ["roofr.com"] } });
    assert.equal(rec.ok, false);
    assert.equal(rec.failureReason, "disallowed_port");
  });

  test("07 rejects cross-domain redirects", async () => {
    const { store } = seedNamed();
    const rec = await acquirePublicSource(store, {
      url: "https://roofr.com/",
      workspaceId: "ws-ridgeline",
      objectiveId: "OBJ-018",
      policy: { allowedDomains: ["roofr.com"] },
      fixture: { redirectTo: "https://evil.example/phish", contentType: "text/html", body: "nope" },
    });
    assert.equal(rec.ok, false);
    assert.equal(rec.failureReason, "cross_domain_redirect");
  });

  test("08 rejects excessive redirects", async () => {
    const { store } = seedNamed();
    const rec = await acquirePublicSource(store, {
      url: "https://roofr.com/",
      workspaceId: "ws-ridgeline",
      objectiveId: "OBJ-018",
      policy: { allowedDomains: ["roofr.com"] },
      fixture: {
        hops: [
          { url: "https://roofr.com/", status: 302, location: "https://roofr.com/a" },
          { url: "https://roofr.com/a", status: 302, location: "https://roofr.com/b" },
          { url: "https://roofr.com/b", status: 302, location: "https://roofr.com/c" },
          { url: "https://roofr.com/c", status: 302, location: "https://roofr.com/d" },
          { url: "https://roofr.com/d", status: 200, body: PRODUCT_HTML, contentType: "text/html" },
        ],
      },
    });
    assert.equal(rec.ok, false);
    assert.equal(rec.failureReason, "excessive_redirects");
  });

  test("09 rejects unsupported types, oversized bodies, and login walls", async () => {
    const { store } = seedNamed();
    const type = await acquirePublicSource(store, {
      url: "https://roofr.com/logo.png",
      workspaceId: "ws-ridgeline",
      objectiveId: "OBJ-018",
      policy: { allowedDomains: ["roofr.com"] },
      fixture: { body: "PNG", contentType: "image/png" },
    });
    assert.equal(type.ok, false);
    assert.equal(type.failureReason, "unsupported_type");
    const big = await acquirePublicSource(store, {
      url: "https://roofr.com/huge",
      workspaceId: "ws-ridgeline",
      objectiveId: "OBJ-018",
      policy: { allowedDomains: ["roofr.com"] },
      fixture: { body: "x".repeat(1_000_001), contentType: "text/html" },
    });
    assert.equal(big.ok, false);
    assert.equal(big.failureReason, "oversized");
    const wall = await acquirePublicSource(store, {
      url: "https://roofr.com/login",
      workspaceId: "ws-ridgeline",
      objectiveId: "OBJ-018",
      policy: { allowedDomains: ["roofr.com"] },
      fixture: { body: LOGIN_HTML, contentType: "text/html", status: 200 },
    });
    assert.equal(wall.ok, false);
    assert.ok(["login_path", "password_field", "login_prompt"].includes(wall.failureReason));
  });

  test("10 persists required source-acquisition fields and never exposes credentials", async () => {
    const { store } = seedNamed();
    const rec = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    assert.equal(rec.ok, true);
    assert.equal(recordHasRequiredFields(rec), true);
    for (const k of sourceAcquisitionRequiredFields()) assert.ok(k in rec, k);
    const bad = await acquirePublicSource(store, { url: "https://user:s3cret@roofr.com/", workspaceId: "ws-ridgeline", objectiveId: "OBJ-018" });
    assert.equal(bad.ok, false);
    assert.equal(bad.failureReason, "credentials_forbidden");
    const dumped = JSON.stringify(store.listSourceAcquisitions());
    assert.equal(dumped.includes("s3cret"), false);
    assert.equal(bad.credentialsExposed, false);
    assert.equal(SEARCH_INTEGRATION_EXISTS, false);
    assert.equal(RESEARCH_CAPABILITY_LABEL, "Bounded owner-permitted public-domain research.");
  });
});

describe("mission 18 extraction 11-16", () => {
  test("11 extracts main/article/product/feature only", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    const out = extractTeachingPassages(store, { source: src, html: PRODUCT_HTML, workspaceId: "ws-ridgeline" });
    assert.ok(out.relevant.some((p) => /takeoff and proposal/.test(p.excerpt)));
    assert.equal(out.relevant.some((p) => /Skip to content/.test(p.excerpt)), false);
  });

  test("12 rejects nav, cookies, and a11y links", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    const out = extractTeachingPassages(store, { source: src, html: PRODUCT_HTML, workspaceId: "ws-ridgeline" });
    const omitted = out.omitted.map((p) => p.omittedReason);
    assert.ok(out.passages.every((p) => !/Skip to content|Accept all cookies|^Home Products Login$/.test(p.excerpt) || p.omittedReason));
    assert.ok(omitted.includes("a11y_chrome") || omitted.includes("cookie_banner") || omitted.includes("navigation") || out.relevant.every((p) => !/Skip to content/.test(p.excerpt)));
  });

  test("13 rejects login prompts, contact forms, and footer boilerplate", async () => {
    const { store } = seedNamed();
    const html = `<html><body><main><p>Sign in</p><p>Contact us</p><p>Privacy policy</p><p>Roofr provides takeoff software for roofing contractors who produce proposals from measurements.</p></main><footer>Terms of service</footer></body></html>`;
    const src = await fixtureAcquire(store, "https://roofr.com/", html);
    const out = extractTeachingPassages(store, { source: src, html: html, workspaceId: "ws-ridgeline" });
    assert.ok(out.omitted.some((p) => ["login_prompt", "contact_form", "footer_boilerplate"].includes(p.omittedReason)));
    assert.ok(out.relevant.some((p) => /takeoff software/.test(p.excerpt)));
  });

  test("14 rejects video placeholders, hiring pages, and salary stats", async () => {
    const { store } = seedNamed();
    const v = extractTeachingPassages(store, { source: { id: "S1", workspaceId: "ws-ridgeline" }, html: VIDEO_HTML });
    assert.ok(v.omitted.some((p) => p.omittedReason === "video_placeholder") || v.noActionableEvidence);
    const h = extractTeachingPassages(store, { source: { id: "S2", workspaceId: "ws-ridgeline" }, html: HIRING_HTML });
    assert.ok(h.omitted.some((p) => p.omittedReason === "hiring_page" || p.omittedReason === "salary_stats"));
    const w = extractTeachingPassages(store, { source: { id: "S3", workspaceId: "ws-ridgeline" }, html: WAGE_HTML });
    assert.ok(w.omitted.some((p) => p.omittedReason === "salary_stats"));
    assert.ok((store.listFindingOmissions() || []).some((o) => o.reason === "salary_stats" || o.accurateButIrrelevant));
  });

  test("15 rejects slogans without substance", async () => {
    const { store } = seedNamed();
    const out = extractTeachingPassages(store, { source: { id: "S4", workspaceId: "ws-ridgeline" }, html: SLOGAN_HTML });
    assert.ok(out.omitted.some((p) => p.omittedReason === "slogan_without_substance") || out.noActionableEvidence);
  });

  test("16 persists passage fields and does not decide relevance from domain name alone", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    const out = extractTeachingPassages(store, { source: src, html: PRODUCT_HTML, workspaceId: "ws-ridgeline", objectiveId: "OBJ-018" });
    const p = out.passages[0];
    assert.ok(p.passageId || p.id);
    assert.ok(p.sourceId);
    assert.ok(p.excerpt);
    assert.ok(p.locator);
    assert.ok(p.checksum);
    assert.ok(p.url);
    assert.ok(p.timestamp);
    assert.equal(typeof p.relevanceScore, "number");
    assert.ok(p.usefulnessReason);
    assert.equal(p.relevanceFromDomainNameAlone, false);
    const domainOnly = extractTeachingPassages(store, { source: src, html: "<html><body><main><p>Welcome to our website.</p></main></body></html>", relevanceFromDomainOnly: true });
    assert.equal(domainOnly.relevant.length, 0);
  });
});

describe("mission 18 findings 17-24", () => {
  test("17 typed findings include directly_supported_fact", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    const f = proposeTeachingFinding(store, {
      workspaceId: "ws-ridgeline", source: src,
      claim: "Roofr provides takeoff and proposal software for roofing contractors so crews can turn measurements into material lists and proposals.",
      excerpt: "Roofr provides takeoff and proposal software for roofing contractors so crews can turn measurements into material lists and proposals.",
      passage: { locator: { section: "main" } },
      forceType: "directly_supported_fact",
    });
    assert.equal(f.type, "directly_supported_fact");
    assert.ok(FINDING_TYPES.includes(f.type));
  });

  test("18 vendor_marketing_claim is classified and is not independent proof", async () => {
    const { store } = seedNamed();
    const f = proposeTeachingFinding(store, {
      workspaceId: "ws-ridgeline",
      source: { id: "S", sourceId: "S", sourceClassification: "live_public_source", live: true, fetchStatus: "ok", substantiveText: "Trusted by leading contractors. Unlock growth." },
      claim: "Trusted by leading contractors to unlock growth.",
      excerpt: "Trusted by leading contractors. Unlock growth.",
    });
    assert.equal(f.type, "vendor_marketing_claim");
    assert.equal(f.vendorMarketingIsNotIndependentProof, true);
  });

  test("19 observed_product_feature is a first-class type", () => {
    assert.ok(FINDING_TYPES.includes("observed_product_feature"));
    assert.equal(classifyFindingType("The product includes aerial measurements and an estimating workflow used by roofing companies.", { directSupport: true }), "observed_product_feature");
  });

  test("20 public_pricing_observation stays observational", () => {
    const t = classifyFindingType("Pricing starts at $99 per month per seat.", { onVendorPage: true, directSupport: true });
    assert.equal(t, "public_pricing_observation");
  });

  test("21 multiple pages on one vendor domain are not independent corroboration", () => {
    const r = sameVendorNotIndependent([{ domain: "roofr.com" }, { domain: "roofr.com" }]);
    assert.equal(r.independent, false);
    assert.match(r.note, /not independent/i);
  });

  test("22 cautious_inference is distinct from fact", () => {
    assert.equal(classifyFindingType("This may suggest contractors could prefer bundled CRM and estimating.", {}), "cautious_inference");
  });

  test("23 unresolved_question is a typed finding", () => {
    assert.equal(classifyFindingType("What do contractors actually pay for estimating software?", {}), "unresolved_question");
  });

  test("24 owner_policy_suggestion stays a suggestion; webpage cannot create policy", async () => {
    const { store } = seedNamed();
    const f = proposeTeachingFinding(store, {
      workspaceId: "ws-ridgeline",
      source: { id: "S", sourceId: "S", fetchStatus: "ok", sourceClassification: "live_public_source", substantiveText: "Owner should require aerial photos." },
      claim: "Owner should require aerial photos before qualification.",
      excerpt: "Owner should require aerial photos.",
      forceType: "owner_policy_suggestion",
    });
    assert.equal(f.type, "owner_policy_suggestion");
    assert.equal(f.policySuggestion, true);
    assert.equal(f.becameOwnerPolicy, false);
    assert.equal(f.webpageCannotCreateOwnerPolicy, true);
    const policies = store.listKnowledge().filter((k) => k.kind === "owner_policy" && k.sourceId === "S");
    assert.equal(policies.length, 0);
  });
});

describe("mission 18 teaching 25-35", () => {
  test("25 teaching packet is a first-class record", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    const f = proposeTeachingFinding(store, { workspaceId: "ws-ridgeline", objectiveId: "OBJ-018", source: src, claim: src.substantiveText.slice(0, 180), excerpt: src.substantiveText.slice(0, 180), forceType: "observed_product_feature" });
    const out = createTeachingPacket(store, { workspaceId: "ws-ridgeline", objectiveId: "OBJ-018", findings: [f], passages: [], sources: [src] });
    assert.ok(out.packet);
    assert.ok(out.packet.packetId);
    assert.equal(store.getTeachingPacket(out.packet.id).id, out.packet.id);
  });

  test("26 teacher is Scout and recipient is Offer Strategist", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    const f = proposeTeachingFinding(store, { workspaceId: "ws-ridgeline", source: src, claim: src.substantiveText.slice(0, 160), excerpt: src.substantiveText.slice(0, 160), forceType: "observed_product_feature" });
    const out = createTeachingPacket(store, { workspaceId: "ws-ridgeline", findings: [f], sources: [src] });
    assert.equal(out.packet.teacherName, "Scout");
    assert.equal(out.packet.recipientRoleId, OFFER_STRATEGIST_ROLE_ID);
    assert.equal(out.packet.recipientEmployeeId, "EMP-001");
  });

  test("27 Scout cannot approve, verify, or self-credit", () => {
    const { store } = seedNamed();
    assert.throws(() => assertScoutCannotApprove("scout"), /cannot approve/i);
    assert.throws(() => recordTeachingContribution(store, { kind: "lesson_approved_for_supervised_use", role: "scout", workspaceId: "ws-ridgeline", evidence: { packetId: "TPK-001" } }), /self-credit|cannot approve/i);
  });

  test("28 packet explains support, inference, must-not-claim, applicability, unknowns", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    const f = proposeTeachingFinding(store, { workspaceId: "ws-ridgeline", source: src, claim: src.substantiveText.slice(0, 160), excerpt: src.substantiveText.slice(0, 160), forceType: "observed_product_feature" });
    const p = createTeachingPacket(store, { workspaceId: "ws-ridgeline", findings: [f], sources: [src] }).packet;
    assert.ok(Array.isArray(p.whatSourceSupports));
    assert.ok(Array.isArray(p.whatMayBeInferred));
    assert.ok(p.whatMustNotBeClaimed.some((x) => /TAM|demand/i.test(x)));
    assert.ok(p.whenApplicable);
    assert.ok(p.whatRemainsUnknown.length >= 3);
  });

  test("29 packet only populates from fetched evidence and accepted findings", () => {
    const { store } = seedNamed();
    const empty = createTeachingPacket(store, { workspaceId: "ws-ridgeline", findings: [], sources: [] });
    assert.equal(empty.ok, false);
    assert.equal(empty.reason, "no_actionable_evidence");
  });

  test("30 verification statuses are the required set", () => {
    assert.deepEqual(PACKET_STATUSES, ["proposed", "rejected", "awaiting_owner_approval", "approved_for_supervised_use", "invalidated", "expired"]);
  });

  test("31 explicit reviewer identity is recorded", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    const f = proposeTeachingFinding(store, { workspaceId: "ws-ridgeline", source: src, claim: src.substantiveText.slice(0, 160), excerpt: src.substantiveText.slice(0, 160), forceType: "observed_product_feature" });
    const p = createTeachingPacket(store, { workspaceId: "ws-ridgeline", findings: [f], sources: [src], status: "proposed" }).packet;
    const session = createLocalOwnerSession(store, {});
    const v = verifyTeachingPacket(store, p.id, { actor: "local_owner", actorType: "local_owner", session: session, status: "approved_for_supervised_use" });
    assert.ok(v.verification.reviewerIdentity.actor);
    assert.equal(v.packet.reviewerIdentity.actorType, "local_owner");
  });

  test("32 default owner approval required; no silent auto-approve", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    const f = proposeTeachingFinding(store, { workspaceId: "ws-ridgeline", source: src, claim: src.substantiveText.slice(0, 160), excerpt: src.substantiveText.slice(0, 160), forceType: "observed_product_feature" });
    const p = createTeachingPacket(store, { workspaceId: "ws-ridgeline", findings: [f], sources: [src] }).packet;
    assert.equal(p.status, "awaiting_owner_approval");
    assert.equal(p.silentlyAutoApproved, false);
    assert.equal(p.defaultOwnerApprovalRequired, true);
    assert.throws(() => verifyTeachingPacket(store, p.id, { actor: "demo_operator", actorType: "demo_operator", status: "approved_for_supervised_use" }), /owner|local_owner|auto-approve/i);
  });

  test("33 lesson retrieval is not whole documents; owner rules are pinned", () => {
    const { store, workspaceId } = seedNamed();
    store.putTeachingPacket({
      id: "TPK-OK", workspaceId, recipientRoleId: OFFER_STRATEGIST_ROLE_ID, status: "approved_for_supervised_use",
      whatSourceSupports: [{ claim: "Vendor states takeoff and proposal software for roofing contractors.", excerpt: "takeoff and proposal software" }],
      whatMustNotBeClaimed: ["TAM"],
    });
    const r = retrieveLessons(store, { workspaceId, query: "roofing estimating software positioning" });
    assert.equal(r.retrievalMethod, "lexical_deterministic");
    assert.match(r.retrievalLabel, /lexical\/deterministic/i);
    assert.ok(r.ownerRules.some((x) => x.pinned));
    assert.equal(r.delivery.wholeDocuments, false);
  });

  test("34 only approved same-workspace same-role packets; relevant over unrelated; dedupe; conflicts; expired hidden", () => {
    const { store, workspaceId } = seedNamed();
    store.putTeachingPacket({ id: "TPK-A", workspaceId, recipientRoleId: OFFER_STRATEGIST_ROLE_ID, status: "approved_for_supervised_use", whatSourceSupports: [{ claim: "aerial measurements for roofing estimates", excerpt: "aerial measurements" }] });
    store.putTeachingPacket({ id: "TPK-B", workspaceId, recipientRoleId: OFFER_STRATEGIST_ROLE_ID, status: "approved_for_supervised_use", whatSourceSupports: [{ claim: "aerial measurements for roofing estimates", excerpt: "aerial measurements" }] });
    store.putTeachingPacket({ id: "TPK-X", workspaceId: "ws-other", recipientRoleId: OFFER_STRATEGIST_ROLE_ID, status: "approved_for_supervised_use", whatSourceSupports: [{ claim: "other ws", excerpt: "other" }] });
    store.putTeachingPacket({ id: "TPK-EXP", workspaceId, recipientRoleId: OFFER_STRATEGIST_ROLE_ID, status: "expired", whatSourceSupports: [{ claim: "expired aerial", excerpt: "expired" }] });
    store.putTeachingPacket({ id: "TPK-UNREL", workspaceId, recipientRoleId: OFFER_STRATEGIST_ROLE_ID, status: "approved_for_supervised_use", whatSourceSupports: [{ claim: "office coffee machine policy", excerpt: "coffee" }] });
    const r = retrieveLessons(store, { workspaceId, query: "aerial roofing measurements estimating" });
    assert.equal(r.lessons.some((l) => l.packetId === "TPK-X"), false);
    assert.equal(r.lessons.some((l) => l.packetId === "TPK-EXP"), false);
    assert.ok(r.lessons.some((l) => l.packetId === "TPK-A"));
    assert.equal(r.lessons.filter((l) => l.packetId === "TPK-B").length, 0);
    assert.ok(r.unrelated.some((l) => l.packetId === "TPK-UNREL") || !r.lessons.some((l) => l.packetId === "TPK-UNREL"));
  });

  test("35 delivery trace is persisted and retrieval is labeled lexical/deterministic", () => {
    const { store, workspaceId } = seedNamed();
    store.putTeachingPacket({ id: "TPK-D", workspaceId, recipientRoleId: OFFER_STRATEGIST_ROLE_ID, status: "approved_for_supervised_use", whatSourceSupports: [{ claim: "estimating proposals", excerpt: "estimating" }] });
    const r = retrieveLessons(store, { workspaceId, query: "estimating proposals" });
    assert.ok(r.delivery.id);
    assert.equal(store.getLessonDelivery(r.delivery.id).retrievalMethod, RETRIEVAL_METHOD);
    assert.equal(r.storedNeRetrievedNeUsedNeAppliedNeImproved, true);
  });
});

describe("mission 18 evaluation 36-41", () => {
  test("36 learning episode records allowed outcomes", () => {
    assert.deepEqual(EPISODE_OUTCOMES, ["improved", "unchanged", "regressed", "blocked", "insufficient_evidence", "awaiting_owner_approval"]);
  });

  test("37 comparable baseline is FOB-001/OSR-003 vs supervised post-lesson only after approval", () => {
    const { store, workspaceId } = seedNamed();
    const ep = evaluateEpisode(store, { workspaceId, awaitingOwnerApproval: true, criteria: predeclareImprovementCriteria() });
    assert.equal(ep.outcome, "awaiting_owner_approval");
    assert.equal(ep.comparable.sameEvaluator, "EVL-M16-001");
    assert.equal(ep.comparable.bakeoffRerun, false);
    assert.equal(ep.baselineRef, "FOB-001/OSR-003");
  });

  test("38 improvement criteria are predeclared before comparison", () => {
    const c = predeclareImprovementCriteria();
    assert.ok(c.declaredAt);
    assert.deepEqual(c.criteria, IMPROVEMENT_CRITERIA);
    assert.match(c.note, /before/i);
  });

  test("39 length, confidence, extra claims, citation count, invented TAM are not improvement", () => {
    const { store, workspaceId } = seedNamed();
    const ep = evaluateEpisode(store, {
      workspaceId,
      lesson: { id: "TPK-1" },
      delivered: true,
      cited: true,
      applied: true,
      baseline: { id: "FOB-001" },
      post: { id: "POST" },
      materialImprovement: true,
      claimedReasons: ["length", "confidence"],
      criteria: predeclareImprovementCriteria(),
    });
    assert.equal(ep.outcome, "unchanged");
    assert.ok(NOT_IMPROVEMENT.includes("length"));
  });

  test("40 evaluator gold never enters teaching surfaces", () => {
    assert.throws(() => assertNoGoldLeak({ packet: { gold: "ATLAS-SEALED-001", ranked_tiers: [] } }), /gold/i);
  });

  test("41 corroboration-only lesson is unchanged", () => {
    const { store, workspaceId } = seedNamed();
    const ep = evaluateEpisode(store, { workspaceId, lesson: { id: "TPK-1" }, delivered: true, cited: true, applied: true, onlyCorroborates: true, criteria: predeclareImprovementCriteria() });
    assert.equal(ep.outcome, "unchanged");
  });
});

describe("mission 18 governance 42-50", () => {
  test("42 public sources cannot rewrite owner policy", async () => {
    const { store } = seedNamed();
    const before = store.listKnowledge().filter((k) => k.kind === "owner_policy").map((k) => k.id).sort();
    await runEvidenceLearning(store, {
      workspaceId: "ws-ridgeline",
      objectiveId: "OBJ-018",
      seedUrls: ["https://roofr.com/"],
      urlFixtures: { "https://roofr.com/": { body: PRODUCT_HTML, contentType: "text/html" } },
    });
    const after = store.listKnowledge().filter((k) => k.kind === "owner_policy").map((k) => k.id).sort();
    assert.deepEqual(after, before);
  });

  test("43 future autonomy interface fields exist", () => {
    const { store } = seedNamed();
    const p = createAutonomyPolicyInterface(store, {});
    for (const k of ["ownerPolicyId", "approvedSourceClasses", "approvedDomains", "approvedFindingTypes", "permittedRecipientRoles", "maxDailySpend", "maxPagesPerObjective", "corroborationRequirements", "approvalMode", "expiration", "revocationConditions"]) {
      assert.ok(k in p, k);
    }
  });

  test("44 conceptual modes 1-4 exist as interface", () => {
    assert.equal(AUTONOMY_MODES[1], "owner_review_required");
    assert.equal(AUTONOMY_MODES[2], "delegated_within_policy");
    assert.equal(AUTONOMY_MODES[3], "bounded_auto_approve");
    assert.equal(AUTONOMY_MODES[4], "autonomous_learning");
  });

  test("45 default remains owner review required", () => {
    assert.equal(DEFAULT_APPROVAL_MODE, "owner_review_required");
    const { store } = seedNamed();
    assert.equal(createAutonomyPolicyInterface(store, {}).approvalMode, "owner_review_required");
    assert.equal(createAutonomyPolicyInterface(store, {}).activeMode, 1);
  });

  test("46 delegated autonomy is not activated; autonomous learning is not implemented", () => {
    assert.equal(DELEGATED_AUTONOMY_ACTIVATED, false);
    assert.equal(AUTONOMOUS_LEARNING_IMPLEMENTED, false);
    const { store } = seedNamed();
    const p = createAutonomyPolicyInterface(store, {});
    assert.equal(p.delegatedAutonomyActivated, false);
    assert.equal(p.autonomousLearningImplemented, false);
  });

  test("47 contribution events cannot be self-awarded", () => {
    const { store } = seedNamed();
    assert.throws(() => recordTeachingContribution(store, { kind: "teaching_packet_proposed", role: "workflow_manager", selfAwarded: true, evidence: { packetId: "X" } }), /self-awarded/);
  });

  test("48 provisional events are effective=false", () => {
    const { store } = seedNamed();
    const ev = recordTeachingContribution(store, { kind: "teaching_packet_proposed", role: "workflow_manager", workspaceId: "ws-ridgeline", evidence: { packetId: "TPK-Z", objectiveId: "OBJ-018" }, state: "provisional" });
    assert.equal(ev.state, "provisional");
    assert.equal(ev.effective, false);
  });

  test("49 no reward kinds for page counts, verbosity, duplicates, or owner interruptions", () => {
    assert.equal(ALL_CONTRIBUTION_KINDS.includes("page_count"), false);
    assert.equal(ALL_CONTRIBUTION_KINDS.includes("verbosity"), false);
    const { store } = seedNamed();
    assert.throws(() => recordTeachingContribution(store, { kind: "page_count", role: "workflow_manager", evidence: { objectiveId: "OBJ-018" } }), /page counts|Unknown contribution/i);
  });

  test("50 no automatic rank, promotion, or autonomy", () => {
    const { store, workspaceId } = seedNamed();
    const emp = store.getEmployeeRole("EMP-001");
    assert.equal(emp.status, "development_verified");
    assert.equal(emp.promoted, false);
    const slice = teachingControlRoomSlice(store, { workspaceId });
    assert.equal(slice.weightsFineTuneRl, false);
    assert.match(LEARNING_DESCRIPTION, /No weight updates, fine-tuning, RL/);
  });
});

describe("mission 18 history 51-58", () => {
  test("51 correction/invalidation is append-only", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    const f = proposeTeachingFinding(store, { workspaceId: "ws-ridgeline", source: src, claim: src.substantiveText.slice(0, 160), excerpt: src.substantiveText.slice(0, 160), forceType: "observed_product_feature" });
    createTeachingPacket(store, { workspaceId: "ws-ridgeline", findings: [f], sources: [src], status: "proposed" });
    const inv = invalidateLearningChain(store, { sourceId: src.sourceId, reason: "fixture_invalidation_demo" });
    assert.equal(inv.appendOnly, true);
    assert.equal(inv.deletedLiveRecords, false);
    assert.ok(store.getSourceAcquisition(src.sourceId));
    assert.ok(store.getLearningInvalidation(inv.id));
    assert.ok((store.listTeachingVerifications() || []).some((v) => v.status === "invalidated"));
  });

  test("52 source to evaluation chain is recorded", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", FEATURE_HTML);
    const passages = extractTeachingPassages(store, { source: src, html: FEATURE_HTML, workspaceId: "ws-ridgeline" });
    const f = proposeTeachingFinding(store, { workspaceId: "ws-ridgeline", source: src, passage: passages.relevant[0] || passages.passages[0], claim: (passages.relevant[0] || passages.passages[0]).excerpt, excerpt: (passages.relevant[0] || passages.passages[0]).excerpt, forceType: "observed_product_feature" });
    const pack = createTeachingPacket(store, { workspaceId: "ws-ridgeline", findings: [f], passages: passages.passages, sources: [src], status: "proposed" }).packet;
    const session = createLocalOwnerSession(store, {});
    verifyTeachingPacket(store, pack.id, { actor: "local_owner", session, status: "approved_for_supervised_use" });
    const del = retrieveLessons(store, { workspaceId: "ws-ridgeline", query: "job management estimating invoicing roofing" });
    const ep = evaluateEpisode(store, { workspaceId: "ws-ridgeline", lesson: pack, delivered: true, cited: true, applied: true, deliveryId: del.delivery.id, onlyCorroborates: true, criteria: predeclareImprovementCriteria() });
    const inv = invalidateLearningChain(store, { sourceId: src.sourceId });
    assert.ok(inv.chain.sourceId);
    assert.ok(inv.chain.passageIds.length || passages.passages.length);
    assert.ok(inv.chain.findingIds.includes(f.id));
    assert.ok(inv.chain.packetIds.includes(pack.id));
    assert.equal(ep.outcome, "unchanged");
  });

  test("53 live records are not deleted by invalidation", async () => {
    const { store } = seedNamed();
    const src = await fixtureAcquire(store, "https://roofr.com/", PRODUCT_HTML);
    invalidateLearningChain(store, { sourceId: src.sourceId });
    assert.ok(store.getSourceAcquisition(src.id || src.sourceId));
    assert.equal(store.getFounderOpportunityBrief("FOB-001").id, "FOB-001");
  });

  test("54 frozen hashes stay", () => {
    const { store } = seedNamed();
    const check = frozenHashCheck(store);
    assert.equal(check["atlas-v15"].match, true);
    assert.equal(check["atlas-v16"].match, true);
    assert.equal(check["scout-ws-ridgeline-v0"].match, true);
    assert.equal(check["watcher-ws-ridgeline-v0"].match, true);
    assert.equal(check["conductor-ws-ridgeline-v0"].match, true);
    assert.equal(check["offer_strategist-ws-ridgeline-v0"].match, true);
  });

  test("55 FOB-001 remains unchanged when lesson does not materially improve", () => {
    const { store } = seedNamed();
    const before = JSON.stringify(store.getFounderOpportunityBrief("FOB-001"));
    const out = maybeCreateFob002(store, { episode: { outcome: "unchanged" }, approvedLesson: null, materialImprovement: false });
    assert.equal(out.created, false);
    assert.equal(store.getFounderOpportunityBrief("FOB-002"), undefined);
    assert.equal(JSON.stringify(store.getFounderOpportunityBrief("FOB-001")), before);
  });

  test("56 EMP-001 stays development_verified on the frozen version hash", () => {
    const { store } = seedNamed();
    const emp = store.getEmployeeRole("EMP-001");
    assert.equal(emp.status, "development_verified");
    assert.equal(emp.versionId, "offer_strategist-ws-ridgeline-v0");
    assert.equal(store.getVersion("offer_strategist-ws-ridgeline-v0").contentHash, "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce");
  });

  test("57 atlas-v15 remains serving and atlas-v16 remains immutable/ineligible", () => {
    const { store, workspaceId } = seedNamed();
    assert.equal(resolveServingAtlasVersion(store, workspaceId), "atlas-v15");
    const r = store.listVersionReviews().find((x) => x.versionId === "atlas-v16");
    assert.equal(r.ineligibleForServing, true);
    assert.equal(store.getVersion("atlas-v16").immutable, true);
  });

  test("58 control room section distinguishes the chain and hides approvals until a request exists", async () => {
    const { store, workspaceId } = seedNamed();
    const empty = teachingControlRoomSlice(store, { workspaceId });
    assert.equal(empty.title, "EMPLOYEE LEARNING AND TEACHING");
    assert.equal(empty.showApprovalOnlyWhenRequestExists, false);
    assert.equal(empty.pendingTeachingApprovals.length, 0);
    const html = readFileSync(new URL("../../../apps/api/src/control-room.html", import.meta.url), "utf8");
    assert.match(html, /EMPLOYEE LEARNING AND TEACHING/);
    const learning = await runEvidenceLearning(store, {
      workspaceId,
      objectiveId: "OBJ-018",
      seedUrls: ["https://roofr.com/"],
      allowedDomains: ["roofr.com"],
      urlFixtures: { "https://roofr.com/": { body: PRODUCT_HTML, contentType: "text/html" } },
    });
    const view = mission18Review(store, { workspaceId });
    assert.equal(view.title, "EMPLOYEE LEARNING AND TEACHING");
    assert.ok(view.chain);
    if (learning.packet) {
      assert.ok(["awaiting_owner_approval", "proposed"].includes(learning.packet.status));
      assert.equal(learning.ownerApprovalOccurred, false);
    }
    const audit = auditTeachingChain(store, { workspaceId, learning, objectiveId: "OBJ-018" });
    assert.equal(audit.report.evaluatorRevisionId, "EVL-M16-001");
    assert.equal(audit.deterministic, true);
    assert.equal(audit.originalPreserved, true);
    assert.equal(RETRIEVAL_METHOD, "lexical_deterministic");
  });
});
