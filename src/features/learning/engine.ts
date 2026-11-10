import { api, id, now } from '../../lib/api';
import { transitionWorkflow, type WorkflowStatus } from '../../lib/workflow';
import type { AgentResult, Operation, Provider, Snapshot, Topic } from '../../lib/types';

export type Config = { provider:Provider; model:string; skillOverrides?:Record<string,string> };
type Probe = { questions:{question:string;rationale:string;strand:string}[];context:string };
type Evaluation = { observations:{strand:string;observed:string;inferred:string;gap:string}[];startingPoint:string;summary:string };
type Curriculum = { approach:string;topics:{id:string;title:string;description:string;prerequisites:string[];objectives:string[];difficulty:string}[] };
type Teaching = { message:string;question:string;questionType:'predict'|'check'|'clarify';topicId:string;phase:'teach'|'remediate' };
type Practice = { kind:string;prompt:string;solution:string;topicId:string };
type PracticeEvaluation = { verdict:string;feedback:string;misconception:string;recommendation:string };
type Extraction = { propositions:{id:string;name:string;statement:string;sourceMessageId?:string|null}[];chains:{premises:string[];conclusion:string}[] };
type Audit = { links:{id:string;linkTo:string|null}[] };

export function parseStringList(value:string):string[] {
  try {
    const parsed:unknown=JSON.parse(value);
    return Array.isArray(parsed)&&parsed.every(item=>typeof item==='string')?parsed:[];
  } catch { return []; }
}

function savedProbeEvaluation(step:Snapshot['workflow_executions'][number]|undefined,answers:{question:string;answer:string;reasoning:string}[]):AgentResult<Evaluation>|null {
  if(step?.status!=='completed'||step.input!==JSON.stringify({answers})||!step.output) return null;
  try {
    const value:unknown=JSON.parse(step.output);
    if(!value||typeof value!=='object'||!('summary' in value)||typeof value.summary!=='string'||!('startingPoint' in value)||typeof value.startingPoint!=='string'||!('observations' in value)||!Array.isArray(value.observations)) return null;
    return value as AgentResult<Evaluation>;
  } catch { return null; }
}

export function orderCurriculumTopics<T extends {id:string;prerequisites:string[]}>(topics:T[]):T[] {
  const ids=new Set(topics.map(topic=>topic.id));
  if(ids.size!==topics.length) throw new Error('Учебный план содержит повторяющиеся ID тем');
  for(const topic of topics) for(const prerequisite of topic.prerequisites) {
    if(!ids.has(prerequisite)) throw new Error(`Тема «${topic.id}» ссылается на отсутствующую предпосылку`);
    if(prerequisite===topic.id) throw new Error(`Тема «${topic.id}» не может зависеть от себя`);
  }
  const remaining=new Set(ids),ordered:T[]=[];
  while(remaining.size) {
    const next=topics.find(topic=>remaining.has(topic.id)&&topic.prerequisites.every(id=>!remaining.has(id)));
    if(!next) throw new Error('Учебный план содержит цикл предпосылок');
    ordered.push(next);remaining.delete(next.id);
  }
  return ordered;
}

const skill:Record<Operation,string> = {probe:'knowledge-probe',evaluate_probe:'knowledge-probe',curriculum:'curriculum-planner',teach:'socratic-teacher',practice:'exercise-generator',evaluate_practice:'answer-evaluator',extract:'knowledge-extractor',audit:'knowledge-auditor',validate:''};

async function call<T>(config:Config,operation:Operation,input:unknown,sessionId?:string):Promise<AgentResult<T>> {
  const snapshot = await api.snapshot();
  const threadKey=`thread:${config.provider}:${sessionId}:${operation}`;
  const threadId = sessionId ? snapshot.preferences.find(p=>p.key===threadKey)?.value : undefined;
  const started = Date.now();
  try {
    const selected = config.skillOverrides?.[operation];
    const skillName = selected && /^[a-z][a-z0-9-]{0,60}$/.test(selected) ? selected : skill[operation];
    const result = await api.agent<T>(operation,config.provider,config.model,input,skillName,threadId);
    if(sessionId && result._execution.sessionId) await api.save('preferences',{key:threadKey,value:result._execution.sessionId});
    await api.save('agent_executions',{id:id(),session_id:sessionId??'',provider:config.provider,model:config.model,operation,status:'completed',duration_ms:String(result._execution.durationMs),metadata:JSON.stringify({usage:result._execution.usage??null}),created_at:now()});
    return result;
  } catch(error) {
    await api.save('agent_executions',{id:id(),session_id:sessionId??'',provider:config.provider,model:config.model,operation,status:'failed',duration_ms:String(Date.now()-started),metadata:'{}',created_at:now()}).catch(()=>{});
    throw error;
  }
}

async function workflow(goalId:string,stepId:string,status:WorkflowStatus,input:unknown,output:unknown=null,error='',sessionId?:string) {
  const prerequisite=stepId==='evaluation'?'probe':stepId==='curriculum'?'evaluation':stepId==='teach'?'curriculum':null;
  await transitionWorkflow({goalId,stepId,status,input,output,error,sessionId,
    instanceId:stepId==='teach'?sessionId:undefined,
    dependencies:prerequisite?[`${goalId}:${prerequisite}`]:[],metadata:{workflow:'learning'},
  });
}

async function message(sessionId:string,role:'user'|'assistant',content:string,kind='text') {
  const record={id:id(),session_id:sessionId,role,content,kind,created_at:now()};
  await api.save('messages',record); return record;
}

export async function startGoal(title:string,config:Config) {
  const goalId=id(), sessionId=id(), timestamp=now();
  await api.save('learning_goals',{id:goalId,title,created_at:timestamp,updated_at:timestamp});
  await api.save('sessions',{id:sessionId,goal_id:goalId,phase:'probe',title,created_at:timestamp,updated_at:timestamp});
  await message(sessionId,'user',title,'goal');
  await workflow(goalId,'probe','running',{title});
  try {
    const result=await call<Probe>(config,'probe',{goal:title},sessionId);
    await workflow(goalId,'probe','waiting_for_user',{title},result);
    for(const q of result.questions) await message(sessionId,'assistant',q.question,'diagnostic');
  } catch(e) { await workflow(goalId,'probe','failed',{title},null,String(e)); throw e; }
  return {goalId,sessionId};
}

export async function resumeProbe(goalId:string,sessionId:string,config:Config) {
  const snap=await api.snapshot(); const goal=snap.learning_goals.find(g=>g.id===goalId); if(!goal) throw new Error('Цель не найдена');
  await workflow(goalId,'probe','running',{title:goal.title});
  try {
    const result=await call<Probe>(config,'probe',{goal:goal.title},sessionId);
    await workflow(goalId,'probe','waiting_for_user',{title:goal.title},result);
    for(const q of result.questions) await message(sessionId,'assistant',q.question,'diagnostic');
  } catch(e) { await workflow(goalId,'probe','failed',{title:goal.title},null,String(e)); throw e; }
}

export async function finishProbe(goalId:string,sessionId:string,answers:{question:string;answer:string;reasoning:string}[],config:Config) {
  const snap=await api.snapshot(); const goal=snap.learning_goals.find(g=>g.id===goalId); if(!goal) throw new Error('Goal missing');
  for(const a of answers) {
    const saved=snap.diagnostic_answers.find(item=>item.session_id===sessionId&&item.question===a.question);
    if(!saved || saved.answer!==a.answer || saved.reasoning!==a.reasoning) {
      await api.save('diagnostic_answers',{id:saved?.id??id(),session_id:sessionId,question:a.question,answer:a.answer,reasoning:a.reasoning,evaluation:saved?.evaluation??'',created_at:saved?.created_at??now()});
    }
    const content=`${a.question}\n\n${a.answer}\n\nХод мысли: ${a.reasoning}`;
    if(!snap.messages.some(item=>item.session_id===sessionId&&item.kind==='diagnostic-answer'&&item.content===content)) await message(sessionId,'user',content,'diagnostic-answer');
  }
  const probeStep=snap.workflow_executions.find(item=>item.id===`${goalId}:probe`);
  await workflow(goalId,'probe','completed',{answers},probeStep?.output?JSON.parse(probeStep.output):{answered:answers.length});
  let evaluation=savedProbeEvaluation(snap.workflow_executions.find(item=>item.id===`${goalId}:evaluation`),answers);
  if(!evaluation) {
    await workflow(goalId,'evaluation','running',{answers});
    try { evaluation=await call<Evaluation>(config,'evaluate_probe',{goal:goal.title,answers},sessionId); }
    catch(e) { await workflow(goalId,'evaluation',String(e).includes('отменён')?'cancelled':'failed',{answers},null,String(e)); throw e; }
    await workflow(goalId,'evaluation','completed',{answers},evaluation);
  }
  if(!snap.messages.some(item=>item.session_id===sessionId&&item.kind==='probe-evaluation'&&item.content===evaluation.summary)) await message(sessionId,'assistant',evaluation.summary,'probe-evaluation');
  await workflow(goalId,'curriculum','running',{evaluation});
  let curriculum:AgentResult<Curriculum>;
  try {
    curriculum=await call<Curriculum>(config,'curriculum',{goal:goal.title,answers,evaluation},sessionId);
    curriculum={...curriculum,topics:orderCurriculumTopics(curriculum.topics)};
  }
  catch(e) { await workflow(goalId,'curriculum',String(e).includes('отменён')?'cancelled':'failed',{evaluation},null,String(e)); throw e; }
  // A previous attempt may have stopped while saving topics. Replace that partial plan before writing the new one.
  for(const previous of snap.curricula.filter(item=>item.goal_id===goalId)) await api.remove('curricula',previous.id);
  const curriculumId=id(); await api.save('curricula',{id:curriculumId,goal_id:goalId,created_at:now(),updated_at:now()});
  const ids=new Map(curriculum.topics.map(t=>[t.id,id()]));
  const conceptIds=new Map(curriculum.topics.map(t=>[t.id,snap.knowledge_nodes.find(n=>n.goal_id===goalId&&n.kind==='concept'&&n.name.toLocaleLowerCase('ru')===t.title.toLocaleLowerCase('ru'))?.id??id()]));
  for(const [position,t] of curriculum.topics.entries()) {
    const topicId=ids.get(t.id),conceptId=conceptIds.get(t.id);
    if(!topicId||!conceptId) throw new Error('Не удалось сопоставить темы учебного плана');
    await api.save('topics',{id:topicId,curriculum_id:curriculumId,title:t.title,description:t.description,prerequisites:JSON.stringify(t.prerequisites.map(p=>ids.get(p)).filter(Boolean)),objectives:JSON.stringify(t.objectives),difficulty:t.difficulty,status:'pending',position:String(position)});
    if(!snap.knowledge_nodes.some(n=>n.id===conceptId)) await api.save('knowledge_nodes',{id:conceptId,goal_id:goalId,kind:'concept',name:t.title,statement:t.description,source_session_id:sessionId,source_message_id:'',created_at:now()});
    await api.save('knowledge_topic_links',{node_id:conceptId,topic_id:topicId});
  }
  for(const t of curriculum.topics) for(const prerequisite of t.prerequisites) {
    const premise=conceptIds.get(prerequisite),conclusion=conceptIds.get(t.id);
    if(premise&&conclusion&&premise!==conclusion) await api.save('knowledge_edges',{id:id(),goal_id:goalId,premises:JSON.stringify([premise]),conclusion_id:conclusion,source_session_id:sessionId,created_at:now()});
  }
  await workflow(goalId,'curriculum','completed',{evaluation},curriculum);
  await api.save('sessions',{...snap.sessions.find(s=>s.id===sessionId)!,phase:'learning',updated_at:now()});
  await message(sessionId,'assistant',curriculum.approach,'curriculum');
}

export async function startLearningSession(goalId:string) {
  const snap=await api.snapshot();
  const goal=snap.learning_goals.find(item=>item.id===goalId);
  const curriculumStep=snap.workflow_executions.find(item=>item.id===`${goalId}:curriculum`);
  if(!goal || !snap.curricula.some(item=>item.goal_id===goalId) || curriculumStep&&curriculumStep.status!=='completed') throw new Error('Сначала завершите диагностику и создайте план');
  const sessionId=id(), timestamp=now();
  await api.save('sessions',{id:sessionId,goal_id:goalId,phase:'learning',title:goal.title,created_at:timestamp,updated_at:timestamp});
  await api.save('learning_goals',{...goal,updated_at:timestamp});
  return sessionId;
}

export async function teach(goalId:string,sessionId:string,topic:Topic,config:Config,answer?:string) {
  const snap=await api.snapshot(); const goal=snap.learning_goals.find(g=>g.id===goalId); if(!goal) throw new Error('Goal missing');
  if(answer) await message(sessionId,'user',answer,'teaching-answer');
  const sessionIds=new Set(snap.sessions.filter(item=>item.goal_id===goalId).map(item=>item.id));
  const history=snap.messages.filter(item=>sessionIds.has(item.session_id)).sort((a,b)=>a.created_at.localeCompare(b.created_at)).slice(-24).map(item=>({role:item.role,content:item.content,kind:item.kind}));
  const recordedClaims=snap.knowledge_nodes.filter(item=>item.goal_id===goalId&&item.kind==='proposition').slice(-20).map(item=>item.statement);
  await workflow(goalId,'teach','running',{topicId:topic.id,answer:answer??''},null,'',sessionId);
  let result:AgentResult<Teaching>;
  try { result=await call<Teaching>(config,'teach',{goal:goal.title,topic:{id:topic.id,title:topic.title,description:topic.description,objectives:parseStringList(topic.objectives)},history,recordedClaims,answer:answer??null},sessionId); }
  catch(e) { await workflow(goalId,'teach',String(e).includes('отменён')?'cancelled':'failed',{topicId:topic.id,answer:answer??''},null,String(e),sessionId); throw e; }
  const text=`${result.message}\n\n**${result.questionType==='predict'?'Предположите':'Проверьте понимание'}:** ${result.question}`;
  const created=await message(sessionId,'assistant',text,'teaching');
  await workflow(goalId,'teach','waiting_for_user',{topicId:topic.id,answer:answer??''},result,'',sessionId);
  await api.save('topics',{...topic,status:'in_progress',position:String(topic.position)});
  const session=snap.sessions.find(item=>item.id===sessionId);
  if(session) await api.save('sessions',{...session,updated_at:now()});
  await extract(goalId,sessionId,topic.id,[created],config).catch(()=>{});
}

async function extract(goalId:string,sessionId:string,topicId:string,messages:{id:string;content:string}[],config:Config) {
  const snap=await api.snapshot();
  const extracted=await call<Extraction>(config,'extract',{messages:messages.map(m=>({messageId:m.id,text:m.content})),existing:snap.knowledge_nodes.filter(n=>n.goal_id===goalId).map(n=>({id:n.id,statement:n.statement}))},sessionId);
  if(!extracted.propositions.length) return;
  const existing=snap.knowledge_nodes.filter(n=>n.goal_id===goalId);
  const audit=await call<Audit>(config,'audit',{propositions:extracted.propositions,existing:existing.map(n=>({id:n.id,statement:n.statement}))},sessionId);
  const links=new Map(audit.links.map(l=>[l.id,l.linkTo])); const ids=new Map<string,string>();
  for(const p of extracted.propositions) {
    const linked=links.get(p.id); const valid=linked&&existing.some(n=>n.id===linked);
    const nodeId=valid?linked!:id(); ids.set(p.id,nodeId);
    const sourceMessageId=p.sourceMessageId&&messages.some(m=>m.id===p.sourceMessageId)?p.sourceMessageId:messages[0].id;
    if(!valid) await api.save('knowledge_nodes',{id:nodeId,goal_id:goalId,kind:'proposition',name:p.name,statement:p.statement,source_session_id:sessionId,source_message_id:sourceMessageId,created_at:now()});
    await api.save('knowledge_topic_links',{node_id:nodeId,topic_id:topicId});
    if(!snap.knowledge_provenance.some(v=>v.node_id===nodeId&&v.message_id===sourceMessageId)) await api.save('knowledge_provenance',{id:id(),node_id:nodeId,session_id:sessionId,message_id:sourceMessageId,created_at:now()});
  }
  for(const chain of extracted.chains) { const premises=chain.premises.map(p=>ids.get(p)).filter((v):v is string=>!!v); const conclusion=ids.get(chain.conclusion); if(!premises.length||!conclusion) continue; const key=`${[...premises].sort().join('+')}>${conclusion}`; if(snap.knowledge_edges.some(e=>`${JSON.parse(e.premises).sort().join('+')}>${e.conclusion_id}`===key)) continue; await api.save('knowledge_edges',{id:id(),goal_id:goalId,premises:JSON.stringify(premises),conclusion_id:conclusion,source_session_id:sessionId,created_at:now()}); }
}

export async function generateExercise(goalId:string,topic:Topic,config:Config,format?:'retrieval_card') {
  const snap=await api.snapshot(); const goal=snap.learning_goals.find(g=>g.id===goalId); if(!goal) throw new Error('Goal missing');
  const topicExerciseIds=new Set(snap.exercises.filter(item=>item.goal_id===goalId&&item.topic_id===topic.id).map(item=>item.id));
  const attempts=snap.attempts.filter(item=>topicExerciseIds.has(item.exercise_id)).slice(-8).map(item=>({answer:item.answer,evaluation:item.evaluation}));
  const selectedConfig=format==='retrieval_card'&&!config.skillOverrides?.practice
    ? {...config,skillOverrides:{...config.skillOverrides,practice:'retrieval-review'}} : config;
  const result=await call<Practice>(selectedConfig,'practice',{goal:goal.title,topic,attempts,format});
  const exercise={id:id(),goal_id:goalId,topic_id:topic.id,kind:result.kind,prompt:result.prompt,solution:result.solution,created_at:now()};
  await api.save('exercises',exercise); return exercise;
}

export async function evaluateExercise(exercise:{id:string;prompt:string;solution:string},answer:string,reasoning:string,config:Config) {
  if(!answer.trim()) throw new Error('Сначала напишите ответ');
  // The answer may already include an explanation. Keep that text available to
  // the evaluator without pretending the learner filled a separate field.
  const separateReasoning=reasoning.trim();
  const result=await call<PracticeEvaluation>(config,'evaluate_practice',{problem:exercise.prompt,solution:exercise.solution,answer,reasoning:separateReasoning||answer.trim(),reasoningSource:separateReasoning?'separate':'answer'});
  await api.save('attempts',{id:id(),exercise_id:exercise.id,answer,reasoning,evaluation:JSON.stringify(result),created_at:now()});
  return result;
}

export function activeGoal(snap:Snapshot,goalId:string|null) { return goalId===''?undefined:snap.learning_goals.find(g=>g.id===goalId)??snap.learning_goals.at(-1); }
