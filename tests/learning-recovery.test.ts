import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../src/lib/types';

const fake = vi.hoisted(() => ({
  snapshot: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  agent: vi.fn(),
}));

vi.mock('../src/lib/api', () => ({ api: fake, id: () => crypto.randomUUID(), now: () => new Date().toISOString() }));

import { finishProbe, generateExercise, startLearningSession, teach } from '../src/features/learning/engine';

describe('learning workflow recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const snapshot = {
      learning_goals: [{ id: 'goal', title: 'Изучить C' }],
      sessions: [{ id: 'session', goal_id: 'goal', phase: 'probe', title: 'Изучить C' }],
      messages: [],
      diagnostic_answers: [{ id: 'saved-answer', session_id: 'session', question: 'Вопрос 1', answer: 'Ответ 1', reasoning: 'Мысль 1', evaluation: '', created_at: '2026-01-01' }],
      curricula: [{ id: 'partial-plan', goal_id: 'goal' }],
      topics: [{ id: 'partial-topic', curriculum_id: 'partial-plan' }],
      exercises: [],
      attempts: [],
      knowledge_nodes: [],
      knowledge_edges: [],
      knowledge_provenance: [],
      workflow_executions: [{ id: 'goal:probe', status: 'waiting_for_user', output: JSON.stringify({ questions: [{ question: 'Вопрос 1' }, { question: 'Вопрос 2' }] }), retry_count: 0 }],
      preferences: [],
    } as unknown as Snapshot;
    fake.snapshot.mockResolvedValue(snapshot);
    fake.save.mockImplementation(async (table:string,record:{id?:string})=>{
      if(table==='workflow_executions') {
        const index=snapshot.workflow_executions.findIndex(item=>item.id===record.id);
        if(index>=0) snapshot.workflow_executions[index]=record as Snapshot['workflow_executions'][number];
        else snapshot.workflow_executions.push(record as Snapshot['workflow_executions'][number]);
      }
    });
    fake.remove.mockResolvedValue(undefined);
    fake.agent.mockImplementation(async (operation: string) => {
      if (operation === 'evaluate_probe') return { summary: 'Оценка', observations: [], startingPoint: 'Начало', _execution: { durationMs: 1 } };
      if (operation === 'curriculum') return { approach: 'План', topics: [{ id: 'c', title: 'Указатели', description: 'Адреса памяти', prerequisites: [], objectives: [], difficulty: 'beginner' }], _execution: { durationMs: 1 } };
      throw new Error(`Unexpected operation: ${operation}`);
    });
  });

  it('saves only missing answers and replaces an interrupted curriculum', async () => {
    const actions: string[] = [];
    const persist=fake.save.getMockImplementation()!;
    fake.save.mockImplementation(async (table: string, record:unknown) => { actions.push(`save:${table}`);await persist(table,record); });
    fake.remove.mockImplementation(async (table: string, id: string) => { actions.push(`remove:${table}:${id}`); });

    await finishProbe('goal', 'session', [
      { question: 'Вопрос 1', answer: 'Ответ 1', reasoning: 'Мысль 1' },
      { question: 'Вопрос 2', answer: 'Ответ 2', reasoning: 'Мысль 2' },
    ], { provider: 'codex', model: 'default' });

    const savedAnswers = fake.save.mock.calls.filter(([table]) => table === 'diagnostic_answers');
    expect(savedAnswers).toHaveLength(1);
    expect(savedAnswers[0][1].question).toBe('Вопрос 2');
    expect(actions.indexOf('remove:curricula:partial-plan')).toBeGreaterThan(-1);
    expect(actions.indexOf('remove:curricula:partial-plan')).toBeLessThan(actions.indexOf('save:curricula'));
    const completedProbe = fake.save.mock.calls.find(([table, record]) => table === 'workflow_executions' && record.step_id === 'probe' && record.status === 'completed');
    expect(JSON.parse(completedProbe?.[1].output).questions).toHaveLength(2);
  });

  it('does not replace the saved plan when the model returns invalid dependencies', async () => {
    fake.agent.mockImplementation(async (operation:string) => {
      if(operation==='evaluate_probe') return {summary:'Оценка',observations:[],startingPoint:'Начало',_execution:{durationMs:1}};
      if(operation==='curriculum') return {approach:'План',topics:[{id:'pointers',title:'Указатели',description:'',prerequisites:['missing'],objectives:[],difficulty:'beginner'}],_execution:{durationMs:1}};
      throw new Error(`Unexpected operation: ${operation}`);
    });
    await expect(finishProbe('goal','session',[{question:'Вопрос 1',answer:'Ответ 1',reasoning:'Мысль 1'}],{provider:'codex',model:'default'})).rejects.toThrow('отсутствующую предпосылку');
    expect(fake.remove).not.toHaveBeenCalled();
    expect(fake.save).toHaveBeenCalledWith('workflow_executions',expect.objectContaining({step_id:'curriculum',status:'failed'}));
  });

  it('starts another learning session only after the curriculum is complete', async () => {
    const snapshot=await fake.snapshot();
    snapshot.workflow_executions.push({id:'goal:curriculum',status:'running'});
    await expect(startLearningSession('goal')).rejects.toThrow('Сначала завершите диагностику');
    snapshot.workflow_executions.at(-1).status='completed';
    const next=await startLearningSession('goal');
    expect(next).toBeTruthy();
    expect(fake.save).toHaveBeenCalledWith('sessions',expect.objectContaining({id:next,goal_id:'goal',phase:'learning'}));
  });

  it('keeps teacher context inside one goal across sessions', async () => {
    const snapshot=await fake.snapshot();
    snapshot.workflow_executions.push({id:'goal:curriculum',status:'completed'} as Snapshot['workflow_executions'][number]);
    snapshot.sessions.push({id:'previous',goal_id:'goal'},{id:'other',goal_id:'another-goal'});
    snapshot.messages.push(
      {id:'a',session_id:'previous',role:'user',content:'Я понимаю адреса',kind:'teaching-answer',created_at:'2026-01-02'},
      {id:'b',session_id:'other',role:'user',content:'Чужая цель',kind:'teaching-answer',created_at:'2026-01-03'},
    );
    snapshot.knowledge_nodes.push({id:'claim',goal_id:'goal',kind:'proposition',statement:'Указатель хранит адрес'});
    fake.agent.mockImplementation(async (operation: string) => {
      if(operation==='teach') return {message:'Проверим на примере адреса.',question:'Что изменится?',questionType:'predict',topicId:'topic',phase:'teach',_execution:{durationMs:1}};
      if(operation==='extract') return {propositions:[],chains:[],_execution:{durationMs:1}};
      throw new Error(`Unexpected operation: ${operation}`);
    });
    await teach('goal','session',{id:'topic',curriculum_id:'partial-plan',title:'Указатели',description:'Адреса памяти',objectives:'[]',prerequisites:'[]',difficulty:'beginner',status:'pending',position:0},{provider:'codex',model:'default'});
    const input=fake.agent.mock.calls.find(([operation])=>operation==='teach')?.[3];
    expect(input.history.map((item:{content:string})=>item.content)).toContain('Я понимаю адреса');
    expect(input.history.map((item:{content:string})=>item.content)).not.toContain('Чужая цель');
    expect(input.recordedClaims).toEqual(['Указатель хранит адрес']);
  });

  it('links an audited shared proposition to the current topic', async () => {
    const snapshot=await fake.snapshot();
    snapshot.workflow_executions.push({id:'goal:curriculum',status:'completed'} as Snapshot['workflow_executions'][number]);
    snapshot.knowledge_nodes.push({id:'existing',goal_id:'goal',kind:'proposition',name:'Адрес',statement:'Указатель хранит адрес'});
    fake.agent.mockImplementation(async (operation:string) => {
      if(operation==='teach') return {message:'Указатель хранит адрес.',question:'Что это означает?',questionType:'check',topicId:'topic',phase:'teach',_execution:{durationMs:1}};
      if(operation==='extract') return {propositions:[{id:'claim',name:'Адрес',statement:'Указатель хранит адрес.',sourceMessageId:null}],chains:[],_execution:{durationMs:1}};
      if(operation==='audit') return {links:[{id:'claim',linkTo:'existing'}],_execution:{durationMs:1}};
      throw new Error(`Unexpected operation: ${operation}`);
    });
    await teach('goal','session',{id:'topic',curriculum_id:'partial-plan',title:'Указатели',description:'Адреса памяти',objectives:'[]',prerequisites:'[]',difficulty:'beginner',status:'pending',position:0},{provider:'codex',model:'default'});
    expect(fake.save).toHaveBeenCalledWith('knowledge_topic_links',{node_id:'existing',topic_id:'topic'});
    expect(fake.save.mock.calls.filter(([table])=>table==='knowledge_nodes')).toHaveLength(0);
  });

  it('uses only attempts for the selected topic when generating practice', async () => {
    const snapshot=await fake.snapshot();
    snapshot.exercises.push({id:'same-topic',goal_id:'goal',topic_id:'topic'},{id:'other-topic',goal_id:'goal',topic_id:'other'});
    snapshot.attempts.push({exercise_id:'same-topic',answer:'Нужный ответ',evaluation:'{}'},{exercise_id:'other-topic',answer:'Другой ответ',evaluation:'{}'});
    fake.agent.mockResolvedValue({kind:'reasoning',prompt:'Объясните значение указателя',solution:'Указатель содержит адрес',topicId:'topic',_execution:{durationMs:1}});
    await generateExercise('goal',{id:'topic',curriculum_id:'partial-plan',title:'Указатели',description:'Адреса памяти',objectives:'[]',prerequisites:'[]',difficulty:'beginner',status:'pending',position:0},{provider:'codex',model:'default'});
    const input=fake.agent.mock.calls.find(([operation])=>operation==='practice')?.[3];
    expect(input.attempts.map((item:{answer:string})=>item.answer)).toEqual(['Нужный ответ']);
  });
});
