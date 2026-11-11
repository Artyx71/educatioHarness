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

  it('reuses a completed evaluation for unchanged answers after a curriculum interruption', async () => {
    const snapshot=await fake.snapshot();
    const answers=[{question:'Вопрос 1',answer:'Ответ 1',reasoning:'Мысль 1'}];
    snapshot.workflow_executions.push({id:'goal:evaluation',status:'completed',input:JSON.stringify({answers}),output:JSON.stringify({summary:'Сохранённая оценка',observations:[],startingPoint:'Начало',_execution:{durationMs:1}})} as Snapshot['workflow_executions'][number]);
    snapshot.messages.push({id:'evaluation-message',session_id:'session',kind:'probe-evaluation',role:'assistant',content:'Сохранённая оценка',created_at:'2026-01-01'});
    await finishProbe('goal','session',answers,{provider:'codex',model:'default'});
    expect(fake.agent.mock.calls.map(([operation])=>operation)).toEqual(['curriculum']);
    expect(fake.save.mock.calls.filter(([table,record])=>table==='messages'&&record.kind==='probe-evaluation')).toHaveLength(0);
  });

  it('re-evaluates when the learner changes an answer', async () => {
    const snapshot=await fake.snapshot();
    snapshot.workflow_executions.push({id:'goal:evaluation',status:'completed',input:JSON.stringify({answers:[{question:'Вопрос 1',answer:'Старый ответ',reasoning:'Мысль 1'}]}),output:JSON.stringify({summary:'Устаревшая оценка',observations:[],startingPoint:'Начало'})} as Snapshot['workflow_executions'][number]);
    await finishProbe('goal','session',[{question:'Вопрос 1',answer:'Новый ответ',reasoning:'Мысль 1'}],{provider:'codex',model:'default'});
    expect(fake.agent.mock.calls.map(([operation])=>operation)).toEqual(['evaluate_probe','curriculum']);
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

  it('does not duplicate a saved answer when retrying a failed teaching request', async () => {
    const snapshot=await fake.snapshot();
    snapshot.workflow_executions.push({id:'goal:curriculum',status:'completed'} as Snapshot['workflow_executions'][number]);
    snapshot.messages.push({id:'pending',session_id:'session',role:'user',kind:'teaching-answer',content:'Я думаю, это адрес',created_at:'2026-01-02'});
    fake.agent.mockImplementation(async (operation:string) => {
      if(operation==='teach') return {message:'Разберём адрес.',question:'Что хранит указатель?',questionType:'check',topicId:'topic',phase:'teach',_execution:{durationMs:1}};
      if(operation==='extract') return {propositions:[],chains:[],_execution:{durationMs:1}};
      throw new Error(`Unexpected operation: ${operation}`);
    });
    await teach('goal','session',{id:'topic',curriculum_id:'partial-plan',title:'Указатели',description:'',objectives:'[]',prerequisites:'[]',difficulty:'beginner',status:'pending',position:0},{provider:'codex',model:'default'},'Я думаю, это адрес');
    expect(fake.save.mock.calls.filter(([table,record])=>table==='messages'&&record.role==='user')).toHaveLength(0);
    expect(fake.save.mock.calls.filter(([table,record])=>table==='messages'&&record.role==='assistant')).toHaveLength(1);
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

  it('rejects a lesson or exercise assigned by the model to another topic', async () => {
    const snapshot=await fake.snapshot();
    snapshot.workflow_executions.push({id:'goal:curriculum',status:'completed'} as Snapshot['workflow_executions'][number]);
    const topic={id:'topic',curriculum_id:'partial-plan',title:'Указатели',description:'',objectives:'[]',prerequisites:'[]',difficulty:'beginner',status:'pending',position:0};
    fake.agent.mockResolvedValue({message:'Обсудим другой материал.',question:'Что вы знаете?',questionType:'check',topicId:'other',phase:'teach',_execution:{durationMs:1}});
    await expect(teach('goal','session',topic,{provider:'codex',model:'default'})).rejects.toThrow('другой теме');
    expect(fake.save.mock.calls.filter(([table,record])=>table==='messages'&&record.role==='assistant')).toHaveLength(0);
    expect(fake.save).toHaveBeenCalledWith('workflow_executions',expect.objectContaining({step_id:'teach',status:'failed'}));
    vi.clearAllMocks();
    fake.snapshot.mockResolvedValue(snapshot);
    fake.save.mockResolvedValue(undefined);
    fake.agent.mockResolvedValue({kind:'reasoning',prompt:'Задание по другой теме',solution:'Ответ',topicId:'other',_execution:{durationMs:1}});
    await expect(generateExercise('goal',topic,{provider:'codex',model:'default'})).rejects.toThrow('другой теме');
    expect(fake.save.mock.calls.filter(([table])=>table==='exercises')).toHaveLength(0);
  });

  it('uses the retrieval skill for cards unless the learner selected a custom skill', async () => {
    fake.agent.mockResolvedValue({kind:'short_answer',prompt:'Вспомните указатели',solution:'Адрес',topicId:'topic',_execution:{durationMs:1}});
    const topic={id:'topic',curriculum_id:'partial-plan',title:'Указатели',description:'Адреса памяти',objectives:'[]',prerequisites:'[]',difficulty:'beginner',status:'pending',position:0};
    await generateExercise('goal',topic,{provider:'codex',model:'default'},'retrieval_card');
    expect(fake.agent.mock.calls.at(-1)?.[4]).toBe('retrieval-review');
    await generateExercise('goal',topic,{provider:'codex',model:'default',skillOverrides:{practice:'exercise-generator'}},'retrieval_card');
    expect(fake.agent.mock.calls.at(-1)?.[4]).toBe('exercise-generator');
  });
});
