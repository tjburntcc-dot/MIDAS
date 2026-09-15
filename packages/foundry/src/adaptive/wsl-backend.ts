import {execFileSync, spawn,execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type {BackendCommand, BackendResult, ExecutorBackend} from './executor.ts';

/** Maintained WSL + distribution Bubblewrap; no unisolated Windows/Linux fallback. */
export class WslBubblewrapBackend implements ExecutorBackend {
  readonly distribution:string;
  constructor(distribution='Ubuntu') {
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(distribution))throw Error('WSL_DISTRIBUTION_INVALID');
    this.distribution=distribution;
  }
  private linux(path:string){return execFileSync('wsl.exe',['-d',this.distribution,'--exec','wslpath','-a',path],{encoding:'utf8',timeout:10000,windowsHide:true}).trim();}
  async execute(command:BackendCommand):Promise<BackendResult>{
    const blocked=(reason:string,stderr=''):BackendResult=>({status:'blocked',exitCode:null,stdout:'',stderr,truncated:false,isolation:'wsl-bubblewrap',reason});
    if(command.network!=='off')return blocked('WSL_NETWORK_REQUIRES_ACQUISITION_BROKER');
    if(command.signal?.aborted)return blocked('EXECUTOR_CANCELLED');
    try {
      const {signal,...plain}=command;
      const payload={...plain,workspace:this.linux(command.workspace),cwd:this.linux(command.cwd),...(command.completion?{completion:{...command.completion,path:this.linux(command.completion.path)}}:{})};
      const script=this.linux(fileURLToPath(new URL('./wsl-supervisor.py',import.meta.url)));
      return await new Promise<BackendResult>((resolve,reject)=>{
        const unit='midas-command-'+randomUUID();
        const child=spawn('wsl.exe',['-d',this.distribution,'--exec','systemd-run','--user','--quiet','--wait','--pipe','--collect','--unit='+unit,'-p','MemoryMax=1073741824','-p','MemorySwapMax=0','-p','TasksMax=64','-p','CPUQuota=100%','-p','RuntimeMaxSec='+Math.ceil(command.timeoutMs/1000+5)+'s','-p','TimeoutStopSec=2s','-p','KillMode=control-group','python3',script],{stdio:['pipe','pipe','pipe'],windowsHide:true});
        let data='',errors='',bytes=0,settled=false;
        const cancel=()=>{execFile('wsl.exe',['-d',this.distribution,'--exec','systemctl','--user','kill','--kill-whom=all','--signal=SIGTERM',unit],{timeout:5000,windowsHide:true},()=>{});};
        signal?.addEventListener('abort',cancel,{once:true});
        const finish=(result:BackendResult)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);clearTimeout(timer);resolve(result);};
        // If observation of the trusted supervisor is lost, throw. AdaptiveWorkspace
        // retains dispatching intent and blocks another inference/effect submission.
        const timer=setTimeout(()=>{if(settled)return;settled=true;child.kill();reject(Error('EXECUTOR_OUTCOME_UNCERTAIN'));},command.timeoutMs+20000);
        child.stdout.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>command.maxOutputBytes*7+16384){child.kill();if(!settled){settled=true;clearTimeout(timer);reject(Error('EXECUTOR_OUTCOME_UNCERTAIN'));}}else data+=b.toString('utf8');});
        child.stderr.on('data',(b:Buffer)=>{if(errors.length<8192)errors+=b.toString('utf8').slice(0,8192-errors.length);});
        child.on('error',()=>finish(blocked('WSL_UNAVAILABLE')));
        child.on('close',()=>{signal?.removeEventListener('abort',cancel);if(settled)return;try{const result=JSON.parse(data);if(!['completed','failed','blocked','timed_out'].includes(result.status)||result.isolation!=='wsl-bubblewrap')throw Error();finish(result);}catch{settled=true;clearTimeout(timer);reject(Error('EXECUTOR_OUTCOME_UNCERTAIN'));}});
        child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));
      });
    }catch(error){if(String(error).includes('EXECUTOR_OUTCOME_UNCERTAIN'))throw error;return blocked('WSL_UNAVAILABLE',String(error).slice(0,1000));}
  }
}
