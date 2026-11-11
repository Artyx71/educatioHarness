import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
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
