# Sample: can a visitor request an estimate?

**Illustrative specimen, authored by the development assistant on September 11, 2026. Not a real business audit, buyer observation or MIDAS runtime output.** This is the proposed paid deliverable's format, with intentionally seeded examples. No website was contacted or tested to produce these findings.

Client: Example Cleaning Co. (invented). Task: find service area, request an estimate, understand what happens next. Scope: one homepage/contact route at desktop and narrow mobile widths. Submission, phone calls and booking are excluded unless separately authorized.

Open the companion `sample-site.html` locally. It contains the exact source elements cited below; no server or network is needed. Reproduction checklist: (1) open at a narrow and wide window, (2) select Request an estimate, (3) note the URL fragment changes but no estimate section exists, (4) compare the hero and contact service areas, (5) try to identify a contact channel without inventing one. No form submission is possible. A corrected retest must use a separately versioned site; keep this original specimen intact.

## Decision for the owner

Fix the estimate button destination before buying more traffic. Confirm the intended service area and contact wording with the owner. Revenue impact is unknown; this report does not estimate recovered leads.

| Finding | Reproduction and evidence | Observed versus inferred | Recommended action and acceptance |
|---|---|---|---|
| P1: estimate button has no target | Specimen source: `<a href="#estimate">Request an estimate</a>`; no element has `id="estimate"`. Select the button; there is no estimate section to navigate to. | Defect is seeded in this specimen. A visitor abandoning is a hypothesis, not an observed customer action. | Point the button to the actual contact section. Retest keyboard and pointer navigation at both widths; record resulting URL/target. |
| P2: two different service areas | Specimen hero says “North County”; contact instructions say “South County only.” | Contradiction is directly present. Which area is correct is unknown. | Ask the business owner. Do not choose an area from context or silently correct it. Publish consistent wording only after approval. |
| P2: contact does not explain next step | Specimen says “Send details” but gives no channel or process. | Missing instruction is observable; a particular response time is not established. | Add the approved contact method and owner-confirmed next step. Never invent a same-day promise. |

## Ready-to-send developer ticket

Title: Repair homepage estimate link. Evidence: source reference SAMP-1, missing fragment target. Change: link to the real estimate section after owner confirms its location. Acceptance: pointer/keyboard activation lands at the intended section at 390 px and 1440 px; no submission is made; screenshot and URL recorded. Owner: customer's existing webmaster, not assumed to be Mason. Status: proposed, not executed.

## Limits and handoff

This is functional triage, not accessibility certification, security testing, SEO, conversion research or a complete quality guarantee. No contacts were submitted; inbox delivery is unverified. No issue proves lost revenue. A real report must attach dated screenshots/URLs, device/browser conditions, reproducible steps and owner permission for any non-read-only test. Founder review/delivery effort must be timed during a pilot. No test buyers, testimonials, sales or customer results exist.
