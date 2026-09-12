# Research v4 verification — September 12, 2026

Development-assistant verification completed at approximately 22:50 UTC. Scope: public publisher documentation and public forum pages; local preparation code and the live proposal were read only. No credentials, provider requests, token-count requests, account checks or outreach were used. This verifies documented behavior and retained text, not account access or successful execution.

## Retained business evidence

All nine `text` excerpts in [sources.json](sources.json) match the retrieved page text after replacing hyperlink markup with its visible label and normalizing whitespace. A local comparison found nine matches; retained excerpts total 950 characters and 13–22 words each. `interpretation` remains development-assistant analysis. The observation date is our retrieval date; cached public pages do not establish that every statement remains operationally current.

| Source record | Publisher location checked | Result and date qualification |
| --- | --- | --- |
| quote-jobber-approval | [Jobber: Quote Approvals](https://help.getjobber.com/en/articles/quote-approvals/), Overview | Exact sentence; explicit update August 11, 2026. Original publication unknown. |
| quote-jobber-conversion-snapshot | [Jobber: Converting a Quote to a Job](https://help.getjobber.com/en/articles/converting-a-quote-to-a-job/), conversion instructions | Exact sentence; explicit update March 26, 2024. Describes snapshot behavior; does not establish a defect. |
| quote-housecall-conversion | [Housecall Pro: Copy or Convert Jobs and Estimates](https://help.housecallpro.com/en/articles/2883009-how-to-copy-or-convert-jobs-and-estimates), estimate-to-job section | Exact sentence; August 11, 2026 displayed without an explicit publication/update distinction. |
| quote-square-estimates | [Square: Create and send invoice estimates](https://squareup.com/help/us/en/article/7215-create-an-estimate-online), Auto-convert estimates | Exact sentence including linked product name; feature entitlement is plan dependent. No date displayed. |
| quote-excel-template-substitute | [Microsoft: Excel templates](https://excel.cloud.microsoft/create/en/templates/), usage FAQ | Exact sentence; time saving is a publisher claim. No date displayed. |
| quote-jobber-import-constraints | [Jobber: Import Quotes](https://help.getjobber.com/en/articles/import-quotes/), Overview | Exact two-sentence note; explicit update May 22, 2026. |
| quote-public-scope-friction | [Public cleaning quotation discussion](https://www.reddit.com/r/smallbusiness/comments/1sy3def/i_need_help_with_qoute_calculator/), original post by twinkletherabbit | Exact contiguous excerpt; retrieved page says four months ago. Exact date and operator identity unverified. |
| quote-public-basic-stack | [Public solo-operator software discussion](https://www.reddit.com/r/smallbusiness/comments/1qyq9fv/solo_service_business_owners_what_do_you_use_for/), HomeScoutInSpace comment | Exact paragraph; retrieved page says seven months ago. Software use is self-reported. |
| quote-public-adoption-handoff | [Public CRM migration discussion](https://www.reddit.com/r/smallbusiness/comments/swfhg4/my_bluecollar_service_based_business_has_20/), smithpimpington follow-up | Exact contiguous excerpt; retrieved page says five years ago. Historical anecdote; precise date remains unknown. |

No excerpt wording correction was needed. The Housecall Pro record already preserves the date correction made during initial preparation: `publishedAt` is null, with the ambiguous displayed date in `dateNote`. Reddit relative ages are preserved as observations and are not converted into invented timestamps. `rights: public_readonly` records the access method, not a publisher redistribution license. Public commenters are not buyer leads or evidence of willingness to pay.

The final paragraph of [synthesis.md](synthesis.md) is corrected: an engineering-justified reversible prototype may proceed without interviews. Commercial uncertainty remains explicit. This packet supports exercising source versioning, quote/job persistence and runtime correction; it does not implement approved-scope snapshots or establish demand. Existing field-service suites and competent basic tools are the strongest contrary evidence to a generic tracker proposition.

## Official OpenAI route and prices

The opened [Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra) documents `gpt-6-astra`, Responses support and reasoning efforts `low`, `medium`, `high`, `xhigh`, `max`; `max` is the highest listed. Context is 1,050,000 tokens and maximum output is 128,000 tokens. These are published model limits, not the smaller local budget limits. The model card's “Default” label does not establish a default reasoning effort. We did not establish Astra's omitted-effort default; the proposed request explicitly sets `reasoning.effort: "max"`.

The [Responses create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) documents `service_tier: "default"` as standard processing. Omitting the field means `auto`, which uses project configuration. The returned tier reflects actual processing and may differ from the requested value. `max_output_tokens` includes reasoning and visible output. Accordingly, explicit `max` reasoning and explicit `default` service tier are separate choices.

The opened [official pricing table](https://developers.openai.com/api/docs/pricing) and model page agree on current Astra Standard rates per million tokens:

| Context | Input | Cached input | Cache writes | Output |
| --- | ---: | ---: | ---: | ---: |
| Short | $10.00 | $1.00 | $12.50 | $50.00 |
| Long | $20.00 | $2.00 | $25.00 | $75.00 |

The model page sets the long-context threshold above 272,000 input tokens, applying higher rates to the full request. Batch/Flex are half Standard; Fast doubles applicable rates. The proposed ordinary Standard route is therefore not $5 input/$30 output. The pricing page also specifies $10 per 1,000 ordinary web-search calls plus search-content tokens at model rates, and a 10% uplift for eligible regional-processing endpoints. No regional endpoint is proposed here. Prices are observations on this date, not a guarantee against later changes.

## Complete token-count projection

The opened [input-token count reference](https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens/methods/count) documents `POST /v1/responses/input_tokens` and these twelve optional body fields: `conversation`, `input`, `instructions`, `model`, `parallel_tool_calls`, `personality`, `previous_response_id`, `reasoning`, `text`, `tool_choice`, `tools`, `truncation` (deprecated). Conversation and previous-response references are mutually exclusive. `text` includes structured-output configuration; retaining only user text is not the complete request projection.

Local readback of `packages/foundry/src/experiment/token-count.ts` finds exactly that allowlist. It preserves full supplied values, removes the three generation-only fields used by the current builder (`max_output_tokens`, `service_tier`, `store`), and rejects unknown fields. The current `buildResponsesBody()` projection consequently retains the exact `model`, `reasoning`, role `instructions`, serialized `input` containing task/context/tool contracts, and full `text.format` JSON Schema. Top-level provider tools, when supplied by another request builder, are also retained. This is a code inspection; no count or inference was sent.

The [counting guide](https://developers.openai.com/api/docs/guides/token-counting) documents request, conversation and tool counting. Neither that guide, the count reference, nor the pricing page checked here established a separate count-endpoint charge or guaranteed that it is free. Treat its price as unresolved. Counting the supplied request cannot pre-count unknown future search results or generated output; those need separate conservative reservations.

## Local packet implications and remaining uncertainty

The [V4 execution packet](../INTEGRATED-EXECUTION-V4.md) retains $12.50/M input and $50/M output as a conservative cache-write ceiling. At its 32,768 input and 16,384 total-output limits, the arithmetic is `ceil((32768 × 1250 + 16384 × 5000) / 1,000,000) = 123` US cents. This reservation agrees with the documented short-context rates. Its separate hosted-search and $4 counting reserves are local admission policy, not provider quotes or proof of final billing.

Official documentation establishes route metadata only. Current project entitlement, credential validity, provider acceptance of the exact frozen body, available quota, returned model/tier, billing reconciliation and task completion remain untested by this review. No immutable Astra revision was established; the model string is an alias. Keep these uncertainties separate from the verified publisher excerpts and deterministic local preparation checks.
