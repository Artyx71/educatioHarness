import { useState } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { Markdown } from '../../components/Markdown';
import { exerciseLabel, verdictLabel } from '../../lib/i18n';
import type { Snapshot, Topic } from '../../lib/types';
import { evaluateExercise, type Config } from '../learning/engine';
import { AnswerInput } from './AnswerInput';
import { finishReview, latestReviewRun, resumeReview, reviewExercises, startReview } from './review-run';

type Props={snap:Snapshot;goalId:string;topics:Topic[];config:Config;busy:string;run:(label:string,fn:()=>Promise<unknown>)=>void;onClose:()=>void};
type Feedback={verdict:string;feedback:string;misconception:string;recommendation:string};

export function ReviewRun({snap,goalId,topics,config,busy,run,onClose}:Props) {
  const [runId,setRunId]=useState<string|null>(null);
  const [showCompleted,setShowCompleted]=useState(false);
  const [index,setIndex]=useState<number|null>(null);
  const [answer,setAnswer]=useState('');
  const [reasoning,setReasoning]=useState('');
  const current=runId?snap.workflow_executions.find(item=>item.id===runId)??latestReviewRun(snap,goalId):latestReviewRun(snap,goalId);
  let exercises:Snapshot['exercises']=[],damaged=false;
  try { if(current) exercises=reviewExercises(current,snap); } catch { damaged=true; }
  const firstUnanswered=exercises.findIndex(exercise=>!snap.attempts.some(attempt=>attempt.exercise_id===exercise.id));
  const activeIndex=Math.min(index??(firstUnanswered<0?(current?.status==='completed'?0:Math.max(0,exercises.length-1)):firstUnanswered),Math.max(0,exercises.length-1));
  const exercise=exercises[activeIndex];
  const attempt=exercise?snap.attempts.filter(item=>item.exercise_id===exercise.id).at(-1):undefined;
  let feedback:Feedback|null=null;
  if(attempt) try { feedback=JSON.parse(attempt.evaluation) as Feedback; } catch { /* The answer remains recorded. */ }
  const start=()=>run('Подготовка итогового повторения',async()=>{const next=await startReview(goalId,topics,config);setRunId(next);setShowCompleted(false);setIndex(0);setAnswer('');setReasoning('')});
  const moveNext=()=>{setIndex(activeIndex+1);setAnswer('');setReasoning('')};
  const canStart=topics.filter(topic=>topic.status==='in_progress'||topic.status==='completed').length>=2;
  return <div className="page practice-page review-page">
    <button className="text-button" onClick={onClose}><ArrowLeft size={14}/> Обычная практика</button>
    <div className="section-head"><div><span className="eyebrow">ИТОГОВОЕ ПОВТОРЕНИЕ</span><h1>Проверьте связи между темами.</h1><p>Несколько вопросов без подсказки о теме. Сначала свой ответ, затем разбор.</p></div></div>
    {!current||current.status==='completed'&&!showCompleted?<div className="panel review-intro">{current?.status==='completed'&&<p>Предыдущий набор завершён: {exercises.length} вопросов и {exercises.filter(item=>snap.attempts.some(attempt=>attempt.exercise_id===item.id)).length} сохранённых ответов.</p>}<p>Набор охватит до трёх разных изученных тем. Вопросы создаёт модель; её оценка не заменяет объективную проверку.</p>{current?.status==='completed'&&<button className="button secondary" disabled={damaged} onClick={()=>{setIndex(0);setShowCompleted(true)}}>Посмотреть ответы</button>}<button className="button primary" disabled={!!busy||!canStart} onClick={start}>Начать новый набор <ArrowRight size={15}/></button>{!canStart&&<p className="muted">Сначала начните изучать хотя бы две темы.</p>}{busy&&<p className="muted" role="status">{busy}… Это может занять несколько минут.</p>}</div>:
    damaged?<div className="panel empty-state">Не удалось прочитать сохранённый набор. Можно начать новый набор, не удаляя прежние ответы. <button className="button secondary" disabled={!!busy||!canStart} onClick={start}>Новый набор</button></div>:
    current.status!=='waiting_for_user'&&current.status!=='completed'?<div className="panel review-intro"><p>{current.status==='failed'||current.status==='cancelled'?'Подготовка прервалась. Уже созданные вопросы сохранены.':'Подготовка вопросов прервалась при закрытии приложения.'}</p><p className="muted">Готово: {exercises.length} из {JSON.parse(current.input).topicIds.length}.</p><button className="button secondary" disabled={!!busy} onClick={()=>run('Продолжение итогового повторения',()=>resumeReview(current.id,config))}>Продолжить подготовку</button><button className="button ghost" disabled={!!busy} onClick={start}>Новый набор</button>{busy&&<p className="muted" role="status">{busy}… Это может занять несколько минут.</p>}</div>:
    !exercise?<div className="panel empty-state">Вопросы не найдены. Вернитесь к обычной практике или создайте новый набор.</div>:
    <div className="practice-layout"><div className="panel review-progress"><span className="eyebrow">ВОПРОСЫ</span>{exercises.map((item,number)=><button key={item.id} className={number===activeIndex?'active':''} disabled={number>activeIndex&&!snap.attempts.some(attempt=>attempt.exercise_id===item.id)} onClick={()=>{setIndex(number);setAnswer('');setReasoning('')}}><span>{String(number+1).padStart(2,'0')}</span><span>{snap.attempts.some(attempt=>attempt.exercise_id===item.id)?'Ответ сохранён':'Ожидает ответа'}</span></button>)}<p className="muted">Тема откроется после ответа.</p></div><div className="panel exercise-panel study-card"><span className="eyebrow">ВОПРОС {activeIndex+1} / {exercises.length}</span><h2>{feedback?'Разбор ответа':'Вспомните и примените'}</h2><Markdown>{exercise.prompt}</Markdown>{feedback?<div className="feedback"><span className={`verdict ${feedback.verdict}`}>{verdictLabel[feedback.verdict]??feedback.verdict}</span><p className="muted">Тема: {topics.find(topic=>topic.id===exercise.topic_id)?.title??'тема из плана'}</p><strong>Ваш ответ</strong><Markdown>{attempt?.answer??''}</Markdown>{attempt?.reasoning&&<><strong>Ваш ход мысли</strong><Markdown>{attempt.reasoning}</Markdown></>}<Markdown>{feedback.feedback}</Markdown>{feedback.misconception&&<p><strong>Возможное заблуждение:</strong> {feedback.misconception}</p>}<p>{feedback.recommendation}</p><details><summary>Вариант решения модели</summary><Markdown>{exercise.solution}</Markdown></details>{activeIndex<exercises.length-1?<button className="button secondary" onClick={moveNext}>Следующий вопрос <ArrowRight size={15}/></button>:current.status==='completed'?<button className="button secondary" onClick={()=>setShowCompleted(false)}>К сводке</button>:<button className="button primary" disabled={!!busy} onClick={()=>run('Завершение повторения',()=>finishReview(current.id))}>Завершить повторение</button>}</div>:attempt?<div className="feedback"><p>Ответ сохранён, но разбор не удалось прочитать. Вы можете продолжить.</p>{activeIndex<exercises.length-1?<button className="button secondary" onClick={moveNext}>Следующий вопрос</button>:current.status==='completed'?<button className="button secondary" onClick={()=>setShowCompleted(false)}>К сводке</button>:<button className="button primary" onClick={()=>run('Завершение повторения',()=>finishReview(current.id))}>Завершить</button>}</div>:<><AnswerInput kind={exercise.kind} topic="" prompt={exercise.prompt} value={answer} onChange={setAnswer}/><textarea value={reasoning} onChange={event=>setReasoning(event.target.value)} placeholder="Как вы рассуждали?" aria-label="Ход мысли"/><button className="button primary" disabled={!answer.trim()||!!busy} onClick={()=>run('Проверка ответа',()=>evaluateExercise(exercise,answer,reasoning,config))}>Проверить ответ</button></>}{busy&&<div className="loading"><LoaderCircle className="spin" size={18}/>{busy}…</div>}<span className="review-kind">{exerciseLabel[exercise.kind]??exercise.kind}</span></div></div>}
  </div>;
}
