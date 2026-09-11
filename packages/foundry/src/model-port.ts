import {boundedJSON,sanitizeCountResponse} from './experiment/token-count.ts';
import { canonical, hash, identifier, modelResult, money, requireThat, safeInteger, scope, FoundryError, rawHash } from './contracts.ts';
import type { Cost, ModelPort, ModelRequest, ModelResult, Money } from './contracts.ts';
/** An admission/billing port belongs to trusted application code, never model text.
 * reserve must atomically claim the scoped request and reject duplicate pending
 * calls; uncertain retains the reservation until billing reconciliation. */
export interface ModelBudgetPort {
    prepare?(request: ModelRequest, amount: Money, requestHash: string, requestBytes: string): Promise<void>;
    observed?(request: ModelRequest, observation: Record<string, unknown>): Promise<void>;
    reserve(request: ModelRequest, amount: Money, requestHash: string): Promise<void>;
    settle(request: ModelRequest, actual: Cost, providerRequestId: string | null): Promise<void>;
    uncertain(request: ModelRequest, reason: string): Promise<void>;
}
export type ResponsesRoute = {
    authorizationId: string;
    model: string;
    projectId?: string;
    reasoningEffort?: "low" | "medium" | "high";
    serviceTier?: "default";
    maxOutputTokens: number;
    deadlineMs: number;
    inputTokenCeiling: number;
    maxCallCost: Money;
    pricing: {
        inputMinorPerMillion: number;
        outputMinorPerMillion: number;
        source: string;
        effectiveAt: string;
    };
};
/** Supported OpenAI Responses transport. Not enabled by the laboratory CLI.
 * Tests inject an in-memory transport: no provider calls were made for Mission 027.
 * Unlike the older repository adapter this transports output and time limits.
 * Abort means response uncertainty, not proof the provider stopped billing. */
export function responsesModelPort(options: {
    route: ResponsesRoute;
    apiKey: () => string;
    budget: ModelBudgetPort;
    schemaForTask: (task: string) => any;
    validateOutput: (task: string, output: any) => void;
    countInputTokens: (body: any, request?:ModelRequest) => number | Promise<number>;
    transport?: typeof fetch;
}): ModelPort {
    const { apiKey, budget, schemaForTask, validateOutput } = options;
    const route = structuredClone(options.route);
    const transport = options.transport ?? fetch;
    identifier(route.authorizationId);
    identifier(route.model);
    money(route.maxCallCost);
    for (const amount of [route.maxOutputTokens, route.deadlineMs, route.inputTokenCeiling])
        safeInteger(amount, 1);
    for (const amount of [route.pricing.inputMinorPerMillion, route.pricing.outputMinorPerMillion])
        safeInteger(amount);
    requireThat(route.pricing.source.length > 0 && Number.isFinite(Date.parse(route.pricing.effectiveAt)), 'PRICE_PROVENANCE_REQUIRED');
    function price(input: number, output: number): Money {
        safeInteger(input);
        safeInteger(output);
        const numerator = BigInt(input) * BigInt(route.pricing.inputMinorPerMillion) + BigInt(output) * BigInt(route.pricing.outputMinorPerMillion);
        const minorUnits = Number((numerator + 999999n) / 1000000n);
        safeInteger(minorUnits);
        return { minorUnits, currency: route.maxCallCost.currency };
    }
    return {
        kind: 'live',
        async run(request: ModelRequest): Promise<ModelResult> {
            scope(request.scope);
            identifier(request.requestId);
            money(request.limits.maxCost);
            requireThat(request.role.model === route.model, 'PINNED_MODEL_MISMATCH');
            const maximum = price(route.inputTokenCeiling, route.maxOutputTokens);
            requireThat(request.limits.maxCost.currency === maximum.currency && maximum.minorUnits <= request.limits.maxCost.minorUnits && maximum.minorUnits <= route.maxCallCost.minorUnits, 'MODEL_BUDGET_EXCEEDED');
            const schema = schemaForTask(request.task);
            requireThat(schema?.type === 'object' && schema.additionalProperties === false, 'STRICT_OUTPUT_SCHEMA_REQUIRED');
            // Freeze input/config outside generated text. The admitted input-token
            // ceiling must be established by F2's provider-compatible token counter.
            // Administrative scope/request IDs bind local accounting only;
            // they must not leak scenario labels into the worker prompt.
            const body = { ...(route.reasoningEffort ? {reasoning:{effort:route.reasoningEffort}} : {}), ...(route.serviceTier ? {service_tier:route.serviceTier} : {}), model: route.model, input: canonical({ task: request.task, context: request.context, tools: request.tools }), instructions: request.role.procedure, max_output_tokens: route.maxOutputTokens, store: false, text: { format: { type: 'json_schema', name: 'foundry_' + request.task, strict: true, schema } } };
            const bytes=canonical(body), digest=rawHash(bytes);
            const started=Date.now();let admitted=false,usageRecorded=false;
            try {
                if(budget.prepare){await budget.prepare(request,maximum,digest,bytes);admitted=true;}
                const inputTokens=await options.countInputTokens(structuredClone(body),request);
                safeInteger(inputTokens);requireThat(inputTokens<=route.inputTokenCeiling,'MODEL_INPUT_EXCEEDS_ADMISSION');
                const credential=apiKey();requireThat(typeof credential==='string' && credential.length>0,'MODEL_ACCESS_REQUIRED');
                await budget.reserve(request,maximum,digest);admitted=true;
                const response=await transport('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'application/json',...(route.projectId?{'OpenAI-Project':route.projectId}:{})},body:bytes,redirect:'error',signal:AbortSignal.timeout(route.deadlineMs)});
                const raw=await boundedJSON(response,262144) as any;
                await budget.observed?.(request,{inferenceHTTP:sanitizeCountResponse(response.status,response.headers.get('x-request-id'),raw,credential)});
                requireThat(response.ok, 'MODEL_HTTP_ERROR');
                requireThat(raw&&typeof raw==='object','MODEL_RESPONSE_INVALID');
                const requestId = typeof raw.id === 'string' ? raw.id : null;
                const usage = raw.usage;
                await budget.observed?.(request,{providerRequestId:requestId,model:typeof raw.model==='string'?raw.model:null,status:typeof raw.status==='string'?raw.status:null,inputTokens:Number.isSafeInteger(usage?.input_tokens)?usage.input_tokens:null,outputTokens:Number.isSafeInteger(usage?.output_tokens)?usage.output_tokens:null,cachedInputTokens:Number.isSafeInteger(usage?.input_tokens_details?.cached_tokens)?usage.input_tokens_details.cached_tokens:null,latencyMs:Date.now()-started});
                requireThat(raw.model === route.model, 'RETURNED_MODEL_MISMATCH');
                requireThat(!raw.service_tier||raw.service_tier===route.serviceTier,'RETURNED_TIER_MISMATCH');
                requireThat(usage && Number.isSafeInteger(usage.input_tokens) && Number.isSafeInteger(usage.output_tokens), 'MODEL_USAGE_MISSING');
                safeInteger(usage.input_tokens);
                safeInteger(usage.output_tokens);
                requireThat(usage.input_tokens <= route.inputTokenCeiling && usage.output_tokens <= route.maxOutputTokens, 'MODEL_USAGE_EXCEEDS_ADMISSION');
                const estimated = price(usage.input_tokens, usage.output_tokens);
                requireThat(estimated.minorUnits <= maximum.minorUnits, 'MODEL_COST_EXCEEDS_ADMISSION');
                const actual: Cost = { status: 'provisional', money: estimated, basis: 'token-based estimate; ' + route.pricing.source + ' effective ' + route.pricing.effectiveAt + '; reconcile invoice and cached-token discounts' };
                await budget.settle(request, actual, requestId);
                usageRecorded = true;
                requireThat(raw.status === 'completed', 'MODEL_RESPONSE_INCOMPLETE');
                requireThat(!(raw.output ?? []).some((item:any)=>(item.content ?? []).some((part:any)=>part.type==='refusal')),'MODEL_REFUSED');
                const text = (raw.output ?? []).flatMap((item: any) => item.content ?? []).filter((item: any) => item.type === 'output_text').map((item: any) => item.text).join('');
                requireThat(text.length > 0, 'MODEL_OUTPUT_MISSING');
                const output = JSON.parse(text);
                // Preserve the model's bounded JSON artifact, not HTTP headers or the provider envelope.
                // A provider echo of the credential is redacted before durable diagnostic storage.
                const diagnosticOutput=JSON.parse(JSON.stringify(output).split(credential).join('[REDACTED]'));
                await budget.observed?.(request,{outputArtifact:diagnosticOutput});
                requireThat(!text.includes(credential), 'MODEL_SENSITIVE_OUTPUT');
                validateOutput(request.task, output);
                return modelResult({ output, usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cost: actual }, route: { provider: 'openai-responses', model: raw.model, kind: 'live' }, metadata: { providerRequestId: requestId, cachedInputTokens: Number.isSafeInteger(usage.input_tokens_details?.cached_tokens) ? usage.input_tokens_details.cached_tokens : null, latencyMs: Date.now() - started } });
            }
            catch (error) {
                if (admitted && !usageRecorded)
                    await budget.uncertain(request, (error as any).code ?? 'MODEL_RESULT_UNCERTAIN');
                throw new FoundryError((error as any).code ?? 'MODEL_RESULT_UNCERTAIN','Model attempt has no accepted output ('+((error as any).code ?? 'MODEL_RESULT_UNCERTAIN')+'). No automatic retry or fixture fallback.');
            }
        },
    };
}
