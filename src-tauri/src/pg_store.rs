use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::sync::OnceLock;
use postgres::{Client, NoTls};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PgConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    #[serde(default)]
    pub data_dir: Option<String>,
    #[serde(default)]
    pub bin_dir: Option<String>,
}

static PG_STATE: OnceLock<Mutex<Option<PgRuntime>>> = OnceLock::new();

struct PgRuntime {
    config: PgConfig,
    conn_str: String,
    active: bool,
    pg_version: String,
    last_error: Option<String>,
}

fn pg_state_lock() -> &'static Mutex<Option<PgRuntime>> {
    PG_STATE.get_or_init(|| Mutex::new(None))
}

fn get_pg_config_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        paths.push(PathBuf::from(&local_app_data).join("ArkaPOS").join("pg_config.json"));
        paths.push(
            PathBuf::from(&local_app_data)
                .join("com.arka.restaurantpos.server")
                .join("pg_config.json"),
        );
        paths.push(
            PathBuf::from(&local_app_data)
                .join("com.arka.restaurantpos")
                .join("pg_config.json"),
        );
    }
    paths.push(PathBuf::from("data").join("pg_config.json"));
    paths
}

pub fn load_pg_config() -> Option<PgConfig> {
    // 1. Check config file written by Windows Server installer (setup-win-postgres.ps1)
    for p in get_pg_config_paths() {
        if p.exists() {
            if let Ok(raw) = fs::read_to_string(&p) {
                let trimmed = raw.trim_start_matches('\u{feff}').trim();
                if let Ok(cfg) = serde_json::from_str::<PgConfig>(trimmed) {
                    if !cfg.host.is_empty() && !cfg.user.is_empty() && !cfg.database.is_empty() {
                        return Some(cfg);
                    }
                }
            }
        }
    }

    // 2. Check environment variables (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)
    let host = std::env::var("PGHOST").ok().filter(|s| !s.trim().is_empty())?;
    let user = std::env::var("PGUSER").ok().filter(|s| !s.trim().is_empty())?;
    let database = std::env::var("PGDATABASE").ok().filter(|s| !s.trim().is_empty())?;
    let password = std::env::var("PGPASSWORD").unwrap_or_default();
    let port = std::env::var("PGPORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(5432);

    Some(PgConfig {
        host,
        port,
        user,
        password,
        database,
        data_dir: None,
        bin_dir: None,
    })
}

fn build_conn_str(cfg: &PgConfig) -> String {
    let escaped_pass = cfg.password.replace('\\', "\\\\").replace('\'', "\\'");
    format!(
        "host='{}' port={} user='{}' password='{}' dbname='{}' connect_timeout=4",
        cfg.host, cfg.port, cfg.user, escaped_pass, cfg.database
    )
}

fn try_start_bundled_postgres(cfg: &PgConfig) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let bin_dir = match &cfg.bin_dir {
            Some(b) if !b.trim().is_empty() => PathBuf::from(b),
            _ => return,
        };
        let data_dir = match &cfg.data_dir {
            Some(d) if !d.trim().is_empty() => PathBuf::from(d),
            _ => return,
        };

        let pg_ctl = bin_dir.join("pg_ctl.exe");
        if !pg_ctl.exists() || !data_dir.join("PG_VERSION").exists() {
            return;
        }

        // Check status first
        let status_out = Command::new(&pg_ctl)
            .args(&["-D", &data_dir.to_string_lossy(), "status"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(out) = status_out {
            if out.status.success() {
                return; // Already running
            }
        }

        let log_file = data_dir.join("postgres.log");
        let _ = Command::new(&pg_ctl)
            .args(&[
                "-D",
                &data_dir.to_string_lossy(),
                "-l",
                &log_file.to_string_lossy(),
                "-w",
                "-t",
                "12",
                "start",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = cfg;
    }
}

fn ensure_schema(client: &mut Client) -> Result<(), String> {
    client
        .batch_execute(
            "
            CREATE TABLE IF NOT EXISTS arka_meta (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS arka_records (
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                payload JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (table_name, record_id)
            );
            CREATE INDEX IF NOT EXISTS idx_arka_records_table ON arka_records (table_name);
            CREATE TABLE IF NOT EXISTS arka_backups (
                id BIGSERIAL PRIMARY KEY,
                backup_type TEXT NOT NULL,
                db_version BIGINT NOT NULL,
                stats JSONB NOT NULL DEFAULT '{}'::jsonb,
                payload JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ",
        )
        .map_err(|e| format!("Schema init error: {}", e))
}

fn is_valid_table_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 63 {
        return false;
    }
    let mut chars = name.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn extract_record_id(table_name: &str, row: &Value, idx: usize) -> String {
    if table_name == "settings" {
        return "1".to_string();
    }
    if table_name == "chartOfAccounts" {
        if let Some(code) = row.get("code") {
            let s = value_to_id_string(code);
            if !s.is_empty() {
                return s;
            }
        }
    }
    if let Some(id) = row.get("id") {
        let s = value_to_id_string(id);
        if !s.is_empty() {
            return s;
        }
    }
    if let Some(tid) = row.get("tempId") {
        let s = value_to_id_string(tid);
        if !s.is_empty() {
            return s;
        }
    }
    format!("row_{}", idx)
}

fn value_to_id_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn count_business_records(data: &Value) -> usize {
    let mut total = 0usize;
    if let Some(map) = data.as_object() {
        for (k, v) in map {
            if k == "chartOfAccounts" || k == "rawMaterialCategories" || k == "isRawClean" {
                continue;
            }
            if let Some(arr) = v.as_array() {
                total += arr.len();
            }
        }
    }
    total
}

fn compute_stats_json(data: &Value) -> Value {
    let mut table_counts = serde_json::Map::new();
    let mut total = 0usize;
    if let Some(map) = data.as_object() {
        for (k, v) in map {
            if let Some(arr) = v.as_array() {
                table_counts.insert(k.clone(), json!(arr.len()));
                total += arr.len();
            }
        }
    }
    json!({
        "totalRecords": total,
        "orders": data.get("orders").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        "menuItems": data.get("menuItems").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        "warehouses": data.get("warehouses").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        "recipes": data.get("recipes").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        "tableCounts": table_counts
    })
}

fn write_state_tx(client: &mut Client, state: &Value, snapshot_type: Option<&str>) -> Result<(), String> {
    let version = state.get("version").and_then(|v| v.as_i64()).unwrap_or(1);
    let last_updated = state.get("lastUpdated").and_then(|v| v.as_i64()).unwrap_or(0);
    let empty_obj = json!({});
    let data = state.get("data").unwrap_or(&empty_obj);
    let is_raw_clean = data.get("isRawClean").and_then(|v| v.as_bool()).unwrap_or(false);

    let mut tx = client.transaction().map_err(|e| format!("PG BEGIN error: {}", e))?;
    tx.execute("DELETE FROM arka_records", &[])
        .map_err(|e| format!("PG DELETE error: {}", e))?;

    if let Some(tables) = data.as_object() {
        for (table_name, rows_val) in tables {
            if table_name == "isRawClean" || !is_valid_table_name(table_name) {
                continue;
            }
            if let Some(rows) = rows_val.as_array() {
                for (idx, row) in rows.iter().enumerate() {
                    if !row.is_object() {
                        continue;
                    }
                    let rec_id = extract_record_id(table_name, row, idx);
                    tx.execute(
                        "INSERT INTO arka_records (table_name, record_id, payload, updated_at)
                         VALUES ($1, $2, $3, NOW())
                         ON CONFLICT (table_name, record_id)
                         DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()",
                        &[table_name, &rec_id, row],
                    )
                    .map_err(|e| format!("PG UPSERT error on {}: {}", table_name, e))?;
                }
            }
        }
    }

    let ver_json = json!(version);
    let upd_json = json!(last_updated);
    let raw_json = json!(is_raw_clean);

    tx.execute(
        "INSERT INTO arka_meta (key, value, updated_at)
         VALUES ('db_version', $1, NOW()),
                ('last_updated', $2, NOW()),
                ('is_raw_clean', $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
        &[&ver_json, &upd_json, &raw_json],
    )
    .map_err(|e| format!("PG META update error: {}", e))?;

    if let Some(bk_type) = snapshot_type {
        let stats = compute_stats_json(data);
        let payload = json!({
            "version": version,
            "lastUpdated": last_updated,
            "storageEngine": "postgresql",
            "data": data
        });
        tx.execute(
            "INSERT INTO arka_backups (backup_type, db_version, stats, payload) VALUES ($1, $2, $3, $4)",
            &[&bk_type, &version, &stats, &payload],
        )
        .map_err(|e| format!("PG BACKUP insert error: {}", e))?;
        let _ = tx.execute(
            "DELETE FROM arka_backups WHERE id NOT IN (SELECT id FROM arka_backups ORDER BY id DESC LIMIT 30)",
            &[],
        );
    }

    tx.commit().map_err(|e| format!("PG COMMIT error: {}", e))?;
    Ok(())
}

fn read_state_from_client(client: &mut Client) -> Result<Value, String> {
    let mut version: i64 = 1;
    let mut last_updated: i64 = 0;
    let mut is_raw_clean = false;

    let meta_rows = client
        .query("SELECT key, value FROM arka_meta", &[])
        .map_err(|e| format!("PG meta query error: {}", e))?;
    for row in meta_rows {
        let key: String = row.get(0);
        let val: Value = row.get(1);
        match key.as_str() {
            "db_version" => version = val.as_i64().unwrap_or(1),
            "last_updated" => last_updated = val.as_i64().unwrap_or(0),
            "is_raw_clean" => is_raw_clean = val.as_bool().unwrap_or(false),
            _ => {}
        }
    }

    let rec_rows = client
        .query(
            "SELECT table_name, payload FROM arka_records ORDER BY table_name ASC, record_id ASC",
            &[],
        )
        .map_err(|e| format!("PG records query error: {}", e))?;

    let mut data_map = serde_json::Map::new();
    for row in rec_rows {
        let table_name: String = row.get(0);
        let payload: Value = row.get(1);
        let entry = data_map
            .entry(table_name)
            .or_insert_with(|| Value::Array(Vec::new()));
        if let Some(arr) = entry.as_array_mut() {
            arr.push(payload);
        }
    }

    if is_raw_clean {
        data_map.insert("isRawClean".to_string(), Value::Bool(true));
    }

    Ok(json!({
        "version": version,
        "lastUpdated": last_updated,
        "data": Value::Object(data_map)
    }))
}

fn retire_legacy_json(legacy_json_path: &Path) {
    if legacy_json_path.exists() {
        let archive_path = legacy_json_path.with_extension("json.migrated_to_pg.bak");
        if fs::rename(legacy_json_path, &archive_path).is_err() {
            if fs::copy(legacy_json_path, &archive_path).is_ok() {
                let _ = fs::remove_file(legacy_json_path);
            }
        }
    }
    let bak_path = legacy_json_path.with_extension("json.bak");
    if bak_path.exists() {
        let bak_archive = legacy_json_path.with_extension("json.bak.migrated_to_pg.bak");
        let _ = fs::rename(&bak_path, &bak_archive);
    }
}

/// Initialize PostgreSQL runtime on Windows Server boot; auto-migrates legacy arka_db.json if PG is empty.
pub fn init_and_load(legacy_json_path: &Path) -> Option<Value> {
    let cfg = load_pg_config()?;
    try_start_bundled_postgres(&cfg);

    let conn_str = build_conn_str(&cfg);
    match Client::connect(&conn_str, NoTls) {
        Ok(mut client) => {
            if ensure_schema(&mut client).is_err() {
                return None;
            }
            let pg_version = client
                .query_one("SELECT version()", &[])
                .ok()
                .map(|r| {
                    let v: String = r.get(0);
                    v.split(',').next().unwrap_or("PostgreSQL").to_string()
                })
                .unwrap_or_else(|| "PostgreSQL".to_string());

            let mut loaded_state = read_state_from_client(&mut client).ok()?;
            let pg_business_count = count_business_records(loaded_state.get("data").unwrap_or(&json!({})));

            // Auto-migrate legacy JSON file if PostgreSQL has no business records yet
            if pg_business_count == 0 && legacy_json_path.exists() {
                if let Ok(raw) = fs::read_to_string(legacy_json_path) {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
                        let candidate_data = parsed.get("data").unwrap_or(&parsed);
                        if count_business_records(candidate_data) > 0 {
                            let migrated_state = json!({
                                "version": parsed.get("version").and_then(|v| v.as_u64()).unwrap_or(1),
                                "lastUpdated": parsed.get("lastUpdated").and_then(|v| v.as_u64()).unwrap_or(0),
                                "data": candidate_data
                            });
                            if write_state_tx(&mut client, &migrated_state, Some("win_auto_migration")).is_ok() {
                                loaded_state = migrated_state;
                                retire_legacy_json(legacy_json_path);
                            }
                        }
                    }
                }
            } else if pg_business_count > 0 {
                // Retire any lingering active arka_db.json once PostgreSQL holds live data
                retire_legacy_json(legacy_json_path);
            }

            let mut guard = pg_state_lock().lock().unwrap_or_else(|e| e.into_inner());
            *guard = Some(PgRuntime {
                config: cfg,
                conn_str,
                active: true,
                pg_version,
                last_error: None,
            });
            Some(loaded_state)
        }
        Err(err) => {
            let mut guard = pg_state_lock().lock().unwrap_or_else(|e| e.into_inner());
            *guard = Some(PgRuntime {
                config: cfg,
                conn_str,
                active: false,
                pg_version: String::new(),
                last_error: Some(err.to_string()),
            });
            None
        }
    }
}

pub fn is_pg_active() -> bool {
    let guard = pg_state_lock().lock().unwrap_or_else(|e| e.into_inner());
    guard.as_ref().map(|r| r.active).unwrap_or(false)
}

pub fn save_state_to_pg(state: &Value, snapshot_type: Option<&str>) -> bool {
    let conn_str = {
        let guard = pg_state_lock().lock().unwrap_or_else(|e| e.into_inner());
        match guard.as_ref() {
            Some(r) if r.active => r.conn_str.clone(),
            _ => return false,
        }
    };

    if let Ok(mut client) = Client::connect(&conn_str, NoTls) {
        if write_state_tx(&mut client, state, snapshot_type).is_ok() {
            return true;
        }
    }
    false
}

fn sql_literal(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

pub fn build_portable_sql_from_state(state: &Value, db_name: &str) -> String {
    let version = state.get("version").and_then(|v| v.as_i64()).unwrap_or(1);
    let last_updated = state.get("lastUpdated").and_then(|v| v.as_i64()).unwrap_or(0);
    let empty_obj = json!({});
    let data = state.get("data").unwrap_or(&empty_obj);
    let is_raw_clean = data.get("isRawClean").and_then(|v| v.as_bool()).unwrap_or(false);

    let mut lines: Vec<String> = vec![
        "-- Arka POS PostgreSQL Full Transactional Backup".to_string(),
        "-- Format Version: 2 (Cross-Version Compatible: PostgreSQL 12-18 Linux/Windows)".to_string(),
        format!("-- Database: {}", db_name),
        "BEGIN;".to_string(),
        String::new(),
        "CREATE TABLE IF NOT EXISTS arka_meta (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());".to_string(),
        "CREATE TABLE IF NOT EXISTS arka_records (table_name TEXT NOT NULL, record_id TEXT NOT NULL, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (table_name, record_id));".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_arka_records_table ON arka_records (table_name);".to_string(),
        "CREATE TABLE IF NOT EXISTS arka_backups (id BIGSERIAL PRIMARY KEY, backup_type TEXT NOT NULL, db_version BIGINT NOT NULL, stats JSONB NOT NULL DEFAULT '{}'::jsonb, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());".to_string(),
        String::new(),
        "TRUNCATE TABLE arka_records;".to_string(),
        format!(
            "INSERT INTO arka_meta (key, value, updated_at) VALUES ('db_version', {}::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();",
            sql_literal(&json!(version).to_string())
        ),
        format!(
            "INSERT INTO arka_meta (key, value, updated_at) VALUES ('is_raw_clean', {}::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();",
            sql_literal(&json!(is_raw_clean).to_string())
        ),
        format!(
            "INSERT INTO arka_meta (key, value, updated_at) VALUES ('last_updated', {}::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();",
            sql_literal(&json!(last_updated).to_string())
        ),
    ];

    if let Some(tables) = data.as_object() {
        let mut table_names: Vec<&String> = tables.keys().collect();
        table_names.sort();
        for table_name in table_names {
            if table_name == "isRawClean" || !is_valid_table_name(table_name) {
                continue;
            }
            if let Some(rows) = tables.get(table_name).and_then(|v| v.as_array()) {
                for (idx, row) in rows.iter().enumerate() {
                    if !row.is_object() {
                        continue;
                    }
                    let rec_id = extract_record_id(table_name, row, idx);
                    lines.push(format!(
                        "INSERT INTO arka_records (table_name, record_id, payload, updated_at) VALUES ({}, {}, {}::jsonb, NOW()) ON CONFLICT (table_name, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();",
                        sql_literal(table_name),
                        sql_literal(&rec_id),
                        sql_literal(&row.to_string())
                    ));
                }
            }
        }
    }

    lines.push("COMMIT;".to_string());
    lines.push(String::new());
    lines.join("\n")
}

pub fn export_sql_dump(fallback_state: &Value) -> Result<String, String> {
    let active_info = {
        let guard = pg_state_lock().lock().unwrap_or_else(|e| e.into_inner());
        guard.as_ref().and_then(|r| {
            if r.active {
                Some((r.config.database.clone(), r.conn_str.clone()))
            } else {
                None
            }
        })
    };

    if let Some((db_name, conn_str)) = active_info {
        let mut client = Client::connect(&conn_str, NoTls).map_err(|e| e.to_string())?;
        let mut lines: Vec<String> = vec![
            "-- Arka POS PostgreSQL Full Transactional Backup".to_string(),
            "-- Format Version: 2 (Cross-Version Compatible: PostgreSQL 12-18 Linux/Windows)".to_string(),
            format!("-- Database: {}", db_name),
            "BEGIN;".to_string(),
            String::new(),
            "CREATE TABLE IF NOT EXISTS arka_meta (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());".to_string(),
            "CREATE TABLE IF NOT EXISTS arka_records (table_name TEXT NOT NULL, record_id TEXT NOT NULL, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (table_name, record_id));".to_string(),
            "CREATE INDEX IF NOT EXISTS idx_arka_records_table ON arka_records (table_name);".to_string(),
            "CREATE TABLE IF NOT EXISTS arka_backups (id BIGSERIAL PRIMARY KEY, backup_type TEXT NOT NULL, db_version BIGINT NOT NULL, stats JSONB NOT NULL DEFAULT '{}'::jsonb, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());".to_string(),
            String::new(),
            "TRUNCATE TABLE arka_records;".to_string(),
        ];

        if let Ok(rows) = client.query("SELECT key, value FROM arka_meta ORDER BY key ASC", &[]) {
            for row in rows {
                let k: String = row.get(0);
                let v: Value = row.get(1);
                lines.push(format!(
                    "INSERT INTO arka_meta (key, value, updated_at) VALUES ({}, {}::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();",
                    sql_literal(&k),
                    sql_literal(&v.to_string())
                ));
            }
        }

        if let Ok(rows) = client.query(
            "SELECT table_name, record_id, payload FROM arka_records ORDER BY table_name ASC, record_id ASC",
            &[],
        ) {
            for row in rows {
                let t: String = row.get(0);
                let id: String = row.get(1);
                let p: Value = row.get(2);
                lines.push(format!(
                    "INSERT INTO arka_records (table_name, record_id, payload, updated_at) VALUES ({}, {}, {}::jsonb, NOW()) ON CONFLICT (table_name, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();",
                    sql_literal(&t),
                    sql_literal(&id),
                    sql_literal(&p.to_string())
                ));
            }
        }

        lines.push("COMMIT;".to_string());
        lines.push(String::new());
        return Ok(lines.join("\n"));
    }

    Ok(build_portable_sql_from_state(fallback_state, "arka_pos"))
}

fn parse_sql_values_from_insert_line(line: &str) -> Vec<String> {
    let upper = line.to_ascii_uppercase();
    let Some(val_idx) = upper.find("VALUES") else {
        return Vec::new();
    };
    let after_val = &line[val_idx + 6..];
    let Some(open_paren) = after_val.find('(') else {
        return Vec::new();
    };
    let chars: Vec<char> = after_val[open_paren + 1..].chars().collect();
    let n = chars.len();
    let mut i = 0;
    let mut results: Vec<String> = Vec::new();

    while i < n {
        while i < n && (chars[i].is_whitespace() || chars[i] == ',') {
            i += 1;
        }
        if i >= n || chars[i] == ')' {
            break;
        }

        if chars[i] == '\'' {
            i += 1;
            let mut out = String::new();
            while i < n {
                if chars[i] == '\'' {
                    if i + 1 < n && chars[i + 1] == '\'' {
                        out.push('\'');
                        i += 2;
                    } else {
                        i += 1;
                        break;
                    }
                } else {
                    out.push(chars[i]);
                    i += 1;
                }
            }
            results.push(out);
            while i < n && chars[i] != ',' && chars[i] != ')' {
                i += 1;
            }
            if i < n && chars[i] == ')' {
                break;
            }
        } else {
            let mut token = String::new();
            let mut depth = 0usize;
            while i < n {
                let ch = chars[i];
                if ch == '(' {
                    depth += 1;
                    token.push(ch);
                    i += 1;
                } else if ch == ')' {
                    if depth == 0 {
                        break;
                    }
                    depth -= 1;
                    token.push(ch);
                    i += 1;
                } else if ch == ',' && depth == 0 {
                    break;
                } else {
                    token.push(ch);
                    i += 1;
                }
            }
            results.push(token.trim().to_string());
            if i < n && chars[i] == ')' {
                break;
            }
        }
    }
    results
}

fn unescape_pg_copy_field(field: &str) -> Option<String> {
    if field == "\\N" {
        return None;
    }
    let chars: Vec<char> = field.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            match chars[i + 1] {
                'n' => out.push('\n'),
                'r' => out.push('\r'),
                't' => out.push('\t'),
                'b' => out.push('\x08'),
                'f' => out.push('\x0c'),
                '\\' => out.push('\\'),
                other => out.push(other),
            }
            i += 2;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    Some(out)
}

pub fn parse_arka_sql_dump(sql_text: &str) -> Result<(Value, usize, usize), String> {
    let clean_sql = sql_text.trim_start_matches('\u{feff}');
    if clean_sql.trim().is_empty() {
        return Err("فایل بکاپ SQL خالی است.".to_string());
    }

    let mut data_map = serde_json::Map::new();
    let mut db_version: u64 = 1;
    let mut last_updated: u64 = 0;
    let mut is_raw_clean = false;
    let mut total_records: usize = 0;
    let mut copy_mode: u8 = 0; // 0 = none, 1 = arka_meta, 2 = arka_records

    for raw_line in clean_sql.lines() {
        let trimmed = raw_line.trim();
        if copy_mode != 0 {
            if trimmed == "\\." {
                copy_mode = 0;
                continue;
            }
            let cols: Vec<&str> = raw_line.split('\t').collect();
            if copy_mode == 1 && cols.len() >= 2 {
                if let (Some(k), Some(v_raw)) = (unescape_pg_copy_field(cols[0]), unescape_pg_copy_field(cols[1])) {
                    if let Ok(v) = serde_json::from_str::<Value>(&v_raw) {
                        match k.as_str() {
                            "db_version" => db_version = v.as_u64().unwrap_or(1),
                            "last_updated" => last_updated = v.as_u64().unwrap_or(0),
                            "is_raw_clean" => is_raw_clean = v.as_bool().unwrap_or(false),
                            _ => {}
                        }
                    }
                }
            } else if copy_mode == 2 && cols.len() >= 3 {
                if let (Some(t), Some(p_raw)) = (unescape_pg_copy_field(cols[0]), unescape_pg_copy_field(cols[2])) {
                    if is_valid_table_name(&t) {
                        if let Ok(obj) = serde_json::from_str::<Value>(&p_raw) {
                            if obj.is_object() {
                                let entry = data_map.entry(t).or_insert_with(|| Value::Array(Vec::new()));
                                if let Some(arr) = entry.as_array_mut() {
                                    arr.push(obj);
                                    total_records += 1;
                                }
                            }
                        }
                    }
                }
            }
            continue;
        }

        if trimmed.is_empty() || trimmed.starts_with("--") {
            continue;
        }

        let upper = trimmed.to_ascii_uppercase();
        if trimmed.starts_with("\\!")
            || (upper.contains("COPY") && upper.contains("FROM PROGRAM"))
            || upper.contains("CREATE FUNCTION")
            || upper.contains("CREATE OR REPLACE FUNCTION")
            || upper.contains("ALTER ROLE")
            || upper.contains("DROP DATABASE")
            || upper.starts_with("DO $")
        {
            return Err("فایل SQL شامل دستورات غیرمجاز امنیتی است و رد شد.".to_string());
        }

        if upper.starts_with("COPY ") && upper.contains("FROM STDIN") {
            if upper.contains("ARKA_META") {
                copy_mode = 1;
                continue;
            } else if upper.contains("ARKA_RECORDS") {
                copy_mode = 2;
                continue;
            }
        }

        if upper.starts_with("INSERT INTO ") && upper.contains("ARKA_META") {
            let vals = parse_sql_values_from_insert_line(trimmed);
            if vals.len() >= 2 {
                if let Ok(v) = serde_json::from_str::<Value>(&vals[1]) {
                    match vals[0].as_str() {
                        "db_version" => db_version = v.as_u64().unwrap_or(1),
                        "last_updated" => last_updated = v.as_u64().unwrap_or(0),
                        "is_raw_clean" => is_raw_clean = v.as_bool().unwrap_or(false),
                        _ => {}
                    }
                }
            }
            continue;
        }

        if upper.starts_with("INSERT INTO ") && upper.contains("ARKA_RECORDS") {
            let vals = parse_sql_values_from_insert_line(trimmed);
            if vals.len() >= 3 && is_valid_table_name(&vals[0]) {
                if let Ok(obj) = serde_json::from_str::<Value>(&vals[2]) {
                    if obj.is_object() {
                        let entry = data_map.entry(vals[0].clone()).or_insert_with(|| Value::Array(Vec::new()));
                        if let Some(arr) = entry.as_array_mut() {
                            arr.push(obj);
                            total_records += 1;
                        }
                    }
                }
            }
        }
    }

    let restored_tables = data_map.len();
    if total_records == 0 && db_version <= 1 {
        return Err("هیچ رکورد معتبر آرکا (arka_records) در فایل بکاپ SQL یافت نشد.".to_string());
    }

    if is_raw_clean {
        data_map.insert("isRawClean".to_string(), Value::Bool(true));
    }

    let state = json!({
        "version": db_version,
        "lastUpdated": last_updated,
        "data": Value::Object(data_map)
    });

    Ok((state, restored_tables, total_records))
}

pub fn restore_sql_dump(sql_text: &str, current_version: u64, now_ms: u64) -> Result<(Value, usize, usize), String> {
    let (mut state, restored_tables, total_records) = parse_arka_sql_dump(sql_text)?;
    let parsed_ver = state.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
    let next_ver = current_version.max(parsed_ver) + 100;
    state["version"] = json!(next_ver);
    state["lastUpdated"] = json!(now_ms);

    let conn_str_opt = {
        let guard = pg_state_lock().lock().unwrap_or_else(|e| e.into_inner());
        guard.as_ref().and_then(|r| if r.active { Some(r.conn_str.clone()) } else { None })
    };

    if let Some(conn_str) = conn_str_opt {
        let mut client = Client::connect(&conn_str, NoTls).map_err(|e| format!("PG connect error: {}", e))?;
        if let Ok(current_live) = read_state_from_client(&mut client) {
            let _ = write_state_tx(&mut client, &current_live, Some("pre_sql_restore_safety"));
        }
        write_state_tx(&mut client, &state, Some("sql_restore_commit"))?;
    }

    Ok((state, restored_tables, total_records))
}

pub fn get_status_json(fallback_state: &Value) -> Value {
    let info = {
        let guard = pg_state_lock().lock().unwrap_or_else(|e| e.into_inner());
        guard.as_ref().map(|r| {
            (
                r.active,
                r.conn_str.clone(),
                r.config.database.clone(),
                r.config.port,
                r.pg_version.clone(),
                r.last_error.clone(),
            )
        })
    };

    if let Some((true, conn_str, db_name, pg_port, pg_ver, _)) = &info {
        if let Ok(mut client) = Client::connect(conn_str, NoTls) {
            let mut tables = serde_json::Map::new();
            let mut total_records: i64 = 0;
            if let Ok(rows) = client.query(
                "SELECT table_name, COUNT(*)::bigint FROM arka_records GROUP BY table_name ORDER BY table_name ASC",
                &[],
            ) {
                for r in rows {
                    let t: String = r.get(0);
                    let cnt: i64 = r.get(1);
                    tables.insert(t, json!(cnt));
                    total_records += cnt;
                }
            }
            let backup_count: i64 = client
                .query_one("SELECT COUNT(*)::bigint FROM arka_backups", &[])
                .ok()
                .map(|r| r.get(0))
                .unwrap_or(0);
            let version = fallback_state.get("version").and_then(|v| v.as_u64()).unwrap_or(1);

            return json!({
                "status": "ok",
                "engine": "postgresql",
                "connected": true,
                "database": db_name,
                "pgPort": *pg_port,
                "pgVersion": pg_ver,
                "version": version,
                "totalRecords": total_records,
                "tables": tables,
                "backupCount": backup_count
            });
        }
    }

    let empty = json!({});
    let stats = compute_stats_json(fallback_state.get("data").unwrap_or(&empty));
    let last_err = info.and_then(|x| x.5);
    json!({
        "status": "ok",
        "engine": "json-fallback",
        "connected": false,
        "database": null,
        "version": fallback_state.get("version").and_then(|v| v.as_u64()).unwrap_or(1),
        "totalRecords": stats.get("totalRecords").cloned().unwrap_or(json!(0)),
        "tables": stats.get("tableCounts").cloned().unwrap_or(json!({})),
        "backupCount": 0,
        "error": last_err
    })
}
