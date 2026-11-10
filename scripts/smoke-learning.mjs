import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const cwd=resolve(import.meta.dirname,'../src-tauri');
const script=resolve(import.meta.dirname,'../agent-runtime/bundle/main.mjs');
const skills=resolve(import.meta.dirname,'../skills');
const names={probe:'knowledge-probe',evaluate_probe:'knowledge-probe',curriculum:'curriculum-planner',teach:'socratic-teacher',practice:'exercise-generator',evaluate_practice:'answer-evaluator',extract:'knowledge-extractor',audit:'knowledge-auditor'};
async function request(operation,input){
  const child=spawn(process.execPath,[script],{cwd,env:{...process.env,EDUCATIOHARNESS_SKILLS_DIR:skills,EDUCATIOHARNESS_CODEX_PATH:'codex'},stdio:['pipe','pipe','pipe']});
  let output='',error='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>error+=c);
  child.stdin.end(JSON.stringify({operation,provider:'codex',model:'default',input,skill:names[operation]}));
  const code=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',done)});
  const response=JSON.parse(output);if(code!==0||!response.ok) throw new Error(`${operation}: ${response.error??error}`);
  console.log(`${operation}: ok (${response.data._execution.durationMs} ms)`);
  return response.data;
}
const goal='Хочу изучить программирование на C';
const probe=await request('probe',{goal});
const answers=probe.questions.map(q=>({question:q.question,answer:'Пока не знаю точного ответа.',reasoning:'Могу предположить, но не уверен в механизме.'}));
const evaluation=await request('evaluate_probe',{goal,answers});
const curriculum=await request('curriculum',{goal,answers,evaluation});
const first=curriculum.topics[0];
if(!first) throw new Error('No topic generated');
const lesson=await request('teach',{goal,topic:first,history:[],answer:null});
const exercise=await request('practice',{goal,topic:first,attempts:[]});
await request('evaluate_practice',{problem:exercise.prompt,solution:exercise.solution,answer:'Не знаю',reasoning:'Нет уверенности'});
const extract=await request('extract',{messages:[{messageId:'smoke-message',text:lesson.message}],existing:[]});
await request('audit',{propositions:extract.propositions,existing:[]});
console.log(`complete: ${probe.questions.length} diagnostic questions, ${curriculum.topics.length} topics, ${extract.propositions.length} propositions`);
