ALTER TABLE workflow_executions ADD COLUMN session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE workflow_executions ADD COLUMN dependencies TEXT NOT NULL DEFAULT '[]';
ALTER TABLE workflow_executions ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_workflow_steps_goal ON workflow_executions(goal_id, step_id, updated_at);
