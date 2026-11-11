import type { Attempt, Exercise, Topic } from '../../lib/types';

export type ReviewSuggestion = { topic: Topic; reason: 'needs_work' | 'due' };
export type PracticeFeedback = {verdict:'correct'|'partially_correct'|'incorrect'|'uncertain';feedback:string;misconception:string;recommendation:string};

export function parsePracticeFeedback(value: string): PracticeFeedback | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if(parsed && typeof parsed==='object' && 'verdict' in parsed && 'feedback' in parsed && 'misconception' in parsed && 'recommendation' in parsed
      && typeof parsed.verdict==='string' && ['correct','partially_correct','incorrect','uncertain'].includes(parsed.verdict)
      && typeof parsed.feedback==='string' && typeof parsed.misconception==='string' && typeof parsed.recommendation==='string') return parsed as PracticeFeedback;
  } catch { /* Old or incomplete evaluation; do not infer a result. */ }
  return null;
}

export function reviewSuggestion(topics: Topic[], exercises: Exercise[], attempts: Attempt[], now = Date.now()): ReviewSuggestion | null {
  const topicIds = new Set(topics.map(topic => topic.id));
  const exerciseTopics = new Map(exercises.filter(exercise => topicIds.has(exercise.topic_id)).map(exercise => [exercise.id, exercise.topic_id]));
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    if(!parsePracticeFeedback(attempt.evaluation)) continue;
    const topicId = exerciseTopics.get(attempt.exercise_id);
    if (!topicId || !Number.isFinite(Date.parse(attempt.created_at))) continue;
    const previous = latest.get(topicId);
    if (!previous || Date.parse(previous.created_at) < Date.parse(attempt.created_at)) latest.set(topicId, attempt);
  }
  const due = topics.flatMap(topic => {
    const attempt = latest.get(topic.id);
    if (!attempt) return [];
    const ageDays = (now - Date.parse(attempt.created_at)) / 86_400_000;
    const result = parsePracticeFeedback(attempt.evaluation)!;
    const needsWork = result.verdict === 'incorrect' || result.verdict === 'partially_correct' || result.verdict === 'uncertain';
    const threshold = needsWork ? 1 : 7;
    return ageDays >= threshold ? [{ topic, reason: needsWork ? 'needs_work' as const : 'due' as const, ageDays }] : [];
  });
  due.sort((a, b) => Number(b.reason === 'needs_work') - Number(a.reason === 'needs_work') || b.ageDays - a.ageDays);
  return due[0] ?? null;
}
