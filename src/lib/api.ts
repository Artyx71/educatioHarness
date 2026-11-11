import { invoke } from '@tauri-apps/api/core';
import type { AgentResult, Attempt, AuthStatus, Exercise, Goal, KnowledgeEdge, KnowledgeNode, Message, Operation, Provider, Session, SkillMetadata, Snapshot, Topic } from './types';

type WritableNumbers<T> = { [K in keyof T]: T[K] extends number ? T[K] | string : T[K] };
type AgentExecution = { id:string; session_id:string; provider:Provider; model:string; operation:Operation; status:string; duration_ms:number|string; metadata:string; created_at:string };
type SaveRecords = {
  learning_goals:Goal;
  sessions:Session;
  messages:Message;
  diagnostic_answers:Snapshot['diagnostic_answers'][number];
  curricula:Snapshot['curricula'][number];
  topics:WritableNumbers<Topic>;
  exercises:Exercise;
  attempts:Attempt;
  knowledge_nodes:KnowledgeNode;
  knowledge_edges:KnowledgeEdge;
  knowledge_topic_links:Snapshot['knowledge_topic_links'][number];
  knowledge_provenance:Snapshot['knowledge_provenance'][number];
  workflow_executions:WritableNumbers<Snapshot['workflow_executions'][number]>;
  agent_executions:AgentExecution;
  preferences:Snapshot['preferences'][number];
};
type DeletableTable = 'curricula'|'topics'|'knowledge_nodes'|'knowledge_edges'|'exercises'|'learning_goals';

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
let activeAgentRequest: string | undefined;
export async function cancelActiveAgent() {
  if (!activeAgentRequest) return false;
  return invoke<boolean>('cancel_agent', {requestId: activeAgentRequest});
}
export const api = {
  snapshot: () => invoke<Snapshot>('snapshot'),
  save: <K extends keyof SaveRecords>(table:K,record:SaveRecords[K]) => invoke<void>('save_record',{table,record}),
  remove: (table:DeletableTable,id:string) => invoke<void>('delete_record',{table,id}),
  auth: () => invoke<AuthStatus>('auth_status'),
  login: () => invoke<void>('codex_login'),
  logout: () => invoke<void>('codex_logout'),
  saveKey: (key:string,model:string) => invoke<void>('save_api_key',{key,model}),
  removeKey: () => invoke<void>('remove_api_key'),
  dataLocation: () => invoke<string>('data_location'),
  moveDataDirectory: (directory:string) => invoke<void>('move_data_directory',{directory}),
  inspectBackup: (path:string) => invoke<{goals:number;sessions:number;attempts:number;version:number}>('inspect_backup',{path}),
  exportBackup: (path:string) => invoke<{goals:number;sessions:number;attempts:number;version:number}>('export_backup',{path}),
  importBackup: (path:string) => invoke<{goals:number;sessions:number;attempts:number;version:number}>('import_backup',{path}),
  inspectPortableBackup: (path:string,password:string) => invoke<{goals:number;sessions:number;attempts:number;version:number}>('inspect_portable_backup',{path,password}),
  exportPortableBackup: (path:string,password:string) => invoke<{goals:number;sessions:number;attempts:number;version:number}>('export_portable_backup',{path,password}),
  importPortableBackup: (path:string,password:string) => invoke<{goals:number;sessions:number;attempts:number;version:number}>('import_portable_backup',{path,password}),
  syncConfigure: (url:string,token:string) => invoke<{has_archive:boolean;etag:string|null}>('sync_configure',{url,token}),
  syncStatus: () => invoke<{has_archive:boolean;etag:string|null}>('sync_status'),
  syncDisconnect: () => invoke<void>('sync_disconnect'),
  syncUpload: (path:string,password:string) => invoke<void>('sync_upload',{path,password}),
  syncDownload: (path:string) => invoke<void>('sync_download',{path}),
  exportObsidian: (directory:string) => invoke<string>('export_obsidian',{directory}),
  listSkills: () => invoke<SkillMetadata[]>('list_skills'),
  saveSkillDirectories: (directories:string[]) => invoke<void>('save_skill_directories',{directories}),
  agent: async <T>(operation:Operation,provider:Provider,model:string,input:unknown,skill:string,sessionId?:string) => {
    const requestId = id();
    activeAgentRequest = requestId;
    try { return await invoke<AgentResult<T>>('agent_call',{request:{requestId,operation,provider,model,input,skill,sessionId}}); }
    finally { if (activeAgentRequest === requestId) activeAgentRequest = undefined; }
  },
};
