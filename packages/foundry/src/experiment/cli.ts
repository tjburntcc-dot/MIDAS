import {prepareBounded,boundedDiagnostic,boundedBatch,boundedReport,recordCalibration,lockExploratory} from './bounded.ts';
import { resolve, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { prepare, approve, readJSON, writeJSON, signed, keypair } from './config.ts';
import { runDevelopment, reviewPacket, recordReview, candidate, freeze, report, openExperiment } from './workflow.ts';
import { rehearse } from './rehearsal.ts';
import { createManifest, evaluateNext, releaseAggregate, replayAggregate } from './custodian.ts';
import { requireThat, object } from '../contracts.ts';
export async function main(argv = process.argv.slice(2)) {
    const command = argv[0] ?? 'help', args: Record<string, string> = {};
    for (let i = 1; i < argv.length; i += 2) {
        requireThat(argv[i].startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--') && !Object.hasOwn(args, argv[i].slice(2)), 'INVALID_ARGUMENT');
        args[argv[i].slice(2)] = argv[i + 1];
    }
    object(args, [], ['root', 'file', 'key', 'condition', 'procedure', 'failures', 'rationale', 'boundary', 'cases', 'release', 'attempt', 'reason','old-root','diagnostic-root']);
    const root = resolve(args.root ?? 'var/foundry-experiment-028');
    let result: any;
    if (command === 'help')
        return { commands: 'prepare | rehearse | keygen | sign | sign-invoice | authorize | smoke | develop | validate | review-pack | review | candidate | freeze | custodian-manifest | evaluate | aggregate | replay-analysis | reconcile | interrupt | contaminate | report', live: 'explicit signed numerical authorization required; no automatic retry/fallback' };
    if(command==='bounded-prepare')result=prepareBounded(root,resolve(args['old-root']??'var/foundry-smoke-028'),resolve(args['diagnostic-root']??'var/foundry-count-diagnostic-028'));
    else if(command==='bounded-diagnostic')result=await boundedDiagnostic(root);
    else if(command==='bounded-batch')result=await boundedBatch(root,readJSON(args.file));
    else if(command==='bounded-report')result=boundedReport(root);
    else if(command==='calibrate')result=recordCalibration(root,readJSON(args.file));
    else if(command==='lock-exploratory')result=lockExploratory(root);
    else if (command === 'prepare')
        result = prepare(root);
    else if (command === 'rehearse')
        result = await rehearse(root);
    else if(command==='keygen'){requireThat(args.file,'KEY_PATH_REQUIRED');const keys=keypair();writeFileSync(args.file,keys.privateKey,{flag:'wx',mode:0o600});writeFileSync(args.file+'.pub',keys.publicKey,{flag:'wx'});result={publicKeyFile:args.file+'.pub'};}
    else if(command==='sign-invoice'){requireThat(args.file&&args.key,'SIGNING_FILE_AND_KEY_REQUIRED');const envelope=signed(readJSON(args.file),readFileSync(args.key,'utf8'));result={statement:envelope.payload,signature:envelope.signature};}
    else if (command === 'sign') {
        requireThat(args.file && args.key, 'SIGNING_FILE_AND_KEY_REQUIRED');
        result = signed(readJSON(args.file), readFileSync(args.key, 'utf8'));
    }
    else if (command === 'authorize') {
        requireThat(args.file && args.key, 'APPROVAL_FILE_AND_KEY_REQUIRED');
        result = approve(root, args.file, args.key);
    }
    else if (['smoke', 'develop', 'validate'].includes(command)) {
        const condition = args.condition ?? 'baseline';
        requireThat(['baseline', 'challenger'].includes(condition), 'INVALID_CONDITION');
        result = await runDevelopment(root, command === 'smoke' ? 'smoke' : command === 'validate' ? 'validation' : 'development', condition as any);
    }
    else if (command === 'review-pack') {
        result = reviewPacket(root);
        writeJSON(join(root, 'reports', 'review-packet.json'), result);
    }
    else if (command === 'review')
        result = recordReview(root, readJSON(args.file));
    else if (command === 'candidate')
        result = candidate(root, args.procedure, (args.failures ?? '').split(',').filter(Boolean), args.rationale ?? '');
    else if (command === 'freeze')
        result = freeze(root, readJSON(args.file));
    else if (command === 'custodian-manifest')
        result = createManifest(root, readJSON(args.boundary), args.cases, args.key);
    else if (command === 'evaluate')
        result = await evaluateNext(root, readJSON(args.boundary), args.cases, readJSON(args.release));
    else if(command==='replay-analysis')result=replayAggregate(root,readJSON(args.boundary));
    else if (command === 'aggregate')
        result = releaseAggregate(root, readJSON(args.boundary), args.key);
    else if (['reconcile', 'interrupt', 'contaminate'].includes(command)) {
        const x = openExperiment(root, true);
        try {
            if (command === 'reconcile') {
                requireThat(x.spec.billingPublicKey, 'BILLING_AUTHORITY_REQUIRED');
                x.ledger.reconcile(readJSON(args.file), x.spec.billingPublicKey, x.auth.projectId);
            }
            else if (command === 'interrupt')
                x.ledger.interrupt(args.attempt);
            else {
                requireThat(args.reason && args.reason.length > 0, 'CONTAMINATION_REASON_REQUIRED');
                x.store.transaction(() => x.store.put('experiment-contamination', 'final', { reason: args.reason, at: new Date().toISOString() }, null));
            }
            result = { recorded: true, exposure: x.ledger.totals() };
        }
        finally {
            x.store.close();
        }
    }
    else if (command === 'report')
        result = report(root);
    else
        throw Error('UNKNOWN_COMMAND');
    return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
    main().then(x => console.log(JSON.stringify(x, null, 2))).catch(e => { console.error(JSON.stringify({ error: e.code ?? 'COMMAND_FAILED', message: 'Experiment command failed; no automatic retry. Inspect the scoped ledger. No credentials or provider response bodies are logged.' })); process.exitCode = 1; });
