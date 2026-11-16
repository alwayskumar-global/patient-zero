import {NextRequest} from 'next/server';import {z} from 'zod';import {assess} from '@/lib/server';import {guard,json,failure,boundedJSON} from '@/lib/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.object({lockfile:z.string().min(1),asOf:z.string(),mode:z.enum(['evidence','retrospective']),failOn:z.enum(['medium','high'])}).strict();
export async function POST(request:NextRequest){try{guard(request,true);const input=schema.parse(await boundedJSON(request));return json(assess(input.lockfile,input.asOf,input.mode,input.failOn));}catch(e){return failure(e);}}
