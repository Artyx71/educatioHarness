import type { Attempt, Exercise, Topic } from '../../lib/types';

export type ReviewSuggestion = { topic: Topic; reason: 'needs_work' | 'due' };

function verdict(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && 'verdict' in parsed && typeof parsed.verdict === 'string') return parsed.verdict;
  } catch { /* Old or incomplete evaluation; do not infer a result. */ }
  return 'uncertain';
}

export function reviewSuggestion(topics: Topic[], exercises: Exercise[], attempts: Attempt[], now = Date.now()): ReviewSuggestion | null {
  const topicIds = new Set(topics.map(topic => topic.id));
  const exerciseTopics = new Map(exercises.filter(exercise => topicIds.has(exercise.topic_id)).map(exercise => [exercise.id, exercise.topic_id]));
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    const topicId = exerciseTopics.get(attempt.exercise_id);
    if (!topicId || !Number.isFinite(Date.parse(attempt.created_at))) continue;
    const previous = latest.get(topicId);
    if (!previous || Date.parse(previous.created_at) < Date.parse(attempt.created_at)) latest.set(topicId, attempt);
  }
  const due = topics.flatMap(topic => {
    const attempt = latest.get(topic.id);
    if (!attempt) return [];
    const ageDays = (now - Date.parse(attempt.created_at)) / 86_400_000;
    const result = verdict(attempt.evaluation);
    const needsWork = result === 'incorrect' || result === 'partially_correct' || result === 'uncertain';
    const threshold = needsWork ? 1 : 7;
    return ageDays >= threshold ? [{ topic, reason: needsWork ? 'needs_work' as const : 'due' as const, ageDays }] : [];
  });
  due.sort((a, b) => Number(b.reason === 'needs_work') - Number(a.reason === 'needs_work') || b.ageDays - a.ageDays);
  return due[0] ?? null;
}
