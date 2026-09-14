import {validateBackgroundPolicy} from './durable-responses.ts';
import {responseObservation,terminalFailureCode} from './response-observation.ts';
import type {BackgroundPolicy,DurableResponses} from './durable-responses.ts';
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
    background?: BackgroundPolicy;
    reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max";
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
/** Same exact provider body for offline contract inspection and actual admission. Contains no credentials. */
export function buildResponsesBody(route: ResponsesRoute, request: ModelRequest, schema: any) {
    if(route.background)validateBackgroundPolicy(route.background);
    let input:any=canonical({ task: request.task, context: request.context, tools: request.tools });
    if(request.images?.length){
        requireThat(request.images.length===1,'MODEL_IMAGE_COUNT_LIMIT');
        for(const image of request.images){
            identifier(image.sourceId);requireThat(['image/png','image/jpeg'].includes(image.mimeType)&&image.detail==='auto'&&typeof image.base64==='string'&&image.base64.length<=86668&&typeof image.provenance==='string'&&image.provenance.length>0&&image.provenance.length<=2000,'MODEL_IMAGE_CONTRACT');
            const bytes=Buffer.from(image.base64,'base64');requireThat(bytes.length>8&&bytes.length<=65000&&bytes.toString('base64')===image.base64&&rawHash(bytes)===image.sha256,'MODEL_IMAGE_BYTES_OR_HASH');
            requireThat(image.mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255,'MODEL_IMAGE_TYPE');
        }
        input=[{role:'user',content:[{type:'input_text',text:canonical({task:request.task,context:request.context,tools:request.tools,images:request.images.map(({base64,...metadata})=>metadata)})},...request.images.map(image=>({type:'input_image',image_url:'data:'+image.mimeType+';base64,'+image.base64,detail:image.detail}))]}];
    }
    return { ...(route.reasoningEffort ? {reasoning:{effort:route.reasoningEffort}} : {}), ...(route.serviceTier ? {service_tier:route.serviceTier} : {}), model: route.model, input, instructions: request.role.procedure, max_output_tokens: route.maxOutputTokens, store: route.background?.store??false, ...(route.background?{background:true}:{}), text: { format: { type: 'json_schema', name: 'foundry_' + request.task, strict: true, schema } } };
}
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
    durable?: DurableResponses;
    resume?: boolean;
}): ModelPort {
    const { apiKey, budget, schemaForTask, validateOutput } = options;
    const route = structuredClone(options.route);
    const transport = options.transport ?? fetch;
    requireThat(Boolean(route.background)===Boolean(options.durable),'BACKGROUND_DURABILITY_REQUIRED');
    requireThat(!options.resume||Boolean(options.durable),'BACKGROUND_RESUME_REQUIRED');
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
            const body = buildResponsesBody(route, request, schema);
            const bytes=canonical(body), digest=rawHash(bytes);
            const started=Date.now();let admitted=Boolean(options.resume),usageRecorded=false;
            try {
                if(!options.resume){
                if(budget.prepare){await budget.prepare(request,maximum,digest,bytes);admitted=true;}
                const inputTokens=await options.countInputTokens(structuredClone(body),request);
                safeInteger(inputTokens);requireThat(inputTokens<=route.inputTokenCeiling,'MODEL_INPUT_EXCEEDS_ADMISSION');
                }
                const credential=apiKey();requireThat(typeof credential==='string' && credential.length>0,'MODEL_ACCESS_REQUIRED');
                if(!options.resume)await budget.reserve(request,maximum,digest);admitted=true;
                let raw:any;
                if(options.durable){raw=await options.durable.execute({bytes,credential,projectId:route.projectId!,model:route.model,createDeadlineMs:route.deadlineMs,transport,resume:Boolean(options.resume)});}
                else {
                const response=await transport('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'application/json',...(route.projectId?{'OpenAI-Project':route.projectId}:{})},body:bytes,redirect:'error',signal:AbortSignal.timeout(route.deadlineMs)});
                await budget.observed?.(request,{inferenceHTTP:sanitizeCountResponse(response.status,response.headers.get('x-request-id'),null,credential)});
                raw=await boundedJSON(response,262144) as any;
                await budget.observed?.(request,{inferenceHTTP:sanitizeCountResponse(response.status,response.headers.get('x-request-id'),raw,credential)});
                requireThat(response.ok, 'MODEL_HTTP_ERROR');
                }
                requireThat(raw&&typeof raw==='object','MODEL_RESPONSE_INVALID');
                const requestId = typeof raw.id === 'string' ? raw.id : null;
                const usage = raw.usage;
                await budget.observed?.(request,{...responseObservation(raw,credential),cachedInputTokens:Number.isSafeInteger(usage?.input_tokens_details?.cached_tokens)?usage.input_tokens_details.cached_tokens:null,latencyMs:Date.now()-started});
                requireThat(raw.model === route.model, 'RETURNED_MODEL_MISMATCH');
                requireThat(!raw.service_tier||raw.service_tier===route.serviceTier,'RETURNED_TIER_MISMATCH');
                const failureCode=terminalFailureCode(raw.status);
                try {
                requireThat(usage && Number.isSafeInteger(usage.input_tokens) && Number.isSafeInteger(usage.output_tokens), 'MODEL_USAGE_MISSING');
                safeInteger(usage.input_tokens);
                safeInteger(usage.output_tokens);
                requireThat(usage.input_tokens <= route.inputTokenCeiling && usage.output_tokens <= route.maxOutputTokens, 'MODEL_USAGE_EXCEEDS_ADMISSION');
                const estimated = price(usage.input_tokens, usage.output_tokens);
                requireThat(estimated.minorUnits <= maximum.minorUnits, 'MODEL_COST_EXCEEDS_ADMISSION');
                const actual: Cost = { status: 'provisional', money: estimated, basis: 'token-based estimate; ' + route.pricing.source + ' effective ' + route.pricing.effectiveAt + '; reconcile invoice and cached-token discounts' };
                await budget.settle(request, actual, requestId);
                usageRecorded = true;
                } catch(accountingError) {
                    if(!failureCode)throw accountingError;
                    await budget.observed?.(request,{accountingUsage:'unknown',accountingError:typeof (accountingError as any).code==='string'?(accountingError as any).code:'MODEL_ACCOUNTING_UNAVAILABLE'});
                }
                if(failureCode)throw new FoundryError(failureCode);
                requireThat(raw.status === 'completed', 'MODEL_RESULT_UNCERTAIN');
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
                return modelResult({ output, usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cost: {status:'provisional',money:price(usage.input_tokens,usage.output_tokens),basis:'token-based estimate; '+route.pricing.source+' effective '+route.pricing.effectiveAt+'; reconcile invoice and cached-token discounts'} }, route: { provider: 'openai-responses', model: raw.model, kind: 'live' }, metadata: { providerRequestId: requestId, cachedInputTokens: Number.isSafeInteger(usage.input_tokens_details?.cached_tokens) ? usage.input_tokens_details.cached_tokens : null, latencyMs: options.durable?Date.parse(options.durable.state().terminalAt)-Date.parse(options.durable.state().dispatchAt):Date.now() - started } });
            }
            catch (error) {
                if((error as any)?.simulatedCrash)throw error;
                const code=typeof (error as any).code==='string'?(error as any).code:(error as any).name==='TimeoutError'?'MODEL_DEADLINE_UNCERTAIN':'MODEL_RESULT_UNCERTAIN';
                if (admitted && !usageRecorded)
                    await budget.uncertain(request, code);
                throw new FoundryError(code,'Model attempt has no accepted output ('+code+'). No automatic retry or fixture fallback.');
            }
        },
    };
}
