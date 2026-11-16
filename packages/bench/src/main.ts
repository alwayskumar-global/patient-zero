#!/usr/bin/env node
import {tuneAndFreeze,runBenchmark} from './index.js';
try{
 const [command,...extra]=process.argv.slice(2);if(extra.length)throw new Error('Unexpected benchmark arguments');
 if(command==='tune'){const result=await tuneAndFreeze();console.log(JSON.stringify(result,null,2));}
 else if(command==='run'){await runBenchmark();console.log('Wrote bench/results.md and bench/results.json');}
 else throw new Error('Usage: patient-zero-bench tune|run');
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=2;}
