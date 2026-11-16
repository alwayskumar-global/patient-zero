import {z} from 'zod';
import {posix} from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import semver from 'semver';
import {digest} from './graph.js';
import {packageName} from './model.js';

const map=z.record(packageName,z.string());
const descriptor=z.object({name:packageName.optional(),version:z.string().optional(),resolved:z.string().optional(),integrity:z.string().optional(),
 link:z.boolean().optional(),inBundle:z.boolean().optional(),dependencies:map.optional(),devDependencies:map.optional(),optionalDependencies:map.optional(),peerDependencies:map.optional(),
 peerDependenciesMeta:z.record(packageName,z.object({optional:z.boolean().optional()}).passthrough()).optional(),
 workspaces:z.union([z.array(z.string()),z.object({packages:z.array(z.string())}).passthrough()]).optional(),
}).passthrough();
const schema=z.object({lockfileVersion:z.union([z.literal(2),z.literal(3)]),name:packageName.optional(),packages:z.record(z.string(),descriptor)}).passthrough();
type Descriptor=z.infer<typeof descriptor>;
export interface LockedNode {path:string;name:string;version:string|null;id:string|null;local:boolean}
export interface LockedEdge {from:string;to:string;name:string;kind:'dependency'|'dev'|'optional'|'peer'|'workspace'}
export interface ParsedLockfile {schemaVersion:1;lockfileVersion:2|3;hash:string;root:string;nodes:LockedNode[];edges:LockedEdge[];skippedOptional:{from:string;name:string}[]}

function cleanPath(path:string):string {
 if(path==='' )return path;
 if(path.length>2048||path.startsWith('/')||path.includes('\\')||path.includes('\0')||path.includes(':')||path.split('/').some(s=>s===''||s==='.'||s==='..'))throw new Error('Unsupported or escaping lockfile location');
 return path;
}
function installedName(path:string):string|null {
 const parts=path.split('/'),i=parts.lastIndexOf('node_modules');
 if(i<0)return null;
 return packageName.parse(parts.slice(i+1).join('/'));
}
function sourceName(urlText:string|undefined,version:string):string {
 if(!urlText)throw new Error('Registry package has no resolved source; regenerate a standard package-lock with registry URLs');
 let url:URL;try{url=new URL(urlText);}catch{throw new Error('Unsupported lockfile source: expected an HTTPS public npm registry URL');}
 if(url.protocol!=='https:'||url.hostname!=='registry.npmjs.org'||url.port||url.username||url.password||url.search||url.hash)throw new Error('Unsupported lockfile source: only credential-free HTTPS registry.npmjs.org artifacts are supported');
 const path=decodeURIComponent(url.pathname).slice(1),separator=path.indexOf('/-/');
 if(separator<1)throw new Error('Unrecognized public npm artifact path');
 const name=packageName.parse(path.slice(0,separator));
 if(path.slice(separator+3)!==`${name.split('/').at(-1)}-${version}.tgz`)throw new Error('Resolved artifact does not match the locked package version');
 return name;
}
function reference(name:string,spec:string):{name:string;range:string;local:boolean} {
 if(spec.startsWith('npm:')){
  const body=spec.slice(4),i=body.lastIndexOf('@');
  if(i<=0)throw new Error('Invalid npm alias reference');
  return {name:packageName.parse(body.slice(0,i)),range:body.slice(i+1),local:false};
 }
 if(spec.startsWith('file:')||spec.startsWith('workspace:'))return{name,range:spec.startsWith('workspace:')?spec.slice(10):'*',local:true};
 if(spec.includes(':')||spec.includes('/')||spec.startsWith('.'))throw new Error('Unsupported non-registry dependency reference');
 return{name,range:spec,local:false};
}
function matchesWorkspace(path:string,patterns:string[]):boolean {
 return patterns.some(pattern=>{
  if(pattern.startsWith('!')||pattern.includes('{')||pattern.includes('['))throw new Error('Unsupported workspace pattern; use explicit paths or * / ** globs');
  cleanPath(pattern.replaceAll('*','x'));
  const regex=pattern.split('/').map(p=>p==='**'?'.*':p.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('/');
  return new RegExp(`^${regex}$`).test(path);
 });
}

/** Pure metadata parser: never reads node_modules, executes scripts or contacts a registry. */
export function parseLockfile(bytes:string):ParsedLockfile {
 if(Buffer.byteLength(bytes)>32*1024*1024)throw new Error('Lockfile exceeds 32 MiB');
 const raw=schema.parse(JSON.parse(bytes)),packages=raw.packages;
 if(!Object.hasOwn(packages,''))throw new Error('Lockfile must include its root packages[""] descriptor');
 if(Object.keys(packages).length>100000)throw new Error('Lockfile exceeds 100,000 locations');
 const rootDescriptor=packages['']!;
 const patterns=Array.isArray(rootDescriptor.workspaces)?rootDescriptor.workspaces:rootDescriptor.workspaces?.packages??[];
 const nodes=new Map<string,LockedNode>(),locations=new Map<string,string>();
 const localPaths=new Set(['']);
 for(const [path,d] of Object.entries(packages)) {
  cleanPath(path);
  const slot=installedName(path);
  if(d.link){if(!slot||!d.resolved)throw new Error('Invalid local workspace link');continue;}
  if(path===''||slot===null){
   if(path!=='' && !matchesWorkspace(path,patterns))throw new Error('Local descriptors must belong to declared workspaces');
   const name=packageName.parse(d.name??(path===''?raw.name:undefined)??(path===''?'your-app':undefined));
   if(d.version && !semver.valid(d.version))throw new Error('Invalid local project version');
   nodes.set(path,{path,name,version:d.version??null,id:null,local:true});localPaths.add(path);locations.set(path,path);continue;
  }
  const prefix=path.slice(0,path.lastIndexOf('node_modules')).replace(/\/$/,'');
  if(prefix && !Object.hasOwn(packages,prefix))throw new Error('Invalid nested dependency location');
  if(d.inBundle)throw new Error('Bundled package contents cannot be assessed independently by this metadata gate');
  if(!d.version||semver.valid(d.version)!==d.version)throw new Error('Registry packages require an exact canonical semver');
  const canonical=sourceName(d.resolved,d.version);
  if(d.name && d.name!==canonical)throw new Error('Package descriptor/source identity mismatch');
  nodes.set(path,{path,name:canonical,version:d.version,id:`${canonical}@${d.version}`,local:false});locations.set(path,path);
 }
 for(const [path,d] of Object.entries(packages))if(d.link){
  const target=cleanPath(d.resolved!);
  if(!localPaths.has(target)||target===''||!nodes.has(target))throw new Error('Workspace links must resolve to declared local descriptors inside this lockfile');
  if(installedName(path)!==nodes.get(target)!.name)throw new Error('Workspace link identity mismatch');
  locations.set(path,target);
 }
 const edges:LockedEdge[]=[],skippedOptional:{from:string;name:string}[]=[];
 const find=(from:string,name:string,peer=false):string|undefined=>{
  let dir=peer && !nodes.get(from)!.local ? posix.dirname(from):from;
  if(dir==='.')dir='';
  for(;;){
   if(posix.basename(dir)!=='node_modules'){
    const candidate=dir?`${dir}/node_modules/${name}`:`node_modules/${name}`;
    if(locations.has(candidate))return locations.get(candidate);
   }
   if(dir==='')return undefined;
   dir=posix.dirname(dir);if(dir==='.')dir='';
  }
 };
 for(const [from,node] of nodes){
  const d=packages[from]!;
  const refs=new Map<string,{spec:string;kind:LockedEdge['kind'];optional:boolean}>();
  if(node.local)for(const [name,spec]of Object.entries(d.devDependencies??{}))refs.set(name,{spec,kind:'dev',optional:false});
  for(const [name,spec]of Object.entries(d.dependencies??{}))refs.set(name,{spec,kind:'dependency',optional:false});
  for(const [name,spec]of Object.entries(d.optionalDependencies??{}))refs.set(name,{spec,kind:'optional',optional:true});
  const declarations=[...refs.entries(),...Object.entries(d.peerDependencies??{}).filter(([name])=>!refs.has(name)).map(([name,spec])=>[name,{spec,kind:'peer' as const,optional:d.peerDependenciesMeta?.[name]?.optional===true}] as const)];
  for(const [name,{spec,kind,optional}]of declarations){
   const expected=reference(name,spec);
   if(!expected.local&&semver.validRange(expected.range)===null&&!/^[A-Za-z][A-Za-z0-9._-]*$/.test(expected.range))throw new Error('Invalid registry version range or dist-tag');
   const target=find(from,name,kind==='peer');
   if(target===undefined){if(optional&&!expected.local){skippedOptional.push({from,name});continue;}throw new Error(`Unresolved required dependency ${name} from ${from||'<root>'}`);}
   const resolved=nodes.get(target)!;
   if(expected.name!==resolved.name)throw new Error(`Dependency/alias identity mismatch for ${name}`);
   if(expected.local!==resolved.local && expected.local)throw new Error('Local dependency resolved to registry package');
   if(resolved.local){
    if(!expected.local && !(patterns.length && localPaths.has(target)))throw new Error('Unexpected registry-to-local resolution');
    if(spec.startsWith('file:')){
     const relative=posix.normalize(posix.join(from,spec.slice(5)));
     if(relative!==target)throw new Error('Local file reference does not match its workspace link');
    }else if(expected.range!=='*' && expected.range!=='' && (!resolved.version||!semver.satisfies(resolved.version,expected.range)))throw new Error('Workspace version does not satisfy declared range');
   }else{
    const range=semver.validRange(expected.range);
    if(range!==null && !semver.satisfies(resolved.version!,range))throw new Error(`Locked version does not satisfy ${name}'s declared range`);
    if(range===null && !/^[A-Za-z][A-Za-z0-9._-]*$/.test(expected.range))throw new Error('Invalid registry version range or dist-tag');
   }
   edges.push({from,to:target,name,kind});
  }
 }
 // npm workspaces participate in a root install even without root dependencies.
 for(const path of localPaths)if(path!=='')edges.push({from:'',to:path,name:nodes.get(path)!.name,kind:'workspace'});
 const reached=new Set(['']);let queue=[''];
 while(queue.length){const current=queue.shift()!;for(const edge of edges)if(edge.from===current&&!reached.has(edge.to)){reached.add(edge.to);queue.push(edge.to);}}
 for(const path of nodes.keys())if(!reached.has(path))throw new Error(`Unreachable installed location: ${path}`);
 return{schemaVersion:1,lockfileVersion:raw.lockfileVersion,hash:digest(bytes),root:nodes.get('')!.name,nodes:[...nodes.values()].sort((a,b)=>a.path.localeCompare(b.path)),edges:edges.sort((a,b)=>`${a.from}\0${a.to}\0${a.kind}`.localeCompare(`${b.from}\0${b.to}\0${b.kind}`)),skippedOptional};
}
export async function readLockfile(path:string):Promise<ParsedLockfile> {
 const info=await stat(path);if(!info.isFile()||info.size>32*1024*1024)throw new Error('Expected a lockfile no larger than 32 MiB');
 return parseLockfile(await readFile(path,'utf8'));
}
export function rootPaths(lock:ParsedLockfile):Map<string,string[]> {
 const paths=new Map<string,string[]>([['',['']]]),queue=[''];
 const adjacency=new Map<string,string[]>();for(const e of lock.edges)adjacency.set(e.from,[...(adjacency.get(e.from)??[]),e.to]);
 while(queue.length){const from=queue.shift()!;for(const to of adjacency.get(from)??[])if(!paths.has(to)){paths.set(to,[...paths.get(from)!,to]);queue.push(to);}}
 return paths;
}
