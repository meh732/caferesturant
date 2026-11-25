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
                                let archive_path = legacy_json_path.with_extension("json.migrated_to_pg.bak");
                                let _ = fs::copy(legacy_json_path, archive_path);
                            }
                        }
                    }
                }
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

pub fn export_snapshot_from_pg() -> Option<Value> {
    let (conn_str, db_name) = {
        let guard = pg_state_lock().lock().unwrap_or_else(|e| e.into_inner());
        match guard.as_ref() {
            Some(r) if r.active => (r.conn_str.clone(), r.config.database.clone()),
            _ => return None,
        }
    };

    let mut client = Client::connect(&conn_str, NoTls).ok()?;
    let state = read_state_from_client(&mut client).ok()?;
    let version = state.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
    let last_updated = state.get("lastUpdated").and_then(|v| v.as_u64()).unwrap_or(0);
    let data = state.get("data").cloned().unwrap_or_else(|| json!({}));

    let mut out = serde_json::Map::new();
    out.insert("version".to_string(), json!(version));
    out.insert("lastUpdated".to_string(), json!(last_updated));
    out.insert("storageEngine".to_string(), json!("postgresql"));
    out.insert("database".to_string(), json!(db_name));
    if let Some(dmap) = data.as_object() {
        for (k, v) in dmap {
            out.insert(k.clone(), v.clone());
        }
    }
    out.insert("data".to_string(), data);
    Some(Value::Object(out))
}

fn sql_literal(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

pub fn export_sql_dump() -> Result<String, String> {
    let (cfg, conn_str) = {
        let guard = pg_state_lock().lock().unwrap_or_else(|e| e.into_inner());
        match guard.as_ref() {
            Some(r) if r.active => (r.config.clone(), r.conn_str.clone()),
            _ => return Err("PostgreSQL is not active".to_string()),
        }
    };

    // 1. Prefer bundled pg_dump.exe when available
    if let Some(bin_dir) = &cfg.bin_dir {
        let pg_dump = PathBuf::from(bin_dir).join("pg_dump.exe");
        if pg_dump.exists() {
            let mut cmd = Command::new(&pg_dump);
            cmd.env("PGPASSWORD", &cfg.password).args(&[
                "-h",
                &cfg.host,
                "-p",
                &cfg.port.to_string(),
                "-U",
                &cfg.user,
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-privileges",
                &cfg.database,
            ]);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }
            if let Ok(out) = cmd.output() {
                if out.status.success() && out.stdout.len() > 50 {
                    return Ok(String::from_utf8_lossy(&out.stdout).to_string());
                }
            }
        }
    }

    // 2. Pure transactional SQL dump fallback
    let mut client = Client::connect(&conn_str, NoTls).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = vec![
        "-- Arka POS Windows Server PostgreSQL Full Transactional Backup".to_string(),
        format!("-- Database: {}", cfg.database),
        "BEGIN;".to_string(),
        "CREATE TABLE IF NOT EXISTS arka_meta (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());".to_string(),
        "CREATE TABLE IF NOT EXISTS arka_records (table_name TEXT NOT NULL, record_id TEXT NOT NULL, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (table_name, record_id));".to_string(),
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
    Ok(lines.join("\n"))
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
