import type {Finding,VersionRecord,DetectionResult,GateResult,ParsedLockfile} from '@patient-zero/core';
export type Mode='retrospective'|'evidence';
export interface IncidentInfo {slug:string;name:string;start:string;end:string;role:string;referenceVersions:number;advisoryPublishedAt:string|null}
export interface Meta {store:{name:string;bytes:number;sha256:string;versions:number;fullHistoryPackages:number;projectedPackages:number};incidents:IncidentInfo[]}
export interface Replay {incident:IncidentInfo;asOf:string;mode:Mode;versions:VersionRecord[];findings:Finding[];coverage:DetectionResult['coverage'];warnings:string[]}
export interface Assessment {result:GateResult;lock:ParsedLockfile;versions:VersionRecord[]}
export interface Explanation {record:VersionRecord;previous:VersionRecord|null;history:VersionRecord[];finding:Finding|null;activity:{at:string;count:number}[];projected:boolean;asOf:string;mode:Mode}
export interface BenchRow {slug:string;role:string;start:string;end:string;referenceVersions:number;referenceWithKnownPublication:number;referenceWithPublisher:number;referenceWithScriptState:number;recallAtEnd:number|null;referencePrecision:number|null;recallAtFirstPublicAdvisory:number|null;firstPublicLeadMinutes:number|null;osvCutoffVersions:number;recallBeforeOsvPublication:number|null;osvLeadMinutes:number|null;knownWindowPublishes:number;flaggedWindowVersions:number;controlFlagsPer1000Publishes:number|null;firstDetections:{version:string;tick:string}[]}
export interface Benchmark {generatedAt:string;configHash:string;codeHash:string;cohortSnapshotAt:string;rows:BenchRow[];limitations:string[]}
