import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchMalwareLabels} from '../dist/index.js';
const advisory=(id,extra={})=>({id,published:'2025-09-08T17:11:19Z',affected:[{package:{name:'chalk',ecosystem:'npm'},versions:['5.6.1']}],...extra});

test('OSV imports only explicit npm MAL version labels, handles pages and deduplicates',async(t)=>{
 const calls=[];let i=0;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  calls.push({url,body:JSON.parse(init.body)});
  return new Response(JSON.stringify(i++===0 ? {vulns:[advisory('MAL-2025-1'),advisory('GHSA-ignore'),advisory('MAL-withdrawn',{withdrawn:'2025-09-09T00:00:00Z'}),advisory('MAL-range',{affected:[{package:{name:'chalk',ecosystem:'npm'},ranges:[]} ]})],next_page_token:'next'} : {vulns:[advisory('MAL-2025-1'),advisory('MAL-other',{affected:[{package:{name:'other',ecosystem:'npm'},versions:['5.6.1']}]})]}));
 });
 const labels=await fetchMalwareLabels('chalk','5.6.1');
 assert.equal(labels.length,1);assert.equal(labels[0].advisoryId,'MAL-2025-1');assert.equal(calls[1].body.page_token,'next');
 assert(calls.every(c=>c.url==='https://api.osv.dev/v1/query'));
});

test('OSV rejects HTTP failures and pagination loops',async(t)=>{
 const mock=t.mock.method(globalThis,'fetch',async()=>new Response('',{status:503}));
 await assert.rejects(fetchMalwareLabels('chalk','5.6.1'),/503/);
 mock.mock.mockImplementation(async()=>new Response(JSON.stringify({next_page_token:'same'})));
 await assert.rejects(fetchMalwareLabels('chalk','5.6.1'),/pagination loop/);
});
