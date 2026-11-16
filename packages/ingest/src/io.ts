import {writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
export async function writeJSON(path:string,value:unknown):Promise<void>{
 await mkdir(dirname(resolve(path)),{recursive:true});const temporary=`${path}.${randomUUID()}.tmp`;
 try{await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await rename(temporary,path);}
 finally{await unlink(temporary).catch(()=>{});}
}
