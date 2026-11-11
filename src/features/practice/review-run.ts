import { api, id } from '../../lib/api';
import { transitionWorkflow } from '../../lib/workflow';
import type { Exercise, Snapshot, Topic, WorkflowExecution } from '../../lib/types';
import { generateExercise, type Config } from '../learning/engine';
import { parsePracticeFeedback } from './review';

type ReviewInput={topicIds:string[]};
type ReviewOutput={exerciseIds:string[];reviewedAt?:string};

function parseList(value:string,field:string):string[] {
  try {
    const parsed:unknown=JSON.parse(value);
    const ids=parsed&&typeof parsed==='object'&&field in parsed?(parsed as Record<string,unknown>)[field]:null;
    if(Array.isArray(ids)&&ids.every(item=>typeof item==='string')) return ids;
  } catch { /* Reject damaged persisted state. */ }
  throw new Error('Сохранённый набор повторения повреждён');
}

export function latestReviewRun(snapshot:Snapshot,goalId:string):WorkflowExecution|undefined {
  return snapshot.workflow_executions.filter(item=>item.goal_id===goalId&&item.step_id==='review').at(-1);
}

export function selectReviewTopics(topics:Topic[],exercises:Exercise[],attempts:Snapshot['attempts'],count=3):Topic[] {
  const studied=topics.filter(topic=>topic.status==='in_progress'||topic.status==='completed');
  if(studied.length<2) throw new Error('Для итогового повторения начните изучать хотя бы две темы');
  const attemptCount=new Map<string,number>();
  const exerciseTopics=new Map(exercises.map(exercise=>[exercise.id,exercise.topic_id]));
  for(const attempt of attempts) {
    if(!parsePracticeFeedback(attempt.evaluation)) continue;
    const topicId=exerciseTopics.get(attempt.exercise_id);
    if(topicId) attemptCount.set(topicId,(attemptCount.get(topicId)??0)+1);
  }
  return studied.slice().sort((a,b)=>(attemptCount.get(a.id)??0)-(attemptCount.get(b.id)??0)||a.position-b.position).slice(0,count);
}

function reviewState(run:WorkflowExecution):{input:ReviewInput;output:ReviewOutput;runId:string} {
  const topicIds=parseList(run.input,'topicIds');
  const exerciseIds=run.output?parseList(run.output,'exerciseIds'):[];
  if(topicIds.length<2||exerciseIds.length>topicIds.length||new Set(topicIds).size!==topicIds.length) throw new Error('Сохранённый набор повторения повреждён');
  return {input:{topicIds},output:{exerciseIds},runId:run.id.slice(0,-':review'.length)};
}

export async function startReview(goalId:string,topics:Topic[],config:Config):Promise<string> {
  const snapshot=await api.snapshot();
  const curriculumIds=new Set(snapshot.curricula.filter(item=>item.goal_id===goalId).map(item=>item.id));
  const selected=selectReviewTopics(topics.filter(topic=>curriculumIds.has(topic.curriculum_id)),snapshot.exercises,snapshot.attempts);
  const runId=id(),input:ReviewInput={topicIds:selected.map(topic=>topic.id)};
  await transitionWorkflow({goalId,instanceId:runId,stepId:'review',status:'running',input,output:{exerciseIds:[]},metadata:{workflow:'learning',kind:'mixed_review'}});
  await resumeReview(`${runId}:review`,config);
  return `${runId}:review`;
}

export async function resumeReview(runId:string,config:Config):Promise<void> {
  const snapshot=await api.snapshot();
  const run=snapshot.workflow_executions.find(item=>item.id===runId&&item.step_id==='review');
  if(!run) throw new Error('Набор повторения не найден');
  const {input,output,runId:instanceId}=reviewState(run);
  if(run.status==='waiting_for_user') return;
  if(run.status==='completed') throw new Error('Повторение уже завершено');
  if(!['running','failed','cancelled'].includes(run.status)) throw new Error('Неизвестный статус повторения');
  if(output.exerciseIds.some(exerciseId=>!snapshot.exercises.some(exercise=>exercise.id===exerciseId&&exercise.goal_id===run.goal_id))) throw new Error('Задание повторения не найдено');
  if(run.status!=='running') await transitionWorkflow({goalId:run.goal_id,instanceId,stepId:'review',status:'running',input,output,metadata:{workflow:'learning',kind:'mixed_review'}});
  try {
    for(let index=output.exerciseIds.length;index<input.topicIds.length;index++) {
      const topic=snapshot.topics.find(item=>item.id===input.topicIds[index]);
      if(!topic) throw new Error('Тема повторения больше не существует');
      const exercise=await generateExercise(run.goal_id,topic,config,'retrieval_card');
      output.exerciseIds.push(exercise.id);
      await transitionWorkflow({goalId:run.goal_id,instanceId,stepId:'review',status:'running',input,output,progressUpdate:true,metadata:{workflow:'learning',kind:'mixed_review'}});
    }
    await transitionWorkflow({goalId:run.goal_id,instanceId,stepId:'review',status:'waiting_for_user',input,output,metadata:{workflow:'learning',kind:'mixed_review'}});
  } catch(error) {
    await transitionWorkflow({goalId:run.goal_id,instanceId,stepId:'review',status:String(error).includes('отменён')?'cancelled':'failed',input,output,error:String(error),metadata:{workflow:'learning',kind:'mixed_review'}});
    throw error;
  }
}

export async function finishReview(runId:string):Promise<void> {
  const snapshot=await api.snapshot();
  const run=snapshot.workflow_executions.find(item=>item.id===runId&&item.step_id==='review');
  if(!run) throw new Error('Набор повторения не найден');
  const {input,output,runId:instanceId}=reviewState(run);
  if(run.status!=='waiting_for_user') throw new Error('Повторение ещё не готово к завершению');
  if(output.exerciseIds.length!==input.topicIds.length||output.exerciseIds.some(exerciseId=>!snapshot.attempts.some(attempt=>attempt.exercise_id===exerciseId&&parsePracticeFeedback(attempt.evaluation)))) throw new Error('Сначала ответьте на все вопросы повторения');
  await transitionWorkflow({goalId:run.goal_id,instanceId,stepId:'review',status:'completed',input,output:{...output,reviewedAt:new Date().toISOString()},metadata:{workflow:'learning',kind:'mixed_review'}});
}

export function reviewExercises(run:WorkflowExecution,snapshot:Snapshot):Exercise[] {
  const {output}=reviewState(run);
  return output.exerciseIds.map(exerciseId=>{
    const exercise=snapshot.exercises.find(item=>item.id===exerciseId&&item.goal_id===run.goal_id);
    if(!exercise) throw new Error('Задание повторения не найдено');
    return exercise;
  });
}
