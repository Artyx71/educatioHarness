import {describe,expect,it} from 'vitest';
import {activitySummary,normalizeProfileName} from './activity';
import type {Snapshot} from '../../lib/types';

const empty:Snapshot={learning_goals:[],sessions:[],messages:[],diagnostic_answers:[],curricula:[],topics:[],exercises:[],attempts:[],knowledge_nodes:[],knowledge_edges:[],knowledge_topic_links:[],knowledge_provenance:[],workflow_executions:[],agent_executions:[],preferences:[]};

describe('local profile activity',()=>{
  it('counts a streak ending yesterday and ignores assistant-only messages',()=>{
    const snapshot={...empty,sessions:[{id:'s',goal_id:'g',phase:'learn',title:'C',created_at:'2026-11-09T12:00:00',updated_at:'2026-11-09T12:00:00'}],messages:[{id:'m',session_id:'s',role:'assistant' as const,content:'text',kind:'text',created_at:'2026-11-11T12:00:00'}],attempts:[{id:'a',exercise_id:'e',answer:'x',reasoning:'',evaluation:'',created_at:'2026-11-10T12:00:00'}]};
    expect(activitySummary(snapshot,new Date(2026,10,11))).toMatchObject({streak:2,totalDays:2});
  });
  it('normalizes a display name without accepting blank or control text',()=>{
    expect(normalizeProfileName('  Анна   П. ')).toBe('Анна П.');
    expect(()=>normalizeProfileName(' \n ')).toThrow();
    expect(()=>normalizeProfileName('A\u0000B')).toThrow();
  });
});
