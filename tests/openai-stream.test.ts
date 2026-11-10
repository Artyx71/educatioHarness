import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';

let server:Server;
let baseURL:string;

beforeAll(async()=>{
  server=createServer((request,response)=>{
    if(request.url!=='/v1/responses' || request.headers.authorization!=='Bearer sk-test') {response.writeHead(401).end();return;}
    request.resume();
    response.writeHead(200,{'content-type':'text/event-stream'});
    const content=JSON.stringify({connected:false,message:'Модель неверно интерпретировала тест подключения.'});
    response.write(`event: response.output_text.delta\ndata: ${JSON.stringify({type:'response.output_text.delta',delta:content,sequence_number:1,content_index:0,output_index:0,item_id:'msg_test',logprobs:[]})}\n\n`);
    response.write(`event: response.completed\ndata: ${JSON.stringify({type:'response.completed',response:{id:'resp_test',usage:{input_tokens:1,output_tokens:1}},sequence_number:2})}\n\n`);
    response.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address || typeof address==='string') throw new Error('No test server address');
  baseURL=`http://127.0.0.1:${address.port}/v1`;
});
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()))});

it('streams a structured OpenAI result through the sidecar protocol',async()=>{
  const child=spawn(process.execPath,['agent-runtime/dist/main.js'],{env:{...process.env,OPENAI_API_KEY:'sk-test',OPENAI_BASE_URL:baseURL},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',chunk=>stdout+=String(chunk));
  child.stderr.on('data',chunk=>stderr+=String(chunk));
  child.stdin.end(JSON.stringify({operation:'validate',provider:'openai',model:'test-model',input:{question:'Проверь подключение'},skill:''}));
  const exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
  expect(exit,stderr).toBe(0);
  const events=stdout.trim().split('\n').map(line=>JSON.parse(line) as {type:string;chars?:number;ok?:boolean;data?:{connected:boolean;_execution:{sessionId:string}}});
  expect(events.some(event=>event.type==='progress'&&Number(event.chars)>0)).toBe(true);
  expect(events.at(-1)).toMatchObject({type:'result',ok:true,data:{connected:true,message:'Модель ответила на тестовый запрос.',_execution:{sessionId:'resp_test'}}});
});
