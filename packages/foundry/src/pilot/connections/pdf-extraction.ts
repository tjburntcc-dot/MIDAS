import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
/** Uses only installed local document parsers and fixed code; no dependency
 * installation, credential read, OCR/model request or source-defined command. */
export function extractInstalledPdf(bytes:Buffer){
 if(bytes.length>2_000_000)return {text:'',pageCount:null,partial:true,limitations:['PDF exceeds the 2 MB local extraction input bound.']};
 const native=spawnSync('pdftotext',['-','-'],{input:bytes,encoding:'utf8',timeout:10000,windowsHide:true,maxBuffer:800000});
 if(native.status===0&&native.stdout.trim()){const text=native.stdout.slice(0,180000);return {text,pageCount:Math.max(1,native.stdout.split('\f').length-1),partial:text.length<native.stdout.length,limitations:text.length<native.stdout.length?['Extracted text capped at 180,000 characters.']:[]};}
 const python=join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
 if(existsSync(python)){
  const code="import sys,io,json\nfrom pypdf import PdfReader\nr=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=False)\nn=len(r.pages);parts=[];size=0\nfor p in r.pages[:80]:\n t=p.extract_text() or '';parts.append(t);size+=len(t)\n if size>=180000: break\ns='\\n'.join(parts)\nprint(json.dumps({'text':s[:180000],'pageCount':n,'partial':len(parts)<n or len(s)>180000},ensure_ascii=False))";
  const run=spawnSync(python,['-I','-c',code],{input:bytes,encoding:'utf8',timeout:10000,windowsHide:true,maxBuffer:800000});
  if(run.status===0)try{const r=JSON.parse(run.stdout);return {...r,partial:r.partial||!r.text.trim(),limitations:[...(r.partial?['Installed pypdf extraction bounded to 80 pages / 180,000 characters.']:[]),...(!r.text.trim()?['No extractable text; a scanned document needs separately permitted OCR or owner text export.']:[])]};}catch{}
 }
 return {text:'',pageCount:null,partial:true,limitations:['Installed local PDF extraction was unavailable or failed; original bounded bytes remain available. No OCR or model inspection occurred.']};
}
