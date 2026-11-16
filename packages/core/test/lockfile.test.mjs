import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLockfile,rootPaths} from '../dist/index.js';
import {locked,lockfile} from '../../../fixtures/locked.mjs';
for(const format of [2,3])test(`v${format}: scoped, hoisted, nested and peer resolutions retain physical paths`,()=>{
 const parsed=parseLockfile(lockfile({'':{dependencies:{left:'1.0.0',right:'1.0.0','@scope/host':'1.0.0'}},
  'node_modules/left':locked('left','1.0.0',{dependencies:{dep:'^1.0.0'}}),
  'node_modules/right':locked('right','1.0.0',{dependencies:{dep:'^2.0.0'}}),
  'node_modules/dep':locked('dep','1.0.0'),
  'node_modules/right/node_modules/dep':locked('dep','2.0.0'),
  'node_modules/@scope/host':locked('@scope/host','1.0.0',{peerDependencies:{dep:'^1.0.0'}}),
 },format));
 assert(parsed.edges.some(e=>e.from==='node_modules/left'&&e.to==='node_modules/dep'));
 assert(parsed.edges.some(e=>e.from==='node_modules/right'&&e.to==='node_modules/right/node_modules/dep'));
 assert(parsed.edges.some(e=>e.from==='node_modules/@scope/host'&&e.to==='node_modules/dep'&&e.kind==='peer'));
 assert.deepEqual(rootPaths(parsed).get('node_modules/right/node_modules/dep'),['','node_modules/right','node_modules/right/node_modules/dep']);
});

test('aliases retain canonical registry identities while optional overrides and root dev dependencies resolve',()=>{
 const parsed=parseLockfile(lockfile({'':{dependencies:{alias:'npm:@scope/real@^1.0.0',optional:'^1'},optionalDependencies:{optional:'2.0.0',absent:'*'},devDependencies:{devtool:'*'}},
  'node_modules/alias':locked('@scope/real','1.2.0',{name:'@scope/real'}),
  'node_modules/optional':locked('optional','2.0.0'),
  'node_modules/devtool':locked('devtool'),
 }));
 assert.equal(parsed.nodes.find(n=>n.path==='node_modules/alias').id,'@scope/real@1.2.0');
 assert.equal(parsed.skippedOptional[0].name,'absent');
 assert(parsed.edges.some(e=>e.name==='devtool'&&e.kind==='dev'));
 assert.equal(parsed.edges.filter(e=>e.name==='optional').length,1);
});

test('workspace links are resolved locally without reading files outside the lockfile',()=>{
 const parsed=parseLockfile(lockfile({'':{workspaces:['packages/*'],dependencies:{'@acme/tools':'file:packages/tools'}},
  'packages/tools':{name:'@acme/tools',version:'1.0.0',dependencies:{dep:'*'}},
  'node_modules/@acme/tools':{link:true,resolved:'packages/tools'},'node_modules/dep':locked('dep'),
 }));
 assert(parsed.nodes.find(n=>n.path==='packages/tools').local);
 assert(parsed.edges.some(e=>e.from==='packages/tools'&&e.to==='node_modules/dep'));
 assert(!parsed.nodes.some(n=>n.path==='node_modules/@acme/tools'));
});

test('optional peers may be absent; required peers cannot resolve inside their own package',()=>{
 const good=lockfile({'':{dependencies:{host:'*'}},'node_modules/host':locked('host','1.0.0',{peerDependencies:{missing:'*'},peerDependenciesMeta:{missing:{optional:true}}})});
 assert.equal(parseLockfile(good).skippedOptional.length,1);
 assert.throws(()=>parseLockfile(lockfile({'':{dependencies:{host:'*'}},'node_modules/host':locked('host','1.0.0',{peerDependencies:{dep:'*'}}),'node_modules/host/node_modules/dep':locked('dep')})),/Unresolved required/);
});

test('unsupported formats, missing edges, bad ranges and unreachable installations fail closed',()=>{
 assert.throws(()=>parseLockfile(JSON.stringify({lockfileVersion:1,dependencies:{}})));
 assert.throws(()=>parseLockfile(lockfile({'':{dependencies:{missing:'*'}}})),/Unresolved/);
 assert.throws(()=>parseLockfile(lockfile({'':{dependencies:{dep:'^2'}},'node_modules/dep':locked('dep','1.0.0')})),/satisfy/);
 assert.throws(()=>parseLockfile(lockfile({'node_modules/orphan':locked('orphan')})),/Unreachable/);
});

test('source credentials, git, mismatched archive versions, identity spoofing and escaping links are rejected',()=>{
 const cases=[
  {'':{dependencies:{dep:'*'}},'node_modules/dep':locked('dep','1.0.0',{resolved:'https://secret:token@registry.npmjs.org/dep/-/dep-1.0.0.tgz'})},
  {'':{dependencies:{dep:'*'}},'node_modules/dep':locked('dep','1.0.0',{resolved:'git+https://example.invalid/dep#abc'})},
  {'':{dependencies:{dep:'*'}},'node_modules/dep':locked('dep','1.0.0',{resolved:'https://registry.npmjs.org/dep/-/dep-2.0.0.tgz'})},
  {'':{dependencies:{dep:'*'}},'node_modules/dep':locked('other')},
  {'':{dependencies:{dep:'file:../outside'}},'node_modules/dep':{resolved:'../outside',link:true}},
  {'':{dependencies:{dep:'*'}},'node_modules/dep/../escape':locked('dep')},
  {'':{optionalDependencies:{hidden:'git+ssh://example.invalid/private'}}},
  {'':{optionalDependencies:{hidden:'file:../outside'}}},
 ];
 for(const data of cases)assert.throws(()=>parseLockfile(lockfile(data)));
});

test('v2 legacy dependency section is ignored in favor of packages, matching npm semantics',()=>{
 const data=JSON.parse(lockfile({'':{dependencies:{dep:'1.0.0'}},'node_modules/dep':locked('dep')},2));
 data.dependencies={dep:{version:'9.9.9'}};
 assert.equal(parseLockfile(JSON.stringify(data)).nodes.find(n=>n.id).id,'dep@1.0.0');
});
