import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {NextConfig} from 'next';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config:NextConfig={
 serverExternalPackages:['@patient-zero/core','@relate/relate','koffi'],
 outputFileTracingRoot:root,turbopack:{root},poweredByHeader:false,
 outputFileTracingIncludes:{'/api/*':['../patient-zero.rl','../bench/results.json','../bench/incidents/chalk-debug-2025-09.json','../bench/incidents/shai-hulud-2025-09.json']},
 async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}]}];},
};
export default config;
