import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReviewRun } from '../src/features/practice/ReviewRun';
import type { Snapshot, Topic } from '../src/lib/types';

describe('review answer disclosure',()=>{
  it('does not render the private solution or topic before an answer',()=>{
    const topic:Topic={id:'topic',curriculum_id:'curriculum',title:'Память',description:'',prerequisites:'[]',objectives:'[]',difficulty:'beginner',status:'completed',position:0};
    const snap={
      topics:[topic],exercises:[{id:'exercise',goal_id:'goal',topic_id:'topic',kind:'short_answer',prompt:'Что означает адрес?',solution:'Секретный вариант решения',created_at:'t'}],attempts:[],
      workflow_executions:[{id:'run:review',goal_id:'goal',step_id:'review',status:'waiting_for_user',input:JSON.stringify({topicIds:['topic','other']}),output:JSON.stringify({exerciseIds:['exercise']}),retry_count:0}],
    } as unknown as Snapshot;
    const html=renderToStaticMarkup(createElement(ReviewRun,{snap,goalId:'goal',topics:[topic],config:{provider:'codex',model:'default'},busy:'',run:()=>{},onClose:()=>{}}));
    expect(html).toContain('Что означает адрес?');
    expect(html).not.toContain('Секретный вариант решения');
    expect(html).not.toContain('Тема: Память');
  });

  it('offers saved answers without revealing them in the completed summary',()=>{
    const topic:Topic={id:'topic',curriculum_id:'curriculum',title:'Память',description:'',prerequisites:'[]',objectives:'[]',difficulty:'beginner',status:'completed',position:0};
    const snap={
      topics:[topic],exercises:[{id:'exercise',goal_id:'goal',topic_id:'topic',kind:'short_answer',prompt:'Что означает адрес?',solution:'Решение модели',created_at:'t'}],
      attempts:[{id:'attempt',exercise_id:'exercise',answer:'Мой сохранённый ответ',reasoning:'',evaluation:'{"verdict":"correct","feedback":"Верно","misconception":"","recommendation":""}',created_at:'t'}],
      workflow_executions:[{id:'run:review',goal_id:'goal',step_id:'review',status:'completed',input:JSON.stringify({topicIds:['topic','other']}),output:JSON.stringify({exerciseIds:['exercise'],reviewedAt:'t'}),retry_count:0}],
    } as unknown as Snapshot;
    const html=renderToStaticMarkup(createElement(ReviewRun,{snap,goalId:'goal',topics:[topic],config:{provider:'codex',model:'default'},busy:'',run:()=>{},onClose:()=>{}}));
    expect(html).toContain('Посмотреть ответы');
    expect(html).not.toContain('Мой сохранённый ответ');
    expect(html).not.toContain('Решение модели');
  });
  it('does not unlock the next review question for an unevaluated saved answer',()=>{
    const topic:Topic={id:'topic',curriculum_id:'curriculum',title:'Память',description:'',prerequisites:'[]',objectives:'[]',difficulty:'beginner',status:'completed',position:0};
    const snap={
      topics:[topic],exercises:[{id:'exercise',goal_id:'goal',topic_id:'topic',kind:'short_answer',prompt:'Что означает адрес?',solution:'Секретное решение',created_at:'t'}],
      attempts:[{id:'draft',exercise_id:'exercise',answer:'Мой ответ',reasoning:'',evaluation:'',created_at:'t'}],
      workflow_executions:[{id:'run:review',goal_id:'goal',step_id:'review',status:'waiting_for_user',input:JSON.stringify({topicIds:['topic','other']}),output:JSON.stringify({exerciseIds:['exercise']}),retry_count:0}],
    } as unknown as Snapshot;
    const html=renderToStaticMarkup(createElement(ReviewRun,{snap,goalId:'goal',topics:[topic],config:{provider:'codex',model:'default'},busy:'',run:()=>{},onClose:()=>{}}));
    expect(html).toContain('Повторить проверку');
    expect(html).not.toContain('Секретное решение');
    expect(html).not.toContain('Тема: Память');
    expect(html).not.toContain('Следующий вопрос');
  });
});
