import {NextRequest} from 'next/server';import {replay,modeValue} from '@/lib/server';import {guard,json,failure} from '@/lib/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:NextRequest){try{guard(request);const p=request.nextUrl.searchParams;return json(replay(p.get('incident')??'chalk-debug-2025-09',p.get('asOf')??'2025-09-08T13:00:00Z',modeValue(p.get('mode'))));}catch(e){return failure(e);}}
