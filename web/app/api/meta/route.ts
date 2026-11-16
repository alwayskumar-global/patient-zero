import {NextRequest} from 'next/server';import {metadata} from '@/lib/server';import {guard,json,failure} from '@/lib/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:NextRequest){try{guard(request);return json(metadata());}catch(e){return failure(e);}}
