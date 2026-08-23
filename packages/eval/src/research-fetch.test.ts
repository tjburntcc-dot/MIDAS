import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import { createNewBusiness } from "./product-shell.ts";
import {
  fetchRankAndBriefHarborSrch002,
  labelVendorVsIndependent,
  detectFreshnessHints,
  HARBOR_WORKSPACE_ID,
  SRCH_002_ACCEPTED_USEFUL_URLS,
} from "./research-fetch.ts";
import { detectQuestionFamily, claimSupportsBrief, isCommunityLocalText } from "./research-brief.ts";
import { extractSubstantiveHtml } from "./html-extract.ts";
import { selectPassages } from "./passage-select.ts";

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "midas-rf-"));
  process.env.MIDAS_CURRICULUM_DIR = join(dir, "curriculum");
  mkdirSync(join(dir, "curriculum"), { recursive: true });
  return { dir, store: new FileStore(dir) };
}

const LIBRARY_HTML = `<!doctype html><html><head><title>West Asheville Library | Buncombe County</title></head>
<body>
<nav>Home Menu Login</nav>
<main>
<h1>West Asheville Library</h1>
<h2>Library Hours</h2>
<p>West Asheville Library is open Monday through Thursday 10am to 8pm and Friday through Saturday 10am to 6pm for community members.</p>
<h2>Services</h2>
<p>Reserve the meeting room for community programs. Ask staff about the community bulletin board for local flyers about after-school activities.</p>
<h2>West Asheville Library Events and Programs</h2>
<p>Family story time and youth music programs are listed on the public calendar. After-school events for children are posted when scheduled.</p>
</main>
<footer>Privacy policy Cookie settings</footer>
</body></html>`;

const PDF_TEXT = `Buncombe County Public Libraries
PROGRAMS – February 2025
Hurricane Helene Art Exhibit
All month during library hours
West Asheville Library--942 Haywood Road, Asheville--828-250-4750
Bouncing Books! Music & Movement Story Time @ the YMCA
02/01/2025 @ 11:00am
Join us for an interactive story time. Sing, dance, play, and read.
This is a family friendly program for ages up to 10 years old.
`;

const OFFTOPIC_HTML = `<!doctype html><html><head><title>Wage Table</title></head>
<body><main><h1>Median pay</h1><p>The median wage for roofers is forty thousand dollars per year according to occupational statistics.</p></main></body></html>`;

describe("research-fetch community_local scoring", () => {
  test("detects community_local family for Harbor question", () => {
    const fam = detectQuestionFamily("West Asheville library bulletin flyer after-school music programs");
    assert.equal(fam, "community_local");
    assert.equal(isCommunityLocalText("West Asheville Library meeting room and bulletin board"), true);
    assert.equal(claimSupportsBrief("Ask about the community bulletin board for local flyers", { questionFamily: "community_local" }), true);
    assert.equal(claimSupportsBrief("Median wage for roofers is $40,000", { questionFamily: "community_local" }), false);
  });

  test("html-extract strips chrome and keeps library substance", () => {
    const out = extractSubstantiveHtml(LIBRARY_HTML, {
      objectiveText: "West Asheville library bulletin after-school",
      workspaceText: "Harbor Oak Music Lessons",
    });
    assert.ok(out.substantiveText.includes("bulletin board") || out.substantiveText.includes("Library Hours"));
    assert.ok(!out.substantiveText.includes("Cookie settings"));
    assert.ok(!/skip to content/i.test(out.substantiveText));
  });

  test("passage rank prefers library/bulletin over wages", () => {
    const { store } = tmpStore();
    const brief = { id: "BRF-T", workspaceId: "ws-own-004", questionFamily: "community_local", researchQuestion: "library bulletin" };
    const sel = selectPassages(store, {
      source: { id: "SRC-T", workspaceId: "ws-own-004", substantiveText: PDF_TEXT + "\n\nMedian wage for roofers is forty thousand." },
      brief,
      extraction: {
        substantiveText: PDF_TEXT,
        blocks: [
          { kind: "heading", text: "PROGRAMS – February 2025" },
          { kind: "paragraph", text: "West Asheville Library hosts music and movement story time for children." },
          { kind: "paragraph", text: "Median wage for roofers is forty thousand dollars per year." },
        ],
      },
    });
    assert.ok(sel.relevant.length >= 1);
    assert.ok(sel.relevant.some((p) => /west asheville|music|library/i.test(p.excerpt)));
    assert.ok(!sel.relevant.some((p) => /median wage/i.test(p.excerpt)));
  });

  test("vendor vs independent labels", () => {
    assert.equal(labelVendorVsIndependent(SRCH_002_ACCEPTED_USEFUL_URLS[0]).vendorVsIndependent, "independent");
    assert.equal(labelVendorVsIndependent(SRCH_002_ACCEPTED_USEFUL_URLS[3]).vendorVsIndependent, "vendor_platform");
    const fresh = detectFreshnessHints(PDF_TEXT, SRCH_002_ACCEPTED_USEFUL_URLS[2]);
    assert.equal(fresh.dated, true);
    assert.ok(fresh.summary && /2025/i.test(fresh.summary));
  });
});

describe("research-fetch fetch+extract+rank+workspace scope", () => {
  test("fixture fetch ranks passages and stays on Harbor only", async () => {
    const { store, dir } = tmpStore();
    const created = createNewBusiness(store, {
      companyName: "Harbor Oak Music Lessons",
      ownerObjective: "Start a neighborhood after-school piano and guitar studio near West Asheville library.",
      budget: "$1800",
      availableSkillsAndResources: "piano teaching",
      preferredIndustries: "music lessons",
      geographicConstraints: "West Asheville NC",
    });
    // Force Harbor id used by module: createNewBusiness may mint ws-own-00N — override by putting Harbor workspace id if needed
    const minted = created.workspace.id;
    // Copy workspace to ws-own-004 for module hard-scope
    const ws = store.getWorkspace(minted);
    store.putWorkspace({ ...ws, id: HARBOR_WORKSPACE_ID, name: "Harbor Oak Music Lessons" });

    // Seed a RidgeLine workspace to prove no leak
    store.putWorkspace({
      id: "ws-ridgeline",
      name: "RidgeLine Estimator",
      description: "Roofing software",
      createdAt: new Date().toISOString(),
    });

    const urls = SRCH_002_ACCEPTED_USEFUL_URLS;
    const urlFixtures = {
      [urls[0]]: LIBRARY_HTML,
      [urls[1]]: "", // will be empty fixture body → still "ok" fixture but weak; better simulate fail via separate path
      [urls[2]]: PDF_TEXT,
      [urls[3]]: `<html><head><title>West Asheville Library Calendar</title></head><body><main>
        <h1>Public Libraries » West Asheville Library - Calendar</h1>
        <p>Family Story Time at West Asheville Library - 942 Haywood Rd. Share books, songs, and activities for children.</p>
        <p>Events calendar powered by Trumba</p>
      </main></body></html>`,
    };

    // For URL2, omit from fixtures and use a blocked-looking empty — actually runScout will try live if no fixture.
    // Provide all four as fixtures; URL2 uses off-topic empty-ish page that fails relevance.
    urlFixtures[urls[1]] = OFFTOPIC_HTML;

    const out = await fetchRankAndBriefHarborSrch002(store, {
      workspaceId: HARBOR_WORKSPACE_ID,
      seedUrls: urls,
      urlFixtures,
      skipOpportunity: false,
    });

    assert.equal(out.workspaceId, HARBOR_WORKSPACE_ID);
    assert.ok(out.scoutBriefId);
    assert.ok(out.researchRequestId);
    assert.ok(out.okCount >= 2, "expected at least 2 successful fixture fetches, got " + out.okCount);
    assert.ok(out.passageCount >= 1, "expected ranked passages");
    assert.ok(out.scoutBrief && /Harbor Oak|library|bulletin|passage/i.test(out.scoutBrief.summary));

    // Workspace scope: findings/passages/brief only Harbor
    const findings = (store.listScoutFindings && store.listScoutFindings()) || [];
    for (const f of findings.filter((x) => x.requestId === out.researchRequestId)) {
      assert.equal(f.workspaceId, HARBOR_WORKSPACE_ID);
    }
    const passages = (store.listPassages && store.listPassages()) || [];
    for (const p of passages.filter((x) => x.requestId === out.researchRequestId)) {
      assert.equal(p.workspaceId, HARBOR_WORKSPACE_ID);
    }
    const ridgeFindings = findings.filter((f) => f.workspaceId === "ws-ridgeline");
    assert.equal(ridgeFindings.length, 0);

    // Vendor labels present
    assert.ok(out.fetchRows.some((r) => r.vendorVsIndependent === "independent"));
    assert.ok(out.fetchRows.some((r) => r.vendorVsIndependent === "vendor_platform"));

    assert.equal(out.liveProviderCall, false);
    assert.equal(out.modelSpendUsd, 0);
    assert.equal(out.paidSearch, false);

    // Opportunity cites passages when present
    if (out.opportunity) {
      const opp = store.getOpportunity(out.opportunity.id);
      assert.equal(opp.workspaceId, HARBOR_WORKSPACE_ID);
      assert.equal(opp.inventedDemand, false);
      assert.ok((opp.citedPassages || []).length >= 1);
    }

    // Refuse non-Harbor
    await assert.rejects(
      () => fetchRankAndBriefHarborSrch002(store, { workspaceId: "ws-ridgeline", urlFixtures }),
      /Harbor Oak|ws-own-004|Isolation/
    );

    void dir;
  });
});
