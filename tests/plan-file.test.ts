import { describe, expect, it } from 'vitest';
import { validatePlanFileMetadata, validatePlanText } from '../src/features/learning/plan-file';

describe('learning plan files',()=>{
  it('accepts Markdown and text files without changing their content',()=>{
    expect(()=>validatePlanFileMetadata('Мой план.MD',100)).not.toThrow();
    expect(()=>validatePlanFileMetadata('roadmap.txt',100)).not.toThrow();
    const original='# План\n\n- Память\n- Указатели\n';
    expect(validatePlanText(original)).toBe(original);
  });
  it('rejects unsupported extensions, oversized and binary files',()=>{
    expect(()=>validatePlanFileMetadata('credentials.json',10)).toThrow('.md');
    expect(()=>validatePlanFileMetadata('plan.md',120_001)).toThrow('120 КБ');
    expect(()=>validatePlanText('too short')).toThrow('слишком мало');
    expect(()=>validatePlanText('План с бинарным\0 содержимым')).toThrow('бинарные');
    expect(()=>validatePlanText('a'.repeat(60_001))).toThrow('60 000');
  });
});
