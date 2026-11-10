use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, io::Write, path::PathBuf, process::{Child, Command, Output, Stdio}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use tauri::{Manager, State};

struct AppState { db: Mutex<Connection>, runs: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>> }

fn app_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or("No local data directory")?;
    let dir = base.join("educatio-harness");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn open_db() -> Result<Connection, String> {
    let new_path = app_dir()?.join("educatio-harness.sqlite3");
    let legacy_path = dirs::data_local_dir().ok_or("No local data directory")?.join("my-harness/my-harness.sqlite3");
    let db_path = if !new_path.exists() && legacy_path.exists() { legacy_path } else { new_path };
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;").map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    if version > 2 { return Err(format!("Database version {version} is newer than this application")); }
    if version < 1 {
        conn.execute_batch("BEGIN IMMEDIATE;").map_err(|e|e.to_string())?;
        let result = conn.execute_batch(include_str!("../../migrations/001_initial.sql"));
        match result {
            Ok(()) => conn.execute_batch("PRAGMA user_version=1; COMMIT;").map_err(|e|e.to_string())?,
            Err(e) => { let _ = conn.execute_batch("ROLLBACK;"); return Err(e.to_string()); }
        }
    }
    if version < 2 {
        conn.execute_batch("BEGIN IMMEDIATE;").map_err(|e|e.to_string())?;
        let result = conn.execute_batch(include_str!("../../migrations/002_provenance.sql"));
        match result {
            Ok(()) => conn.execute_batch("PRAGMA user_version=2; COMMIT;").map_err(|e|e.to_string())?,
            Err(e) => { let _ = conn.execute_batch("ROLLBACK;"); return Err(e.to_string()); }
        }
    }
    Ok(())
}

#[tauri::command]
fn snapshot(state: State<AppState>) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let names = ["learning_goals","sessions","messages","diagnostic_answers","curricula","topics","exercises","attempts","knowledge_nodes","knowledge_edges","knowledge_provenance","workflow_executions","agent_executions","preferences"];
    let mut out = serde_json::Map::new();
    for name in names {
        let mut stmt = db.prepare(&format!("SELECT * FROM {name}")).map_err(|e| e.to_string())?;
        let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rows = stmt.query_map([], |row| {
            let mut item = serde_json::Map::new();
            for (i, col) in cols.iter().enumerate() {
                let value: rusqlite::types::Value = row.get(i)?;
                item.insert(col.clone(), match value {
                    rusqlite::types::Value::Null => Value::Null,
                    rusqlite::types::Value::Integer(n) => json!(n),
                    rusqlite::types::Value::Real(n) => json!(n),
                    rusqlite::types::Value::Text(s) => json!(s),
                    rusqlite::types::Value::Blob(_) => Value::Null,
                });
            }
            Ok(Value::Object(item))
        }).map_err(|e| e.to_string())?;
        let values: Result<Vec<_>, _> = rows.collect();
        out.insert(name.into(), json!(values.map_err(|e| e.to_string())?));
    }
    Ok(Value::Object(out))
}

#[tauri::command]
fn save_record(state: State<AppState>, table: String, record: Value) -> Result<(), String> {
    let allowed: &[(&str, &[&str])] = &[
        ("learning_goals", &["id","title","created_at","updated_at"]),
        ("sessions", &["id","goal_id","phase","title","created_at","updated_at"]),
        ("messages", &["id","session_id","role","content","kind","created_at"]),
        ("diagnostic_answers", &["id","session_id","question","answer","reasoning","evaluation","created_at"]),
        ("curricula", &["id","goal_id","created_at","updated_at"]),
        ("topics", &["id","curriculum_id","title","description","prerequisites","objectives","difficulty","status","position"]),
        ("exercises", &["id","goal_id","topic_id","kind","prompt","solution","created_at"]),
        ("attempts", &["id","exercise_id","answer","reasoning","evaluation","created_at"]),
        ("knowledge_nodes", &["id","goal_id","kind","name","statement","source_session_id","source_message_id","created_at"]),
        ("knowledge_edges", &["id","goal_id","premises","conclusion_id","source_session_id","created_at"]),
        ("knowledge_provenance", &["id","node_id","session_id","message_id","created_at"]),
        ("workflow_executions", &["id","goal_id","status","step_id","input","output","error","retry_count","updated_at"]),
        ("agent_executions", &["id","session_id","provider","model","operation","status","duration_ms","metadata","created_at"]),
        ("preferences", &["key","value"]),
    ];
    let (_, columns) = allowed.iter().find(|(name, _)| *name == table).ok_or("Unsupported table")?;
    for key in record.as_object().ok_or("Record must be an object")?.keys() {
        if !columns.contains(&key.as_str()) { return Err(format!("Unsupported field {key}")); }
    }
    let values: Vec<rusqlite::types::Value> = columns.iter().map(|c| match record.get(*c) {
        Some(Value::String(s)) if s.is_empty() && ["topic_id","source_session_id","source_message_id","session_id","message_id"].contains(c) => Ok(rusqlite::types::Value::Null),
        Some(Value::String(s)) => Ok(rusqlite::types::Value::Text(s.clone())),
        Some(Value::Number(n)) => Ok(rusqlite::types::Value::Text(n.to_string())),
        Some(Value::Null) | None => Ok(rusqlite::types::Value::Null),
        _ => Err(format!("Invalid field {c}")),
    }).collect::<Result<_,_>>()?;
    for c in *columns { if !["evaluation","output","error","topic_id","source_session_id","source_message_id","session_id","message_id"].contains(c) && record.get(*c).is_none_or(|v|v.is_null()||v.as_str()==Some("")) { return Err(format!("Empty {c}")); } }
    let placeholders = vec!["?"; columns.len()].join(",");
    let primary = if table == "preferences" {"key"} else {"id"};
    let updates = columns.iter().filter(|c| **c != primary).map(|c|format!("{c}=excluded.{c}")).collect::<Vec<_>>().join(",");
    let query = format!("INSERT INTO {table} ({}) VALUES ({placeholders}) ON CONFLICT({primary}) DO UPDATE SET {updates}", columns.join(","));
    state.db.lock().map_err(|e| e.to_string())?.execute(&query, rusqlite::params_from_iter(values)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_record(state: State<AppState>, table: String, id: String) -> Result<(), String> {
    if !["topics","knowledge_nodes","knowledge_edges","exercises","learning_goals"].contains(&table.as_str()) { return Err("Unsupported delete".into()); }
    if id.len() > 128 || id.is_empty() { return Err("Invalid ID".into()); }
    state.db.lock().map_err(|e| e.to_string())?.execute(&format!("DELETE FROM {table} WHERE id=?"), params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
struct AuthStatus { codex_installed: bool, codex_authenticated: bool, api_key_saved: bool, detail: String }

fn codex_logged_in(success: bool, stdout: &str, stderr: &str) -> bool {
    success && (stdout.trim().starts_with("Logged in") || stderr.trim().starts_with("Logged in"))
}

#[tauri::command]
fn auth_status() -> AuthStatus {
    let status = Command::new("codex").args(["login","status"]).output();
    let (installed, authenticated, detail) = match status {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let stderr = String::from_utf8_lossy(&o.stderr);
            let detail = if stdout.trim().is_empty() { stderr.trim() } else { stdout.trim() };
            (true, codex_logged_in(o.status.success(), &stdout, &stderr), detail.to_string())
        },
        Err(e) => (false, false, e.to_string()),
    };
    let saved = keyring::Entry::new("educatio-harness", "openai-api-key").ok().and_then(|e|e.get_password().ok()).is_some();
    AuthStatus { codex_installed: installed, codex_authenticated: authenticated, api_key_saved: saved, detail }
}

#[tauri::command]
fn codex_login() -> Result<(), String> {
    Command::new("codex").arg("login").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn codex_logout() -> Result<(), String> {
    let result = Command::new("codex").arg("logout").output().map_err(|e| e.to_string())?;
    if result.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&result.stderr).to_string()) }
}

#[tauri::command]
fn save_api_key(key: String) -> Result<(), String> {
    if !key.starts_with("sk-") || key.len() > 512 { return Err("Enter a valid OpenAI API key".into()); }
    keyring::Entry::new("educatio-harness", "openai-api-key").map_err(|e| e.to_string())?.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_api_key() -> Result<(), String> { keyring::Entry::new("educatio-harness", "openai-api-key").map_err(|e| e.to_string())?.delete_credential().map_err(|e|e.to_string()) }

#[derive(Deserialize)]
struct AgentRequest { request_id: String, operation: String, provider: String, model: String, input: Value, skill: String, session_id: Option<String> }

fn wait_for_agent(mut child: Child, cancelled: &AtomicBool, timeout: Duration) -> Result<Output, String> {
    let started = Instant::now();
    loop {
        if cancelled.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Запрос отменён".into());
        }
        if child.try_wait().map_err(|e| e.to_string())?.is_some() { break; }
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Время ожидания ответа ИИ истекло".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    child.wait_with_output().map_err(|e| e.to_string())
}

#[tauri::command]
fn cancel_agent(state: State<AppState>, request_id: String) -> Result<bool, String> {
    let runs = state.runs.lock().map_err(|e| e.to_string())?;
    if let Some(cancelled) = runs.get(&request_id) {
        cancelled.store(true, Ordering::Relaxed);
        Ok(true)
    } else { Ok(false) }
}

#[tauri::command]
async fn agent_call(app: tauri::AppHandle, request: AgentRequest) -> Result<Value, String> {
    if request.request_id.len() > 64 || request.request_id.is_empty() || !request.request_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') { return Err("Invalid request ID".into()); }
    if !["probe","evaluate_probe","curriculum","teach","practice","evaluate_practice","extract","audit","validate"].contains(&request.operation.as_str()) { return Err("Invalid operation".into()); }
    if !["codex","openai"].contains(&request.provider.as_str()) { return Err("Invalid provider".into()); }
    if request.model.len() > 100 || request.skill.len() > 80 || request.input.to_string().len() > 200_000 { return Err("Request too large".into()); }
    let key = if request.provider == "openai" { Some(keyring::Entry::new("educatio-harness", "openai-api-key").map_err(|e|e.to_string())?.get_password().map_err(|_|"No API key saved".to_string())?) } else { None };
    let resource = app.path().resource_dir().map_err(|e|e.to_string())?;
    let bundled = resource.join("agent-runtime/main.mjs");
    let script = if bundled.exists() { bundled } else { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../agent-runtime/dist/main.js") };
    if !script.exists() { return Err("Agent runtime is missing. Run npm run runtime:build".into()); }
    let resource_sidecar = resource.join("educatioharness-node");
    let installed_sidecar = std::env::current_exe().map_err(|e|e.to_string())?.with_file_name("educatioharness-node");
    let sidecar = if resource_sidecar.exists() { resource_sidecar } else { installed_sidecar };
    if !sidecar.exists() { return Err("Node sidecar is missing from the application package".into()); }
    let skills = if resource.join("skills").exists() { resource.join("skills") } else { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../skills") };
    let payload = json!({"operation":request.operation,"provider":request.provider,"model":request.model,"input":request.input,"skill":request.skill,"sessionId":request.session_id});
    let runs = app.state::<AppState>().runs.clone();
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = runs.lock().map_err(|e| e.to_string())?;
        if active.contains_key(&request.request_id) { return Err("Request ID is already active".into()); }
        active.insert(request.request_id.clone(), cancelled.clone());
    }
    let work = tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new(&sidecar);
        let runtime_dir = script.parent().ok_or("Agent runtime path is invalid")?;
        command.arg(&script).current_dir(runtime_dir).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        command.env("EDUCATIOHARNESS_SKILLS_DIR", skills);
        command.env("EDUCATIOHARNESS_CODEX_PATH", "codex");
        if let Some(key) = key { command.env("OPENAI_API_KEY", key); }
        let mut child = command.spawn().map_err(|e| format!("Cannot start agent runtime: {e}"))?;
        child.stdin.take().ok_or("Missing runtime stdin")?.write_all(payload.to_string().as_bytes()).map_err(|e|e.to_string())?;
        let output = wait_for_agent(child, &cancelled, Duration::from_secs(180))?;
        let response: Value = serde_json::from_slice(&output.stdout).map_err(|_|format!("Agent runtime failed: {}", String::from_utf8_lossy(&output.stderr).chars().take(500).collect::<String>()))?;
        if response.get("ok") == Some(&Value::Bool(true)) { Ok(response.get("data").cloned().unwrap_or(Value::Null)) }
        else { Err(response.get("error").and_then(Value::as_str).unwrap_or("Agent request failed").to_string()) }
    }).await.map_err(|e|e.to_string());
    runs.lock().map_err(|e| e.to_string())?.remove(&request.request_id);
    work?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = open_db().expect("Cannot initialize local database");
    tauri::Builder::default().manage(AppState { db: Mutex::new(db), runs: Arc::new(Mutex::new(HashMap::new())) })
        .invoke_handler(tauri::generate_handler![snapshot,save_record,delete_record,auth_status,codex_login,codex_logout,save_api_key,remove_api_key,agent_call,cancel_agent])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let state = window.state::<AppState>();
                if let Ok(active) = state.runs.lock() {
                    for cancelled in active.values() { cancelled.store(true, Ordering::Relaxed); }
                };
            }
        })
        .run(tauri::generate_context!()).expect("error while running educatioHarness");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn codex_status_can_arrive_on_stderr() {
        assert!(codex_logged_in(true, "", "Logged in using ChatGPT"));
        assert!(codex_logged_in(true, "Logged in using ChatGPT", ""));
        assert!(!codex_logged_in(false, "", "Logged in using ChatGPT"));
        assert!(!codex_logged_in(true, "", "Not logged in"));
    }
    #[test]
    fn migration_is_versioned_and_reentrant() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&conn).unwrap(); migrate(&conn).unwrap();
        let version:i64 = conn.query_row("PRAGMA user_version",[],|r|r.get(0)).unwrap();
        assert_eq!(version,2);
        conn.execute("INSERT INTO learning_goals VALUES ('g','C','t','t')",[]).unwrap();
        assert!(conn.execute("INSERT INTO sessions VALUES ('s','missing','probe','C','t','t')",[]).is_err());
    }
    #[test]
    fn cancellation_stops_child_process() {
        let child = Command::new("sleep").arg("5").stdout(Stdio::piped()).spawn().unwrap();
        let cancelled = AtomicBool::new(true);
        let started = Instant::now();
        let result = wait_for_agent(child, &cancelled, Duration::from_secs(1));
        assert!(result.unwrap_err().contains("отменён"));
        assert!(started.elapsed() < Duration::from_secs(1));
    }
}
