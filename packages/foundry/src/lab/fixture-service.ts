import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { businessKey, canonical, hash, object, proposal, requireThat } from '../contracts.ts';
import type { ActionPort, Observation, Proposal } from '../contracts.ts';

/** Independent durable fake business system. Its database is never the domain DB. */
export class FixtureService implements ActionPort {
  db: DatabaseSync; fault: string;
  constructor(path:string,fault='none') {
    mkdirSync(dirname(path),{recursive:true}); this.db=new DatabaseSync(path);this.fault=fault;
    this.db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS effects(key TEXT PRIMARY KEY,requestHash TEXT NOT NULL,result TEXT NOT NULL);');
  }
  close(){this.db.close();}
  execute(p:Proposal):Observation {
    proposal(p); requireThat(p.toolId==='lab.publish' && p.scope.mode==='fixture','FIXTURE_TOOL_REQUIRED');
    object(p.payload,['artifact','simulatedLedger']);
    const key=businessKey(p.scope)+'/'+p.idempotencyKey;
    this.db.exec('BEGIN IMMEDIATE');
    let result:Observation;
    try {
      const prior=this.db.prepare('SELECT requestHash,result FROM effects WHERE key=?').get(key);
      if(prior) { requireThat(prior.requestHash===hash(p),'EXTERNAL_IDEMPOTENCY_CONFLICT'); result=JSON.parse(String(prior.result)); }
      else {
        const ledger=structuredClone(p.payload.simulatedLedger); requireThat(ledger.simulated===true,'SIMULATED_LEDGER_REQUIRED');
        // A fixture delivery discharges its simulated delivery obligation. Refunds
        // stay visible, independently of the worker's completion text.
        ledger.obligations={minorUnits:0,currency:p.estimatedCost.currency};
        if(ledger.bookings) ledger.recognizedRevenue=structuredClone(ledger.bookings);
        result={status:'confirmed',externalReceiptId:'FX-'+hash({key,requestHash:hash(p)}).slice(0,24),payloadHash:p.payloadHash,artifact:structuredClone(p.payload.artifact),ledger,actualCost:{status:'known',money:p.estimatedCost,basis:'simulated fixture delivery charge'},effectCount:1};
        this.db.prepare('INSERT INTO effects(key,requestHash,result) VALUES(?,?,?)').run(key,hash(p),canonical(result));
      }
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
    if(this.fault==='timeout_after_effect') { const err:any=new Error('Fixture timeout after committed effect');err.code='TIMEOUT_AFTER_EFFECT';throw err; }
    return result;
  }
  reconcile(p:Proposal):Observation {
    proposal(p);
    if(this.fault==='unavailable') return {status:'unknown'};
    const prior=this.db.prepare('SELECT requestHash,result FROM effects WHERE key=?').get(businessKey(p.scope)+'/'+p.idempotencyKey);
    if(!prior) return {status:'absent',effectCount:0,actualCost:{status:'known',money:{minorUnits:0,currency:p.estimatedCost.currency},basis:'authoritative fixture lookup proves no effect'}};
    requireThat(prior.requestHash===hash(p),'EXTERNAL_IDEMPOTENCY_CONFLICT'); return JSON.parse(String(prior.result));
  }
}

export class FixtureHttpPort implements ActionPort {
  url:string; token:string;
  constructor(url:string,token:string) { const u=new URL(url);requireThat(u.protocol==='http:' && u.hostname==='127.0.0.1' && !u.username && !u.password,'LOCAL_SERVICE_REQUIRED');this.url=u.origin;this.token=token; }
  async call(operation:string,p:Proposal):Promise<Observation> {
    const response=await fetch(this.url+'/'+operation,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+this.token},body:canonical(p),signal:AbortSignal.timeout(3000)});
    requireThat(response.ok,'FIXTURE_SERVICE_ERROR');return response.json() as Promise<Observation>;
  }
  execute(p:Proposal){return this.call('execute',p);}
  reconcile(p:Proposal){return this.call('reconcile',p);}
}

export function serve(service:FixtureService,token:string,port=0) {
  requireThat(token.length>=32,'INVALID_SERVICE_TOKEN');
  const server=createServer(async(req,res)=>{
    if(req.headers.authorization!=='Bearer '+token) {res.writeHead(401).end();return;}
    if(req.method!=='POST' || !['/execute','/reconcile'].includes(req.url ?? '')) {res.writeHead(404).end();return;}
    try {
      const chunks:Buffer[]=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;requireThat(bytes<=65536,'BODY_TOO_LARGE');chunks.push(chunk);}
      const p=proposal(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const result=req.url==='/execute'?service.execute(p):service.reconcile(p);
      res.writeHead(200,{'content-type':'application/json'}).end(canonical(result));
    }catch(error){if((error as any).code==='TIMEOUT_AFTER_EFFECT')req.socket.destroy();else res.writeHead(400).end(JSON.stringify({error:(error as any).code ?? 'INVALID_REQUEST'}));}
  });
  server.listen(port,'127.0.0.1',()=>{const address=server.address() as any;process.stdout.write(JSON.stringify({service:'foundry-fixture',url:'http://127.0.0.1:'+address.port})+'\n');});
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=Object.fromEntries(process.argv.slice(2).reduce((rows:string[][],v,i,a)=>i%2===0?[...rows,[v.replace(/^--/,''),a[i+1]]]:rows,[]));
  requireThat(args.db && args['token-file'],'SERVICE_ARGUMENTS_REQUIRED');
  const service=new FixtureService(args.db,args.fault ?? 'none');
  serve(service,readFileSync(args['token-file'],'utf8').trim(),Number(args.port ?? 0));
}
