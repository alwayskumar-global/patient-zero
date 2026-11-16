import {NextRequest,NextResponse} from 'next/server';
class LocalRequestError extends Error {}
/** This is a loopback-only local application, not an unauthenticated public service. */
export function guard(request:NextRequest,post=false):void{
 const host=request.headers.get('host');if(!host)throw new LocalRequestError('Missing local host.');
 let url:URL;try{url=new URL(`http://${host}`);}catch{throw new LocalRequestError('Invalid local host.');}
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new LocalRequestError('This assessor is available only on loopback.');
 const origin=request.headers.get('origin'),expected=`${request.nextUrl.protocol}//${host}`;
 if((origin!==null&&origin!==expected)||(post&&origin===null)||request.headers.get('sec-fetch-site')==='cross-site')throw new LocalRequestError('Cross-origin assessment is not permitted.');
}
export function json(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function failure(error:unknown,status=422){const response=json({error:error instanceof Error?error.message:'Assessment could not be completed.',status:'incomplete',exitCode:2},error instanceof LocalRequestError?403:status);/* A rejected/cancelled upload must not leave an unread body on a reused HTTP/1 connection. */response.headers.set('Connection','close');return response;}
export async function boundedJSON(request:NextRequest):Promise<unknown>{
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('Expected application/json.');
 if(!request.body)throw new Error('No lockfile payload.');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw new Error('Web uploads are limited to 2 MiB; use the CLI for larger lockfiles.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
