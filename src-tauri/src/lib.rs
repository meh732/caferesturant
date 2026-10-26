use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::process::{Child, Command};
use std::sync::{Mutex, OnceLock};
use std::path::PathBuf;
use std::io::{Read, Write};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};

static NODE_SERVER_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
static ACTIVE_SERVER_PORT: Mutex<u16> = Mutex::new(3000);
static CACHED_MACHINE_ID: OnceLock<String> = OnceLock::new();
static CENTRAL_DB_LOCK: OnceLock<Mutex<serde_json::Value>> = OnceLock::new();

const LICENSE_MASTER_SALT: &str = "ARKA_ENTERPRISE_OFFLINE_SECRET_2026_HARDWARE_LOCK_#POS_SALT!";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NetworkInfo {
    pub ip: String,
    pub all_ips: Vec<String>,
    pub port: u16,
    pub subnet_mask: String,
    pub default_gateway: String,
    pub dns_servers: Vec<String>,
    pub server_running: bool,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LicenseStatusInfo {
    #[serde(rename = "isActivated")]
    pub is_activated: bool,
    #[serde(rename = "machineId")]
    pub machine_id: String,
    #[serde(rename = "activatedAt")]
    pub activated_at: Option<String>,
}

// ============================================================================
// Pure Rust FIPS 180-4 SHA-256 & HMAC-SHA256 (100% compatible with keygen.html)
// ============================================================================
fn sha256(data: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0x00);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut h_val = h[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h_val.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            h_val = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(h_val);
    }

    let mut out = [0u8; 32];
    for (i, val) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&val.to_be_bytes());
    }
    out
}

fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; 32] {
    let mut k = [0u8; 64];
    if key.len() > 64 {
        let hashed = sha256(key);
        k[..32].copy_from_slice(&hashed);
    } else {
        k[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0u8; 64];
    let mut opad = [0u8; 64];
    for i in 0..64 {
        ipad[i] = k[i] ^ 0x36;
        opad[i] = k[i] ^ 0x5c;
    }

    let mut inner = ipad.to_vec();
    inner.extend_from_slice(msg);
    let inner_hash = sha256(&inner);

    let mut outer = opad.to_vec();
    outer.extend_from_slice(&inner_hash);
    sha256(&outer)
}

fn bytes_to_upper_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02X}", b)).collect()
}

pub fn get_hardware_machine_id() -> String {
    if let Some(cached) = CACHED_MACHINE_ID.get() {
        return cached.clone();
    }

    let mut raw_tokens: Vec<String> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let queries = [
            ("UUID", "(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue).UUID"),
            ("CPU", "(Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1).ProcessorId"),
            ("BASEBOARD", "(Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue).SerialNumber"),
            ("DISK", "(Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue | Select-Object -First 1).SerialNumber"),
            ("MGUID", "(Get-ItemProperty -Path Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography -ErrorAction SilentlyContinue).MachineGuid"),
        ];

        for (prefix, q) in queries {
            if let Ok(output) = Command::new("powershell")
                .args(&["-NoProfile", "-NonInteractive", "-Command", q])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                let val = String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .replace('\r', "")
                    .replace('\n', "")
                    .trim()
                    .to_string();
                if val.len() > 2 && val.to_lowercase() != "none" && !val.contains("00000000") {
                    let clean_val = if prefix == "DISK" {
                        val.replace(' ', "")
                    } else {
                        val
                    };
                    raw_tokens.push(format!("{}:{}", prefix, clean_val));
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(mid) = fs::read_to_string("/etc/machine-id") {
            let t = mid.trim();
            if !t.is_empty() {
                raw_tokens.push(format!("MID:{}", t));
            }
        }
    }

    if raw_tokens.is_empty() {
        let host = std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "ARKA-POS-HOST".to_string());
        raw_tokens.push(format!("HOST:{}", host));
    }

    let combined = raw_tokens.join("|");
    let digest = sha256(combined.as_bytes());
    let hex = bytes_to_upper_hex(&digest);

    let p1 = &hex[0..4];
    let p2 = &hex[4..8];
    let p3 = &hex[8..12];
    let p4 = &hex[12..16];

    let machine_id = format!("ARKA-SRV-{}-{}-{}-{}", p1, p2, p3, p4);
    let _ = CACHED_MACHINE_ID.set(machine_id.clone());
    machine_id
}

pub fn compute_expected_activation_key(machine_id: &str) -> String {
    let clean_id = machine_id.trim().to_uppercase();
    let payload = format!("SERVER_LICENSE:{}", clean_id);
    let sig = hmac_sha256(LICENSE_MASTER_SALT.as_bytes(), payload.as_bytes());
    let hex = bytes_to_upper_hex(&sig);

    let k1 = &hex[0..4];
    let k2 = &hex[6..10];
    let k3 = &hex[12..16];
    let k4 = &hex[18..22];

    format!("ARKA-KEY-{}-{}-{}-{}", k1, k2, k3, k4)
}

pub fn verify_license_key(machine_id: &str, user_key: &str) -> bool {
    let clean_key = user_key.trim().to_uppercase();
    if clean_key.is_empty() {
        return false;
    }
    let expected = compute_expected_activation_key(machine_id);
    clean_key == expected
}

fn get_app_data_dir() -> PathBuf {
    // Prefer local './data' folder if writable, otherwise %LOCALAPPDATA%/com.arka.restaurantpos/data
    let cwd_data = PathBuf::from("data");
    if cwd_data.exists() || fs::create_dir_all(&cwd_data).is_ok() {
        return cwd_data;
    }
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let p = PathBuf::from(local_app_data).join("com.arka.restaurantpos").join("data");
        let _ = fs::create_dir_all(&p);
        return p;
    }
    cwd_data
}

fn get_license_file_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    paths.push(get_app_data_dir().join("arka_server_license.json"));
    paths.push(PathBuf::from("data").join("arka_server_license.json"));
    paths.push(PathBuf::from("../data").join("arka_server_license.json"));
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        paths.push(
            PathBuf::from(local_app_data)
                .join("com.arka.restaurantpos")
                .join("arka_server_license.json"),
        );
    }
    paths
}

pub fn read_server_license_status() -> LicenseStatusInfo {
    let machine_id = get_hardware_machine_id();
    for path in get_license_file_paths() {
        if path.exists() {
            if let Ok(raw) = fs::read_to_string(&path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
                    let saved_key = json
                        .get("licenseKey")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    // Verify saved key against current hardware machine ID or saved machineId if key matches
                    if verify_license_key(&machine_id, saved_key) {
                        let activated_at = json
                            .get("activatedAt")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        return LicenseStatusInfo {
                            is_activated: true,
                            machine_id,
                            activated_at,
                        };
                    }
                    // Also check if Node server-license.js wrote a valid license for its machineId on same host
                    if let Some(saved_mid) = json.get("machineId").and_then(|v| v.as_str()) {
                        if verify_license_key(saved_mid, saved_key) {
                            let activated_at = json
                                .get("activatedAt")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            return LicenseStatusInfo {
                                is_activated: true,
                                machine_id: saved_mid.to_string(),
                                activated_at,
                            };
                        }
                    }
                }
            }
        }
    }

    LicenseStatusInfo {
        is_activated: false,
        machine_id,
        activated_at: None,
    }
}

pub fn save_server_license(license_key: &str) -> Result<LicenseStatusInfo, String> {
    let status = read_server_license_status();
    let machine_id = status.machine_id;
    let clean_key = license_key.trim().to_uppercase();

    if !verify_license_key(&machine_id, &clean_key) {
        return Err("کد فعال‌سازی وارد شده نامعتبر است یا مربوط به سخت‌افزار این سیستم نمی‌باشد.".to_string());
    }

    let now_iso = format!("{}", now_millis());
    let payload = serde_json::json!({
        "isActivated": true,
        "machineId": machine_id,
        "licenseKey": clean_key,
        "activatedAt": now_iso,
        "platform": std::env::consts::OS
    });

    let serialized = serde_json::to_string_pretty(&payload).unwrap_or_default();
    let mut saved_any = false;
    for path in get_license_file_paths() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::write(&path, &serialized).is_ok() {
            saved_any = true;
        }
    }

    if !saved_any {
        return Err("خطا در ذخیره‌سازی فایل لایسنس روی دیسک.".to_string());
    }

    Ok(LicenseStatusInfo {
        is_activated: true,
        machine_id,
        activated_at: Some(now_iso),
    })
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(1700000000000)
}

// ============================================================================
// Central Authoritative Database Engine (Shared by Windows Tauri & LAN Phones)
// ============================================================================
fn get_db_file_path() -> PathBuf {
    let candidates = [
        PathBuf::from("data/arka_db.json"),
        PathBuf::from("../data/arka_db.json"),
        get_app_data_dir().join("arka_db.json"),
    ];
    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }
    get_app_data_dir().join("arka_db.json")
}

fn get_central_db_mutex() -> &'static Mutex<serde_json::Value> {
    CENTRAL_DB_LOCK.get_or_init(|| {
        let db_path = get_db_file_path();
        if db_path.exists() {
            if let Ok(raw) = fs::read_to_string(&db_path) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if parsed.get("data").is_some() {
                        return Mutex::new(parsed);
                    }
                }
            }
        }
        Mutex::new(serde_json::json!({
            "version": 1,
            "lastUpdated": now_millis(),
            "data": {}
        }))
    })
}

fn persist_central_db(state: &serde_json::Value) {
    let db_path = get_db_file_path();
    if let Some(parent) = db_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(serialized) = serde_json::to_string(state) {
        let _ = fs::write(&db_path, serialized);
    }
}

fn merge_central_db_payload(incoming_body: &serde_json::Value) -> (u64, u64) {
    let mutex = get_central_db_mutex();
    let mut guard = mutex.lock().unwrap();

    // Ensure root structure exists
    if !guard.is_object() {
        *guard = serde_json::json!({
            "version": 1,
            "lastUpdated": now_millis(),
            "data": {}
        });
    }

    let current_version = guard.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
    let new_version = current_version + 1;
    let now = now_millis();

    let incoming_data = incoming_body
        .get("data")
        .unwrap_or(incoming_body);

    let deleted_ids_obj = incoming_body
        .get("deleted")
        .or_else(|| incoming_body.get("deletedIds"))
        .and_then(|v| v.as_object());

    if let Some(incoming_tables) = incoming_data.as_object() {
        if guard.get("data").and_then(|d| d.as_object()).is_none() {
            guard["data"] = serde_json::json!({});
        }
        let server_data = guard.get_mut("data").unwrap().as_object_mut().unwrap();

        for (table_name, incoming_rows_val) in incoming_tables {
            if table_name == "version" || table_name == "lastUpdated" || table_name == "deletedIds" || table_name == "deleted" {
                continue;
            }
            if let Some(incoming_rows) = incoming_rows_val.as_array() {
                if table_name == "settings" {
                    if !incoming_rows.is_empty() {
                        server_data.insert(table_name.clone(), serde_json::Value::Array(incoming_rows.clone()));
                    }
                    continue;
                }

                let existing_rows = server_data
                    .entry(table_name.clone())
                    .or_insert_with(|| serde_json::Value::Array(Vec::new()));

                let mut merged_map: std::collections::BTreeMap<String, serde_json::Value> = std::collections::BTreeMap::new();
                let mut unkeyed_rows: Vec<serde_json::Value> = Vec::new();

                if let Some(arr) = existing_rows.as_array() {
                    for item in arr {
                        if let Some(id_val) = item.get("id") {
                            let key = match id_val {
                                serde_json::Value::Number(n) => n.to_string(),
                                serde_json::Value::String(s) => s.clone(),
                                _ => id_val.to_string(),
                            };
                            merged_map.insert(key, item.clone());
                        }
                    }
                }

                // Apply deletions if specified
                if let Some(del_map) = deleted_ids_obj {
                    if let Some(del_arr) = del_map.get(table_name).and_then(|v| v.as_array()) {
                        for del_id in del_arr {
                            let key = match del_id {
                                serde_json::Value::Number(n) => n.to_string(),
                                serde_json::Value::String(s) => s.clone(),
                                _ => del_id.to_string(),
                            };
                            merged_map.remove(&key);
                        }
                    }
                }

                // Upsert incoming rows
                for item in incoming_rows {
                    if let Some(id_val) = item.get("id") {
                        let key = match id_val {
                            serde_json::Value::Number(n) => n.to_string(),
                            serde_json::Value::String(s) => s.clone(),
                            _ => id_val.to_string(),
                        };
                        merged_map.insert(key, item.clone());
                    } else {
                        unkeyed_rows.push(item.clone());
                    }
                }

                let mut final_rows: Vec<serde_json::Value> = merged_map.into_values().collect();
                final_rows.extend(unkeyed_rows);
                server_data.insert(table_name.clone(), serde_json::Value::Array(final_rows));
            }
        }
    }

    guard["version"] = serde_json::Value::Number(serde_json::Number::from(new_version));
    guard["lastUpdated"] = serde_json::Value::Number(serde_json::Number::from(now));

    persist_central_db(&guard);
    (new_version, now)
}

/// Detect the primary local LAN IPv4 address using a UDP socket route probe
fn get_primary_lan_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                let ip = local_addr.ip().to_string();
                if ip != "127.0.0.1" && ip != "0.0.0.0" {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

/// Gather detailed Windows/Linux network adapter parameters (Subnet, Gateway, DNS)
#[tauri::command]
fn get_system_network_info() -> NetworkInfo {
    let primary_ip = get_primary_lan_ip();
    let mut all_ips = vec![primary_ip.clone()];
    let mut subnet_mask = "255.255.255.0".to_string();
    let mut default_gateway = String::new();
    let mut dns_servers = Vec::new();

    if let Some(dot_idx) = primary_ip.rfind('.') {
        let prefix = &primary_ip[..dot_idx];
        default_gateway = format!("{}.1", prefix);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        if let Ok(output) = Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-Command",
                "Get-NetIPConfiguration | Select-Object -ExpandProperty IPv4DefaultGateway | Select-Object -ExpandProperty NextHop",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if let Some(first_line) = text.lines().next() {
                let gw = first_line.trim();
                if !gw.is_empty() {
                    default_gateway = gw.to_string();
                }
            }
        }

        if let Ok(output) = Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-Command",
                "Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object -ExpandProperty ServerAddresses",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() && !dns_servers.contains(&trimmed.to_string()) {
                    dns_servers.push(trimmed.to_string());
                }
            }
        }
    }

    if dns_servers.is_empty() {
        if !default_gateway.is_empty() {
            dns_servers.push(default_gateway.clone());
        }
        dns_servers.push("8.8.8.8".to_string());
    }

    if !all_ips.contains(&"127.0.0.1".to_string()) {
        all_ips.push("127.0.0.1".to_string());
    }

    let port = *ACTIVE_SERVER_PORT.lock().unwrap_or_else(|e| e.into_inner());
    let server_running = check_port_listening(port);

    NetworkInfo {
        ip: primary_ip.clone(),
        all_ips,
        port,
        subnet_mask,
        default_gateway,
        dns_servers,
        server_running,
        url: format!("http://{}:{}", primary_ip, port),
    }
}

#[tauri::command]
fn get_server_license_info() -> LicenseStatusInfo {
    read_server_license_status()
}

#[tauri::command]
fn activate_server_license(license_key: String) -> Result<LicenseStatusInfo, String> {
    save_server_license(&license_key)
}

fn check_port_listening(port: u16) -> bool {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), port);
    TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(250)).is_ok()
}

/// Start or switch the LAN HTTP server on the specified port
#[tauri::command]
fn start_lan_server(port: u16) -> Result<NetworkInfo, String> {
    {
        let mut active_port = ACTIVE_SERVER_PORT.lock().map_err(|e| e.to_string())?;
        *active_port = port;
    }

    let config_dir = get_app_data_dir();
    let _ = fs::create_dir_all(&config_dir);
    let config_path = config_dir.join("arka-network-config.json");
    let _ = fs::write(&config_path, format!("{{\"port\": {}}}", port));

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let rule_name = format!("ArkaPOS_LAN_Port_{}", port);
        let _ = Command::new("netsh")
            .args(&[
                "advfirewall",
                "firewall",
                "add",
                "rule",
                &format!("name={}", rule_name),
                "dir=in",
                "action=allow",
                "protocol=TCP",
                &format!("localport={}", port),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    ensure_lan_server_listening(port);

    Ok(get_system_network_info())
}

fn find_dist_dir() -> PathBuf {
    let mut candidates = vec![
        PathBuf::from("dist"),
        PathBuf::from("../dist"),
    ];
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("dist"));
            candidates.push(exe_dir.join("../dist"));
            candidates.push(exe_dir.join("resources/dist"));
            candidates.push(exe_dir.join("_up_/dist"));
        }
    }
    for c in candidates {
        if c.exists() && c.is_dir() {
            return c;
        }
    }
    PathBuf::from("dist")
}

fn ensure_lan_server_listening(port: u16) {
    if check_port_listening(port) {
        return;
    }

    // Try spawning Node server.js if node + server.js exist in development/Linux
    let server_js_candidates = vec![
        PathBuf::from("server.js"),
        PathBuf::from("../server.js"),
        PathBuf::from("resources/server.js"),
    ];

    for candidate in server_js_candidates {
        if candidate.exists() {
            let mut cmd = Command::new("node");
            cmd.arg(&candidate).env("PORT", port.to_string());

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            if let Ok(child) = cmd.spawn() {
                if let Ok(mut guard) = NODE_SERVER_PROCESS.lock() {
                    if let Some(mut old) = guard.take() {
                        let _ = old.kill();
                    }
                    *guard = Some(child);
                }
                std::thread::sleep(std::time::Duration::from_millis(350));
                if check_port_listening(port) {
                    return;
                }
            }
        }
    }

    // Native Rust multi-threaded LAN HTTP + Central Database Server
    std::thread::spawn(move || {
        let bind_addr = format!("0.0.0.0:{}", port);
        if let Ok(listener) = TcpListener::bind(&bind_addr) {
            for stream in listener.incoming().flatten() {
                std::thread::spawn(move || {
                    handle_lan_http_client(stream, port);
                });
            }
        }
    });
}

fn read_full_http_request(stream: &mut TcpStream) -> Option<(String, String, String)> {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(10)));
    let mut buf = Vec::with_capacity(16384);
    let mut temp = [0u8; 8192];
    let mut header_end_idx: Option<usize> = None;
    let mut expected_content_len: usize = 0;

    loop {
        match stream.read(&mut temp) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&temp[..n]);
                if header_end_idx.is_none() {
                    if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                        let end = pos + 4;
                        header_end_idx = Some(end);
                        let header_str = String::from_utf8_lossy(&buf[..end]);
                        for line in header_str.lines() {
                            let lower = line.to_ascii_lowercase();
                            if lower.starts_with("content-length:") {
                                if let Some(val_str) = line.split(':').nth(1) {
                                    expected_content_len = val_str.trim().parse::<usize>().unwrap_or(0);
                                }
                            }
                        }
                    }
                }

                if let Some(hdr_end) = header_end_idx {
                    if buf.len() >= hdr_end + expected_content_len {
                        break;
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {
                break;
            }
            Err(_) => break,
        }
    }

    if buf.is_empty() {
        return None;
    }

    let hdr_end = header_end_idx.unwrap_or(buf.len());
    let header_str = String::from_utf8_lossy(&buf[..hdr_end]).to_string();
    let first_line = header_str.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    let method = parts.first().copied().unwrap_or("GET").to_uppercase();
    let raw_path = parts.get(1).copied().unwrap_or("/");
    let clean_path = raw_path.split('?').next().unwrap_or("/").to_string();

    let body_str = if hdr_end < buf.len() {
        let end = std::cmp::min(buf.len(), hdr_end + expected_content_len.max(buf.len() - hdr_end));
        String::from_utf8_lossy(&buf[hdr_end..end]).to_string()
    } else {
        String::new()
    };

    Some((method, clean_path, body_str))
}

fn send_json_response(stream: &mut TcpStream, status_line: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nCache-Control: no-store, no-cache, must-revalidate\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status_line,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn handle_lan_http_client(mut stream: TcpStream, port: u16) {
    let Some((method, clean_path, body_str)) = read_full_http_request(&mut stream) else {
        return;
    };

    // Handle CORS Preflight
    if method == "OPTIONS" {
        send_json_response(&mut stream, "204 No Content", "");
        return;
    }

    // 1. Hardware License Endpoints
    if clean_path == "/api/license/status" {
        let status = read_server_license_status();
        let body = serde_json::to_string(&status).unwrap_or_else(|_| "{}".to_string());
        send_json_response(&mut stream, "200 OK", &body);
        return;
    }

    if clean_path == "/api/license/activate" && method == "POST" {
        let parsed: serde_json::Value = serde_json::from_str(&body_str).unwrap_or_default();
        let key = parsed.get("licenseKey").and_then(|v| v.as_str()).unwrap_or("");
        match save_server_license(key) {
            Ok(info) => {
                let resp = serde_json::json!({
                    "success": true,
                    "message": "لایسنس سرور با موفقیت فعال و روی سخت‌افزار این سیستم قفل شد.",
                    "isActivated": info.is_activated,
                    "machineId": info.machine_id,
                    "activatedAt": info.activated_at
                });
                send_json_response(&mut stream, "200 OK", &resp.to_string());
            }
            Err(err_msg) => {
                let resp = serde_json::json!({
                    "success": false,
                    "message": err_msg
                });
                send_json_response(&mut stream, "400 Bad Request", &resp.to_string());
            }
        }
        return;
    }

    // 2. Central Database Sync & Version Endpoints
    if clean_path == "/api/db/version" {
        let mutex = get_central_db_mutex();
        let guard = mutex.lock().unwrap();
        let version = guard.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
        let last_updated = guard.get("lastUpdated").and_then(|v| v.as_u64()).unwrap_or(0);
        let resp = serde_json::json!({
            "status": "ok",
            "version": version,
            "lastUpdated": last_updated
        });
        send_json_response(&mut stream, "200 OK", &resp.to_string());
        return;
    }

    if clean_path == "/api/db/sync" && method == "GET" {
        let mutex = get_central_db_mutex();
        let guard = mutex.lock().unwrap();
        let version = guard.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
        let last_updated = guard.get("lastUpdated").and_then(|v| v.as_u64()).unwrap_or(0);
        let default_empty = serde_json::json!({});
        let data = guard.get("data").unwrap_or(&default_empty);
        let resp = serde_json::json!({
            "status": "ok",
            "version": version,
            "lastUpdated": last_updated,
            "data": data
        });
        send_json_response(&mut stream, "200 OK", &resp.to_string());
        return;
    }

    if clean_path == "/api/db/sync" && method == "POST" {
        if let Ok(incoming_json) = serde_json::from_str::<serde_json::Value>(&body_str) {
            let (new_version, now) = merge_central_db_payload(&incoming_json);
            let resp = serde_json::json!({
                "status": "ok",
                "version": new_version,
                "lastUpdated": now
            });
            send_json_response(&mut stream, "200 OK", &resp.to_string());
        } else {
            let resp = serde_json::json!({ "status": "error", "message": "Invalid JSON body" });
            send_json_response(&mut stream, "400 Bad Request", &resp.to_string());
        }
        return;
    }

    if clean_path == "/api/db/reset" && method == "POST" {
        let mutex = get_central_db_mutex();
        let mut guard = mutex.lock().unwrap();
        let new_version = guard.get("version").and_then(|v| v.as_u64()).unwrap_or(1) + 1;
        let now = now_millis();
        *guard = serde_json::json!({
            "version": new_version,
            "lastUpdated": now,
            "data": {}
        });
        persist_central_db(&guard);
        let resp = serde_json::json!({
            "status": "ok",
            "version": new_version,
            "lastUpdated": now
        });
        send_json_response(&mut stream, "200 OK", &resp.to_string());
        return;
    }

    if clean_path == "/api/settings" && method == "POST" {
        if let Ok(settings_obj) = serde_json::from_str::<serde_json::Value>(&body_str) {
            let payload = serde_json::json!({
                "data": {
                    "settings": [settings_obj]
                }
            });
            let (new_version, _) = merge_central_db_payload(&payload);
            let resp = serde_json::json!({ "status": "ok", "version": new_version });
            send_json_response(&mut stream, "200 OK", &resp.to_string());
        } else {
            send_json_response(&mut stream, "200 OK", "{\"status\":\"ok\"}");
        }
        return;
    }

    if clean_path == "/api/orders" && method == "GET" {
        let mutex = get_central_db_mutex();
        let guard = mutex.lock().unwrap();
        let orders = guard
            .get("data")
            .and_then(|d| d.get("orders"))
            .cloned()
            .unwrap_or_else(|| serde_json::json!([]));
        send_json_response(&mut stream, "200 OK", &orders.to_string());
        return;
    }

    if clean_path == "/api/orders" && method == "POST" {
        if let Ok(order_obj) = serde_json::from_str::<serde_json::Value>(&body_str) {
            let payload = serde_json::json!({
                "data": {
                    "orders": [order_obj]
                }
            });
            let (new_version, _) = merge_central_db_payload(&payload);
            let resp = serde_json::json!({ "status": "ok", "version": new_version });
            send_json_response(&mut stream, "200 OK", &resp.to_string());
        } else {
            send_json_response(&mut stream, "200 OK", "{\"status\":\"ok\"}");
        }
        return;
    }

    // 3. Health & Network Info Endpoints
    if clean_path == "/api/health" || clean_path == "/api/network/info" {
        let ip = get_primary_lan_ip();
        let body = format!(
            "{{\"status\":\"ok\",\"ip\":\"{}\",\"ips\":[\"{}\"],\"localIps\":[\"{}\"],\"port\":{},\"host\":\"{}:{}\",\"platform\":\"windows-tauri\"}}",
            ip, ip, ip, port, ip, port
        );
        send_json_response(&mut stream, "200 OK", &body);
        return;
    }

    // 4. Serve Static Frontend Assets from dist for LAN Mobile/Tablet Clients
    let dist_dir = find_dist_dir();
    let rel_path = if clean_path == "/" {
        "index.html"
    } else {
        clean_path.trim_start_matches('/')
    };

    let mut target_file = dist_dir.join(rel_path);
    if !target_file.exists() || target_file.is_dir() {
        target_file = dist_dir.join("index.html");
    }

    if let Ok(bytes) = fs::read(&target_file) {
        let ext = target_file.extension().and_then(|e| e.to_str()).unwrap_or("");
        let mime = match ext {
            "html" => "text/html; charset=utf-8",
            "js" | "mjs" => "application/javascript; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "json" | "webmanifest" => "application/json; charset=utf-8",
            "svg" => "image/svg+xml",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "ico" => "image/x-icon",
            "woff2" => "font/woff2",
            "woff" => "font/woff",
            "ttf" => "font/ttf",
            _ => "application/octet-stream",
        };
        let header = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            mime,
            bytes.len()
        );
        let _ = stream.write_all(header.as_bytes());
        let _ = stream.write_all(&bytes);
        let _ = stream.flush();
    } else {
        let not_found = b"HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nConnection: close\r\n\r\nNot Found";
        let _ = stream.write_all(not_found);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut initial_port: u16 = 3000;
    let config_candidates = [
        PathBuf::from("data/arka-network-config.json"),
        get_app_data_dir().join("arka-network-config.json"),
    ];
    for cfg_path in &config_candidates {
        if let Ok(raw) = fs::read_to_string(cfg_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(p) = json.get("port").and_then(|v| v.as_u64()) {
                    if p >= 80 && p <= 65535 {
                        initial_port = p as u16;
                        break;
                    }
                }
            }
        }
    }

    if let Ok(mut guard) = ACTIVE_SERVER_PORT.lock() {
        *guard = initial_port;
    }

    // Warm up hardware ID and central DB on startup
    let _ = get_hardware_machine_id();
    let _ = get_central_db_mutex();

    ensure_lan_server_listening(initial_port);

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_system_network_info,
            start_lan_server,
            get_server_license_info,
            activate_server_license
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
