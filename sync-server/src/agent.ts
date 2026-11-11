import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {z} from 'zod';

const skills={
  probe:'knowledge-probe', evaluate_probe:'knowledge-probe', curriculum:'curriculum-planner',
  teach:'socratic-teacher', practice:'exercise-generator', evaluate_practice:'answer-evaluator',
  extract:'knowledge-extractor', audit:'knowledge-auditor', validate:'',
} as const;

const Payload=z.object({
  operation:z.enum(Object.keys(skills) as [keyof typeof skills,...(keyof typeof skills)[]]),
  model:z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/),
  input:z.unknown(),
  sessionId:z.string().max(256).nullable().optional(),
}).strict();

export type AgentConfig={apiKey:string;runtimePath:string;skillsDir:string};
export function classifyAgentFailure(message:string):{status:number;error:string} {
  if (message.includes('Country, region, or territory not supported') || message.includes('unsupported_country_region_territory'))
    return {status:403,error:'OpenAI API недоступен в регионе сервера. Выберите сервер в поддерживаемом регионе или используйте ChatGPT через Codex на компьютере.'};
  if (message.includes('401') || message.includes('invalid_api_key'))
    return {status:401,error:'OpenAI API-ключ на сервере отклонён. Проверьте EDUCATIO_AGENT_API_KEY.'};
  if (message.includes('429') || message.includes('rate_limit'))
    return {status:429,error:'Лимит запросов OpenAI API достигнут. Повторите позже.'};
  if (message.includes('Agent request timed out'))
    return {status:504,error:'Время ожидания ответа модели истекло.'};
  return {status:502,error:'Не удалось получить ответ модели на сервере.'};
}
export function validateAgentRequest(raw:unknown) {
  const parsed=Payload.safeParse(raw);
  if (!parsed.success) throw new Error('Invalid agent request');
  const data=parsed.data;
  return {operation:data.operation,provider:'openai',model:data.model,input:data.input,skill:skills[data.operation],skillDirectories:[],sessionId:data.sessionId??null};
}

export async function executeAgent(raw:unknown,config:AgentConfig,signal?:AbortSignal):Promise<unknown> {
  const request=validateAgentRequest(raw);
  if (!config.apiKey||!existsSync(config.runtimePath)) throw new Error('Agent provider is not configured on the server');
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[config.runtimePath],{
      cwd:config.skillsDir,
      env:{PATH:process.env.PATH,HOME:process.env.HOME,OPENAI_API_KEY:config.apiKey,EDUCATIOHARNESS_SKILLS_DIR:config.skillsDir},
      stdio:['pipe','pipe','pipe'],
    });
    let output='';let stderr='';let settled=false;
    const finish=(error?:Error,value?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value)};
    const abort=()=>{child.kill();finish(new Error('Agent request cancelled'))};
    const timer=setTimeout(()=>{child.kill();finish(new Error('Agent request timed out'))},180_000);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return}
    child.on('error',error=>finish(new Error(`Cannot start agent runtime: ${error.message}`)));
    child.stdout.on('data',(chunk:Buffer)=>{output+=chunk.toString('utf8');if(output.length>2_000_000){child.kill();finish(new Error('Agent output exceeded limit'))}});
    child.stderr.on('data',(chunk:Buffer)=>{stderr=(stderr+chunk.toString('utf8')).slice(-4000)});
    child.on('close',()=>{
      if(settled)return;
      const line=output.split('\n').reverse().find(part=>part.includes('"type":"result"'));
      if(!line){finish(new Error(`Agent runtime returned no result${stderr?': '+stderr.slice(0,300):''}`));return}
      try {
        const result=JSON.parse(line) as {type:string;ok:boolean;data?:unknown;error?:string};
        if(result.type!=='result'||!result.ok) finish(new Error((result.error??'Agent request failed').slice(0,500)));
        else finish(undefined,result.data);
      } catch {finish(new Error('Invalid agent runtime response'))}
    });
    child.stdin.end(JSON.stringify(request));
  });
}
