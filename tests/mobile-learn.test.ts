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
});
