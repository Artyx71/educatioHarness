import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Learn } from '../src/app/App';
import type { Snapshot } from '../src/lib/types';

describe('narrow learning shell',()=>{
  it('renders a plan control without a stray zero when no topics exist',()=>{
    const html=renderToStaticMarkup(createElement(Learn,{
      snap:{messages:[],diagnostic_answers:[],learning_goals:[],workflow_executions:[]} as unknown as Snapshot,
      topics:[],config:{provider:'codex',model:'default'},busy:'',run:()=>{},onGoal:()=>{},onTopic:()=>{},
    }));
    expect(html).toContain('mobile-plan-button');
    expect(html).toContain('Новая учебная цель');
    expect(html).not.toMatch(/>0\s*<\/section>/);
  });
  it('does not offer to skip an unanswered teacher question',()=>{
    const topic={id:'pointers',curriculum_id:'plan',title:'Указатели',description:'',objectives:'[]',prerequisites:'[]',difficulty:'beginner',status:'in_progress',position:0};
    const snap={
      learning_goals:[{id:'goal',title:'Изучить C'}],sessions:[],messages:[],diagnostic_answers:[],
      workflow_executions:[{id:'session:teach',status:'waiting_for_user',output:JSON.stringify({topicId:'pointers'})}],
    } as unknown as Snapshot;
    const props={snap,goalId:'goal',sessionId:'session',topics:[topic],topic,config:{provider:'codex' as const,model:'default'},busy:'',run:()=>{},onGoal:()=>{},onTopic:()=>{}};
    const waiting=renderToStaticMarkup(createElement(Learn,props));
    expect(waiting).toContain('Опишите ход мысли');
    expect(waiting).not.toContain('Продолжить: Указатели');
    snap.workflow_executions[0].status='failed';
    expect(renderToStaticMarkup(createElement(Learn,props))).toContain('Продолжить: Указатели');
  });
});
