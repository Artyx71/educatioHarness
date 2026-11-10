import CodeMirror from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';

function codeLanguage(context: string) {
  if (/\b(rust|cargo)\b/i.test(context)) return { name: 'Rust', extension: rust() };
  if (/\b(python|питон)\b/i.test(context)) return { name: 'Python', extension: python() };
  if (/\b(typescript|javascript|node\.js)\b/i.test(context)) return { name: 'JavaScript / TypeScript', extension: javascript({ typescript: /typescript/i.test(context) }) };
  return { name: 'C / C++', extension: cpp() };
}

export default function CodeEditor({context,value,onChange}:{context:string;value:string;onChange:(value:string)=>void}) {
  const language=codeLanguage(context);
  return <div className="code-answer"><div className="answer-toolbar"><span>РЕДАКТОР КОДА · {language.name}</span><span>Tab — отступ · Ctrl+Z — отмена</span></div><CodeMirror value={value} onChange={onChange} extensions={[language.extension]} theme="dark" height="260px" basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, autocompletion: true }} aria-label="Ваш код" /></div>;
}
