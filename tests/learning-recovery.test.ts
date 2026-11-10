import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../src/lib/types';

const fake = vi.hoisted(() => ({
  snapshot: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  agent: vi.fn(),
}));

vi.mock('../src/lib/api', () => ({ api: fake, id: () => crypto.randomUUID(), now: () => new Date().toISOString() }));

import { finishProbe } from '../src/features/learning/engine';

describe('learning workflow recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const snapshot = {
      learning_goals: [{ id: 'goal', title: 'Изучить C' }],
      sessions: [{ id: 'session', goal_id: 'goal', phase: 'probe', title: 'Изучить C' }],
      messages: [],
      diagnostic_answers: [{ id: 'saved-answer', session_id: 'session', question: 'Вопрос 1', answer: 'Ответ 1', reasoning: 'Мысль 1', evaluation: '', created_at: '2026-01-01' }],
      curricula: [{ id: 'partial-plan', goal_id: 'goal' }],
      topics: [{ id: 'partial-topic', curriculum_id: 'partial-plan' }],
      knowledge_nodes: [],
      knowledge_edges: [],
      knowledge_provenance: [],
      workflow_executions: [{ id: 'goal:probe', status: 'waiting_for_user', output: JSON.stringify({ questions: [{ question: 'Вопрос 1' }, { question: 'Вопрос 2' }] }), retry_count: 0 }],
      preferences: [],
    } as unknown as Snapshot;
    fake.snapshot.mockResolvedValue(snapshot);
    fake.save.mockResolvedValue(undefined);
    fake.remove.mockResolvedValue(undefined);
    fake.agent.mockImplementation(async (operation: string) => {
      if (operation === 'evaluate_probe') return { summary: 'Оценка', observations: [], startingPoint: 'Начало', _execution: { durationMs: 1 } };
      if (operation === 'curriculum') return { approach: 'План', topics: [{ id: 'c', title: 'Указатели', description: 'Адреса памяти', prerequisites: [], objectives: [], difficulty: 'beginner' }], _execution: { durationMs: 1 } };
      throw new Error(`Unexpected operation: ${operation}`);
    });
  });

  it('saves only missing answers and replaces an interrupted curriculum', async () => {
    const actions: string[] = [];
    fake.save.mockImplementation(async (table: string) => { actions.push(`save:${table}`); });
    fake.remove.mockImplementation(async (table: string, id: string) => { actions.push(`remove:${table}:${id}`); });

    await finishProbe('goal', 'session', [
      { question: 'Вопрос 1', answer: 'Ответ 1', reasoning: 'Мысль 1' },
      { question: 'Вопрос 2', answer: 'Ответ 2', reasoning: 'Мысль 2' },
    ], { provider: 'codex', model: 'default' });

    const savedAnswers = fake.save.mock.calls.filter(([table]) => table === 'diagnostic_answers');
    expect(savedAnswers).toHaveLength(1);
    expect(savedAnswers[0][1].question).toBe('Вопрос 2');
    expect(actions.indexOf('remove:curricula:partial-plan')).toBeGreaterThan(-1);
    expect(actions.indexOf('remove:curricula:partial-plan')).toBeLessThan(actions.indexOf('save:curricula'));
    const completedProbe = fake.save.mock.calls.find(([table, record]) => table === 'workflow_executions' && record.step_id === 'probe' && record.status === 'completed');
    expect(JSON.parse(completedProbe?.[1].output).questions).toHaveLength(2);
  });
});
