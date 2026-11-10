import { lazy, Suspense } from 'react';

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

export function Markdown({children}:{children:string}) {
  return <Suspense fallback={<div className="markdown">{children}</div>}><MarkdownRenderer>{children}</MarkdownRenderer></Suspense>;
}
