import { readFileSync } from 'node:fs';
import { requireThat, canonical, safeInteger, hash } from '../contracts.ts';
import { responsesModelPort } from '../model-port.ts';
import { outputSchema, validateOutput } from './task.ts';
import type { ModelBudgetPort, ResponsesRoute } from '../model-port.ts';
/** Token count uses the complete create payload, including instructions/schema/settings.
 * No character-ratio estimator, omission of schema overhead, or local fallback. */
export function providerPort(route: ResponsesRoute, projectId: string, credentialFile: string, budget: ModelBudgetPort, transport: typeof fetch = fetch) {
    const credential = () => readFileSync(credentialFile, 'utf8').trim();
    return responsesModelPort({ route: { ...route, projectId }, budget, apiKey: credential, schemaForTask: () => outputSchema, validateOutput: (_task, out) => validateOutput(out), transport,
        async countInputTokens(body) {
            requireThat(body.model === route.model && body.store === false && body.service_tier === 'default' && !Object.hasOwn(body, 'tools'), 'UNFROZEN_PROVIDER_REQUEST');
            const bytes = canonical(body);
            requireThat(Buffer.byteLength(bytes, 'utf8') <= 65536, 'REQUEST_TOO_LARGE');
            const response = await transport('https://api.openai.com/v1/responses/input_tokens', { method: 'POST', headers: { authorization: 'Bearer ' + credential(), 'OpenAI-Project': projectId, 'content-type': 'application/json' }, body: bytes, signal: AbortSignal.timeout(10000) });
            requireThat(response.ok, 'TOKEN_COUNT_HTTP_ERROR');
            const value = await response.json() as any;
            requireThat(value.object === 'response.input_tokens', 'TOKEN_COUNT_INVALID');
            safeInteger(value.input_tokens);
            // Provider-compatible exact input count plus 10%/256 tokens for conservative admission.
            return Math.ceil(value.input_tokens * 1.1) + 256;
        },
    });
}
