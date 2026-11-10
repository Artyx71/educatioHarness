import { invoke } from '@tauri-apps/api/core';
import type { AgentResult, AuthStatus, Operation, Provider, Snapshot } from './types';

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
let activeAgentRequest: string | undefined;
export async function cancelActiveAgent() {
  if (!activeAgentRequest) return false;
  return invoke<boolean>('cancel_agent', {requestId: activeAgentRequest});
}
export const api = {
  snapshot: () => invoke<Snapshot>('snapshot'),
  save: (table:string,record:Record<string,unknown>) => invoke<void>('save_record',{table,record}),
  remove: (table:string,id:string) => invoke<void>('delete_record',{table,id}),
  auth: () => invoke<AuthStatus>('auth_status'),
  login: () => invoke<void>('codex_login'),
  logout: () => invoke<void>('codex_logout'),
  saveKey: (key:string) => invoke<void>('save_api_key',{key}),
  removeKey: () => invoke<void>('remove_api_key'),
  agent: async <T>(operation:Operation,provider:Provider,model:string,input:unknown,skill:string,sessionId?:string) => {
    const requestId = id();
    activeAgentRequest = requestId;
    try { return await invoke<AgentResult<T>>('agent_call',{request:{requestId,operation,provider,model,input,skill,sessionId}}); }
    finally { if (activeAgentRequest === requestId) activeAgentRequest = undefined; }
  },
};
