'use client';
import {createContext,useContext,useEffect,useState,useRef,type ReactNode} from 'react';
import type {Meta,Mode,Assessment} from '@/lib/contracts';
import {getJSON} from '@/lib/format';
import sample from '../../fixtures/lockfiles/chalk-v3.json';
const sampleText=JSON.stringify(sample,null,2);
function useAppState(){
 const [meta,setMeta]=useState<Meta|null>(null),[metaError,setMetaError]=useState('');
 const [incident,setIncident]=useState('chalk-debug-2025-09'),[asOf,setAsOf]=useState('2025-09-08T13:30:00.000Z'),[mode,setMode]=useState<Mode>('retrospective');
 const [theme,setTheme]=useState<'dark'|'light'>('dark');
 const [lockText,setLockText]=useState(sampleText),[fileName,setFileName]=useState('Demo · chalk-v3.json');
 const [gateMode,setGateMode]=useState<Mode>('retrospective'),[gateTime,setGateTime]=useState('2025-09-08T14:00:00.000Z'),[failOn,setFailOn]=useState<'medium'|'high'>('medium');
 const inputKey=JSON.stringify([lockText,gateMode,gateTime,failOn]);const inputRef=useRef(inputKey),requestRef=useRef(0);inputRef.current=inputKey;
 const [assessment,setAssessment]=useState<Assessment|null>(null),[assessing,setAssessing]=useState(false),[assessmentError,setAssessmentError]=useState('');
 useEffect(()=>{setAssessment(null);setAssessmentError('');},[inputKey]);
 useEffect(()=>{getJSON<Meta>('/api/meta').then(setMeta).catch(e=>setMetaError(e.message));const stored=localStorage.getItem('pz-theme');setTheme(stored==='light'||stored==='dark'?stored:matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');},[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('pz-theme',theme);},[theme]);
 function chooseIncident(slug:string){setIncident(slug);const i=meta?.incidents.find(i=>i.slug===slug);if(i)setAsOf(slug==='chalk-debug-2025-09'?new Date(Date.parse(i.start)+30*60000).toISOString():i.end);}
 function loadDemo(){setLockText(sampleText);setFileName('Demo · chalk-v3.json');setGateMode('retrospective');setGateTime('2025-09-08T14:00:00.000Z');setAssessment(null);setAssessmentError('');}
 async function assess(){const key=inputKey,id=++requestRef.current;setAssessing(true);setAssessmentError('');setAssessment(null);try{const data=await getJSON<Assessment>('/api/gate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lockfile:lockText,asOf:gateTime,mode:gateMode,failOn})});if(inputRef.current===key&&requestRef.current===id)setAssessment(data);}catch(e){if(inputRef.current===key&&requestRef.current===id)setAssessmentError(e instanceof Error?e.message:String(e));}finally{if(requestRef.current===id)setAssessing(false);}}
 async function upload(file:File){setAssessment(null);setAssessmentError('');if(file.size>1800000){setAssessmentError('Choose a JSON lockfile smaller than 1.8 MB, or use the CLI for larger files.');return;}setLockText(await file.text());setFileName(file.name);setGateMode('evidence');setGateTime(new Date().toISOString());}
 return{meta,metaError,incident,chooseIncident,asOf,setAsOf,mode,setMode,theme,setTheme,lockText,fileName,gateMode,setGateMode,gateTime,setGateTime,failOn,setFailOn,assessment,assessing,assessmentError,assess,upload,loadDemo};
}
type AppState=ReturnType<typeof useAppState>;const AppContext=createContext<AppState|null>(null);
export function Provider({children}:{children:ReactNode}){return <AppContext.Provider value={useAppState()}>{children}</AppContext.Provider>;}
export function useApp(){const app=useContext(AppContext);if(!app)throw new Error('Application provider missing');return app;}
