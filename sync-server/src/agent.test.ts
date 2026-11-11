import assert from 'node:assert/strict';
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
  await assert.rejects(executeAgent({operation:'probe',model:'gpt-6-luna',input:{}},{apiKey:'',runtimePath:'/missing',skillsDir:'/missing'}),/not configured/);
});

test('model errors distinguish server region from rejected key',()=>{
  assert.equal(classifyAgentFailure('403 Country, region, or territory not supported').status,403);
  assert.match(classifyAgentFailure('403 Country, region, or territory not supported').error,/регионе сервера/);
  assert.equal(classifyAgentFailure('401 invalid_api_key').status,401);
  assert.equal(classifyAgentFailure('429 rate_limit').status,429);
  assert.equal(classifyAgentFailure('Agent request timed out').status,504);
  assert.equal(classifyAgentFailure('Bearer sk-secret').error.includes('sk-secret'),false);
});
