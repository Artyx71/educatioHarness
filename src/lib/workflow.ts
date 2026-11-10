import { api, now } from './api';
import type { WorkflowExecution } from './types';

export type WorkflowStatus = 'pending'|'running'|'waiting_for_user'|'completed'|'failed'|'cancelled';
export type WorkflowTransition = {
  goalId:string;
  stepId:string;
  status:WorkflowStatus;
  input:unknown;
  output?:unknown;
  error?:string;
  sessionId?:string;
  instanceId?:string;
  dependencies?:string[];
  metadata?:Record<string,unknown>;
  progressUpdate?:boolean;
};

export async function transitionWorkflow(step:WorkflowTransition):Promise<WorkflowExecution> {
  const snapshot=await api.snapshot();
  const id=`${step.instanceId??step.goalId}:${step.stepId}`;
  const previous=snapshot.workflow_executions.find(item=>item.id===id);
  const dependencies=step.dependencies??[];
  if(step.status==='running') for(const dependency of dependencies) {
    if(!snapshot.workflow_executions.some(item=>item.id===dependency&&item.status==='completed')) {
      throw new Error(`Сначала завершите предыдущий шаг: ${dependency}`);
    }
  }
  const record:WorkflowExecution={
    id,goal_id:step.goalId,session_id:step.sessionId??null,step_id:step.stepId,status:step.status,
    input:JSON.stringify(step.input),output:step.output===undefined||step.output===null?'':JSON.stringify(step.output),
    error:step.error??'',retry_count:Number(previous?.retry_count??0)+(step.status==='running'&&!step.progressUpdate&&previous&&['running','failed','cancelled'].includes(previous.status)?1:0),
    dependencies:JSON.stringify(dependencies),metadata:JSON.stringify(step.metadata??{}),updated_at:now(),
  };
  await api.save('workflow_executions',record);
  return record;
}
