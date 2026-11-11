import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {classifyAgentFailure,executeAgent,validateAgentRequest} from './agent.js';

test('remote agent request uses only approved OpenAI workflow and built-in skill',async()=>{
  const request=validateAgentRequest({operation:'probe',model:'gpt-6-luna',input:{goal:'Изучить C'}});
  assert.equal(request.provider,'openai');
  assert.equal(request.skill,'knowledge-probe');
  assert.deepEqual(request.skillDirectories,[]);
  assert.throws(()=>validateAgentRequest({operation:'probe',provider:'codex',model:'gpt-6-luna',input:{}}));
  assert.throws(()=>validateAgentRequest({operation:'probe',model:'gpt-6-luna',skill:'external',input:{}}));
  assert.throws(()=>validateAgentRequest({operation:'shell',model:'gpt-6-luna',input:{}}));
  await assert.rejects(executeAgent({operation:'probe',model:'gpt-6-luna',input:{}},{provider:'openai',apiKey:'',runtimePath:'/missing',skillsDir:'/missing'}),/not configured/);
});

test('trusted server selects Codex without forwarding an API key or client provider',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'educatio-codex-server-'));
  const runtimePath=join(directory,'agent.mjs');
  await writeFile(runtimePath,`let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{const request=JSON.parse(input);process.stdout.write(JSON.stringify({type:'result',ok:true,data:{provider:request.provider,skill:request.skill,hasApiKey:!!process.env.OPENAI_API_KEY,workspace:process.env.EDUCATIOHARNESS_AGENT_WORKSPACE,cwd:process.cwd()}})+'\\n')})`);
  try {
    const result=await executeAgent({operation:'probe',model:'default',input:{goal:'C'}},{provider:'codex',runtimePath,skillsDir:directory,workspaceDir:directory}) as {provider:string;skill:string;hasApiKey:boolean;workspace:string;cwd:string};
    assert.deepEqual(result,{provider:'codex',skill:'knowledge-probe',hasApiKey:false,workspace:directory,cwd:directory});
    assert.throws(()=>validateAgentRequest({operation:'probe',provider:'openai',model:'default',input:{}},'codex'));
    await assert.rejects(executeAgent({operation:'probe',model:'default',input:{}},{provider:'codex',runtimePath,skillsDir:directory,workspaceDir:'/missing'}),/workspace/);
  } finally {await rm(directory,{recursive:true,force:true})}
});

test('model errors distinguish server region from rejected key',()=>{
  assert.equal(classifyAgentFailure('403 Country, region, or territory not supported').status,403);
  assert.match(classifyAgentFailure('403 Country, region, or territory not supported').error,/регионе сервера/);
  assert.equal(classifyAgentFailure('401 invalid_api_key').status,401);
  assert.equal(classifyAgentFailure('429 rate_limit').status,429);
  assert.match(classifyAgentFailure('401 Not logged in','codex').error,/codex login status/);
  assert.match(classifyAgentFailure('401 Unauthorized','codex').error,/codex login status/);
  assert.equal(classifyAgentFailure('Agent request timed out').status,504);
  assert.equal(classifyAgentFailure('Bearer sk-secret').error.includes('sk-secret'),false);
});

test('cancelling an agent waits for shutdown and stops its child process',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'educatio-agent-cancel-'));
  const runtimePath=join(directory,'agent.mjs');
  const pidPath=join(directory,'pids.json');
  await writeFile(runtimePath,`import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});writeFileSync(${JSON.stringify(pidPath)},JSON.stringify({runtime:process.pid,child:child.pid}));setInterval(()=>{},1000)`);
  const controller=new AbortController();
  let pids:{runtime:number;child:number}|undefined;
  try {
    const running=executeAgent({operation:'probe',model:'default',input:{}},{provider:'openai',apiKey:'test-key',runtimePath,skillsDir:directory},controller.signal);
    for(let attempt=0;attempt<100;attempt++) {
      try {pids=JSON.parse(await readFile(pidPath,'utf8')) as {runtime:number;child:number};break}
      catch {await new Promise(resolve=>setTimeout(resolve,20))}
    }
    assert(pids,'agent runtime did not start');
    controller.abort();
    await assert.rejects(running,/cancelled/);
    assert.throws(()=>process.kill(pids!.runtime,0),{code:'ESRCH'});
    if(process.platform==='linux') {
      // A killed grandchild may briefly be a zombie until the init process reaps it.
      const state=await readFile(`/proc/${pids.child}/stat`,'utf8').then(raw=>raw.split(') ')[1]?.[0],()=>undefined);
      assert(state===undefined||state==='Z',`agent descendant is still running: ${state}`);
    }
  } finally {
    controller.abort();
    if(pids) {try {process.kill(pids.child,'SIGKILL')} catch {/* already stopped */}}
    await rm(directory,{recursive:true,force:true});
  }
});
