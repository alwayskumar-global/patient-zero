import {NextRequest} from 'next/server';import {explain,modeValue} from '@/lib/server';import {guard,json,failure} from '@/lib/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:NextRequest){try{guard(request);const p=request.nextUrl.searchParams;return json(explain(p.get('id')??'',p.get('asOf')??new Date().toISOString(),modeValue(p.get('mode'))));}catch(e){return failure(e);}}
