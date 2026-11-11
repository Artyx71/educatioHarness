/** Existing local lessons remain available when credentials expire or the network is offline. */
export function shouldRequireConnection(connected: boolean, offlineRequested: boolean, savedGoalCount: number): boolean {
  return !connected && !(offlineRequested && savedGoalCount > 0);
}

export const learningAgentTasks = new Set([
  'Подготовка диагностики', 'Продолжение диагностики', 'Построение плана',
  'Подготовка урока', 'Разбор ответа', 'Подготовка задания', 'Проверка ответа',
  'Подготовка итогового повторения', 'Продолжение итогового повторения',
  'Завершение повторения', 'Обновление графа знаний',
]);

export function shouldBlockOfflineAgentTask(connected: boolean, label: string): boolean {
  return !connected && learningAgentTasks.has(label);
}
