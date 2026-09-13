import {requireThat} from '../contracts.ts';
const exact=(x:any,keys:string[])=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
export const emptyBusinessSiteState=()=>({schemaVersion:1,inquiries:[] as Array<{id:string;name:string;need:string;details:Array<{fieldId:string;value:string}>;status:'draft'|'reviewed'}>});
export function validateBusinessSiteState(value:any){
 requireThat(exact(value,['schemaVersion','inquiries'])&&value.schemaVersion===1&&Array.isArray(value.inquiries)&&value.inquiries.length<=100,'PREVIEW_INQUIRY_STATE_INVALID');
 const ids=new Set();const text=(x:any,max:number)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
 for(const item of value.inquiries){requireThat(exact(item,['id','name','need','details','status'])&&text(item.id,100)&&!ids.has(item.id)&&text(item.name,120)&&text(item.need,2000)&&['draft','reviewed'].includes(item.status)&&Array.isArray(item.details)&&item.details.length>=1&&item.details.length<=8,'PREVIEW_INQUIRY_INVALID');ids.add(item.id);const fields=new Set();for(const detail of item.details){requireThat(exact(detail,['fieldId','value'])&&typeof detail.fieldId==='string'&&/^[a-z][a-zA-Z0-9_-]{0,39}$/.test(detail.fieldId)&&!fields.has(detail.fieldId)&&text(detail.value,1000),'PREVIEW_INQUIRY_DETAILS_INVALID');fields.add(detail.fieldId);}}
 requireThat(Buffer.byteLength(JSON.stringify(value))<=256000,'PREVIEW_STATE_TOO_LARGE');
}
