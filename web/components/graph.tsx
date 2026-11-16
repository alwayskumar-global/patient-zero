'use client';
import {useEffect,useRef,useState} from 'react';
import type Sigma from 'sigma';
import type {MultiDirectedGraph} from 'graphology';
import type {Finding,VersionRecord} from '@patient-zero/core';
import {useApp} from './provider';import {Icon} from './ui';
const hash=(text:string)=>[...text].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);
export function Graph({versions,findings,selected,onSelect}:{versions:VersionRecord[];findings:Finding[];selected:string|null;onSelect:(id:string)=>void}){
 const container=useRef<HTMLDivElement>(null),renderer=useRef<Sigma|null>(null),graph=useRef<MultiDirectedGraph|null>(null),callback=useRef(onSelect);callback.current=onSelect;
 const [ready,setReady]=useState(false),[fallback,setFallback]=useState(false);const {theme}=useApp();
 useEffect(()=>{let disposed=false;Promise.all([import('sigma'),import('graphology'),import('@sigma/node-square')]).then(([sigma,graphs,square])=>{
  if(disposed||!container.current)return;try{const data=new graphs.MultiDirectedGraph();graph.current=data;
   const instance=new sigma.default(data,container.current,{nodeProgramClasses:{square:square.NodeSquareProgram},labelFont:'IBM Plex Mono',labelSize:11,labelWeight:'400',labelRenderedSizeThreshold:5,defaultEdgeType:'line',renderEdgeLabels:false,minCameraRatio:.12,maxCameraRatio:3,zIndex:true,stagePadding:55});
   renderer.current=instance;instance.setCustomBBox({x:[0,1400],y:[0,900]});instance.on('clickNode',({node})=>{if(data.getNodeAttribute(node,'kind')==='version')callback.current(data.getNodeAttribute(node,'version'));});setReady(true);
  }catch{setFallback(true);}
 }).catch(()=>setFallback(true));return()=>{disposed=true;renderer.current?.kill();renderer.current=null;graph.current=null;};},[]);
 useEffect(()=>{
  if(!ready||!graph.current||!renderer.current||!container.current)return;const g=graph.current,css=getComputedStyle(container.current),color=(name:string)=>css.getPropertyValue(name).trim();
  const ink=color('--ink'),muted=color('--ink-muted'),ember=color('--ember'),publisher=color('--ink-accent'),edge=color('--edge');
  const flagged=new Map(findings.map(f=>[f.version,f]));g.clear();
  const pubSet=[...new Set(versions.flatMap(v=>v.publisher?[v.publisher]:[]))].sort((a,b)=>versions.filter(v=>v.publisher===b).length-versions.filter(v=>v.publisher===a).length||a.localeCompare(b));
  const centers=new Map(pubSet.map((pub,i)=>[pub,{x:pubSet.length<=3?[560,1040,170][i]!:170+(hash(pub)%4)*340,y:pubSet.length<=3?470:230+(Math.floor(hash(pub)/4)%3)*220}]));
  for(const [pub,center]of centers)g.addNode(`publisher:${pub}`,{...center,size:8,label:pub,color:publisher,type:'square',kind:'publisher',forceLabel:true});
  for(const v of versions){const id=`${v.pkg}@${v.semver}`,key=`version:${id}`,center=v.publisher?centers.get(v.publisher)!:{x:100+(hash(v.pkg)%1180),y:90+(hash(id)%730)};
   const siblings=[...new Set(versions.filter(n=>n.publisher===v.publisher).map(n=>n.pkg))].sort();const index=siblings.indexOf(v.pkg);const angle=(index/Math.max(1,siblings.length)*Math.PI*2)-Math.PI/2,radius=175+(hash(id+'r')%55),isSelected=selected===id;
   g.addNode(key,{x:v.publisher?center.x+Math.cos(angle)*radius:center.x,y:v.publisher?center.y+Math.sin(angle)*radius:center.y,size:isSelected?8:flagged.has(id)?5:3.5,label:id,color:flagged.has(id)?ember:muted,type:'circle',kind:'version',version:id,forceLabel:isSelected,zIndex:isSelected?3:flagged.has(id)?2:1,labelColor:ink});
   if(v.publisher)g.addDirectedEdge(`publisher:${v.publisher}`,key,{size:isSelected?1.6:.65,color:flagged.has(id)?ember:edge,type:'line'});
  }
  // Only recorded propagation paths add taint edges. No unknown-publisher grouping.
  for(const f of findings)for(let i=1;i<f.path.length;i++){const a=`version:${f.path[i-1]!.version}`,b=`version:${f.path[i]!.version}`;if(a!==b&&g.hasNode(a)&&g.hasNode(b)&&!g.hasDirectedEdge(a,b))g.addDirectedEdge(a,b,{color:ember,size:2,type:'arrow'});}
  renderer.current.setSetting('labelColor',{color:ink});renderer.current.refresh();
 },[versions,findings,selected,ready,theme]);
 function camera(action:'fit'|'plus'|'minus'){const camera=renderer.current?.getCamera();if(!camera)return;if(action==='fit')camera.setState({x:.5,y:.5,ratio:1,angle:0});else camera.setState({ratio:Math.max(.12,Math.min(3,camera.ratio*(action==='plus'?.75:1.3)))});}
 return <div className="graph-wrapper"><div ref={container} className="graph sigma-mount" aria-label={`Publisher graph with ${versions.length} visible versions`} role="img"/>{fallback&&<div className="graph-fallback"><p>WebGL unavailable. Select a version from the accessible graph list.</p><div>{versions.map(v=>{const id=`${v.pkg}@${v.semver}`;return <button className="btn mono" key={id} onClick={()=>onSelect(id)}>{id}</button>;})}</div></div>}{!versions.length&&<p className="graph-empty">No publications visible at this freeze.<br/><span>Move the timeline or change temporal mode.</span></p>}<div className="graph-tools">{(['plus','minus','fit']as const).map(action=><button key={action} className="btn btn--icon" aria-label={action==='fit'?'Fit graph':action==='plus'?'Zoom in':'Zoom out'} onClick={()=>camera(action)}><Icon name={action}/></button>)}</div><details className="graph-accessible"><summary>Graph versions ({versions.length})</summary><div>{versions.map(v=>{const id=`${v.pkg}@${v.semver}`;return <button key={id} className="btn mono" onClick={()=>onSelect(id)}>{id}</button>;})}</div></details></div>;
}
