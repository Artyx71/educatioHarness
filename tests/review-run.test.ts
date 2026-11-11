import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exercise, Snapshot, Topic } from '../src/lib/types';

const fake=vi.hoisted(()=>({snapshot:vi.fn(),save:vi.fn(),generateExercise:vi.fn()}));
vi.mock('../src/lib/api',()=>({api:fake,id:()=> 'run-id',now:()=> '2026-01-01T00:00:00.000Z'}));
vi.mock('../src/features/learning/engine',()=>({generateExercise:fake.generateExercise}));
import { finishReview, latestReviewRun, resumeReview, selectReviewTopics, startReview } from '../src/features/practice/review-run';

const topic=(id:string,position:number,status='completed'):Topic=>({id,curriculum_id:'curriculum',title:id,description:'',prerequisites:'[]',objectives:'[]',difficulty:'beginner',status,position});
const evaluated=JSON.stringify({verdict:'correct',feedback:'Верно',misconception:'',recommendation:'Повторите'});

describe('persistent mixed-topic review',()=>{
  let snapshot:Snapshot;
  beforeEach(()=>{
    vi.clearAllMocks();
    snapshot={
      learning_goals:[{id:'goal',title:'C',created_at:'t',updated_at:'t'}],
      curricula:[{id:'curriculum',goal_id:'goal',created_at:'t',updated_at:'t'}],
      topics:[topic('a',0),topic('b',1),topic('c',2)],exercises:[],attempts:[],workflow_executions:[],
      sessions:[],messages:[],diagnostic_answers:[],knowledge_nodes:[],knowledge_edges:[],knowledge_topic_links:[],knowledge_provenance:[],agent_executions:[],preferences:[],
    };
    fake.snapshot.mockImplementation(async()=>snapshot);
    fake.save.mockImplementation(async(table:string,record:Snapshot['workflow_executions'][number])=>{
      if(table!=='workflow_executions') throw new Error(`Unexpected table: ${table}`);
      const index=snapshot.workflow_executions.findIndex(item=>item.id===record.id);
      if(index<0) snapshot.workflow_executions.push(record); else snapshot.workflow_executions[index]=record;
    });
    fake.generateExercise.mockImplementation(async(_goalId:string,selected:Topic)=>{
      const exercise:Exercise={id:`exercise-${selected.id}`,goal_id:'goal',topic_id:selected.id,kind:'short_answer',prompt:`Вопрос ${selected.id}`,solution:'Ответ',created_at:'t'};
      snapshot.exercises.push(exercise);
      return exercise;
    });
  });

  it('selects distinct studied topics with fewer previous attempts',()=>{
    snapshot.exercises.push({id:'old',goal_id:'goal',topic_id:'a',kind:'short_answer',prompt:'',solution:'',created_at:'t'});
    snapshot.attempts.push({id:'attempt',exercise_id:'old',answer:'',reasoning:'',evaluation:evaluated,created_at:'t'});
    expect(selectReviewTopics(snapshot.topics,snapshot.exercises,snapshot.attempts).map(item=>item.id)).toEqual(['b','c','a']);
    expect(()=>selectReviewTopics([topic('a',0)],[],[])).toThrow('хотя бы две темы');
  });

  it('persists a complete set and requires every answer before completion',async()=>{
    const runId=await startReview('goal',snapshot.topics,{provider:'codex',model:'default'});
    const run=latestReviewRun(snapshot,'goal');
    expect(runId).toBe('run-id:review');
    expect(run?.status).toBe('waiting_for_user');
    expect(run?.retry_count).toBe(0);
    expect(JSON.parse(run!.output).exerciseIds).toEqual(['exercise-a','exercise-b','exercise-c']);
    expect(fake.generateExercise.mock.calls.map(([,selected,,format])=>[selected.id,format])).toEqual([['a','retrieval_card'],['b','retrieval_card'],['c','retrieval_card']]);
    await expect(finishReview(runId)).rejects.toThrow('Сначала ответьте');
    snapshot.attempts.push({id:'draft',exercise_id:snapshot.exercises[0].id,answer:'мой ответ',reasoning:'',evaluation:'',created_at:'t'});
    await expect(finishReview(runId)).rejects.toThrow('Сначала ответьте');
    for(const exercise of snapshot.exercises) snapshot.attempts.push({id:`attempt-${exercise.id}`,exercise_id:exercise.id,answer:'мой ответ',reasoning:'',evaluation:evaluated,created_at:'t'});
    await finishReview(runId);
    expect(latestReviewRun(snapshot,'goal')?.status).toBe('completed');
  });

  it('resumes only missing questions after a failed generation',async()=>{
    fake.generateExercise.mockImplementationOnce(async(_goalId:string,selected:Topic)=>{
      const exercise:Exercise={id:`exercise-${selected.id}`,goal_id:'goal',topic_id:selected.id,kind:'short_answer',prompt:'Вопрос',solution:'Ответ',created_at:'t'};
      snapshot.exercises.push(exercise);return exercise;
    }).mockRejectedValueOnce(new Error('Провайдер недоступен'));
    await expect(startReview('goal',snapshot.topics,{provider:'codex',model:'default'})).rejects.toThrow('Провайдер недоступен');
    expect(latestReviewRun(snapshot,'goal')?.status).toBe('failed');
    expect(JSON.parse(latestReviewRun(snapshot,'goal')!.output).exerciseIds).toEqual(['exercise-a']);
    fake.generateExercise.mockClear();
    fake.generateExercise.mockImplementation(async(_goalId:string,selected:Topic)=>{
      const exercise:Exercise={id:`exercise-${selected.id}`,goal_id:'goal',topic_id:selected.id,kind:'short_answer',prompt:'Вопрос',solution:'Ответ',created_at:'t'};
      snapshot.exercises.push(exercise);return exercise;
    });
    await resumeReview('run-id:review',{provider:'codex',model:'default'});
    expect(fake.generateExercise.mock.calls.map(([,selected])=>selected.id)).toEqual(['b','c']);
    expect(latestReviewRun(snapshot,'goal')?.status).toBe('waiting_for_user');
    expect(latestReviewRun(snapshot,'goal')?.retry_count).toBe(1);
  });
});
