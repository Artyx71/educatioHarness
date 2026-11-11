import { expect, it } from 'vitest';
import { ruCount } from '../src/lib/ru-count';

it('uses Russian plural forms around 1, 2, 5, 11 and 21',()=>{
  const word=(count:number)=>ruCount(count,'занятие','занятия','занятий');
  expect([0,1,2,5,11,21,22,25].map(word)).toEqual([
    '0 занятий','1 занятие','2 занятия','5 занятий',
    '11 занятий','21 занятие','22 занятия','25 занятий',
  ]);
});
