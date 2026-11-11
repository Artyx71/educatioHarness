import { useState } from 'react';
import { FileUp, ArrowRight } from 'lucide-react';
import { importLearningPlan, type Config } from './engine';
import { validatePlanFileMetadata, validatePlanText } from './plan-file';

export function PlanImporter({config,busy,run,onGoal,initialOpen=false}:{config:Config;busy:boolean;run:(label:string,fn:()=>Promise<unknown>)=>void;onGoal:(goalId:string,sessionId:string)=>void;initialOpen?:boolean}) {
  const [open,setOpen]=useState(initialOpen);
  const [title,setTitle]=useState('');
  const [content,setContent]=useState('');
  const [filename,setFilename]=useState('');
  const [error,setError]=useState('');

  const load=async(file:File|undefined)=>{
    if(!file) return;
    setError('');
    try {
      validatePlanFileMetadata(file.name,file.size);
      setContent(validatePlanText(await file.text()));
      setFilename(file.name);
      if(!title.trim()) setTitle(file.name.replace(/\.(md|txt)$/i,'').replace(/[-_]/g,' '));
      setOpen(true);
    } catch(cause) {setError(cause instanceof Error?cause.message:`Не удалось прочитать файл: ${String(cause)}`)}
  };

  return <div className="plan-importer">
    <button type="button" className="plan-import-toggle" onClick={()=>setOpen(value=>!value)}><FileUp size={15}/> {open?'Свернуть импорт':'Уже есть план? Импортировать .md / .txt'}</button>
    {open&&<div className="plan-import-fields">
      <p>Можно выбрать Markdown-заметку из Obsidian или обычный текстовый файл. Мы покажем содержимое перед отправкой модели; исходный файл не изменится.</p>
      <label className="plan-file-picker"><FileUp size={14}/>{filename||'Выбрать файл'}<input type="file" accept=".md,.txt,text/markdown,text/plain" onChange={event=>void load(event.currentTarget.files?.[0])}/></label>
      <label>Учебная цель<input value={title} maxLength={180} placeholder="Например: изучить программирование на C" onChange={event=>setTitle(event.target.value)}/></label>
      <label>Содержимое плана<textarea value={content} maxLength={60_000} placeholder="Выберите файл или вставьте готовый план сюда" onChange={event=>setContent(event.target.value)}/></label>
      {error&&<p className="warn" role="alert">{error}</p>}
      <button type="button" className="button secondary" disabled={busy||title.trim().length<6||content.trim().length<20} onClick={()=>run('Импорт учебного плана',async()=>{const result=await importLearningPlan(title,content,config);onGoal(result.goalId,result.sessionId)})}>Построить план из файла <ArrowRight size={15}/></button>
      <small>Модель преобразует текст в темы и связи, не проводя диагностику. Знания пока не считаются проверенными.</small>
    </div>}
  </div>;
}
