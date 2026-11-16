import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';
const root=path.resolve('..');
test.beforeEach(async({page})=>{await page.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});});

test('replay uses the native graph, preserves temporal freezes, and switches incident/evidence views',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/replay');
 await expect(page.getByText('18 signals',{exact:true})).toBeVisible();await expect(page.locator('canvas').first()).toBeVisible();
 await page.getByRole('button',{name:'chalk@5.6.1',exact:false}).first().click();await expect(page.getByRole('heading',{name:'Evidence path',exact:true})).toBeVisible();
 await expect(page.getByText('Missing publisher',{exact:true})).toHaveCount(0);
 await page.getByRole('slider',{name:'Replay time, UTC'}).fill(String(Date.parse('2025-09-08T13:00:00Z')));await expect(page.getByText('0 signals',{exact:true})).toBeVisible();
 await page.getByRole('slider').press('End');await expect(page.getByText('28 signals',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Play replay',exact:true}).click();await expect(page.getByRole('button',{name:'Pause replay'})).toBeVisible();await page.getByRole('button',{name:'Pause replay'}).click();
 await page.getByLabel('Replay temporal mode').selectOption('evidence');await expect(page.getByText('0 signals',{exact:true})).toBeVisible();await expect(page.getByText('No publications visible at this freeze.')).toBeVisible();
 await page.getByRole('button',{name:'Shai-Hulud',exact:false}).first().click();await page.getByLabel('Replay temporal mode').selectOption('retrospective');
 await expect(page.getByText(/516 reference versions/)).toBeVisible();await expect(page.getByText('100 signals',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('gate assessment gives a real block, persists exact paths across routes, and resets uploads to evidence',async({page})=>{
 await page.goto('/gate');await page.getByRole('button',{name:'Assess lockfile'}).click();await expect(page.getByText('BLOCKED · exit 1',{exact:true})).toBeVisible();
 await expect(page.getByRole('img',{name:'Exact dependency path: incident-replay-example to chalk@5.6.1'})).toBeVisible();
 await expect(page.getByRole('button',{name:/Pin|Ignore for/})).toHaveCount(0);
 await page.getByRole('link',{name:'Lockfile',exact:true}).click();await expect(page.getByRole('table',{name:'Resolved versions'}).getByText('chalk',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'chalk',exact:true}).click();await expect(page.getByRole('heading',{name:'Exact installation path'})).toBeVisible();
 await page.getByRole('searchbox').fill('not-present');await expect(page.getByText('No rows match these filters')).toBeVisible();await page.getByRole('searchbox').clear();
 await page.getByRole('link',{name:'Gate',exact:true}).click();await expect(page.getByText('BLOCKED · exit 1',{exact:true})).toBeVisible();
 const unknown={name:'private-app',lockfileVersion:3,packages:{'':{name:'private-app',dependencies:{'not-in-store':'1.0.0'}},'node_modules/not-in-store':{version:'1.0.0',resolved:'https://registry.npmjs.org/not-in-store/-/not-in-store-1.0.0.tgz'}}};
 await page.getByLabel('Choose package-lock.json').setInputFiles({name:'private-lock.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(unknown))});
 await expect(page.getByLabel('Assessment mode')).toHaveValue('evidence');await expect(page.getByText('BLOCKED · exit 1',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Assess lockfile'}).click();await expect(page.getByText('INCOMPLETE · exit 2',{exact:true})).toBeVisible();await expect(page.getByText('Version outside store coverage',{exact:true})).toBeVisible();
});

test('benchmark renders measured results and explain renders source unknowns without safe recommendations',async({page})=>{
 await page.goto('/bench');await expect(page.getByText('659.82',{exact:false}).first()).toBeVisible();await expect(page.getByText('0.00%',{exact:true}).first()).toBeVisible();await expect(page.getByText('Production acceptance not met.',{exact:true})).toBeVisible();
 await expect(page.getByText('0.94',{exact:true})).toHaveCount(0);await expect(page.getByText('2h14m',{exact:true})).toHaveCount(0);
 await page.goto('/explain/%40ctrl%2Ftinycolor%404.1.1?asOf=2025-09-20T00%3A00%3A00Z&mode=retrospective&incident=shai-hulud-2025-09');
 await expect(page.getByRole('heading',{name:'@ctrl/tinycolor@4.1.1',exact:true}).first()).toBeVisible();await expect(page.getByText('Publisher unknown.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:/Pin/})).toHaveCount(0);
});

test('theme, store dialog, responsive drawer, reduced motion and horizontal bounds work',async({page})=>{
 await page.goto('/replay');await expect(page.getByText('18 signals',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Light',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('button',{name:/Store patient-zero/}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog').getByText('1,574',{exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.setViewportSize({width:1024,height:768});await expect(page.getByRole('button',{name:'Findings (18)'})).toBeVisible();await page.getByRole('button',{name:'Findings (18)'}).click();await expect(page.getByRole('heading',{name:'Findings',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Findings (18)'})).toBeFocused();
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 for(const route of ['/replay','/gate','/lockfile','/bench']){await page.goto(route);await expect(page.locator('#content')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
});

test('API rejects cross-origin, non-loopback, oversized and malformed assessments; store stays unchanged',async({request})=>{
 const before=await fs.readFile(path.join(root,'patient-zero.rl'));const body={lockfile:'{}',asOf:'2025-09-08T14:00:00Z',mode:'retrospective',failOn:'medium'};
 expect((await request.post('/api/gate',{headers:{Origin:'https://untrusted.example'},data:body})).status()).toBe(403);
 expect((await request.post('/api/gate',{data:body})).status()).toBe(403);
 expect((await request.get('/api/meta',{headers:{Host:'untrusted.example'}})).status()).toBe(403);
 const malformed=await request.post('/api/gate',{headers:{Origin:'http://127.0.0.1:3000'},data:body});expect(malformed.status()).toBe(422);expect((await malformed.json()).exitCode).toBe(2);
 const large=await request.post('/api/gate',{headers:{Origin:'http://127.0.0.1:3000'},data:{...body,lockfile:'x'.repeat(2200000)}});expect(large.status()).toBe(422);
 const many={lockfileVersion:3,packages:Object.fromEntries(Array.from({length:2002},(_,i)=>[`node_modules/p${i}`,{}]))};
 const bounded=await request.post('/api/gate',{headers:{Origin:'http://127.0.0.1:3000'},data:{...body,lockfile:JSON.stringify(many)}});expect(bounded.status()).toBe(422);expect((await bounded.json()).error).toContain('2,000 locations');
 expect(await fs.readFile(path.join(root,'patient-zero.rl'))).toEqual(before);
});
