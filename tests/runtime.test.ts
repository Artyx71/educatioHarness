import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const operations:Record<string,string>={probe:'knowledge-probe',evaluate_probe:'knowledge-probe',curriculum:'curriculum-planner',teach:'socratic-teacher',practice:'exercise-generator',evaluate_practice:'answer-evaluator',extract:'knowledge-extractor',audit:'knowledge-auditor'};

describe('agent protocol boundaries',()=>{
  it('rejects unknown operations before any provider request',()=>{
    const child=spawnSync(process.execPath,['agent-runtime/dist/main.js'],{input:JSON.stringify({operation:'delete_files',provider:'codex',model:'default',input:{},skill:'knowledge-probe'}),encoding:'utf8'});
    expect(child.status).toBe(1);
    expect(JSON.parse(child.stdout).ok).toBe(false);
  });
  it('rejects path traversal in skill names',()=>{
    const child=spawnSync(process.execPath,['agent-runtime/dist/main.js'],{input:JSON.stringify({operation:'probe',provider:'codex',model:'default',input:{},skill:'../private'}),encoding:'utf8'});
    expect(child.status).toBe(1);
    expect(JSON.parse(child.stdout).error).toContain('Invalid skill name');
  });
  it('has a complete standard metadata header for each workflow skill',()=>{
    for(const skill of new Set(Object.values(operations))){
      const source=readFileSync(`skills/${skill}/SKILL.md`,'utf8');
      expect(source).toMatch(/^---\nname: [a-z-]+\ndescription: .+\nlicense: AGPL-3\.0-only\n---\n/);
    }
  });
});
