# First owner pilot — release 032

Integration owner: current development assistant. Mission 032 availability checked against branches, worktrees and tracked documentation on 2026-09-13. Base: `0ae5c335b11f6f6fe288662cada4df0a3dc18a15`, clean R5. Branch: `codex/first-owner-pilot-v0-032`. R5 remains unsigned, untouched and disabled. No provider calls, credential reads, purchases or external effects are authorized for this release.

Governing roadmap: `MIDAS-Product-and-Execution-Plan-2026-09-13 (1).md`, read in full. Immediate sequencing follows the connected first-owner pilot assignment. Actual company information is unknown. Fixture data is never the default company.

## Outcome and reuse

Onboard company evidence → partial understanding and ranked hypotheses → supported assignment → durable execution → usable checked artifact → correction and renewed checks → owner outcome → updated recommendation. Reuse SQLite StateStore, Portfolio controller, LocalWorkTools, ModelPort evidence contracts, bounded finalization, ProcedureRegistry and existing browser containment. Do not rebuild orchestration or modify the frozen R5 checkout.

## Work ownership and checkpoints

1. Verified base, authority and mission allocation: complete.
2. Root owns pilot server, integration facade, security, launch, deployment preparation, end-to-end tests and final preservation.
3. Execution agent owns configurable workflow execution facade and bounded business-site profile/checks, reusing PortfolioEngine; tests. No changes to frozen stage contracts or grants.
4. Knowledge agent owns pilot evidence/understanding and correction-to-comparison mechanics, reusing validators and ProcedureRegistry; tests.
5. Interface agent owns pilot HTML/CSS/JS only. Strong owner journey, real empty onboarding, explicit demo archive, persisted actions. Fresh review follows integration.
6. Integrate and correct actual desktop/mobile browser journey; restart, isolation, stale corrections, failed checks, pause/resume and fixture improvement limitations verified.
7. Complete runnable handoff, exact remaining pilot inputs, unsent consolidated live requirements and clean local commits.

## Interfaces shared by implementation agents

Pilot server entry: `packages/foundry/src/pilot/cli.ts`, default root `var/owner-pilot-032`, port 43143. Plain HTML/JS/CSS, existing Node TypeScript runtime, no packages installed.

Owner API (JSON): GET `/api/session` → `{csrf}`; GET `/api/state?businessId=...` → view below. POST routes require same-origin and `x-csrf-token`. All mutations return refreshed view. Body includes businessId except create/demo. Client handles errors without losing input.

POST `/api/business` `{name,website,goal,notes}` (new real company, owner input only); `/api/source` `{businessId,title,text,kind,rights,observedAt}` (text/markdown/CSV/JSON content up to 200KB, no automatic URL fetch); `/api/diagnose` `{businessId}`; `/api/demo` `{}` creates separate clearly labeled fixture company; `/api/plan` `{businessId,workflow:'response-packet'|'business-site'}`; `/api/run` `{businessId,taskId}`; `/api/pause` or `/api/resume` `{businessId,taskId}`; `/api/correct` `{businessId,taskId,artifactHash,instruction,assisted,reviewSessionId?}`; `/api/review/start` `{businessId,taskId}` starts prospective timer; `/api/approve` `{businessId,taskId,artifactHash,assisted,reviewSessionId?}` means accept local deliverable only, never send/deploy; `/api/outcome` `{businessId,taskId,artifactHash,kind:'accepted'|'needs-change'|'not-useful',notes,assisted}`; `/api/learning` `{businessId,taskId}` runs fixture comparison mechanics only for fixture business; real company prepares candidate/evaluation requirements without fabricated scores.

GET `/api/artifact?businessId=...&taskId=...` JSON authoritative artifact detail with previewUrl/downloadUrl; GET `/preview?...` safely isolated local preview; GET `/download?...` attachment; GET `/api/export?businessId=...` evidence snapshot. No external send controls.

View contract: `{businesses:[{id,name,mode}],business:null|{id,name,website,goal,notes,mode,version},sources:[{id,title,kind,text,rights,observedAt}],understanding:{status,claims:[],unknowns:[],contradictions:[],hypotheses:[],nextAction,provenance},tasks:[{id,title,workflow,status,reason,nextAction,checkpoint,worker,artifact:null|{hash,title,previewUrl,downloadUrl,checks:[],provenance,version,summary},corrections:[]}],workers:[{id,name,job,procedureVersion,tools:[],evidence,limitations,selectionReason}],learning:[],outcomes:[],inbox:[],connections:[],accounting:{providerCalls:0,providerCostMinor:0,retainedExposureMinor:0,humanSeconds:null},history:[],authority:{liveEnabled:false,externalEffects:false},release:{version:'032',historicalR5:'unsigned; preserved'}}`. Root will adapt agents' interfaces to this owner view.

## Honesty and release gates

Business facts stay source-linked and incomplete. Owner notes are reports, not independently verified truth. Unknown benefit/cost is null. Offline response content is a disclosed development-authored test double. It proves execution/correction mechanics only. Actual inference requires a new exact grant through existing admission mechanisms; no generic API-key bypass. Local owner acceptance is not independent semantic validation. All customer effects and hosting deployment remain blocked. Product preview is local, not live business operation.

Historical retained Mission 031 exposure: 1917 USD cents, counted only in historical archive. Pilot provider admissions and exposure: zero. Founder review timing is measured only when a real session starts/ends and the owner marks assistance accurately.

## Integrated release checkpoint

The evidence, worker registry, two execution profiles, owner server/UI, correction/outcome/learning bridge, backup/restore and explicit signed execution bindings are implemented. Real browser inspection found and corrected long technical check labels, stale review controls and a CSV label on JSON export. Bounded integration review found stale company context could otherwise survive until dispatch; new work and authorization now pin company/source context prospectively. Historical responses and artifacts remain preserved.

The default workspace has no real company data and no new grant. A separately labeled Harbor Workshop demo contains a readable response packet and a functional local inquiry application, both produced through the controller's test-double worker and actual tools/checks. Full correction, outcome, learning and restart behavior is verified in separate development test stores. These do not impersonate Mason's approval or the business owner's judgment.

Final verification and preservation results are recorded in `COMPLETION.md` and ignored `var/owner-pilot-032/verification/`. No additional provider or token-count request, credential read, installation, deployment, customer communication or purchase was made.
