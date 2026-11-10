import CodeMirror from '@uiw/react-codemirror';
import { useEffect, useState } from 'react';
import type { Extension } from '@codemirror/state';

async function codeLanguage(context: string): Promise<{name:string;extension:Extension}> {
  if (/\b(rust|cargo)\b/i.test(context)) return { name: 'Rust', extension: (await import('@codemirror/lang-rust')).rust() };
  if (/\b(python|питон)\b/i.test(context)) return { name: 'Python', extension: (await import('@codemirror/lang-python')).python() };
  if (/\b(typescript|javascript|node\.js)\b/i.test(context)) return { name: 'JavaScript / TypeScript', extension: (await import('@codemirror/lang-javascript')).javascript({ typescript: /typescript/i.test(context) }) };
  return { name: 'C / C++', extension: (await import('@codemirror/lang-cpp')).cpp() };
}

export default function CodeEditor({context,value,onChange}:{context:string;value:string;onChange:(value:string)=>void}) {
  const [language,setLanguage]=useState<{name:string;extension:Extension}|null>(null);
  const [loadError,setLoadError]=useState(false);
  useEffect(()=>{let active=true;setLanguage(null);setLoadError(false);void codeLanguage(context).then(next=>{if(active)setLanguage(next)}).catch(()=>{if(active)setLoadError(true)});return()=>{active=false}},[context]);
  if(loadError)return <textarea value={value} onChange={event=>onChange(event.target.value)} placeholder="Не удалось загрузить подсветку. Код можно написать здесь." aria-label="Ваш код"/>;
  return <div className="code-answer"><div className="answer-toolbar"><span>РЕДАКТОР КОДА · {language?.name??'загрузка языка'}</span><span>Tab — отступ · Ctrl+Z — отмена</span></div><CodeMirror value={value} onChange={onChange} extensions={language?[language.extension]:[]} theme="dark" height="260px" basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, autocompletion: true }} aria-label="Ваш код" /></div>;
}
