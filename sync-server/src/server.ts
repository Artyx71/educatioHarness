import {createHash, timingSafeEqual, randomUUID} from 'node:crypto';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {lstat, mkdir, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {resolve, join, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyAgentFailure, executeAgent, type AgentConfig} from './agent.js';

const MAX_ARCHIVE_BYTES = 100_000_052;
const MAGIC = Buffer.from('EDUHBA01');
type Pointer = {sha256:string; bytes:number};

function reply(response:ServerResponse, status:number, body:unknown) {
  response.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-educatio-sync':'1'});
  response.end(JSON.stringify(body));
}

function authorized(request:IncomingMessage, tokenHash:Buffer):boolean {
  const header=request.headers.authorization;
  if (!header?.startsWith('Bearer ') || header.length>263) return false;
  const received=createHash('sha256').update(header.slice(7)).digest();
  return timingSafeEqual(received,tokenHash);
}

async function current(directory:string):Promise<Pointer|undefined> {
  let raw:string;
  try {raw=await readFile(join(directory,'current.json'),'utf8')}
  catch(error) {if ((error as NodeJS.ErrnoException).code==='ENOENT') return undefined;throw error}
  const value:unknown=JSON.parse(raw);
  if (!value||typeof value!=='object'||!('sha256'in value)||!('bytes'in value)) throw new Error('Damaged archive pointer');
  const {sha256,bytes}=value as Pointer;
  if (!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(bytes)||bytes<52||bytes>MAX_ARCHIVE_BYTES) throw new Error('Damaged archive pointer');
  return {sha256,bytes};
}

async function readArchive(request:IncomingMessage):Promise<Buffer> {
  const length=Number(request.headers['content-length']);
  if (Number.isFinite(length)&&length>MAX_ARCHIVE_BYTES) throw new Error('Archive exceeds 100 MB limit');
  const chunks:Buffer[]=[];
  let bytes=0;
  for await (const chunk of request) {
    const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as Uint8Array);
    bytes+=part.length;
    if (bytes>MAX_ARCHIVE_BYTES) throw new Error('Archive exceeds 100 MB limit');
    chunks.push(part);
  }
  const archive=Buffer.concat(chunks,bytes);
  if (archive.length<52||!archive.subarray(0,8).equals(MAGIC)) throw new Error('Not an educatioHarness encrypted archive');
  return archive;
}

async function readAgentInput(request:IncomingMessage):Promise<unknown> {
  const chunks:Buffer[]=[];
  let bytes=0;
  for await (const chunk of request) {
    const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as Uint8Array);
    bytes+=part.length;
    if(bytes>200_000) throw new Error('Agent request exceeds 200 KB limit');
    chunks.push(part);
  }
  try {return JSON.parse(Buffer.concat(chunks,bytes).toString('utf8')) as unknown}
  catch {throw new Error('Invalid agent JSON')}
}

export function createSyncServer(directory:string, token:string, agentConfig?:AgentConfig) {
  if (!isAbsolute(directory)) throw new Error('EDUCATIO_SYNC_DATA_DIR must be absolute');
  if (token.length<32||token.length>256) throw new Error('EDUCATIO_SYNC_TOKEN must contain 32–256 characters');
  const dataDirectory=resolve(directory);
  const tokenHash=createHash('sha256').update(token).digest();
  let uploading=false;
  let agentBusy=false;
  return createServer(async(request,response)=>{
    try {
      if (request.url==='/health'&&request.method==='GET') return reply(response,200,{ok:true});
      if (!['/v1/archive','/v1/agent'].includes(request.url??'')||!authorized(request,tokenHash)) return reply(response,401,{error:'Unauthorized'});
      if (request.url==='/v1/agent') {
        if (request.method!=='POST') return reply(response,405,{error:'Method not allowed'});
        if (!agentConfig) return reply(response,503,{error:'Agent provider is not configured on the server'});
        if (agentBusy) return reply(response,429,{error:'Another agent request is running'});
        agentBusy=true;
        const controller=new AbortController();
        response.once('close',()=>{if(!response.writableEnded)controller.abort()});
        try {return reply(response,200,await executeAgent(await readAgentInput(request),agentConfig,controller.signal))}
        finally {agentBusy=false}
      }
      if (request.method==='GET') {
        const pointer=await current(dataDirectory);
        if (!pointer) return reply(response,404,{error:'No archive uploaded'});
        const archive=await readFile(join(dataDirectory,`${pointer.sha256}.ehb`));
        if (archive.length!==pointer.bytes||createHash('sha256').update(archive).digest('hex')!==pointer.sha256) throw new Error('Stored archive failed integrity check');
        response.writeHead(200,{'content-type':'application/octet-stream','content-length':archive.length,'etag':`"${pointer.sha256}"`,'cache-control':'no-store','x-educatio-sync':'1'});
        return response.end(archive);
      }
      if (request.method==='HEAD') {
        const pointer=await current(dataDirectory);
        response.writeHead(pointer?200:404,pointer?{'etag':`"${pointer.sha256}"`,'content-length':pointer.bytes,'cache-control':'no-store','x-educatio-sync':'1'}:{'cache-control':'no-store','x-educatio-sync':'1'});
        return response.end();
      }
      if (request.method!=='PUT') return reply(response,405,{error:'Method not allowed'});
      if (uploading) return reply(response,409,{error:'Another upload is in progress'});
      uploading=true;
      try {
        const pointer=await current(dataDirectory);
        if (pointer) {
          if (request.headers['if-match']!==`"${pointer.sha256}"`) return reply(response,412,{error:'Archive changed on server; download before overwriting'});
        } else if (request.headers['if-none-match']!=='*') return reply(response,428,{error:'Send If-None-Match: * for first upload'});
        const archive=await readArchive(request);
        const sha256=createHash('sha256').update(archive).digest('hex');
        const objectPath=join(dataDirectory,`${sha256}.ehb`);
        try {await writeFile(objectPath,archive,{flag:'wx',mode:0o600})}
        catch(error) {if ((error as NodeJS.ErrnoException).code!=='EEXIST') throw error}
        const next:Pointer={sha256,bytes:archive.length};
        const temp=join(dataDirectory,`.current-${randomUUID()}.json`);
        try {
          await writeFile(temp,JSON.stringify(next),{flag:'wx',mode:0o600});
          await rename(temp,join(dataDirectory,'current.json'));
        } catch(error) {await unlink(temp).catch(()=>{});throw error}
        response.setHeader('etag',`"${sha256}"`);
        return reply(response,200,{sha256,bytes:archive.length});
      } finally {uploading=false}
    } catch(error) {
      const message=error instanceof Error?error.message:'Unexpected error';
      const badInput=message.includes('Archive exceeds')||message.includes('Not an educatioHarness')||message.includes('Agent request exceeds')||message.includes('Invalid agent');
      const isAgent=request.url==='/v1/agent';
      const failure=isAgent?classifyAgentFailure(message):{status:500,error:'Server error'};
      if(!response.headersSent) reply(response,badInput?400:failure.status,{error:badInput?message:failure.error});
    }
  });
}

async function main() {
  const directory=process.env.EDUCATIO_SYNC_DATA_DIR;
  const token=process.env.EDUCATIO_SYNC_TOKEN;
  if (!directory||!token) throw new Error('Set EDUCATIO_SYNC_DATA_DIR and EDUCATIO_SYNC_TOKEN');
  process.umask(0o077);
  await mkdir(directory,{recursive:true,mode:0o700});
  if (!(await lstat(directory)).isDirectory()) throw new Error('Sync data path is not a directory');
  const port=Number(process.env.EDUCATIO_SYNC_PORT??8787);
  if (!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid EDUCATIO_SYNC_PORT');
  const agentKey=process.env.EDUCATIO_AGENT_API_KEY;
  const base=resolve(fileURLToPath(import.meta.url),'../../..');
  const agentConfig=agentKey?{apiKey:agentKey,runtimePath:join(base,'agent-runtime/dist/main.js'),skillsDir:join(base,'skills')}:undefined;
  const server=createSyncServer(directory,token,agentConfig);
  server.listen(port,'127.0.0.1',()=>process.stdout.write(`educatioHarness sync server listening on 127.0.0.1:${port}\n`));
}

if (process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{process.stderr.write(`${error instanceof Error?error.message:'Startup error'}\n`);process.exitCode=1});
}
