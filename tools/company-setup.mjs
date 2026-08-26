/**
 * Instantiate Company 0 through the existing workspace abstraction, and two
 * unrelated companies used only to prove the capability analysis is not shaped
 * around Hemmer.
 *
 * No new company type is introduced. `workspaces` already carries name,
 * industry, offer, ideal customer, geography, goal and constraints, which is
 * what a company record needs. Adding a second one would have been a new
 * abstraction earning nothing.
 *
 * The two extra companies exist for the generality test and nothing else. They
 * are marked as fixtures so they can never be mistaken for real businesses.
 *
 * Real opportunities are ingested from the preserved dogfood record rather than
 * retyped, so the work population starts from evidence that already exists.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { newWorkItem, workItemFingerprint, upsertDiscovered, transition, listWorkItems, putWorkItem } from "../packages/eval/src/work-item.ts";

const store = new FileStore(stateDir());
const now = new Date().toISOString();

function ensureWorkspace(ws) {
  const existing = store.getWorkspace(ws.id);
  if (existing) return existing;
  return store.putWorkspace({ ...ws, createdAt: now, updatedAt: now, ownerStatus: "active", persistence: "FILE_STORE" });
}

// ------------------------------------------------------------- Company 0
const hemmer = ensureWorkspace({
  id: "ws-hemmer",
  name: "Hemmer Digital Services",
  description: "Owner-operated digital services business. MIDAS Company 0: the first real operating environment, not the product.",
  industry: "digital_services",
  type: "services",
  offer: "marketing and content websites; written content and SEO; data cleanup and enrichment; workflow automation over existing systems",
  idealCustomer: "Small organisations and teams buying a defined digital deliverable with a stated budget",
  geography: "remote",
  goal: "Reach repeatable paid engagements with minimal founder hours per delivered dollar",
  constraints: "Minimum engagement 500 USD. No native mobile, real-time video, embedded work, or on-site work. Platform escrow or documented deposit only. No unpaid spec work. No deceptive work. Outbound requires owner approval.",
  epistemicClass: "real_company",
});

// ------------------------------- unrelated companies, generality test only
const saas = ensureWorkspace({
  id: "ws-fixture-saas",
  name: "Fixture: scheduling SaaS",
  description: "Synthetic company used only to test that capability analysis is not hardcoded to Company 0. Not a real business.",
  industry: "software", type: "saas",
  offer: "subscription scheduling software for clinics",
  idealCustomer: "Small clinics with two to ten practitioners",
  geography: "remote",
  goal: "Grow net revenue retention above one hundred percent",
  constraints: "Self-serve only. No enterprise contracts.",
  epistemicClass: "synthetic_fixture",
});

const local = ensureWorkspace({
  id: "ws-fixture-local",
  name: "Fixture: mobile bicycle repair",
  description: "Synthetic company used only to test that capability analysis is not hardcoded to Company 0. Not a real business.",
  industry: "local_service", type: "local_physical_service",
  offer: "mobile bicycle repair at the customer's home",
  idealCustomer: "Commuters within one city",
  geography: "single city",
  goal: "Fill the weekly schedule and convert one-off jobs into maintenance plans",
  constraints: "Two vans. Physical presence required. No remote delivery possible.",
  epistemicClass: "synthetic_fixture",
});

// ------------------------------------------- ingest real preserved work
const dogfoodPath = join(stateDir(), "qualifier-dogfood.json");
let ingested = 0;
let alreadyPresent = 0;
if (existsSync(dogfoodPath)) {
  const dog = JSON.parse(readFileSync(dogfoodPath, "utf8"));
  const existingFps = new Set(listWorkItems(store, "ws-hemmer").map((w) => w.fingerprint));
  const batch = [];
  for (const r of dog.results || []) {
    const a = r.assessment;
    const fingerprint = workItemFingerprint({ workspaceId: "ws-hemmer", type: "commercial_opportunity", url: r.url, title: r.title });
    if (existingFps.has(fingerprint)) { alreadyPresent += 1; continue; }
    const item = {
      ...newWorkItem({
        workspaceId: "ws-hemmer", type: "commercial_opportunity", title: r.title,
        objective: "Convert into paid work if it qualifies",
        source: { kind: "web_search", url: r.url, discoveredAt: dog.discoveredOn || dog.at, note: "Preserved from the recommendation-mode dogfood run." },
        evidence: [{ id: "E1", text: "Assessed in recommendation mode on " + (dog.discoveredOn || dog.at) + ". No contact was made.", source: "midas_record", url: r.url }],
        inputs: { originalCaseId: r.case_id },
        economics: a ? {
          expectedValueUsd: a.estimated_value_usd ? (Number(a.estimated_value_usd.low) + Number(a.estimated_value_usd.high)) / 2 : null,
          closeProbabilityPct: a.close_probability_pct, paymentProbabilityPct: a.payment_probability_pct,
          aiFulfilmentPct: a.ai_fulfillment_pct, humanMinutes: a.human_minutes,
        } : {},
      }),
      fingerprint,
    };
    batch.push(item);
  }
  const res = upsertDiscovered(store, batch);
  ingested = res.inserted.length;

  // Replay the qualification that actually happened, with provenance, so the
  // population reflects reality rather than starting everything at discovered.
  for (const item of res.inserted) {
    const r = (dog.results || []).find((x) => x.title === item.title);
    const a = r && r.assessment;
    if (!a) continue;
    let moved = transition(item, {
      to: "qualifying", by: "worker", reason: "Qualification run in recommendation mode.",
      workerRoleId: "opportunity_qualifier", workerVersionId: dog.version || "oq-v1",
      evidenceRefs: ["E1"], at: dog.at,
    });
    const to = a.decision === "pursue" ? "qualified" : a.decision === "decline" ? "declined" : "qualifying";
    if (to !== "qualifying") {
      moved = transition(moved, {
        to, by: "worker",
        reason: a.rationale ? String(a.rationale).slice(0, 300) : "Qualification decision recorded.",
        workerRoleId: "opportunity_qualifier", workerVersionId: dog.version || "oq-v1",
        evidenceRefs: ["E1"], output: a, at: dog.at,
      });
    }
    putWorkItem(store, moved);
  }
}

const population = listWorkItems(store, "ws-hemmer");
const report = {
  at: now,
  company0: { id: hemmer.id, name: hemmer.name, reusedExistingAbstraction: "workspaces" },
  generalityFixtures: [saas.id, local.id],
  realWorkIngested: ingested, alreadyPresent,
  hemmerPopulation: population.length,
  byState: population.reduce((a, w) => { a[w.state] = (a[w.state] || 0) + 1; return a; }, {}),
  note: "Company 0 uses the existing workspace record. The two fixture companies exist only to prove the capability analysis is not shaped around Hemmer.",
};
writeFileSync(join(stateDir(), "company-setup.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("Company 0:", hemmer.id, hemmer.name);
console.log("generality fixtures:", saas.id + ",", local.id);
console.log("real work ingested:", ingested, "| already present:", alreadyPresent);
console.log("hemmer population:", population.length, JSON.stringify(report.byState));
