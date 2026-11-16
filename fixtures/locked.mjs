// Synthetic registry descriptors. No archives are fetched by these tests.
export const locked=(name,version='1.0.0',extra={})=>({version,resolved:`https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`,...extra});
export const lockfile=(packages,lockfileVersion=3)=>JSON.stringify({name:'test-app',lockfileVersion,packages:{'':{name:'test-app',...packages['']},...Object.fromEntries(Object.entries(packages).filter(([p])=>p!==''))}});
