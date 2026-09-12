# Strategy and consolidated live proposal — draft only

**Status: no authorization is granted by this document.** It requests a new, finite execution envelope only after Mason reviews the exact terms below. It does not reuse, release, or transfer historical Mission 028/029 reservations, credentials, model access, or action authority.

## The job to run first

The original “website estimate audit” is too weak as a first venture. A public website can show an estimate route; it does not establish that the route is broken, that an owner will pay to change it, that MIDAS can deliver better than existing agencies, or that cold outreach is welcome. A $149 package, Raleigh focus, and a twenty-hour founder schedule are prior ideas, not facts.

The better first runtime job is **source-backed validation-artifact preparation for Mason’s existing website-route-audit hypothesis**. In one bounded business investigation, MIDAS should use the already prepared, trusted goal and permitted URLs to produce its actual structured validation artifact: sourced claims, stated unknowns, a bounded offer/next-test proposal, and any reviewed draft communication only where the exact recipient and channel are separately eligible. It should stop honestly if its permitted evidence does not support the hypothesis or channel.

This is a shorter learning loop than rebuilding SaaS: inspect a stated route, prepare a tangible audit sample, obtain an owner decision, and later measure whether a permitted conversation or owner-provided introduction produces a useful response. It exercises MIDAS’s actual business-understanding, bounded research, drafting, review, outbox, reply, and feedback machinery while keeping the unverified product thesis reversible.

The current repository supports that shape more credibly than a broad venture launch. The 030 manager can ask a model to choose bounded public-research retrievals, draft, and review; its research adapter is seed/corpus-only rather than a general-web search engine, and its model grant enforces business-scoped `maxCalls`. The source adapter accepts only selected HTTPS seeds or links observed in the fetched corpus. The mail layer has durable exact-batch approvals, source-backed recipient evidence, reply/opt-out/hard-bounce suppression, and reconciliation states. It does **not** by itself prove the Gmail account, OAuth consent, delivery, demand, or real worker advantage.

The earlier 20-hours/week figure was an assistant planning proposal, not a founder commitment, availability statement, or measured operational cost. This proposal makes no availability assumption. Actual review and correction time must be recorded if observed rather than inferred from calendar time.

## What the current integration can and cannot do

| Capability | Actual 030 state | Consequence for this proposal |
| --- | --- | --- |
| Research | Bounded seed retrieval, extracted links, local corpus queries; no general web search | The trusted 030 configuration supplies the permitted URLs. A failure to find evidence is not a market-negative result. |
| Business worker | `OperatingModels` pins a signed business goal, source hosts, route, token/account limits, and per-business call cap | A fresh signed model envelope is still required. Existing local/Codex model access is not API authorization. |
| Procedure learning | Source-to-procedure candidate, immutable six-case freeze, paired injected metered calls | The six cases are developer-visible mechanics. Missing independent semantic review and human correction time means no competence or superiority conclusion. |
| Email | Gmail-shaped durable outbox and provider-accepted/reconciliation/reply states | Enable only after Google OAuth and the live transport have been separately verified. `provider_accepted` is not delivery or commercial qualification. |

## Exact proposed live envelope

This is one proposal, not three roadmaps. It sets a **maximum of 21 primary model calls and 21 supporting count requests**, concurrency one, 180-second inference deadlines, 10-second count deadlines, expiry **September 25, 2026, 22:00 UTC**, and no automatic retry, fallback, or recovery admission. A failed, timed-out, malformed, or uncertain model attempt consumes its assigned slot; provider/action uncertainty is held for reconciliation, never resent blindly.

| Allocation | Calls | Purpose | Stop rule |
| --- | ---: | --- | --- |
| Business investigation and review | 8 | Six investigation and two actual-artifact review calls for one business’s prepared goal and permitted sources | Stop earlier on unsupported source, unresolved contradiction, or a reviewed stop decision. |
| Source-to-procedure extraction | 1 | Extract one public-source lesson into a general, company-private-overlay-separated procedure candidate | Retain baseline if source does not support a specific lesson. |
| Frozen paired procedure mechanics | 12 | Six developer-visible cases × baseline/challenger, same model/settings/context/resource/output contract | Preserve all cells; no replacement calls. Both arms may pass. |
| **Primary-call ceiling** | **21** | One connected exploratory run | No recovery calls. |

The route proposed for all 21 primary calls is **`gpt-5.6-sol`, Responses API, Medium reasoning, default service tier**, with structured schemas already used by the runtime. This is the appropriate common framework for the actual business work and the procedure comparison: it keeps a strong practical frontier baseline, source-contradiction headroom, customer/channel-eligibility reasoning, and the full review opportunity identical across baseline and challenger. It does not claim that Sol is superior to Astra or any other model. Terra is lower priced and may fit later bounded preparation work; Luna is lower priced still and documented for high-volume cost sensitivity. Using a cheaper route here would change the requested comparison standard; equivalent quality for this job has not been measured. The official Sol page checked **2026-09-12** lists Responses support, Medium reasoning, USD **$4 input / $20 output per million tokens**, and a 1.25× cache-write input price. [GPT-5.6 Sol model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-sol)

For a transparent planning reservation, cap each call at **32,768 input and 8,192 output tokens including reasoning**. Using the conservative cache-write input rate, the maximum calculation is `ceil(100 × (32768 × 5 + 8192 × 20) / 1,000,000) / 100 = USD $0.33` per call. Twenty-one calls reserve **USD $6.93**. This is a pricing arithmetic ceiling, not a bill, a price guarantee, a count/request fee estimate, or an authorization. The grant should separately reserve a **USD $2.07 unpriced count uncertainty buffer**, for a proposed total maximum new exposure of **USD $9.00**. If the provider’s current account pricing, token-count behavior, rate limits, or actual model availability differs at authorization time, do not silently substitute a model or enlarge the limit: refresh the proposal and obtain a new exact approval.

Mission 028/029 records establish that `gpt-6-astra` Responses access existed for those historical authorized runs. They do not establish current `gpt-5.6-sol` API entitlement, a current account limit, or that a counterfactual Sol route has been tested. A real authorization must confirm that the founder’s API project can use the proposed Sol route. API billing and key access remain separate from ChatGPT/Codex subscription access; OpenAI’s API quickstart requires an API key for an API call. [OpenAI API quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)

## External-action boundary: Gmail, if and only if reached

No public-business or cold-prospect campaign is proposed. The only live communication request allowed by a later exact action approval is **up to two messages total**, from **one owner-controlled Gmail sender** to controlled or explicitly consenting test recipients. The preferred first recipients are owner-provided records or explicit opt-in/business-request channels. If no such evidence exists, MIDAS stops at drafts; it does not infer permission from a public address.

Before any Gmail send, the owner must separately confirm: the one sender mailbox, the OAuth client/consent configuration, the least scope compatible with the final feature set, the exact controlled/consenting recipients and message hashes, expiry, volume/cadence, sender identity, suppression policy, and the expected reconciliation behavior. The envelope must cap volume at two, set a 30-second minimum interval, and set zero follow-ups. The Gmail API `users.messages.send` endpoint sends the `To`/`Cc`/`Bcc` recipients and returns a `Message` on success; it accepts `gmail.send` among its OAuth scopes. The returned message is an acknowledgement record, not evidence that a recipient received, read, replied, or bought. [Gmail send reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) Gmail’s sending guide requires a base64URL RFC 2822 message in `raw`; threading replies requires matching Subject plus RFC 2822 `References` and `In-Reply-To`. [Gmail sending guide](https://developers.google.com/workspace/gmail/api/guides/sending)

For later reply association, list results contain only message/thread IDs; the message must then be fetched for detail. The implemented live transport is configured for at most **eight bounded mailbox-specific polls** and persist the API IDs, thread IDs, provider acknowledgement, and observed reply timestamps. [Gmail list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [Gmail get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get) A relevant reply, opt-out, hard bounce, expired approval, invalidated source, or uncertain send must block follow-up. Any change requires a fresh exact approval.

## Permitted source case and decision gates

The first business run receives the trusted prepared goal and permitted URLs defined by the 030 trusted configuration, rather than asking Mason to research a new corpus. At least one permitted source must support the audit’s observable route (for example, a quote/booking/contact path), and none is treated as proof of a defect, buyer identity, contact permission, demand, price, economics, or conversion. This fits the adapter’s actual seed/link/corpus limitations and makes changing evidence visibly change the proposal. A later controlled test recipient may be recorded through the implemented owner-record UI, subject to the separate mail gate.

The run ends in exactly one of these owner-visible states:

1. **Unsupported / stop:** no usable factual route or no eligible channel; retain the evidence and draft no outreach.
2. **Validation artifact ready:** one reviewed, source-backed structured validation artifact awaits Mason’s specific decision; no send occurs.
3. **Exact two-message request:** only after the packet is ready and two recipient/channel records satisfy the separate policy; the approval screen shows the sender, recipients, content hashes, evidence hash, expiry, and suppression rules.

The paired 12-call procedure exercise runs only after the source procedure candidate is frozen. It is exploration, not protected evaluation. Its result remains mechanically paired and **inconclusive** until independent semantic review, owner correction time, and fit-for-job measurements exist. MIDAS may retain an observed useful procedure candidate, but it must not label a worker superior or promote it automatically.

## Founder decisions required before execution

1. Confirm the one trusted prepared business goal and permitted URLs from the 030 configuration.
2. Confirm a fresh maximum USD $9.00 API exposure envelope: 21 primary calls and 21 count requests, `gpt-5.6-sol` Medium/default, 32,768/8,192 token ceilings, concurrency one, 180-second/10-second deadlines, September 25, 2026, 22:00 UTC expiry, and zero recovery calls.
3. Confirm whether the run may prepare drafts only (recommended first execution) or may later present a separate two-message Gmail exact-approval request for one sender and controlled/consenting test recipients. The latter needs the OAuth/account checks and specific channel evidence above; it is not included in model authorization.

Until those decisions are explicit, MIDAS should continue offline preparation and browser verification only. No provider request, credential access, Gmail OAuth flow, message send, contact, purchase, publication, or claim of validated demand is authorized.

## Final input-context refinement

The earlier unsigned 8,192-input/$6 draft is retained under `proposal/earlier-8192-input-draft/`. The final v2 proposal allows 32,768 input tokens so multiple retained webpages, founder context, output schema and actual artifact can be reviewed together. This addresses a concrete context-pressure risk; no local character count substitutes for provider token admission. Output remains capped at 8,192 including reasoning, per-call reservation becomes 33 cents, and the 21-call maximum plus the explicit unpriced buffer is $9. Both procedure conditions share the same ceiling. If the complete request exceeds this ceiling, no inference is sent. No live grant has been signed or used.
