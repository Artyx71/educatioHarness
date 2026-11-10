import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake=vi.hoisted(()=>({snapshot:vi.fn(),agent:vi.fn(),save:vi.fn()}));
vi.mock('../src/lib/api',()=>({api:fake,id:()=> 'test-id',now:()=> '2026-11-11T00:00:00Z'}));
import { evaluateExercise } from '../src/features/learning/engine';

const exercise={id:'exercise',prompt:'Почему компоновка не нашла символ?',solution:'Функция не связана с исполняемым файлом.'};
const config={provider:'codex' as const,model:'default'};

describe('practice evaluation input',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    fake.snapshot.mockResolvedValue({preferences:[]});
    fake.agent.mockResolvedValue({verdict:'correct',feedback:'Верно',misconception:'',recommendation:'Повторите позже',_execution:{durationMs:1}});
    fake.save.mockResolvedValue(undefined);
  });

  it('uses reasoning present in the answer when the separate field is blank',async()=>{
    await evaluateExercise(exercise,'Компоновщик не нашёл определение функции.','',config);
    expect(fake.agent.mock.calls[0][3]).toMatchObject({answer:'Компоновщик не нашёл определение функции.',reasoning:'Компоновщик не нашёл определение функции.',reasoningSource:'answer'});
    expect(fake.save.mock.calls.at(-1)?.[1]).toMatchObject({exercise_id:'exercise',reasoning:''});
  });

  it('keeps a separately entered explanation distinct',async()=>{
    await evaluateExercise(exercise,'Ошибка компоновки','Объектный файл с определением не связан.',config);
    expect(fake.agent.mock.calls[0][3]).toMatchObject({reasoning:'Объектный файл с определением не связан.',reasoningSource:'separate'});
  });

  it('does not call the model for an empty answer',async()=>{
    await expect(evaluateExercise(exercise,'  ','',config)).rejects.toThrow('Сначала напишите ответ');
    expect(fake.agent).not.toHaveBeenCalled();
  });
});
