import { lazy, Suspense } from 'react';
import { Markdown } from '../../components/Markdown';

type Props = { kind: string; topic: string; prompt: string; value: string; onChange: (value: string) => void };
const CodeEditor = lazy(() => import('./CodeEditor'));

export function AnswerInput({ kind, topic, prompt, value, onChange }: Props) {
  if (kind === 'code') {
    return <Suspense fallback={<div className="code-answer muted">Загрузка редактора…</div>}><CodeEditor context={`${topic} ${prompt}`} value={value} onChange={onChange}/></Suspense>;
  }
  if (kind === 'math') return <div className="math-answer"><label>Решение и ход вычислений<textarea value={value} onChange={event => onChange(event.target.value)} placeholder="Напишите решение; формулу можно ввести в TeX: $x^2 + y^2$" /></label><div className="math-preview"><span className="eyebrow">ПРЕДПРОСМОТР</span><Markdown>{value || 'Формула появится здесь'}</Markdown></div></div>;
  return <textarea value={value} onChange={event => onChange(event.target.value)} placeholder="Ваш ответ" aria-label="Ваш ответ" />;
}
