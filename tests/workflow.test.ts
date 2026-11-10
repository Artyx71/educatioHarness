import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../src/lib/types';

const fake=vi.hoisted(()=>({snapshot:vi.fn(),save:vi.fn()}));
vi.mock('../src/lib/api',()=>({api:fake,now:()=> '2026-01-01T00:00:00.000Z'}));
import { transitionWorkflow } from '../src/lib/workflow';

describe('persistent workflow transitions',()=>{
  const steps:Snapshot['workflow_executions']=[];
  beforeEach(()=>{
    steps.length=0;
    vi.clearAllMocks();
    fake.snapshot.mockImplementation(async()=>({workflow_executions:steps}));
    fake.save.mockImplementation(async (_table:string,record:Snapshot['workflow_executions'][number])=>{
      const index=steps.findIndex(item=>item.id===record.id);
      if(index<0) steps.push(record); else steps[index]=record;
    });
  });
  it('requires completed dependencies before running a step',async()=>{
    await expect(transitionWorkflow({goalId:'g',stepId:'curriculum',status:'running',input:{},dependencies:['g:evaluation']})).rejects.toThrow('Сначала завершите');
    expect(fake.save).not.toHaveBeenCalled();
    steps.push({id:'g:evaluation',status:'completed'} as Snapshot['workflow_executions'][number]);
    const result=await transitionWorkflow({goalId:'g',stepId:'curriculum',status:'running',input:{goal:'C'},dependencies:['g:evaluation']});
    expect(result.id).toBe('g:curriculum');
    expect(JSON.parse(result.dependencies)).toEqual(['g:evaluation']);
    expect(JSON.parse(result.input)).toEqual({goal:'C'});
  });
  it('keeps session-scoped steps distinct and counts explicit retries',async()=>{
    steps.push({id:'g:curriculum',status:'completed'} as Snapshot['workflow_executions'][number]);
    const input={topicId:'pointers'};
    const first=await transitionWorkflow({goalId:'g',sessionId:'s1',instanceId:'s1',stepId:'teach',status:'running',input,dependencies:['g:curriculum'],metadata:{provider:'codex'}});
    const retry=await transitionWorkflow({goalId:'g',sessionId:'s1',instanceId:'s1',stepId:'teach',status:'running',input,dependencies:['g:curriculum']});
    const second=await transitionWorkflow({goalId:'g',sessionId:'s2',instanceId:'s2',stepId:'teach',status:'running',input,dependencies:['g:curriculum']});
    expect(first.retry_count).toBe(0);
    expect(retry.retry_count).toBe(1);
    expect(second.retry_count).toBe(0);
    expect(second.id).toBe('s2:teach');
    expect(JSON.parse(first.metadata)).toEqual({provider:'codex'});
  });
  it('does not count a normal answer after waiting for the user as a retry',async()=>{
    const input={topicId:'pointers'};
    await transitionWorkflow({goalId:'g',sessionId:'s1',instanceId:'s1',stepId:'teach',status:'running',input});
    await transitionWorkflow({goalId:'g',sessionId:'s1',instanceId:'s1',stepId:'teach',status:'waiting_for_user',input});
    const continued=await transitionWorkflow({goalId:'g',sessionId:'s1',instanceId:'s1',stepId:'teach',status:'running',input:{...input,answer:'Мой ответ'}});
    expect(continued.retry_count).toBe(0);
  });
  it('keeps the retry count stable while a running step saves partial progress',async()=>{
    await transitionWorkflow({goalId:'g',instanceId:'r',stepId:'review',status:'running',input:{},output:{exerciseIds:[]}});
    const updated=await transitionWorkflow({goalId:'g',instanceId:'r',stepId:'review',status:'running',input:{},output:{exerciseIds:['e1']},progressUpdate:true});
    expect(updated.retry_count).toBe(0);
    expect(JSON.parse(updated.output).exerciseIds).toEqual(['e1']);
  });
});
