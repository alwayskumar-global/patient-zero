import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const store=resolve('patient-zero.rl'),before=readFileSync(store);
const client=new Client({name:'patient-zero-raw-mcp-check',version:'1.0.0'});
try{
 await client.connect(new StdioClientTransport({command:process.env.PZ_RELATE_BIN||'relate',args:['serve','--mcp','stdio','--database',store,'--read-only'],stderr:'pipe'}));
 const list=await client.listTools();assert(list.tools.some(t=>t.name==='read_cypher'));assert(list.tools.some(t=>t.name==='get_schema'));assert(!list.tools.some(t=>t.name==='write_cypher'),'read-only configuration must not advertise a write tool');
 const read=await client.callTool({name:'read_cypher',arguments:{statement:'MATCH (v:Version) RETURN count(v) AS versions'}});assert(!read.isError);const rows=JSON.parse(read.content[0].text).rows;assert.equal(rows[0].versions,1574);
 const schema=await client.callTool({name:'get_schema',arguments:{}});assert(!schema.isError);assert.match(JSON.stringify(schema),/Version/);
 const write=await client.callTool({name:'read_cypher',arguments:{statement:'CREATE (:PatientZeroWriteProbe)'}});assert.equal(write.isError,true);
 console.log('PASS: Relate built-in stdio MCP reads 1,574 versions, exposes schema, omits write tool and rejects a write statement.');
}finally{await client.close();assert.deepEqual(readFileSync(store),before,'raw MCP must preserve store bytes');}
