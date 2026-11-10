use rusqlite::{backup::Backup, params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, io::{BufRead, BufReader, Read, Write}, path::PathBuf, process::{Child, Command, Output, Stdio}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use tauri::{Emitter, Manager, State};

struct AppState { db: Mutex<Connection>, runs: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>, api_key_saved: Mutex<Option<(bool, Instant)>> }

#[derive(Serialize)]
struct SkillMetadata { name: String, description: String, source: String }

#[derive(Deserialize)]
struct SkillFrontmatter { name: String, description: String }

fn skill_directories(db: &Connection) -> Result<Vec<PathBuf>, String> {
    let saved: Option<String> = db.query_row("SELECT value FROM preferences WHERE key='skill_directories'", [], |row|row.get(0)).optional().map_err(|e|e.to_string())?;
    let names: Vec<String> = serde_json::from_str(saved.as_deref().unwrap_or("[]")).map_err(|e|e.to_string())?;
    if names.len() > 5 { return Err("Too many skill directories".into()); }
    names.into_iter().map(|name| {
        let path = PathBuf::from(&name);
        if !path.is_absolute() || name.len() > 1024 { return Err("Skill directory must be an absolute path".into()); }
        let canonical = path.canonicalize().map_err(|e|format!("Cannot open skill directory {name}: {e}"))?;
        if !canonical.is_dir() || canonical.parent().is_none() { return Err(format!("Invalid skill directory {name}")); }
        Ok(canonical)
    }).collect()
}

fn read_skill_metadata(path: &std::path::Path, source: &str) -> Result<SkillMetadata, String> {
    let mut header = String::new();
    std::fs::File::open(path.join("SKILL.md")).map_err(|e|e.to_string())?.take(4096).read_to_string(&mut header).map_err(|e|e.to_string())?;
    let normalized = header.replace("\r\n", "\n");
    let yaml = normalized.strip_prefix("---\n").and_then(|s|s.split_once("\n---").map(|(h,_)|h)).ok_or("Invalid SKILL.md frontmatter")?;
    let data: SkillFrontmatter = serde_yaml::from_str(yaml).map_err(|e|e.to_string())?;
    let name = &data.name;
    if name != path.file_name().and_then(|s|s.to_str()).unwrap_or("") || name.is_empty() || name.len() > 64 || name.starts_with('-') || name.ends_with('-') || name.contains("--") || !name.bytes().all(|b|b.is_ascii_lowercase()||b.is_ascii_digit()||b==b'-') { return Err("Invalid skill name".into()); }
    if data.description.is_empty() || data.description.len() > 1024 { return Err("Invalid skill description".into()); }
    Ok(SkillMetadata { name: data.name, description: data.description, source: source.to_string() })
}

#[tauri::command]
fn save_skill_directories(state: State<AppState>, directories: Vec<String>) -> Result<(), String> {
    if directories.len() > 5 { return Err("Можно добавить не более пяти каталогов навыков".into()); }
    let values: Vec<PathBuf> = directories.into_iter().map(|name| {
        let path = PathBuf::from(&name);
        if !path.is_absolute() || name.len() > 1024 { return Err("Укажите абсолютный путь к каталогу навыков".into()); }
        let canonical = path.canonicalize().map_err(|e|format!("Не удалось открыть каталог {name}: {e}"))?;
        if !canonical.is_dir() || canonical.parent().is_none() { return Err(format!("Некорректный каталог {name}")); }
        Ok(canonical)
    }).collect::<Result<_,String>>()?;
    let serialized = serde_json::to_string(&values).map_err(|e|e.to_string())?;
    state.db.lock().map_err(|e|e.to_string())?.execute("INSERT INTO preferences(key,value) VALUES('skill_directories',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![serialized]).map_err(|e|e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_skills(app: tauri::AppHandle, state: State<AppState>) -> Result<Vec<SkillMetadata>, String> {
    let db = state.db.lock().map_err(|e|e.to_string())?;
    let custom = skill_directories(&db)?;
    drop(db);
    let resource = app.path().resource_dir().map_err(|e|e.to_string())?;
    let built_in = if resource.join("skills").is_dir() { resource.join("skills") } else { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../skills") };
    let mut skills = Vec::new();
    for (root, source) in std::iter::once((built_in,"Встроенный".to_string())).chain(custom.into_iter().map(|p| { let label=p.display().to_string(); (p,label) })) {
        for entry in std::fs::read_dir(&root).map_err(|e|format!("Cannot read {}: {e}",root.display()))?.take(100) {
            let entry = entry.map_err(|e|e.to_string())?;
            if entry.file_type().map_err(|e|e.to_string())?.is_dir() && std::fs::symlink_metadata(entry.path().join("SKILL.md")).is_ok_and(|m|m.file_type().is_file()) {
                skills.push(read_skill_metadata(&entry.path(), &source).map_err(|e|format!("{}: {e}",entry.path().display()))?);
            }
        }
    }
    Ok(skills)
}

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

#[derive(Serialize)]
struct BackupInfo { goals: i64, sessions: i64, attempts: i64, version: i64 }

fn backup_path(path: &str, must_exist: bool) -> Result<PathBuf, String> {
    let file = PathBuf::from(path);
    if !file.is_absolute() || file.extension().and_then(|s|s.to_str()) != Some("sqlite3") || path.len() > 4096 { return Err("Выберите абсолютный путь к файлу .sqlite3".into()); }
    if must_exist {
        let meta = std::fs::symlink_metadata(&file).map_err(|e|e.to_string())?;
        if !meta.file_type().is_file() || meta.len() > 500_000_000 { return Err("Некорректный файл или архив больше 500 МБ".into()); }
    } else if file.exists() && !std::fs::symlink_metadata(&file).map_err(|e|e.to_string())?.file_type().is_file() { return Err("Путь назначения должен быть обычным файлом".into()); }
    Ok(file)
}

fn inspect_backup_file(path: &std::path::Path) -> Result<BackupInfo, String> {
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e|e.to_string())?;
    let integrity: String = db.query_row("PRAGMA integrity_check", [], |r|r.get(0)).map_err(|e|e.to_string())?;
    if integrity != "ok" { return Err("Файл базы данных повреждён".into()); }
    let version: i64 = db.query_row("PRAGMA user_version", [], |r|r.get(0)).map_err(|e|e.to_string())?;
    if !(2..=4).contains(&version) { return Err(format!("Версия данных {version} не поддерживается (ожидается 2–4)")); }
    let foreign_keys: i64 = db.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r|r.get(0)).map_err(|e|e.to_string())?;
    if foreign_keys != 0 { return Err("В архиве нарушены связи данных".into()); }
    let count = |table: &str| db.query_row(&format!("SELECT count(*) FROM {table}"), [], |r|r.get(0)).map_err(|e|e.to_string());
    Ok(BackupInfo { goals:count("learning_goals")?, sessions:count("sessions")?, attempts:count("attempts")?, version })
}

fn is_live_database_path(db: &Connection, path: &std::path::Path) -> bool {
    db.path().is_some_and(|current| path.exists() && path.canonicalize().ok() == PathBuf::from(current).canonicalize().ok())
}

#[tauri::command]
fn inspect_backup(path: String) -> Result<BackupInfo, String> { inspect_backup_file(&backup_path(&path,true)?) }

#[tauri::command]
fn export_backup(state: State<AppState>, path: String) -> Result<BackupInfo, String> {
    let destination = backup_path(&path,false)?;
    let temporary = destination.with_extension(format!("{}.sqlite3", uuid::Uuid::new_v4()));
    let result = (|| {
        let source = state.db.lock().map_err(|e|e.to_string())?;
        if is_live_database_path(&source,&destination) { return Err("Нельзя экспортировать поверх открытой базы приложения".into()); }
        let mut copy = Connection::open(&temporary).map_err(|e|e.to_string())?;
        Backup::new(&source,&mut copy).and_then(|backup|backup.run_to_completion(100,Duration::from_millis(10),None)).map_err(|e|e.to_string())?;
        drop(copy);
        let info = inspect_backup_file(&temporary)?;
        std::fs::copy(&temporary,&destination).map_err(|e|e.to_string())?;
        Ok(info)
    })();
    let _ = std::fs::remove_file(&temporary);
    result
}

#[tauri::command]
fn import_backup(state: State<AppState>, path: String) -> Result<BackupInfo, String> {
    if !state.runs.lock().map_err(|e|e.to_string())?.is_empty() { return Err("Дождитесь завершения запроса к модели".into()); }
    let source_path = backup_path(&path,true)?;
    let info = inspect_backup_file(&source_path)?;
    let source = Connection::open_with_flags(&source_path,OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e|e.to_string())?;
    let mut target = state.db.lock().map_err(|e|e.to_string())?;
    if is_live_database_path(&target,&source_path) { return Err("Нельзя импортировать открытую базу приложения".into()); }
    let safety_path = app_dir()?.join(format!("before-import-{}.sqlite3",uuid::Uuid::new_v4()));
    let mut safety = Connection::open(&safety_path).map_err(|e|e.to_string())?;
    Backup::new(&target,&mut safety).and_then(|backup|backup.run_to_completion(100,Duration::from_millis(10),None)).map_err(|e|e.to_string())?;
    drop(safety);
    Backup::new(&source,&mut target).and_then(|backup|backup.run_to_completion(100,Duration::from_millis(10),None)).map_err(|e|e.to_string())?;
    migrate(&target)?;
    target.execute("DELETE FROM preferences WHERE key IN ('skill_directories','skill_overrides')",[]).map_err(|e|e.to_string())?;
    Ok(info)
}

#[tauri::command]
fn export_obsidian(state: State<AppState>, directory: String) -> Result<String, String> {
    let vault = PathBuf::from(&directory);
    if !vault.is_absolute() || directory.len() > 4096 || !std::fs::symlink_metadata(&vault).map_err(|e|e.to_string())?.file_type().is_dir() { return Err("Выберите существующий каталог заметок".into()); }
    let db = state.db.lock().map_err(|e|e.to_string())?;
    let goals: Vec<(String,String)> = db.prepare("SELECT id,title FROM learning_goals ORDER BY created_at")
        .map_err(|e|e.to_string())?.query_map([],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|e|e.to_string())?
        .collect::<Result<_,_>>().map_err(|e|e.to_string())?;
    let topics: Vec<(String,String,String,String)> = db.prepare("SELECT c.goal_id,t.title,t.description,t.id FROM topics t JOIN curricula c ON c.id=t.curriculum_id ORDER BY t.position")
        .map_err(|e|e.to_string())?.query_map([],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(|e|e.to_string())?
        .collect::<Result<_,_>>().map_err(|e|e.to_string())?;
    let claims: Vec<(String,String,String,String)> = db.prepare("SELECT goal_id,name,statement,COALESCE(source_session_id,'') FROM knowledge_nodes WHERE kind='proposition' ORDER BY created_at")
        .map_err(|e|e.to_string())?.query_map([],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(|e|e.to_string())?
        .collect::<Result<_,_>>().map_err(|e|e.to_string())?;
    let folder = vault.join(format!("educatioHarness-{}",&uuid::Uuid::new_v4().to_string()[..8]));
    std::fs::create_dir(&folder).map_err(|e|e.to_string())?;
    let mut index = String::from("# educatioHarness — учебные заметки\n\nЭкспорт идей и плана. Утверждение в графе не доказывает понимание.\n\n");
    for (goal_index,(goal_id,title)) in goals.iter().enumerate() {
        let filename = format!("Цель-{}.md",goal_index+1);
        index.push_str(&format!("- [[Цель-{}|{}]]\n",goal_index+1,title.replace(['\n','|']," ")));
        let mut body = format!("# {}\n\n## Темы\n\n",title);
        for (topic_index,(_,name,description,_)) in topics.iter().enumerate().filter(|(_,t)|&t.0==goal_id) {
            body.push_str(&format!("- [[Тема-{}|{}]]\n",topic_index+1,name.replace(['\n','|']," ")));
            std::fs::write(folder.join(format!("Тема-{}.md",topic_index+1)),format!("# {}\n\n{}\n",name,description)).map_err(|e|e.to_string())?;
        }
        body.push_str("\n## Утверждения из графа\n\n");
        for (_,name,statement,source) in claims.iter().filter(|c|&c.0==goal_id) {
            body.push_str(&format!("### {}\n\n{}\n\nИсточник: занятие `{}`. Это запись модели, не доказательство усвоения.\n\n",name,statement,source));
        }
        std::fs::write(folder.join(filename),body).map_err(|e|e.to_string())?;
    }
    std::fs::write(folder.join("Обзор.md"),index).map_err(|e|e.to_string())?;
    Ok(folder.display().to_string())
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    if version > 4 { return Err(format!("Database version {version} is newer than this application")); }
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
    if version < 3 {
        conn.execute_batch("BEGIN IMMEDIATE;").map_err(|e|e.to_string())?;
        let result = conn.execute_batch(include_str!("../../migrations/003_knowledge_topics.sql"));
        match result {
            Ok(()) => conn.execute_batch("PRAGMA user_version=3; COMMIT;").map_err(|e|e.to_string())?,
            Err(e) => { let _ = conn.execute_batch("ROLLBACK;"); return Err(e.to_string()); }
        }
    }
    if version < 4 {
        conn.execute_batch("BEGIN IMMEDIATE;").map_err(|e|e.to_string())?;
        let result = conn.execute_batch(include_str!("../../migrations/004_guard_knowledge_topics.sql"));
        match result {
            Ok(()) => conn.execute_batch("PRAGMA user_version=4; COMMIT;").map_err(|e|e.to_string())?,
            Err(e) => { let _ = conn.execute_batch("ROLLBACK;"); return Err(e.to_string()); }
        }
    }
    Ok(())
}

#[tauri::command]
fn snapshot(state: State<AppState>) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let names = ["learning_goals","sessions","messages","diagnostic_answers","curricula","topics","exercises","attempts","knowledge_nodes","knowledge_edges","knowledge_topic_links","knowledge_provenance","workflow_executions","agent_executions","preferences"];
    let mut out = serde_json::Map::new();
    for name in names {
        let mut stmt = db.prepare(&format!("SELECT * FROM {name} ORDER BY {}", snapshot_order(name))).map_err(|e| e.to_string())?;
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

fn snapshot_order(table: &str) -> &'static str {
    match table {
        "learning_goals" | "sessions" | "curricula" | "workflow_executions" => "updated_at, id",
        "topics" => "curriculum_id, position, id",
        "preferences" => "key",
        "knowledge_topic_links" => "topic_id, node_id",
        _ => "created_at, id",
    }
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
        ("knowledge_topic_links", &["node_id","topic_id"]),
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
    let primary = if table == "preferences" {"key"} else if table == "knowledge_topic_links" {"node_id,topic_id"} else {"id"};
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

fn cached_api_key_status<F: FnOnce() -> bool>(cache: &Mutex<Option<(bool, Instant)>>, read: F) -> bool {
    let Ok(mut cached) = cache.lock() else { return false; };
    if let Some((value, checked)) = *cached {
        if checked.elapsed() < Duration::from_secs(60) { return value; }
    }
    let value = read();
    *cached = Some((value, Instant::now()));
    value
}

fn bundled_binary(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let filename = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    let resource = app.path().resource_dir().map_err(|e| e.to_string())?.join(&filename);
    if resource.is_file() { return Ok(resource); }
    let beside_app = std::env::current_exe().map_err(|e| e.to_string())?.with_file_name(filename);
    if beside_app.is_file() { return Ok(beside_app); }
    Err(format!("Исполняемый компонент {name} не найден. Переустановите приложение."))
}

#[tauri::command]
fn auth_status(app: tauri::AppHandle, state: State<AppState>) -> AuthStatus {
    let status = bundled_binary(&app, "educatioharness-codex").and_then(|path| Command::new(path).args(["login","status"]).output().map_err(|e|e.to_string()));
    let (installed, authenticated, detail) = match status {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let stderr = String::from_utf8_lossy(&o.stderr);
            let detail = if stdout.trim().is_empty() { stderr.trim() } else { stdout.trim() };
            (true, codex_logged_in(o.status.success(), &stdout, &stderr), detail.to_string())
        },
        Err(e) => (false, false, e.to_string()),
    };
    let saved = cached_api_key_status(&state.api_key_saved, || {
        keyring::Entry::new("educatio-harness", "openai-api-key").ok().and_then(|entry|entry.get_password().ok()).is_some()
    });
    AuthStatus { codex_installed: installed, codex_authenticated: authenticated, api_key_saved: saved, detail }
}

#[tauri::command]
fn codex_login(app: tauri::AppHandle) -> Result<(), String> {
    Command::new(bundled_binary(&app,"educatioharness-codex")?).arg("login").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn codex_logout(app: tauri::AppHandle) -> Result<(), String> {
    let result = Command::new(bundled_binary(&app,"educatioharness-codex")?).arg("logout").output().map_err(|e| e.to_string())?;
    if result.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&result.stderr).to_string()) }
}

#[tauri::command]
fn save_api_key(state: State<AppState>, key: String) -> Result<(), String> {
    if !key.starts_with("sk-") || key.len() > 512 { return Err("Введите корректный ключ OpenAI API".into()); }
    keyring::Entry::new("educatio-harness", "openai-api-key").map_err(|e| e.to_string())?.set_password(&key).map_err(|e| e.to_string())?;
    *state.api_key_saved.lock().map_err(|e|e.to_string())? = Some((true,Instant::now()));
    Ok(())
}

#[tauri::command]
fn remove_api_key(state: State<AppState>) -> Result<(), String> {
    keyring::Entry::new("educatio-harness", "openai-api-key").map_err(|e| e.to_string())?.delete_credential().map_err(|e|e.to_string())?;
    *state.api_key_saved.lock().map_err(|e|e.to_string())? = Some((false,Instant::now()));
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentRequest { request_id: String, operation: String, provider: String, model: String, input: Value, skill: String, session_id: Option<String> }

fn wait_for_agent<F: Fn(&str) + Send + 'static>(mut child: Child, cancelled: &AtomicBool, timeout: Duration, on_line: F) -> Result<Output, String> {
    let started = Instant::now();
    let stdout = child.stdout.take().ok_or("Missing runtime stdout")?;
    let mut stderr = child.stderr.take().ok_or("Missing runtime stderr")?;
    let stdout_reader = std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut data = Vec::new();
        loop {
            let mut line = Vec::new();
            let count = reader.read_until(b'\n', &mut line)?;
            if count == 0 { break; }
            if let Ok(text) = std::str::from_utf8(&line) { on_line(text); }
            data.extend_from_slice(&line);
        }
        Ok::<Vec<u8>,std::io::Error>(data)
    });
    let stderr_reader = std::thread::spawn(move || { let mut data = Vec::new(); stderr.read_to_end(&mut data).map(|_| data) });
    let status = loop {
        if cancelled.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err("Запрос отменён".into());
        }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? { break status; }
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err("Время ожидания ответа ИИ истекло".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let stdout = stdout_reader.join().map_err(|_|"Runtime stdout reader failed")?.map_err(|e|e.to_string())?;
    let stderr = stderr_reader.join().map_err(|_|"Runtime stderr reader failed")?.map_err(|e|e.to_string())?;
    Ok(Output { status, stdout, stderr })
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
    let sidecar = bundled_binary(&app,"educatioharness-node")?;
    let codex_binary = if request.provider == "codex" { Some(bundled_binary(&app,"educatioharness-codex")?) } else { None };
    let skills = if resource.join("skills").exists() { resource.join("skills") } else { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../skills") };
    let extra_skills = {
        let state = app.state::<AppState>();
        let db = state.db.lock().map_err(|e|e.to_string())?;
        skill_directories(&db)?
    };
    let agent_workspace = app_dir()?.join("agent-workspace");
    std::fs::create_dir_all(&agent_workspace).map_err(|e|e.to_string())?;
    let payload = json!({"operation":request.operation,"provider":request.provider,"model":request.model,"input":request.input,"skill":request.skill,"skillDirectories":extra_skills,"sessionId":request.session_id});
    let runs = app.state::<AppState>().runs.clone();
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = runs.lock().map_err(|e| e.to_string())?;
        if active.contains_key(&request.request_id) { return Err("Request ID is already active".into()); }
        active.insert(request.request_id.clone(), cancelled.clone());
    }
    let request_id = request.request_id.clone();
    let event_request_id = request_id.clone();
    let work = tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new(&sidecar);
        let runtime_dir = script.parent().ok_or("Agent runtime path is invalid")?;
        command.arg(&script).current_dir(runtime_dir).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        command.env("EDUCATIOHARNESS_SKILLS_DIR", skills);
        command.env("EDUCATIOHARNESS_AGENT_WORKSPACE", agent_workspace);
        command.env_remove("OPENAI_API_KEY");
        if let Some(path) = codex_binary { command.env("EDUCATIOHARNESS_CODEX_PATH", path); }
        if let Some(key) = key { command.env("OPENAI_API_KEY", key); }
        let mut child = command.spawn().map_err(|e| format!("Cannot start agent runtime: {e}"))?;
        child.stdin.take().ok_or("Missing runtime stdin")?.write_all(payload.to_string().as_bytes()).map_err(|e|e.to_string())?;
        let app_for_events = app.clone();
        let output = wait_for_agent(child, &cancelled, Duration::from_secs(180), move |line| {
            if let Ok(event) = serde_json::from_str::<Value>(line) {
                if event.get("type").and_then(Value::as_str) == Some("progress") {
                    let _ = app_for_events.emit("agent-progress", json!({"requestId":event_request_id,"chars":event.get("chars").and_then(Value::as_u64).unwrap_or(0)}));
                }
            }
        })?;
        let final_line = output.stdout.split(|b| *b == b'\n').find(|line| line.starts_with(b"{\"type\":\"result\""))
            .ok_or_else(||format!("Agent runtime failed: {}", String::from_utf8_lossy(&output.stderr).chars().take(500).collect::<String>()))?;
        let response: Value = serde_json::from_slice(final_line).map_err(|e|format!("Invalid agent response: {e}"))?;
        if response.get("ok") == Some(&Value::Bool(true)) { Ok(response.get("data").cloned().unwrap_or(Value::Null)) }
        else { Err(response.get("error").and_then(Value::as_str).unwrap_or("Agent request failed").to_string()) }
    }).await.map_err(|e|e.to_string());
    runs.lock().map_err(|e| e.to_string())?.remove(&request_id);
    work?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = open_db().expect("Cannot initialize local database");
    tauri::Builder::default().manage(AppState { db: Mutex::new(db), runs: Arc::new(Mutex::new(HashMap::new())), api_key_saved: Mutex::new(None) })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![snapshot,save_record,delete_record,auth_status,codex_login,codex_logout,save_api_key,remove_api_key,agent_call,cancel_agent,save_skill_directories,list_skills,inspect_backup,export_backup,import_backup,export_obsidian])
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
    fn api_key_status_cache_avoids_repeated_secret_store_reads() {
        let cache = Mutex::new(None);
        let mut reads = 0;
        assert!(cached_api_key_status(&cache, || { reads += 1; true }));
        assert!(cached_api_key_status(&cache, || { reads += 1; false }));
        assert_eq!(reads,1);
        *cache.lock().unwrap() = Some((true,Instant::now()-Duration::from_secs(61)));
        assert!(!cached_api_key_status(&cache, || { reads += 1; false }));
        assert_eq!(reads,2);
    }
    #[test]
    fn agent_request_accepts_frontend_camel_case_fields() {
        let request: AgentRequest = serde_json::from_value(json!({
            "requestId":"probe-request",
            "operation":"probe",
            "provider":"codex",
            "model":"default",
            "input":{"goal":"Изучить C"},
            "skill":"knowledge-probe",
            "sessionId":"session-id"
        })).unwrap();
        assert_eq!(request.request_id,"probe-request");
        assert_eq!(request.session_id.as_deref(),Some("session-id"));
    }
    #[test]
    fn migration_is_versioned_and_reentrant() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&conn).unwrap(); migrate(&conn).unwrap();
        let version:i64 = conn.query_row("PRAGMA user_version",[],|r|r.get(0)).unwrap();
        assert_eq!(version,4);
        conn.execute("INSERT INTO learning_goals VALUES ('g','C','t','t')",[]).unwrap();
        assert!(conn.execute("INSERT INTO sessions VALUES ('s','missing','probe','C','t','t')",[]).is_err());
    }
    #[test]
    fn upgrades_v2_graph_and_preserves_topic_links() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(include_str!("../../migrations/001_initial.sql")).unwrap();
        conn.execute_batch(include_str!("../../migrations/002_provenance.sql")).unwrap();
        conn.execute_batch("PRAGMA user_version=2;").unwrap();
        conn.execute("INSERT INTO learning_goals VALUES ('g','C','t','t')",[]).unwrap();
        conn.execute("INSERT INTO curricula VALUES ('c','g','t','t')",[]).unwrap();
        conn.execute("INSERT INTO topics VALUES ('t','c','Указатели','desc','[]','[]','intro','pending',0)",[]).unwrap();
        conn.execute("INSERT INTO knowledge_nodes VALUES ('n','g','concept','Указатели','desc',NULL,NULL,'t')",[]).unwrap();
        migrate(&conn).unwrap();
        let linked:i64=conn.query_row("SELECT count(*) FROM knowledge_topic_links WHERE node_id='n' AND topic_id='t'",[],|row|row.get(0)).unwrap();
        assert_eq!(linked,1);
        conn.execute("INSERT INTO learning_goals VALUES ('g2','Rust','t','t')",[]).unwrap();
        conn.execute("INSERT INTO curricula VALUES ('c2','g2','t','t')",[]).unwrap();
        conn.execute("INSERT INTO topics VALUES ('t2','c2','Ownership','desc','[]','[]','intro','pending',0)",[]).unwrap();
        assert!(conn.execute("INSERT INTO knowledge_topic_links VALUES ('n','t2')",[]).is_err());
        let version:i64=conn.query_row("PRAGMA user_version",[],|row|row.get(0)).unwrap();
        assert_eq!(version,4);
    }
    #[test]
    fn v2_backup_can_be_inspected_and_imported_into_current_schema() {
        let path = std::env::temp_dir().join(format!("educatio-v2-{}.sqlite3",uuid::Uuid::new_v4()));
        let old = Connection::open(&path).unwrap();
        old.execute_batch(include_str!("../../migrations/001_initial.sql")).unwrap();
        old.execute_batch(include_str!("../../migrations/002_provenance.sql")).unwrap();
        old.execute_batch("PRAGMA user_version=2; INSERT INTO learning_goals VALUES ('g','C','t','t');").unwrap();
        drop(old);
        let info=inspect_backup_file(&path).unwrap();
        assert_eq!(info.version,2);
        assert_eq!(info.goals,1);
        let source=Connection::open_with_flags(&path,OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        let mut target=Connection::open_in_memory().unwrap();
        migrate(&target).unwrap();
        Backup::new(&source,&mut target).unwrap().run_to_completion(100,Duration::from_millis(1),None).unwrap();
        migrate(&target).unwrap();
        let version:i64=target.query_row("PRAGMA user_version",[],|row|row.get(0)).unwrap();
        let title:String=target.query_row("SELECT title FROM learning_goals WHERE id='g'",[],|row|row.get(0)).unwrap();
        assert_eq!(version,4);
        assert_eq!(title,"C");
        drop(source);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn snapshots_order_recent_goals_and_sessions_by_update_time() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn.execute("INSERT INTO learning_goals VALUES ('newer-created','C','2026-02-01','2026-02-01')",[]).unwrap();
        conn.execute("INSERT INTO learning_goals VALUES ('recently-used','Rust','2026-01-01','2026-03-01')",[]).unwrap();
        let query = format!("SELECT id FROM learning_goals ORDER BY {}",snapshot_order("learning_goals"));
        let ids: Vec<String> = conn.prepare(&query).unwrap().query_map([],|row|row.get(0)).unwrap().collect::<Result<_,_>>().unwrap();
        assert_eq!(ids,vec!["newer-created","recently-used"]);
        assert_eq!(snapshot_order("topics"),"curriculum_id, position, id");
    }
    #[test]
    #[cfg(unix)]
    fn cancellation_stops_child_process() {
        let child = Command::new("sleep").arg("5").stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
        let cancelled = AtomicBool::new(true);
        let started = Instant::now();
        let result = wait_for_agent(child, &cancelled, Duration::from_secs(1), |_| {});
        assert!(result.unwrap_err().contains("отменён"));
        assert!(started.elapsed() < Duration::from_secs(1));
    }
    #[test]
    #[cfg(unix)]
    fn large_runtime_output_does_not_block() {
        let child = Command::new("head").args(["-c", "131072", "/dev/zero"]).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
        let output = wait_for_agent(child, &AtomicBool::new(false), Duration::from_secs(3), |_| {}).unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout.len(), 131072);
    }
    #[test]
    fn built_in_skills_have_valid_discoverable_metadata() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../skills");
        let probe = read_skill_metadata(&root.join("knowledge-probe"), "Встроенный").unwrap();
        assert_eq!(probe.name, "knowledge-probe");
        assert!(!probe.description.is_empty());
    }
    #[test]
    fn backup_roundtrip_preserves_learning_data() {
        let path = std::env::temp_dir().join(format!("educatio-test-{}.sqlite3",uuid::Uuid::new_v4()));
        let source = Connection::open_in_memory().unwrap();
        migrate(&source).unwrap();
        source.execute("INSERT INTO learning_goals VALUES ('goal','Изучить C','now','now')",[]).unwrap();
        let mut archive = Connection::open(&path).unwrap();
        assert!(is_live_database_path(&archive,&path));
        Backup::new(&source,&mut archive).unwrap().run_to_completion(100,Duration::from_millis(1),None).unwrap();
        drop(archive);
        let info = inspect_backup_file(&path).unwrap();
        assert_eq!(info.goals,1);
        let from_archive = Connection::open_with_flags(&path,OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        let mut restored = Connection::open_in_memory().unwrap();
        Backup::new(&from_archive,&mut restored).unwrap().run_to_completion(100,Duration::from_millis(1),None).unwrap();
        let title: String = restored.query_row("SELECT title FROM learning_goals WHERE id='goal'",[],|r|r.get(0)).unwrap();
        assert_eq!(title,"Изучить C");
        drop(from_archive);
        std::fs::remove_file(path).unwrap();
    }
}
