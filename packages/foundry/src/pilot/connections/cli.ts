/** Explicit owner command boundary for signed connection reads. */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireThat } from '../../contracts.ts';
import { PilotService } from '../service.ts';
import { inspectConnectionReadAuthorization, loadAuthorizedConnectionRead, prepareConnectionReadAuthorization, signConnectionReadProposal } from './host.ts';

type Args = Record<string, string>;
type Dependencies = { service?: Pick<PilotService, 'connectedAccounts' | 'store'>; loadAuthorized?: (services: any, root: string, options?: { connectionId?: string }) => any; write?: (value: any) => void };
const allowed = new Set(['root', 'business', 'connection', 'id', 'token-file', 'shop-domain', 'expires-at', 'output', 'proposal', 'approve-proposal-hash', 'principal', 'approval-reference', 'owner-public-key', 'owner-private-key']);
const parse = (argv: string[]) => { const command = argv[0] ?? 'help', args: Args = {}; for (let index = 1; index < argv.length; index += 2) { const key = argv[index], value = argv[index + 1]; requireThat(typeof key === 'string' && key.startsWith('--') && typeof value === 'string' && !value.startsWith('--'), 'CONNECTION_HOST_CLI_ARGUMENT'); const name = key.slice(2); requireThat(allowed.has(name) && !Object.hasOwn(args, name), 'CONNECTION_HOST_CLI_ARGUMENT'); args[name] = value; } return { command, args }; };
const required = (args: Args, ...names: string[]) => names.forEach(name => requireThat(typeof args[name] === 'string' && args[name].length > 0, 'CONNECTION_HOST_CLI_' + name.toUpperCase().replace(/-/g, '_') + '_REQUIRED'));
const absolute = (value: string, code: string) => { requireThat(isAbsolute(value), code); return resolve(value); };
const help = () => ({ commands: ['prepare --root --business --connection --id --token-file --expires-at --output [--shop-domain for Shopify]', 'sign --root --proposal --approve-proposal-hash --principal --approval-reference --owner-public-key --owner-private-key', 'sync --root [--connection]', 'status --root [--connection]'], authority: 'prepare writes only an unsigned connection-read packet. A Shopify packet includes its exact owner-approved myshopify.com domain. sign requires the exact reviewed hash and explicit owner key files. sync requires --connection when more than one connection grant is installed and accepts no token, key, provider, URL or retry argument.' });

export async function runConnectionHostCli(argv = process.argv.slice(2), dependencies: Dependencies = {}) {
    const { command, args } = parse(argv), write = dependencies.write ?? (value => console.log(JSON.stringify(value, null, 2)));
    if (command === 'help') { const value = help(); write(value); return value; }
    required(args, 'root'); const root = absolute(args.root, 'CONNECTION_HOST_CLI_ROOT_ABSOLUTE_REQUIRED'), service = dependencies.service ?? new PilotService(root), owns = !dependencies.service, services = { connectedAccounts: service.connectedAccounts };
    try {
        if (command === 'prepare') {
            required(args, 'business', 'connection', 'id', 'token-file', 'expires-at', 'output');
            const result = prepareConnectionReadAuthorization(services, { root, directory: absolute(args.output, 'CONNECTION_HOST_CLI_OUTPUT_ABSOLUTE_REQUIRED'), id: args.id, businessId: args.business, connectionId: args.connection, protectedTokenFile: absolute(args['token-file'], 'CONNECTION_HOST_CLI_TOKEN_FILE_ABSOLUTE_REQUIRED'), expiresAt: args['expires-at'], ...(args['shop-domain'] === undefined ? {} : { shopDomain: args['shop-domain'] }) });
            const value = { command, proposalHash: result.proposalHash, summary: result.summary, providerRequests: 0, credentialRead: false }; write(value); return value;
        }
        if (command === 'sign') {
            required(args, 'proposal', 'approve-proposal-hash', 'principal', 'approval-reference', 'owner-public-key', 'owner-private-key');
            const proposal = absolute(args.proposal, 'CONNECTION_HOST_CLI_PROPOSAL_ABSOLUTE_REQUIRED'), publicKey = absolute(args['owner-public-key'], 'CONNECTION_HOST_CLI_OWNER_PUBLIC_KEY_ABSOLUTE_REQUIRED'), privateKey = absolute(args['owner-private-key'], 'CONNECTION_HOST_CLI_OWNER_PRIVATE_KEY_ABSOLUTE_REQUIRED');
            requireThat(existsSync(proposal) && existsSync(publicKey) && existsSync(privateKey), 'CONNECTION_HOST_CLI_SIGNING_FILE_REQUIRED');
            const result = signConnectionReadProposal(services, root, { proposal: JSON.parse(readFileSync(proposal, 'utf8')), expectedHash: args['approve-proposal-hash'], principal: args.principal, approvalReference: args['approval-reference'], publicKey: readFileSync(publicKey, 'utf8'), privateKey: readFileSync(privateKey, 'utf8') });
            const value = { command, proposalHash: result.proposalHash, authorizationFile: 'auth/connection-read/' + result.envelope.payload.connectionId + '.authorization.json', providerRequests: 0, credentialRead: false }; write(value); return value;
        }
        if (command === 'status') { const value = { command, authorization: inspectConnectionReadAuthorization(services, root, args.connection) }; write(value); return value; }
        if (command === 'sync') { const runner = (dependencies.loadAuthorized ?? loadAuthorizedConnectionRead)(services, root, { connectionId: args.connection }); const result = await runner.sync(); const value = { command, result, accounting: runner.totals(), sameInterruptedReadRecoveryOnly: true }; write(value); return value; }
        requireThat(false, 'CONNECTION_HOST_CLI_COMMAND');
    } finally { if (owns) service.store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runConnectionHostCli().catch(error => { console.error(JSON.stringify({ error: error.code ?? 'CONNECTION_HOST_CLI_FAILED', message: error.message })); process.exitCode = 1; });
