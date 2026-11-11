import { describe, expect, it } from 'vitest';
import { shouldBlockOfflineAgentTask, shouldRequireConnection } from '../src/app/connectionGate';

describe('connection gate', () => {
  it('requires a provider for a new profile', () => {
    expect(shouldRequireConnection(false, false, 0)).toBe(true);
    expect(shouldRequireConnection(false, true, 0)).toBe(true);
  });

  it('opens saved data after an explicit offline choice', () => {
    expect(shouldRequireConnection(false, false, 1)).toBe(true);
    expect(shouldRequireConnection(false, true, 1)).toBe(false);
  });

  it('does not gate an authenticated profile', () => {
    expect(shouldRequireConnection(true, false, 0)).toBe(false);
  });

  it('returns to the connection gate after the last goal is removed', () => {
    expect(shouldRequireConnection(false, true, 0)).toBe(true);
  });

  it('blocks new model calls offline but keeps local and authentication actions available', () => {
    expect(shouldBlockOfflineAgentTask(false, 'Подготовка диагностики')).toBe(true);
    expect(shouldBlockOfflineAgentTask(false, 'Проверка ответа')).toBe(true);
    expect(shouldBlockOfflineAgentTask(false, 'Переименование занятия')).toBe(false);
    expect(shouldBlockOfflineAgentTask(false, 'Проверка подключения')).toBe(false);
    expect(shouldBlockOfflineAgentTask(true, 'Проверка ответа')).toBe(false);
  });
});
