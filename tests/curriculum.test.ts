import { describe, expect, it } from 'vitest';
import { orderCurriculumTopics, parseStringList } from '../src/features/learning/engine';

const topic=(id:string,prerequisites:string[]=[]):{id:string;prerequisites:string[]}=>({id,prerequisites});

describe('curriculum dependencies',()=>{
  it('puts prerequisites before dependents without changing other model order',()=>{
    const ordered=orderCurriculumTopics([topic('pointers',['memory']),topic('syntax'),topic('memory',['syntax'])]);
    expect(ordered.map(item=>item.id)).toEqual(['syntax','memory','pointers']);
  });
  it('rejects duplicate IDs, missing prerequisites and cycles',()=>{
    expect(()=>orderCurriculumTopics([topic('a'),topic('a')])).toThrow('повторяющиеся');
    expect(()=>orderCurriculumTopics([topic('a',['missing'])])).toThrow('отсутствующую');
    expect(()=>orderCurriculumTopics([topic('a',['b']),topic('b',['a'])])).toThrow('цикл');
    expect(()=>orderCurriculumTopics([topic('a',['a'])])).toThrow('от себя');
  });
});

describe('stored topic lists',()=>{
  it('loads valid objectives and ignores damaged JSON',()=>{
    expect(parseStringList('["адреса","указатели"]')).toEqual(['адреса','указатели']);
    expect(parseStringList('{"not":"a list"}')).toEqual([]);
    expect(parseStringList('["valid",12]')).toEqual([]);
    expect(parseStringList('broken')).toEqual([]);
  });
});
