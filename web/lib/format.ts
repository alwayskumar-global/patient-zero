export function utc(value:string|null,short=false):string{if(!value)return 'Unknown';return value.replace('T',' ').slice(0,short?16:19)+' UTC';}
export function clock(value:string):string{return value.slice(11,16);}
export function percent(value:number|null):string{return value===null?'Not established':`${(value*100).toFixed(2)}%`;}
export function bytes(value:number):string{return `${(value/1024/1024).toFixed(2)} MB`;}
export function explainHref(id:string,asOf:string,mode:string,incident:string):string{return `/explain/${encodeURIComponent(id)}?asOf=${encodeURIComponent(asOf)}&mode=${mode}&incident=${incident}`;}
export async function getJSON<T>(url:string,init?:RequestInit):Promise<T>{const response=await fetch(url,{...init,cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error??'The request could not be completed.');return data as T;}
