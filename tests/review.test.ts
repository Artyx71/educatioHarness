import { describe, expect, it } from 'vitest';
import { reviewSuggestion } from '../src/features/practice/review';
import type { Attempt, Exercise, Topic } from '../src/lib/types';

const topic = (id:string) => ({id, curriculum_id:'c', title:id, description:'', prerequisites:'[]', objectives:'[]', difficulty:'', status:'in_progress', position:0}) satisfies Topic;
const exercise = (id:string, topicId:string) => ({id, goal_id:'g', topic_id:topicId, kind:'short_answer', prompt:'', solution:'', created_at:''}) satisfies Exercise;
const attempt = (id:string, exerciseId:string, daysAgo:number, verdict:string):Attempt => ({id, exercise_id:exerciseId, answer:'', reasoning:'', evaluation:JSON.stringify({verdict}), created_at:new Date(Date.UTC(2026,0,10)-daysAgo*86_400_000).toISOString()});

describe('review suggestions', () => {
  const now=Date.UTC(2026,0,10);
  it('waits a day before suggesting an incorrect answer and a week after a correct one', () => {
    expect(reviewSuggestion([topic('a')],[exercise('e','a')],[attempt('a1','e',0,'incorrect')],now)).toBeNull();
    expect(reviewSuggestion([topic('a')],[exercise('e','a')],[attempt('a1','e',1,'incorrect')],now)?.reason).toBe('needs_work');
    expect(reviewSuggestion([topic('a')],[exercise('e','a')],[attempt('a1','e',6,'correct')],now)).toBeNull();
    expect(reviewSuggestion([topic('a')],[exercise('e','a')],[attempt('a1','e',7,'correct')],now)?.reason).toBe('due');
  });
  it('uses only the latest attempt and prioritizes unresolved mistakes', () => {
    const result=reviewSuggestion([topic('a'),topic('b')],[exercise('ea','a'),exercise('eb','b')],[attempt('old','ea',9,'incorrect'),attempt('new','ea',2,'correct'),attempt('b','eb',2,'partially_correct')],now);
    expect(result?.topic.id).toBe('b');
  });
  it('ignores attempts outside the current curriculum', () => {
    expect(reviewSuggestion([topic('a')],[exercise('eb','b')],[attempt('b','eb',9,'incorrect')],now)).toBeNull();
  });
});
