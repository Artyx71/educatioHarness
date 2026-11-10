import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const steps = [
  ['probe', 'Диагностика'],
  ['evaluate_probe', 'Оценка диагностики'],
  ['curriculum', 'Учебный план'],
  ['teach', 'Преподавание'],
  ['practice', 'Создание заданий'],
  ['evaluate_practice', 'Проверка ответов'],
  ['extract', 'Извлечение знаний'],
  ['audit', 'Аудит знаний'],
] as const;

function stringArray(raw: string): string[] {
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((item):item is string=>typeof item==='string') : []; }
  catch { return []; }
}

function overrides(raw: string): Record<string,string> {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
  } catch { return {}; }
}

export function SkillSettings({savedDirectories,savedOverrides,busy,run}:{savedDirectories:string;savedOverrides:string;busy:string;run:(label:string,fn:()=>Promise<unknown>)=>void}) {
  const pathExample=navigator.userAgent.includes('Windows')?'C:\\Users\\Имя\\skills':navigator.userAgent.includes('Mac')?'/Users/имя/skills':'/home/имя/skills';
  const qc=useQueryClient();
  const [directoryText,setDirectoryText]=useState(stringArray(savedDirectories).join('\n'));
  const [selected,setSelected]=useState(overrides(savedOverrides));
  useEffect(()=>setDirectoryText(stringArray(savedDirectories).join('\n')),[savedDirectories]);
  useEffect(()=>setSelected(overrides(savedOverrides)),[savedOverrides]);
  const {data:skills=[],error}=useQuery({queryKey:['skills',savedDirectories],queryFn:api.listSkills});
  const uniqueSkills=skills.filter((item,index)=>skills.findIndex(other=>other.name===item.name)===index);
  return <div className="panel skill-settings">
    <h2>Навыки агента</h2>
    <p>Встроенные навыки доступны всегда. Можно подключить свои каталоги с папками <code>имя/SKILL.md</code>. Приложение читает метаданные при обнаружении и загружает инструкции только перед нужным шагом.</p>
    <label>Дополнительные каталоги — один абсолютный путь на строку<textarea value={directoryText} onChange={e=>setDirectoryText(e.target.value)} placeholder={pathExample}/></label>
    <button className="button secondary" disabled={!!busy} onClick={()=>run('Сохранение каталогов',async()=>{await api.saveSkillDirectories(directoryText.split('\n').map(p=>p.trim()).filter(Boolean));await qc.invalidateQueries({queryKey:['skills']})})}>Сохранить каталоги</button>
    {error&&<p className="warn">Не удалось прочитать навыки: {String(error)}</p>}
    <div className="skill-list">{uniqueSkills.map(item=><div key={item.name}><strong>{item.name}</strong><small>{item.source}</small><p>{item.description}</p></div>)}</div>
    <h3>Навык для каждого шага</h3>
    <p>Замена методики влияет на ответы модели, но не расширяет её права. Навык с тем же именем, что встроенный, не заменяет его.</p>
    <div className="skill-selects">{steps.map(([operation,label])=><label key={operation}>{label}<select value={selected[operation]??''} onChange={e=>setSelected(current=>({...current,[operation]:e.target.value}))}><option value="">Встроенный навык</option>{uniqueSkills.filter(item=>item.source!=='Встроенный').map(item=><option value={item.name} key={item.name}>{item.name}</option>)}</select></label>)}</div>
    <button className="button secondary" disabled={!!busy} onClick={()=>run('Сохранение навыков',()=>api.save('preferences',{key:'skill_overrides',value:JSON.stringify(Object.fromEntries(Object.entries(selected).filter(([,value])=>value)))}))}>Сохранить выбор</button>
  </div>;
}

export function parseSkillOverrides(raw:string):Record<string,string>{return overrides(raw)}
