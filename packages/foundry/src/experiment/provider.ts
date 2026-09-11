import { countTokens } from './token-count.ts';
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
        async countInputTokens(body,request) {
            requireThat(body.model === route.model && body.store === false && body.service_tier === 'default' && !Object.hasOwn(body, 'tools'), 'UNFROZEN_PROVIDER_REQUEST');
            return countTokens(body,projectId,credential(),async event=>{if(request)await budget.observed?.(request,{tokenCount:event});},transport);
        },
    });
}
