import { lazy, Suspense, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { open, save, confirm } from '@tauri-apps/plugin-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, BrainCircuit, Dumbbell, Settings2, ArrowRight, PlugZap, LoaderCircle, Plus, LogOut, Search, Network } from 'lucide-react';
import { api, cancelActiveAgent } from '../lib/api';
import brandIcon from '../../src-tauri/icons/icon.svg';
import type { AuthStatus, Exercise, Provider, Snapshot, Topic } from '../lib/types';
import { useUi } from '../stores/ui';
import { activeGoal, evaluateExercise, finishProbe, generateExercise, orderCurriculumTopics, parseStringList, resumeProbe, startGoal, startLearningSession, teach, type Config } from '../features/learning/engine';
import { SkillSettings, parseSkillOverrides } from '../features/settings/SkillSettings';
import { Markdown } from '../components/Markdown';
import { AnswerInput } from '../features/practice/AnswerInput';
import { reviewSuggestion } from '../features/practice/review';
import { activitySummary } from '../features/profile/activity';
import { ProfileSettings } from '../features/profile/ProfileSettings';
import { phaseLabel, exerciseLabel, verdictLabel } from '../lib/i18n';

const empty:Snapshot={learning_goals:[],sessions:[],messages:[],diagnostic_answers:[],curricula:[],topics:[],exercises:[],attempts:[],knowledge_nodes:[],knowledge_edges:[],knowledge_topic_links:[],knowledge_provenance:[],workflow_executions:[],agent_executions:[],preferences:[]};
const Graph = lazy(() => import('../features/knowledge-graph/Graph').then(module => ({default:module.Graph})));
const ReviewRun = lazy(() => import('../features/practice/ReviewRun').then(module => ({default:module.ReviewRun})));
const defaultApiModel='gpt-6.1-sol';
const mobileRuntime=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export default function App() {
  const qc=useQueryClient(); const ui=useUi();
  const {data:snap=empty,error:dbError}=useQuery({queryKey:['snapshot'],queryFn:api.snapshot});
  const {data:auth,error:authError,refetch:refreshAuth}=useQuery({queryKey:['auth'],queryFn:api.auth,refetchInterval:6000});
  const [busy,setBusy]=useState(''); const [error,setError]=useState(''); const [sessionSearch,setSessionSearch]=useState('');
  const [progressChars,setProgressChars]=useState(0);
  useEffect(()=>{let closed=false;let unlisten:(()=>void)|undefined;void listen<{requestId:string;chars:number}>('agent-progress',event=>setProgressChars(event.payload.chars)).then(fn=>{if(closed)fn();else unlisten=fn});return()=>{closed=true;unlisten?.()}},[]);
  const [provider,setProvider]=useState<Provider>('codex'); const [model,setModel]=useState('');
  const goal=activeGoal(snap,ui.goalId); const session=ui.sessionId===''?undefined:snap.sessions.find(s=>s.id===ui.sessionId)??snap.sessions.filter(s=>s.goal_id===goal?.id).at(-1);
  const curriculum=snap.curricula.find(c=>c.goal_id===goal?.id);
  const curriculumStep=snap.workflow_executions.find(step=>step.id===`${goal?.id}:curriculum`);
  const topics=curriculumStep&&curriculumStep.status!=='completed'?[]:snap.topics.filter(t=>t.curriculum_id===curriculum?.id).sort((a,b)=>a.position-b.position);
  const topic=topics.find(t=>t.id===ui.topicId)??topics.find(t=>t.status==='in_progress')??topics[0];
  const configured=snap.preferences.find(p=>p.key==='provider')?.value as Provider|undefined;
  useEffect(()=>{if(configured) setProvider(configured)},[configured]);
  useEffect(()=>{const value=snap.preferences.find(p=>p.key==='model')?.value;if(value) setModel(value)},[snap.preferences]);
  const savedDirectories=snap.preferences.find(p=>p.key==='skill_directories')?.value??'[]';
  const savedOverrides=snap.preferences.find(p=>p.key==='skill_overrides')?.value??'{}';
  const config:Config={provider,model:model|| (provider==='codex'?'default':defaultApiModel),skillOverrides:parseSkillOverrides(savedOverrides)};
  const connected=provider==='codex'?auth?.codex_authenticated:provider==='openai'?auth?.api_key_saved:auth?.server_configured;
  const refresh=async()=>{await qc.invalidateQueries({queryKey:['snapshot']});await refreshAuth()};
  async function run(label:string,fn:()=>Promise<unknown>){
    setError('');setProgressChars(0);setBusy(label);
    try { await fn(); }
    catch(e) { setError(String(e)); }
    finally {
      // A failed agent call may already have persisted a goal or workflow step.
      try { await refresh(); } catch(e) { setError(current=>current||String(e)); }
      setBusy('');setProgressChars(0);
    }
  }
  async function saveConfig(p:Provider,m:string){setProvider(p);setModel(m);await api.save('preferences',{key:'provider',value:p});await api.save('preferences',{key:'model',value:m});await refresh()}
  const mustConnect=!connected;
  if(dbError) return <div className="fatal"><h1>Не удалось открыть данные</h1><p>{String(dbError)}</p><p>Проверьте доступность выбранного каталога и запустите приложение снова. Существующая база не заменялась пустой.</p></div>;
  return <div className="app"><aside className="sidebar ref-sidebar">
    <button className="brand ref-brand" onClick={()=>ui.setPage('dashboard')} aria-label="На главную"><div className="brand-mark"><img src={brandIcon} alt=""/></div><div>educatioHarness</div></button>
    <div className="sidebar-actions"><button onClick={()=>{ui.setGoal('');ui.setSession('');ui.setPage('learn')}}><Plus size={15}/> ОБУЧЕНИЕ</button>{goal&&topics.length>0&&<button disabled={!!busy} onClick={()=>run('Новое занятие',async()=>{const next=await startLearningSession(goal.id);ui.setSession(next);ui.setPage('learn')})}><BookOpen size={15}/> НОВОЕ ЗАНЯТИЕ</button>}<button onClick={()=>ui.setPage('practice')}><Dumbbell size={15}/> ПРАКТИКА</button></div>
    <div className="sessions-heading"><span>ЗАНЯТИЯ</span></div><label className="session-search"><Search size={13}/><input aria-label="Поиск занятий" placeholder="Поиск..." value={sessionSearch} onChange={e=>setSessionSearch(e.target.value)}/></label>
    <div className="session-list">{snap.sessions.slice().reverse().filter(s=>s.title.toLocaleLowerCase('ru').includes(sessionSearch.toLocaleLowerCase('ru'))).map(s=><button key={s.id} className={session?.id===s.id&&ui.page==='learn'?'selected':''} onClick={()=>{ui.setSession(s.id);ui.setGoal(s.goal_id);ui.setPage('learn')}}><strong>{s.title}</strong><small>{phaseLabel[s.phase]??s.phase} · {s.updated_at.slice(0,10)}</small></button>)}{!snap.sessions.length&&<p>Пока нет занятий</p>}</div>
    <div className="sidebar-bottom ref-bottom"><button onClick={()=>ui.setPage('graph')}><Network size={15}/> ГРАФ ЗНАНИЙ</button><button onClick={()=>ui.setPage('settings')}><Settings2 size={15}/> НАСТРОЙКИ</button><div className={`status ${connected?'online':'offline'}`}><span/>{connected?(provider==='server'?'Сервер настроен':`${provider==='codex'?'ChatGPT':'OpenAI API'} подключён`):'ИИ не подключён'}</div>{authError&&<p className="warn">{String(authError)}</p>}</div>
  </aside><main className="main">
    {mustConnect&&ui.page!=='settings'?<Connect auth={auth} busy={busy} error={error} onLogin={()=>run('Вход',async()=>{await api.login();await new Promise(r=>setTimeout(r,1500));await refreshAuth()})} onKey={key=>run('Проверка ключа',async()=>{await api.saveKey(key,defaultApiModel);await saveConfig('openai',defaultApiModel)})} onSettings={()=>ui.setPage('settings')}/>:
    ui.page==='dashboard'?<Dashboard snap={snap} goalId={goal?.id} busy={busy} onStart={()=>ui.setPage('learn')} onPractice={()=>ui.setPage('practice')} onReview={topicId=>{ui.setTopic(topicId);ui.setPage('practice')}} onCreate={objective=>run('Подготовка диагностики',async()=>{const started=await startGoal(objective,config);ui.setGoal(started.goalId);ui.setSession(started.sessionId);ui.setPage('learn')})}/>:
    ui.page==='learn'?<Learn snap={snap} goalId={goal?.id} sessionId={session?.id} topics={topics} topic={topic} config={config} busy={busy} run={run} onGoal={(g,s)=>{ui.setGoal(g);ui.setSession(s)}} onTopic={ui.setTopic}/>:
    ui.page==='graph'?<Suspense fallback={<div className="page muted">Загрузка графа…</div>}><Graph nodes={snap.knowledge_nodes.filter(n=>n.goal_id===goal?.id)} edges={snap.knowledge_edges.filter(e=>e.goal_id===goal?.id)} topics={topics} topicLinks={snap.knowledge_topic_links} sessions={snap.sessions} messages={snap.messages} provenance={snap.knowledge_provenance} onSave={node=>run('Сохранение утверждения',()=>api.save('knowledge_nodes',node))} onDelete={id=>run('Удаление утверждения',()=>api.remove('knowledge_nodes',id))} onOpenSession={id=>{const target=snap.sessions.find(item=>item.id===id);if(target){ui.setGoal(target.goal_id);ui.setSession(id);ui.setPage('learn')}}}/></Suspense>:
    ui.page==='practice'?<PracticePage goalId={goal?.id} topics={topics} initialTopicId={ui.topicId??''} snap={snap} config={config} busy={busy} run={run}/>:
    ui.page==='history'?<History snap={snap} onOpen={id=>{ui.setSession(id);ui.setGoal(snap.sessions.find(s=>s.id===id)?.goal_id??null);ui.setPage('learn')}}/>:
    <Settings auth={auth} snapshot={snap} provider={provider} model={model} busy={busy} run={run} saveConfig={saveConfig} refreshAuth={refreshAuth} savedDirectories={savedDirectories} savedOverrides={savedOverrides} savedServerUrl={snap.preferences.find(p=>p.key==='sync_server_url')?.value??''} savedServerEtag={snap.preferences.find(p=>p.key==='sync_last_etag')?.value??''}/>}
    {busy&&progressChars>0&&<div className="agent-progress">Ответ формируется · {progressChars} знаков</div>}
    {busy&&<button className="cancel-agent" onClick={()=>void cancelActiveAgent()}>Отменить запрос</button>}
    {error&&(connected||ui.page==='settings')&&<div className="toast error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Закрыть ошибку">×</button></div>}
  </main><nav className="mobile-nav" aria-label="Основная навигация">
    <button aria-current={ui.page==='dashboard'?'page':undefined} onClick={()=>ui.setPage('dashboard')}><BrainCircuit size={17}/><span>Главная</span></button>
    <button aria-current={ui.page==='learn'?'page':undefined} onClick={()=>ui.setPage('learn')}><BookOpen size={17}/><span>Учёба</span></button>
    <button aria-current={ui.page==='practice'?'page':undefined} onClick={()=>ui.setPage('practice')}><Dumbbell size={17}/><span>Практика</span></button>
    <button aria-current={ui.page==='graph'?'page':undefined} onClick={()=>ui.setPage('graph')}><Network size={17}/><span>Граф</span></button>
    <button aria-current={ui.page==='history'?'page':undefined} onClick={()=>ui.setPage('history')}><Search size={17}/><span>История</span></button>
    <button aria-current={ui.page==='settings'?'page':undefined} onClick={()=>ui.setPage('settings')}><Settings2 size={17}/><span>Настройки</span></button>
  </nav></div>;
}

function Connect({auth,busy,error,onLogin,onKey,onSettings}:{auth?:AuthStatus;busy:string;error:string;onLogin:()=>void;onKey:(key:string)=>void;onSettings:()=>void}){
  const [mode,setMode]=useState<'choice'|'key'>('choice');const [key,setKey]=useState('');
  return <div className="connect-wrap"><div className="connect-card"><div className="hero-icon"><PlugZap size={26}/></div><h1>Подключить ИИ</h1><p>{mobileRuntime?'На телефоне учебные запросы выполняет ваш сервер. Его токен хранится только до закрытия приложения.':'Подключите модель, чтобы начать персональное обучение.'}</p>{mobileRuntime?<button className="connect-option primary" onClick={onSettings}><span><strong>Подключить свой сервер</strong><small>HTTPS · серверный OpenAI API</small></span><ArrowRight size={18}/></button>:mode==='choice'?<><button className="connect-option primary" disabled={!auth?.codex_installed||!!busy} onClick={onLogin}><span><strong>Войти через ChatGPT</strong><small>Рекомендуем · официальный вход Codex</small></span><ArrowRight size={18}/></button><button className="connect-option" onClick={()=>setMode('key')}><span><strong>Использовать ключ OpenAI API</strong><small>Запросы оплачиваются через ваш API-аккаунт</small></span><ArrowRight size={18}/></button>{!auth?.codex_installed&&<p className="warn">Codex CLI не установлен. Установите его для входа через ChatGPT.</p>}</>:<><label>Ключ OpenAI API<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-..."/></label><button className="button primary" disabled={!!busy||!key} onClick={()=>onKey(key)}>Проверить и сохранить ключ</button><button className="button ghost" onClick={()=>setMode('choice')}>Назад</button></>}{busy&&<p className="muted">{busy}… {busy==='Вход'?'Завершите вход в браузере — статус обновится автоматически.':'Выполняем реальный запрос к выбранной модели.'}</p>}{error&&<p className="warn">{error}</p>}<button className="subtle-link" onClick={onSettings}>Настройки подключения</button></div></div>;
}

function Dashboard({snap,goalId,busy,onStart,onPractice,onReview,onCreate}:{snap:Snapshot;goalId?:string;busy:string;onStart:()=>void;onPractice:()=>void;onReview:(topicId:string)=>void;onCreate:(objective:string)=>void}){
  const [objective,setObjective]=useState('');
  const goal=snap.learning_goals.find(g=>g.id===goalId);
  const curriculum=snap.curricula.find(c=>c.goal_id===goal?.id);
  const goalTopics=snap.topics.filter(t=>t.curriculum_id===curriculum?.id).sort((a,b)=>a.position-b.position);
  const review=reviewSuggestion(goalTopics,snap.exercises,snap.attempts);
  const dayKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const {days:activeDays,streak}=activitySummary(snap);
  const days=Array.from({length:35},(_,i)=>{const day=new Date();day.setDate(day.getDate()-34+i);return dayKey(day)});
  return <div className="reference-home">
    <button className="home-graph-link" onClick={()=>useUi.getState().setPage('graph')}><BrainCircuit size={14}/> Граф знаний <ArrowRight size={13}/></button>
    <div className="home-summary"><div className="home-mark"><BrainCircuit size={24}/></div><h1>Чему вы хотите научиться?</h1><p>{snap.knowledge_nodes.filter(n=>n.kind==='proposition').length} утверждений · {snap.knowledge_edges.length} связей</p><p>{snap.sessions.length} занятий · {snap.attempts.length} ответов в практике</p>{goalTopics.length>0&&<div className="topic-dashboard"><div className="topic-dashboard-head"><span>ТЕКУЩИЙ ПЛАН</span><span>{goalTopics.filter(t=>t.status==='completed').length} / {goalTopics.length} тем</span></div>{goalTopics.slice(0,5).map(t=><div key={t.id} className="topic-dashboard-row"><span className={`topic-dot ${t.status}`}/><span>{t.title}</span><small>{snap.attempts.filter(a=>snap.exercises.some(e=>e.id===a.exercise_id&&e.topic_id===t.id)).length} ответов</small></div>)}</div>}{review&&<button className="review-prompt" onClick={()=>onReview(review.topic.id)}><span><strong>Время повторить · {review.topic.title}</strong><small>{review.reason==='needs_work'?'В прошлый раз ответ вызвал трудности':'Тема давно не встречалась в практике'}</small></span><ArrowRight size={15}/></button>}<div className="activity-dashboard"><div className="topic-dashboard-head"><span>АКТИВНОСТЬ · 35 ДНЕЙ</span><span>{streak} дн. подряд</span></div><div className="activity-grid">{days.map(day=><span key={day} title={`${day}: ${activeDays.has(day)?'было занятие или ответ':'нет активности'}`} className={activeDays.has(day)?'active':''}/>)}</div></div>{goal&&<button className="text-button" onClick={onStart}>Продолжить: {goal.title} <ArrowRight size={14}/></button>}</div>
    <div className="home-composer"><div className="home-input"><textarea value={objective} onChange={e=>setObjective(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&objective.trim().length>=6&&!busy){e.preventDefault();onCreate(objective.trim())}}} placeholder="Например: хочу изучить программирование на C" aria-label="Учебная цель"/><button disabled={objective.trim().length<6||!!busy} onClick={()=>onCreate(objective.trim())} aria-label="Начать обучение"><ArrowRight size={19}/></button></div><div className="home-composer-foot"><div className="mode-switch"><button className="active"><BookOpen size={13}/> ОБУЧЕНИЕ</button><button onClick={onPractice}><Dumbbell size={13}/> ПРАКТИКА</button></div><span>Сначала выясним, что вы уже знаете</span></div></div>
  </div>;
}

export function Learn({snap,goalId,sessionId,topics,topic,config,busy,run,onGoal,onTopic}:{snap:Snapshot;goalId?:string;sessionId?:string;topics:Topic[];topic?:Topic;config:Config;busy:string;run:(label:string,fn:()=>Promise<unknown>)=>void;onGoal:(g:string,s:string)=>void;onTopic:(id:string)=>void}){
  const [objective,setObjective]=useState('');const [answers,setAnswers]=useState<Record<number,{answer:string;reasoning:string}>>({});const [reply,setReply]=useState('');
  const [curriculumOpen,setCurriculumOpen]=useState(false);
  const probe=goalId?snap.workflow_executions.find(w=>w.id===`${goalId}:probe`):undefined;
  const probeData=probe?.output?JSON.parse(probe.output) as {questions:{question:string;rationale:string;strand:string}[]}:undefined;
  useEffect(()=>{
    const restored:Record<number,{answer:string;reasoning:string}>={};
    probeData?.questions?.forEach((question,index)=>{
      const saved=snap.diagnostic_answers.find(item=>item.session_id===sessionId&&item.question===question.question);
      if(saved) restored[index]={answer:saved.answer,reasoning:saved.reasoning};
    });
    setAnswers(restored);
  // Restore only when opening a session or its question set, not while the learner is typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sessionId,probe?.output]);
  const answered=probeData?.questions?.every(question=>snap.diagnostic_answers.some(item=>item.session_id===sessionId&&item.question===question.question))??snap.diagnostic_answers.some(item=>item.session_id===sessionId);
  const messages=snap.messages.filter(m=>m.session_id===sessionId&&m.kind!=='diagnostic');
  const waiting=probe?.status==='waiting_for_user'&&!answered&&!topics.length&&!!probeData?.questions?.length;
  const showStart=!goalId||(!sessionId);
  useEffect(()=>{
    if(!topics.length||!messages.length) return;
    const pane=document.querySelector<HTMLElement>('.conversation-scroll');
    if(pane) pane.scrollTop=pane.scrollHeight;
  },[messages.length,topics.length,topic?.id]);
  return <div className="learn-page"><aside className={`curriculum ${curriculumOpen?'mobile-open':''}`}><div className="curriculum-head"><span className="eyebrow">ПЛАН ОБУЧЕНИЯ</span><button className="icon-button" title="Новая цель" onClick={()=>{setCurriculumOpen(false);onGoal('','')}}><Plus size={17}/></button><button className="mobile-plan-close" aria-label="Закрыть план" onClick={()=>setCurriculumOpen(false)}>×</button></div>{topics.length?topics.map((t,i)=><button key={t.id} className={`topic ${topic?.id===t.id?'selected':''}`} onClick={()=>{onTopic(t.id);setCurriculumOpen(false)}}><span className="topic-index">{String(i+1).padStart(2,'0')}</span><span><strong>{t.title}</strong><small>{t.status==='completed'?'изучена':t.status==='in_progress'?'в процессе':'в плане'}</small></span></button>):<div className="empty-side">План появится после диагностики.</div>}{topic&&<TopicEditor topic={topic} topics={topics} busy={!!busy} run={run} onRemoved={()=>onTopic('')}/>}</aside>{curriculumOpen&&<button className="mobile-plan-backdrop" aria-label="Закрыть план обучения" onClick={()=>setCurriculumOpen(false)}/>}<section className="conversation"><div className="conversation-head"><div><span className="eyebrow">ОБУЧЕНИЕ</span><h1>{topic?.title??snap.learning_goals.find(g=>g.id===goalId)?.title??'Новая учебная цель'}</h1></div><button className="mobile-plan-button" onClick={()=>setCurriculumOpen(current=>!current)}>План</button><span className="chip">{topics.length?'Интерактивный урок':'Диагностика знаний'}</span></div><div className="conversation-scroll">{showStart?<div className="start-goal"><div className="hero-icon"><BookOpen/></div><h2>Что вы хотите понять?</h2><p>Сначала определим отправную точку, затем построим план.</p><textarea value={objective} onChange={e=>setObjective(e.target.value)} placeholder="Хочу изучить программирование на C..."/><button className="button primary" disabled={!!busy||objective.trim().length<6} onClick={()=>run('Подготовка диагностики',async()=>{const started=await startGoal(objective.trim(),config);onGoal(started.goalId,started.sessionId)})}>Начать обучение <ArrowRight size={16}/></button></div>:waiting&&probeData?<div className="probe-form"><span className="eyebrow">ПЕРВИЧНАЯ ОЦЕНКА</span><h2>Определим вашу отправную точку.</h2><p>Рассуждайте вслух: ход мысли важнее идеального ответа.</p>{probeData.questions.map((q,i)=><div className="probe-question" key={i}><span>{String(i+1).padStart(2,'0')} · {q.strand}</span><h3>{q.question}</h3><textarea placeholder="Ваш ответ" value={answers[i]?.answer??''} onChange={e=>setAnswers(v=>({...v,[i]:{...v[i],answer:e.target.value}}))}/><textarea placeholder="Как вы рассуждали? В чём сомневаетесь?" value={answers[i]?.reasoning??''} onChange={e=>setAnswers(v=>({...v,[i]:{...v[i],reasoning:e.target.value}}))}/></div>)}<button className="button primary" disabled={!!busy||probeData.questions.some((_,i)=>!answers[i]?.answer?.trim())} onClick={()=>run('Построение плана',()=>finishProbe(goalId!,sessionId!,probeData.questions.map((q,i)=>({question:q.question,answer:answers[i].answer,reasoning:answers[i].reasoning??''})),config))}>Построить план <ArrowRight size={16}/></button></div>:!topics.length&&goalId&&sessionId?<div className="start-goal"><h2>Продолжить диагностику</h2><p>Предыдущий шаг прервался. Вы можете повторить его без потери сохранённых ответов.</p><button className="button secondary" disabled={!!busy} onClick={()=>run('Продолжение диагностики',()=>answered?finishProbe(goalId,sessionId,snap.diagnostic_answers.filter(a=>a.session_id===sessionId).map(a=>({question:a.question,answer:a.answer,reasoning:a.reasoning})),config):resumeProbe(goalId,sessionId,config))}>Продолжить</button></div>:<><div className="messages">{messages.map(m=><div key={m.id} className={`message ${m.role}`}><div className="avatar">{m.role==='assistant'?<BrainCircuit size={16}/>: 'Вы'}</div><div><small>{m.role==='assistant'?'educatioHarness':'Вы'}</small><Markdown>{m.content}</Markdown></div></div>)}</div>{topics.length>0&&topic&&<div className="lesson-actions"><button className="button secondary" disabled={!!busy} onClick={()=>run('Подготовка урока',()=>teach(goalId!,sessionId!,topic,config))}>Продолжить: {topic.title} <ArrowRight size={16}/></button></div>}</>}{busy&&<div className="loading"><LoaderCircle size={18} className="spin"/> {busy}…</div>}</div>{topics.length>0&&topic&&<div className="composer"><textarea value={reply} onChange={e=>setReply(e.target.value)} placeholder="Опишите ход мысли или попросите объяснить ещё раз…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(reply.trim()&&!busy) run('Разбор ответа',async()=>{await teach(goalId!,sessionId!,topic,config,reply.trim());setReply('')})}}}/><button className="button primary" disabled={!reply.trim()||!!busy} onClick={()=>run('Разбор ответа',async()=>{await teach(goalId!,sessionId!,topic,config,reply.trim());setReply('')})}>Отправить <ArrowRight size={16}/></button></div>}</section></div>;
}

function TopicEditor({topic,topics,busy,run,onRemoved}:{topic:Topic;topics:Topic[];busy:boolean;run:(label:string,fn:()=>Promise<unknown>)=>void;onRemoved:()=>void}){
  const [title,setTitle]=useState(topic.title);
  const [description,setDescription]=useState(topic.description);
  const [status,setStatus]=useState(topic.status);
  const [difficulty,setDifficulty]=useState(topic.difficulty);
  const [objectives,setObjectives]=useState(parseStringList(topic.objectives).join('\n'));
  const [prerequisites,setPrerequisites]=useState(parseStringList(topic.prerequisites));
  useEffect(()=>{
    setTitle(topic.title);setDescription(topic.description);setStatus(topic.status);
    setDifficulty(topic.difficulty);setObjectives(parseStringList(topic.objectives).join('\n'));
    setPrerequisites(parseStringList(topic.prerequisites));
  },[topic]);
  const earlier=topics.filter(item=>item.id!==topic.id&&item.position<topic.position);
  const saveTopic=()=>run('Сохранение темы',async()=>{
    const edited={...topic,title:title.trim(),description:description.trim(),status,difficulty,objectives:JSON.stringify(objectives.split('\n').map(value=>value.trim()).filter(Boolean)),prerequisites:JSON.stringify(prerequisites)};
    orderCurriculumTopics(topics.map(item=>({id:item.id,prerequisites:item.id===topic.id?prerequisites:parseStringList(item.prerequisites)})));
    await api.save('topics',edited);
  });
  const deleteTopic=()=>run('Удаление темы',async()=>{
    const approved=await confirm(`Удалить тему «${topic.title}»? Связанные задания останутся без темы.`,{title:'Удаление темы',kind:'warning'});
    if(!approved) return;
    await api.remove('topics',topic.id);onRemoved();
  });
  return <details className="topic-editor" key={topic.id}><summary>Настроить тему</summary>
    <label>Название<input value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Описание<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <label>Учебные цели · по одной на строку<textarea value={objectives} onChange={e=>setObjectives(e.target.value)}/></label>
    <label>Сложность<select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="beginner">Начальная</option><option value="intermediate">Средняя</option><option value="advanced">Продвинутая</option></select></label>
    <label>Статус<select value={status} onChange={e=>setStatus(e.target.value)}><option value="pending">В плане</option><option value="in_progress">В процессе</option><option value="completed">Изучена</option></select></label>
    <fieldset className="topic-prerequisites"><legend>Предпосылки</legend>{earlier.length?earlier.map(item=><label key={item.id}><input type="checkbox" checked={prerequisites.includes(item.id)} onChange={e=>setPrerequisites(current=>e.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/>{item.title}</label>):<span className="muted">Это первая тема плана</span>}</fieldset>
    <button className="button secondary" disabled={busy||!title.trim()} onClick={saveTopic}>Сохранить</button>
    <button className="button ghost" disabled={busy} onClick={deleteTopic}>Удалить тему</button>
  </details>;
}

function PracticePage({goalId,topics,initialTopicId,snap,config,busy,run}:{goalId?:string;topics:Topic[];initialTopicId:string;snap:Snapshot;config:Config;busy:string;run:(label:string,fn:()=>Promise<unknown>)=>void}){
  const [topicId,setTopicId]=useState(initialTopicId);const [exerciseId,setExerciseId]=useState('');const [answer,setAnswer]=useState('');const [reasoning,setReasoning]=useState('');const [cardMode,setCardMode]=useState(false);
  const [reviewMode,setReviewMode]=useState(false);
  if(reviewMode&&goalId) return <Suspense fallback={<div className="page muted">Загрузка повторения…</div>}><ReviewRun key={goalId} snap={snap} goalId={goalId} topics={topics} config={config} busy={busy} run={run} onClose={()=>setReviewMode(false)}/></Suspense>;
  const topic=topics.find(t=>t.id===topicId)??topics[0];
  const exercise:Exercise|undefined=snap.exercises.find(e=>e.id===exerciseId&&e.topic_id===topic?.id)??snap.exercises.filter(e=>e.goal_id===goalId&&e.topic_id===topic?.id).at(-1);
  const attempt=snap.attempts.filter(a=>a.exercise_id===exercise?.id).at(-1);
  const feedback=attempt?JSON.parse(attempt.evaluation) as {verdict:string;feedback:string;misconception:string;recommendation:string}:null;
  const create=(asCard:boolean)=>run('Подготовка задания',async()=>{const next=await generateExercise(goalId!,topic,config,asCard?'retrieval_card':undefined);setExerciseId(next.id);setAnswer('');setReasoning('');setCardMode(asCard)});
  return <div className="page practice-page"><div className="section-head"><div><span className="eyebrow">ПРАКТИКА</span><h1>Примените изученное.</h1><p>Вспомните идею без подсказки, затем проверьте ход мысли.</p></div><button className="button secondary" disabled={!!busy||!goalId||topics.filter(item=>item.status==='in_progress'||item.status==='completed').length<2} onClick={()=>setReviewMode(true)}>Итоговое повторение <ArrowRight size={15}/></button></div>{!topics.length?<div className="panel empty-state">Сначала пройдите диагностику и составьте план.</div>:<div className="practice-layout"><div className="panel"><label>Тема<select value={topic?.id??''} onChange={e=>{setTopicId(e.target.value);setExerciseId('');setAnswer('');setReasoning('');setCardMode(false)}}>{topics.map(t=><option value={t.id} key={t.id}>{t.title}</option>)}</select></label><div className="practice-create"><button className="button secondary" disabled={!!busy} onClick={()=>create(false)}><Plus size={16}/> Новое задание</button><button className="button secondary" disabled={!!busy} onClick={()=>create(true)}>Карточка памяти</button></div><p className="muted">Карточка открывает разбор только после вашего ответа. Проверка ИИ — гипотеза, а не объективный тест.</p></div><div className={`panel exercise-panel ${cardMode?'study-card':''} ${feedback?'revealed':''}`}>{exercise?<><span className="eyebrow">{cardMode?'КАРТОЧКА · ВСПОМНИТЕ САМИ':exerciseLabel[exercise.kind]??exercise.kind}</span><h2>{cardMode?'Что вы помните?':'Задание'}</h2><Markdown>{exercise.prompt}</Markdown>{feedback?<div className="feedback"><span className={`verdict ${feedback.verdict}`}>{verdictLabel[feedback.verdict]??feedback.verdict}</span><Markdown>{feedback.feedback}</Markdown>{feedback.misconception&&<p><strong>Возможное заблуждение:</strong> {feedback.misconception}</p>}<p>{feedback.recommendation}</p><details><summary>Вариант решения модели</summary><Markdown>{exercise.solution}</Markdown></details>{cardMode&&<button className="button secondary" disabled={!!busy} onClick={()=>create(true)}>Следующая карточка</button>}</div>:<><AnswerInput kind={exercise.kind} topic={topic.title} prompt={exercise.prompt} value={answer} onChange={setAnswer}/><textarea value={reasoning} onChange={e=>setReasoning(e.target.value)} placeholder="Ваш ход мысли" aria-label="Ваш ход мысли"/><button className="button primary" disabled={!answer.trim()||!!busy} onClick={()=>run('Проверка ответа',()=>evaluateExercise(exercise,answer,reasoning,config))}>Проверить ответ</button></>}</>:<div className="empty-state">Создайте задание или карточку по теме из плана.</div>}{busy&&<div className="loading"><LoaderCircle className="spin" size={18}/>{busy}…</div>}</div></div>}</div>;
}

function History({snap,onOpen}:{snap:Snapshot;onOpen:(id:string)=>void}){return <div className="page"><span className="eyebrow">ИСТОРИЯ</span><h1>Учебные занятия</h1><div className="panel list-panel">{snap.sessions.length?snap.sessions.slice().reverse().map(s=><button className="history-row" key={s.id} onClick={()=>onOpen(s.id)}><div><strong>{s.title}</strong><small>{phaseLabel[s.phase]??s.phase} · {s.updated_at.slice(0,10)} · {snap.messages.filter(m=>m.session_id===s.id).length} сообщений</small></div><ArrowRight size={16}/></button>):<p className="muted">Занятий пока нет.</p>}</div></div>}

function Settings({auth,snapshot,provider,model,busy,run,saveConfig,refreshAuth,savedDirectories,savedOverrides,savedServerUrl,savedServerEtag}:{auth?:AuthStatus;snapshot:Snapshot;provider:Provider;model:string;busy:string;run:(label:string,fn:()=>Promise<unknown>)=>void;saveConfig:(p:Provider,m:string)=>Promise<void>;refreshAuth:()=>Promise<unknown>;savedDirectories:string;savedOverrides:string;savedServerUrl:string;savedServerEtag:string}){
  const [key,setKey]=useState('');const [message,setMessage]=useState('');const [transferMessage,setTransferMessage]=useState('');
  const [exportPassword,setExportPassword]=useState('');const [confirmPassword,setConfirmPassword]=useState('');const [importPassword,setImportPassword]=useState('');
  const [serverUrl,setServerUrl]=useState(savedServerUrl);const [serverToken,setServerToken]=useState('');const [syncPassword,setSyncPassword]=useState('');const [syncMessage,setSyncMessage]=useState('');
  useEffect(()=>setServerUrl(savedServerUrl),[savedServerUrl]);
  const {data:serverStatus,error:serverError,refetch:refreshServer}=useQuery({queryKey:['sync-status',savedServerUrl],queryFn:api.syncStatus,enabled:!!savedServerUrl,refetchOnWindowFocus:false});
  const {data:dataLocation,error:dataLocationError}=useQuery({queryKey:['data-location'],queryFn:api.dataLocation});
  const exportData=()=>run('Экспорт данных',async()=>{const path=await save({defaultPath:'educatioHarness.sqlite3',filters:[{name:'Данные educatioHarness',extensions:['sqlite3']}]});if(!path)return;const info=await api.exportBackup(path);setTransferMessage(`Экспортировано: ${info.goals} целей, ${info.sessions} занятий, ${info.attempts} ответов.`)});
  const importData=()=>run('Импорт данных',async()=>{const path=await open({multiple:false,directory:false,filters:[{name:'Данные educatioHarness',extensions:['sqlite3']}]});if(typeof path!=='string')return;const info=await api.inspectBackup(path);const approved=await confirm(`В файле: ${info.goals} целей, ${info.sessions} занятий и ${info.attempts} ответов. Текущие данные будут заменены; перед этим автоматически создастся резервная копия. Продолжить?`,{title:'Импорт данных',kind:'warning'});if(!approved)return;await api.importBackup(path);setTransferMessage('Импорт завершён. Данные обновлены, сохранённые ключи остались на этом устройстве.')});
  const exportPortable=()=>run('Защищённый экспорт',async()=>{if(exportPassword!==confirmPassword||exportPassword.length<12)throw new Error('Пароль должен содержать минимум 12 символов и совпадать с подтверждением');const path=await save({defaultPath:'educatioHarness.ehb',filters:[{name:'Защищённый архив educatioHarness',extensions:['ehb']}]});if(!path)return;try{const info=await api.exportPortableBackup(path,exportPassword);setTransferMessage(`Защищённый архив создан: ${info.goals} целей, ${info.sessions} занятий, ${info.attempts} ответов.`)}finally{setExportPassword('');setConfirmPassword('')}});
  const importPortable=()=>run('Защищённый импорт',async()=>{if(!importPassword)throw new Error('Введите пароль архива');const path=await open({multiple:false,directory:false,filters:[{name:'Защищённый архив educatioHarness',extensions:['ehb']}]});if(typeof path!=='string')return;try{const info=await api.inspectPortableBackup(path,importPassword);const approved=await confirm(`В архиве: ${info.goals} целей, ${info.sessions} занятий и ${info.attempts} ответов. Текущие данные будут заменены после создания резервной копии. Продолжить?`,{title:'Импорт защищённого архива',kind:'warning'});if(!approved)return;await api.importPortableBackup(path,importPassword);setTransferMessage('Защищённый архив импортирован. Пароль и ключи ИИ не сохранялись в базе.')}finally{setImportPassword('')}});
  const connectServer=()=>run('Подключение сервера',async()=>{await api.syncConfigure(serverUrl.trim(),serverToken.trim());setServerToken('');if(mobileRuntime)await saveConfig('server',defaultApiModel);setSyncMessage(mobileRuntime?'Сервер подключён. Токен останется только в памяти до закрытия приложения.':'Сервер подключён. Токен сохранён только в системном хранилище секретов.');await refreshServer()});
  const uploadToServer=()=>run('Отправка архива',async()=>{if(!syncPassword)throw new Error('Введите пароль выбранного архива');if(serverStatus?.has_archive){const approved=await confirm('Удалённый архив будет заменён. Убедитесь, что вы уже скачали и проверили актуальную версию с сервера. Продолжить?',{title:'Замена архива на сервере',kind:'warning'});if(!approved)return}const path=await open({multiple:false,directory:false,filters:[{name:'Защищённый архив educatioHarness',extensions:['ehb']}]});if(typeof path!=='string')return;try{await api.syncUpload(path,syncPassword);setSyncMessage('Зашифрованный архив отправлен. Сервер не получил пароль или данные в открытом виде.');await refreshServer()}finally{setSyncPassword('')}});
  const downloadFromServer=()=>run('Загрузка архива',async()=>{const path=await save({defaultPath:'educatioHarness-from-server.ehb',filters:[{name:'Защищённый архив educatioHarness',extensions:['ehb']}]});if(!path)return;await api.syncDownload(path);setSyncMessage('Архив скачан. Импортируйте его выше, указав пароль.')});
  const uploadCurrent=()=>run('Отправка данных',async()=>{if(serverStatus?.has_archive){const approved=await confirm('Текущий архив на сервере будет заменён шифрованной копией данных этого устройства. Вы проверили актуальную версию? Продолжить?',{title:'Замена архива',kind:'warning'});if(!approved)return}try{const info=await api.syncUploadCurrent(syncPassword);setSyncMessage(`Отправлено: ${info.goals} целей, ${info.sessions} занятий. Пароль не передавался серверу.`);await refreshServer()}finally{setSyncPassword('')}});
  const importCurrent=()=>run('Перенос данных с сервера',async()=>{const approved=await confirm('Локальные занятия будут заменены архивом сервера после создания резервной копии. Проверьте, что это нужный архив. Продолжить?',{title:'Импорт с сервера',kind:'warning'});if(!approved)return;try{const info=await api.syncImportCurrent(importPassword);await saveConfig('server',defaultApiModel);setSyncMessage(`Импортировано: ${info.goals} целей, ${info.sessions} занятий. Локальная резервная копия сохранена.`);await refreshServer()}finally{setImportPassword('')}});
  const exportNotes=()=>run('Экспорт заметок',async()=>{const path=await open({directory:true,multiple:false,title:'Выберите хранилище Obsidian или папку заметок'});if(typeof path!=='string')return;const folder=await api.exportObsidian(path);setTransferMessage(`Заметки сохранены в ${folder}`)});
  const moveData=()=>run('Перенос каталога данных',async()=>{const directory=await open({directory:true,multiple:false,title:'Выберите новый каталог для данных'});if(typeof directory!=='string')return;const approved=await confirm(`Приложение скопирует базу в папку educatioHarness внутри выбранного каталога и перезапустится. Исходная база останется как резервная копия. Продолжить?`,{title:'Каталог данных',kind:'warning'});if(approved) await api.moveDataDirectory(directory)});
  const modelOptions=provider==='codex'?[{id:'default',label:'Авто',hint:'Выбор Codex'},{id:'gpt-6.1-sol',label:'Sol',hint:'Проверено в Codex'}]:[{id:'gpt-6.1-sol',label:'Sol',hint:'Сильнее'},{id:'gpt-6.1-terra',label:'Terra',hint:'Баланс'},{id:'gpt-6-luna',label:'Luna',hint:'Быстрее'}];
  const activeModel=model||(provider==='codex'?'default':defaultApiModel);
  const modelChoices=modelOptions.some(option=>option.id===activeModel)?modelOptions:[...modelOptions,{id:activeModel,label:activeModel,hint:'Ранее выбранная'}];
  const config={provider,model:activeModel};
  return <div className="page settings-page">
    <span className="eyebrow">ПАРАМЕТРЫ</span><h1>Настройки</h1>
    <div className="settings-grid">
      <div className="panel">
        <h2>Провайдер ИИ</h2><p>{mobileRuntime?'На телефоне запросы выполняет ваш сервер с собственным OpenAI API-ключом. Учебные тексты будут видны серверу и OpenAI.':'ChatGPT использует сессию Codex CLI. Запросы по API-ключу оплачиваются отдельно. Свой сервер использует его серверный API-ключ.'}</p>
        <div className="model-picker"><span>Провайдер</span><div className="model-toggle provider-toggle" role="group" aria-label="Выбор провайдера">{!mobileRuntime&&<><button type="button" className={provider==='codex'?'active':''} aria-pressed={provider==='codex'} disabled={!!busy} onClick={()=>run('Смена провайдера',()=>saveConfig('codex','default'))}><strong>ChatGPT</strong><small>Через Codex CLI</small></button><button type="button" className={provider==='openai'?'active':''} aria-pressed={provider==='openai'} disabled={!!busy} onClick={()=>run('Смена провайдера',()=>saveConfig('openai',defaultApiModel))}><strong>OpenAI API</strong><small>Свой API-ключ</small></button></>}<button type="button" className={provider==='server'?'active':''} aria-pressed={provider==='server'} disabled={!!busy} onClick={()=>run('Смена провайдера',()=>saveConfig('server',defaultApiModel))}><strong>Свой сервер</strong><small>AI-шлюз</small></button></div></div>
        <div className="model-picker"><span>Модель</span><div className="model-toggle" role="group" aria-label="Выбор модели">{modelChoices.map(option=><button key={option.id} type="button" className={activeModel===option.id?'active':''} aria-pressed={activeModel===option.id} disabled={!!busy} onClick={()=>run('Смена модели',()=>saveConfig(provider,option.id))}><strong>{option.label}</strong><small>{option.hint}</small></button>)}</div></div>
        <div className="connection"><span className={`status ${provider==='codex'?auth?.codex_authenticated?'online':'offline':provider==='openai'?auth?.api_key_saved?'online':'offline':auth?.server_configured?'online':'offline'}`}><span/>{provider==='codex'?(auth?.codex_authenticated?'Вход выполнен':'Нет подключения'):provider==='openai'?(auth?.api_key_saved?'API-ключ сохранён':'API-ключ не сохранён'):auth?.server_configured?'Сервер настроен · ИИ не проверен':'Сервер не подключён'}</span><button className="button secondary" disabled={!!busy} onClick={()=>run('Проверка подключения',async()=>{const r=await api.agent<{connected:boolean;message:string}>('validate',config.provider,config.model,{question:'Проверь подключение'},'');setMessage(r.message)})}>Проверить подключение</button>{message&&<p className="muted">{message}</p>}</div>
      </div>
      {!mobileRuntime&&<div className="panel">
        <h2>Авторизация</h2><h3>ChatGPT</h3>
        <p>Codex CLI: {auth?.codex_installed?'установлен':'не установлен'}. {auth?.codex_authenticated?'Вход выполнен.':'Войдите в браузере через официальный процесс Codex.'}</p>
        {auth?.detail&&!auth.codex_authenticated&&<p className="muted">{auth.detail}</p>}
        <div className="button-row"><button className="button secondary" disabled={!!busy||!auth?.codex_installed} onClick={()=>run('Открытие входа',async()=>{await api.login();await refreshAuth()})}>Войти через ChatGPT</button><button className="button ghost" disabled={!auth?.codex_authenticated} onClick={()=>run('Отключение',async()=>{await api.logout();await refreshAuth()})}><LogOut size={15}/> Отключить</button></div>
        <h3>Ключ OpenAI API</h3><label>Ключ<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-…"/></label>
        <div className="button-row"><button className="button secondary" disabled={!key||!!busy} onClick={()=>run('Проверка ключа',async()=>{await api.saveKey(key,provider==='openai'?activeModel:defaultApiModel);setKey('');await refreshAuth()})}>Проверить и сохранить ключ</button><button className="button ghost" disabled={!auth?.api_key_saved} onClick={()=>run('Удаление ключа',async()=>{await api.removeKey();await refreshAuth()})}>Удалить ключ</button></div>
      </div>}
      <ProfileSettings savedName={snapshot.preferences.find(p=>p.key==='profile_name')?.value??''} snapshot={snapshot} busy={busy} run={run}/>
      <div className="desktop-settings" hidden={mobileRuntime}>
      <SkillSettings savedDirectories={savedDirectories} savedOverrides={savedOverrides} busy={busy} run={run}/>
      <div className="panel"><h2>Каталог данных</h2><p>Текущая база: <code>{dataLocation??(dataLocationError?String(dataLocationError):'загрузка…')}</code></p><p>Для переноса выберите существующий каталог. Приложение создаст в нём папку educatioHarness, сохранит копию базы и перезапустится. Старый файл останется на месте.</p><button className="button secondary" disabled={!!busy||!dataLocation} onClick={moveData}>Изменить каталог данных</button></div>
      <div className="panel"><h2>Перенос данных</h2><p>Защищённый архив можно скопировать на другой компьютер. Он зашифрован вашим паролем; ключи ИИ не переносятся. Пароль нельзя восстановить.</p><div className="transfer-fields"><label>Пароль нового архива<input type="password" autoComplete="new-password" value={exportPassword} onChange={e=>setExportPassword(e.target.value)} placeholder="Не менее 12 символов"/></label><label>Повторите пароль<input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label></div><button className="button secondary" disabled={!!busy||exportPassword.length<12||exportPassword!==confirmPassword} onClick={exportPortable}>Создать защищённый архив</button><div className="transfer-import"><label>Пароль полученного архива<input type="password" autoComplete="off" value={importPassword} onChange={e=>setImportPassword(e.target.value)}/></label><button className="button secondary" disabled={!!busy||!importPassword} onClick={importPortable}>Импортировать защищённый архив</button></div><details className="legacy-transfer"><summary>Обычный SQLite-файл без шифрования</summary><p>Только для локальной резервной копии или совместимости. Не пересылайте его без дополнительной защиты.</p><div className="button-row"><button className="button secondary" disabled={!!busy} onClick={exportData}>Экспорт SQLite</button><button className="button secondary" disabled={!!busy} onClick={importData}>Импорт SQLite</button></div></details><h3>Obsidian</h3><p>Создаёт отдельную папку с Markdown-заметками: цели, темы и утверждения. Существующие файлы не меняет.</p><button className="button secondary" disabled={!!busy} onClick={exportNotes}>Экспорт в Obsidian</button>{transferMessage&&<p className="muted" role="status">{transferMessage}</p>}</div>
      </div>
      <div className="panel">
        <h2>Свой сервер</h2>
        <p>Ручной перенос защищённых архивов через ваш сервер. Это ещё не автоматическая синхронизация: при конфликте сначала скачайте архив и проверьте данные. Архивный endpoint видит только шифртекст; включённый AI-шлюз получает открытый текст учебных запросов.</p>
        <div className="transfer-fields"><label>Адрес HTTPS<input type="url" value={serverUrl} onChange={e=>setServerUrl(e.target.value)} placeholder="https://study.example.org"/></label><label>Токен доступа<input type="password" autoComplete="off" value={serverToken} onChange={e=>setServerToken(e.target.value)} placeholder="Не менее 32 символов"/></label></div>
        <div className="button-row"><button className="button secondary" disabled={!!busy||!serverUrl.trim()||serverToken.length<32} onClick={connectServer}>Проверить и подключить</button><button className="button ghost" disabled={!!busy||!savedServerUrl} onClick={()=>run('Отключение сервера',async()=>{await api.syncDisconnect();setSyncMessage('Сервер отключён на этом устройстве. Архив на сервере сохранён.');await refreshServer()})}>Отключить</button></div>
        {savedServerUrl&&<>
          <p className="muted">{serverStatus?serverStatus.has_archive?'На сервере есть архив.':'Сервер доступен, архива пока нет.':serverError?`Ошибка подключения: ${String(serverError)}`:'Проверяем сервер…'}</p>
          {serverStatus?.has_archive&&savedServerEtag!==serverStatus.etag&&<p className="warn">На этом устройстве нет актуальной версии сервера. Сначала скачайте и проверьте архив.</p>}
          {mobileRuntime?<>
            <label>Пароль нового архива<input type="password" autoComplete="new-password" value={syncPassword} onChange={e=>setSyncPassword(e.target.value)} placeholder="Не менее 12 символов"/></label>
            <button className="button secondary" disabled={!!busy||syncPassword.length<12||!serverStatus||(serverStatus.has_archive&&savedServerEtag!==serverStatus.etag)} onClick={uploadCurrent}>Зашифровать и отправить данные</button>
            {serverStatus?.has_archive&&<><label>Пароль архива на сервере<input type="password" autoComplete="off" value={importPassword} onChange={e=>setImportPassword(e.target.value)}/></label><button className="button secondary" disabled={!!busy||!importPassword} onClick={importCurrent}>Скачать и развернуть данные</button></>}
          </>:<>
            <label>Пароль архива для отправки<input type="password" autoComplete="off" value={syncPassword} onChange={e=>setSyncPassword(e.target.value)}/></label>
            <div className="button-row"><button className="button secondary" disabled={!!busy||!syncPassword||!serverStatus||(serverStatus.has_archive&&savedServerEtag!==serverStatus.etag)} onClick={uploadToServer}>Отправить .ehb</button><button className="button secondary" disabled={!!busy||!serverStatus?.has_archive} onClick={downloadFromServer}>Скачать .ehb</button></div>
          </>}
        </>}
        {syncMessage&&<p className="muted" role="status">{syncMessage}</p>}
      </div>
      <div className="desktop-settings" hidden={mobileRuntime}><div className="panel"><h2>Границы агента</h2><p>Codex запущен с политикой read-only, без сетевого доступа и без подтверждения повышенных прав. Это не полная изоляция чтения файлов: не открывайте с ним чувствительные проекты. OpenAI API не получает локальные инструменты.</p><p className="muted">Навыки задают методику, но не расширяют разрешения.</p></div></div>
    </div>
  </div>;
}
