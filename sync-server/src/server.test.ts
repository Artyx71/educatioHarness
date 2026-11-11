import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {createSyncServer} from './server.js';

test('encrypted archive relay authenticates and prevents stale overwrites',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'educatio-sync-test-'));
  const token=randomBytes(32).toString('hex');
  const server=createSyncServer(directory,token);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  assert(address&&typeof address==='object');
  const url=`http://127.0.0.1:${address.port}/v1/archive`;
  const archive=Buffer.concat([Buffer.from('EDUHBA01'),randomBytes(44)]);
  try {
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{authorization:'Bearer invalid'}})).status,401);
    assert.equal((await fetch(url.replace('/v1/archive','/v1/agent'),{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
    assert.equal((await fetch(url.replace('/v1/archive','/v1/agent'),{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'})).status,503);
    assert.equal((await fetch(url,{headers:{authorization:`Bearer ${token}`}})).status,404);
    const headers={authorization:`Bearer ${token}`,'if-none-match':'*'};
    const firstUpload=await fetch(url,{method:'PUT',headers,body:archive});
    assert.equal(firstUpload.status,200);
    assert.match(firstUpload.headers.get('etag')??'',/^"[a-f0-9]{64}"$/);
    const fetched=await fetch(url,{headers:{authorization:`Bearer ${token}`}});
    assert.equal(fetched.status,200);
    assert.equal(fetched.headers.get('x-educatio-sync'),'1');
    assert.deepEqual(Buffer.from(await fetched.arrayBuffer()),archive);
    const etag=fetched.headers.get('etag');
    assert(etag);
    assert.equal((await fetch(url,{method:'PUT',headers,body:archive})).status,412);
    const newer=Buffer.concat([Buffer.from('EDUHBA01'),randomBytes(44)]);
    assert.equal((await fetch(url,{method:'PUT',headers:{authorization:`Bearer ${token}`,'if-match':etag},body:newer})).status,200);
    assert.equal((await fetch(url,{method:'PUT',headers:{authorization:`Bearer ${token}`,'if-match':etag},body:archive})).status,412);
    const latest=await fetch(url,{headers:{authorization:`Bearer ${token}`}});
    assert.deepEqual(Buffer.from(await latest.arrayBuffer()),newer);
    assert.equal((await fetch(url,{method:'PUT',headers:{authorization:`Bearer ${token}`,'if-match':latest.headers.get('etag')!},body:Buffer.from('plaintext')})).status,400);
    const currentTag=latest.headers.get('etag')!;
    const competing=await Promise.all([1,2].map(()=>fetch(url,{method:'PUT',headers:{authorization:`Bearer ${token}`,'if-match':currentTag},body:Buffer.concat([Buffer.from('EDUHBA01'),randomBytes(44)])})));
    assert.equal(competing.filter(result=>result.status===200).length,1);
    assert.equal(competing.filter(result=>result.status===409||result.status===412).length,1);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await rm(directory,{recursive:true,force:true});
  }
});

test('agent endpoint requires token and returns an actionable regional error',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'educatio-agent-test-'));
  const token=randomBytes(32).toString('hex');
  const runtimePath=join(directory,'agent.mjs');
  await writeFile(runtimePath,"process.stdout.write(JSON.stringify({type:'result',ok:false,error:'403 Country, region, or territory not supported'})+'\\n')");
  const server=createSyncServer(directory,token,{provider:'openai',apiKey:'test-key',runtimePath,skillsDir:directory});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  assert(address&&typeof address==='object');
  const url=`http://127.0.0.1:${address.port}/v1/agent`;
  const body=JSON.stringify({operation:'probe',model:'gpt-6-luna',input:{goal:'C'}});
  try {
    assert.equal((await fetch(url,{method:'POST',body})).status,401);
    const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body});
    assert.equal(response.status,403);
    assert.match((await response.json() as {error:string}).error,/регионе сервера/);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await rm(directory,{recursive:true,force:true});
  }
});

test('Codex endpoint keeps provider selection on the server',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'educatio-codex-http-'));
  const workspace=await mkdtemp(join(tmpdir(),'educatio-codex-workspace-'));
  const token=randomBytes(32).toString('hex');
  const runtimePath=join(directory,'agent.mjs');
  await writeFile(runtimePath,`let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{const request=JSON.parse(input);process.stdout.write(JSON.stringify({type:'result',ok:true,data:{provider:request.provider,skill:request.skill,hasApiKey:!!process.env.OPENAI_API_KEY}})+'\\n')})`);
  const server=createSyncServer(directory,token,{provider:'codex',runtimePath,skillsDir:directory,workspaceDir:workspace});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  assert(address&&typeof address==='object');
  const url=`http://127.0.0.1:${address.port}/v1/agent`;
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
  try {
    const result=await fetch(url,{method:'POST',headers,body:JSON.stringify({operation:'probe',model:'default',input:{goal:'C'}})});
    assert.equal(result.status,200);
    assert.deepEqual(await result.json(),{provider:'codex',skill:'knowledge-probe',hasApiKey:false});
    const override=await fetch(url,{method:'POST',headers,body:JSON.stringify({operation:'probe',provider:'openai',model:'default',input:{goal:'C'}})});
    assert.equal(override.status,400);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await rm(directory,{recursive:true,force:true});
    await rm(workspace,{recursive:true,force:true});
  }
});
