use std::net::{TcpListener, TcpStream, UdpSocket};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use std::thread;
use std::fs;
use std::path::{Path, PathBuf};

static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static CURRENT_PORT: AtomicU16 = AtomicU16::new(0);
static NETWORK_CACHE: Mutex<Option<(Instant, Vec<String>)>> = Mutex::new(None);

fn is_valid_private_ip(ip: &str) -> bool {
    let clean = ip.trim();
    if clean.is_empty() 
        || clean == "0.0.0.0" 
        || clean.starts_with("127.") 
        || clean.starts_with("169.254.") 
        || clean.starts_with("192.168.56.") // Ignore VirtualBox Host-Only virtual adapter
        || clean == "255.255.255.255" 
    {
        return false;
    }

    let parts: Vec<&str> = clean.split('.').collect();
    if parts.len() != 4 {
        return false;
    }

    for p in parts {
        match p.parse::<u8>() {
            Ok(_) => (),
            Err(_) => return false,
        }
    }

    true
}

fn extract_ipv4(text: &str) -> Option<String> {
    for word in text.split_whitespace() {
        let clean = word.trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
        if is_valid_private_ip(clean) {
            return Some(clean.to_string());
        }
    }
    None
}

fn read_configured_port() -> u16 {
    let candidate_dirs = [
        PathBuf::from("."),
        PathBuf::from("dist"),
        PathBuf::from("resources"),
        PathBuf::from("resources/dist"),
    ];

    for dir in &candidate_dirs {
        let cfg_path = dir.join("arka-network-config.json");
        if cfg_path.exists() {
            if let Ok(content) = fs::read_to_string(&cfg_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(port) = json.get("serverPort").and_then(|p| p.as_u64()) {
                        if port > 0 && port <= 65535 {
                            return port as u16;
                        }
                    }
                }
            }
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            for sub in &["", "dist", "resources", "resources/dist"] {
                let cfg_path = parent.join(sub).join("arka-network-config.json");
                if cfg_path.exists() {
                    if let Ok(content) = fs::read_to_string(&cfg_path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(port) = json.get("serverPort").and_then(|p| p.as_u64()) {
                                if port > 0 && port <= 65535 {
                                    return port as u16;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    3000
}

fn collect_dist_candidate_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    // 1. Relative paths from working directory
    dirs.push(PathBuf::from("dist"));
    dirs.push(PathBuf::from("../dist"));
    dirs.push(PathBuf::from("../../dist"));
    dirs.push(PathBuf::from("../../../dist"));
    dirs.push(PathBuf::from("resources/dist"));
    dirs.push(PathBuf::from("resources"));
    dirs.push(PathBuf::from("."));

    // 2. Current working directory ancestor tree (up to 6 levels up)
    if let Ok(cd) = std::env::current_dir() {
        let mut curr = Some(cd.as_path());
        for _ in 0..6 {
            if let Some(p) = curr {
                dirs.push(p.join("dist"));
                dirs.push(p.join("resources").join("dist"));
                dirs.push(p.join("resources"));
                dirs.push(p.to_path_buf());
                curr = p.parent();
            } else {
                break;
            }
        }
    }

    // 3. Executable location ancestor tree (up to 6 levels up)
    if let Ok(exe_path) = std::env::current_exe() {
        let mut curr = exe_path.parent();
        for _ in 0..6 {
            if let Some(p) = curr {
                dirs.push(p.join("dist"));
                dirs.push(p.join("resources").join("dist"));
                dirs.push(p.join("resources"));
                dirs.push(p.to_path_buf());
                curr = p.parent();
            } else {
                break;
            }
        }
    }

    // 4. Windows LocalAppData installed paths
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let base = PathBuf::from(local_app_data);
            dirs.push(base.join("Programs").join("ArkaCafePOS").join("dist"));
            dirs.push(base.join("Programs").join("ArkaCafePOS").join("resources").join("dist"));
            dirs.push(base.join("Programs").join("ArkaCafePOS"));
            dirs.push(base.join("com.arka.restaurantpos").join("dist"));
            dirs.push(base.join("com.arka.restaurantpos"));
        }
    }

    // Filter to existing directories and deduplicate
    let mut unique: Vec<PathBuf> = Vec::new();
    for d in dirs {
        if d.exists() && d.is_dir() && !unique.contains(&d) {
            unique.push(d);
        }
    }
    unique
}

fn collect_server_script_paths() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    candidates.push(PathBuf::from("server.js"));
    candidates.push(PathBuf::from("../server.js"));
    candidates.push(PathBuf::from("../../server.js"));
    candidates.push(PathBuf::from("../../../server.js"));
    candidates.push(PathBuf::from("dist/server.js"));

    if let Ok(cd) = std::env::current_dir() {
        let mut curr = Some(cd.as_path());
        for _ in 0..6 {
            if let Some(p) = curr {
                candidates.push(p.join("server.js"));
                curr = p.parent();
            } else {
                break;
            }
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        let mut curr = exe_path.parent();
        for _ in 0..6 {
            if let Some(p) = curr {
                candidates.push(p.join("server.js"));
                curr = p.parent();
            } else {
                break;
            }
        }
    }

    let mut unique = Vec::new();
    for c in candidates {
        if c.exists() && c.is_file() && !unique.contains(&c) {
            unique.push(c);
        }
    }
    unique
}

#[tauri::command]
fn get_system_network_info() -> Vec<String> {
    // 0. Cache check: valid for 60 seconds. Prevents continuous process spawning & high CPU spikes!
    if let Ok(guard) = NETWORK_CACHE.lock() {
        if let Some((ts, ref cached_ips)) = *guard {
            if ts.elapsed() < Duration::from_secs(60) && !cached_ips.is_empty() {
                return cached_ips.clone();
            }
        }
    }

    let mut ips: Vec<String> = Vec::new();

    // 1. Ultra-fast UDP socket routing probe across gateways & common subnets (0 processes, 0% CPU)
    let test_targets = [
        "192.168.1.1:53", "192.168.0.1:53", "192.168.41.1:53", "192.168.41.254:53",
        "192.168.2.1:53", "192.168.4.1:53", "192.168.8.1:53", "192.168.10.1:53",
        "192.168.31.1:53", "192.168.100.1:53", "10.0.0.1:53", "172.16.0.1:53",
        "1.1.1.1:53", "8.8.8.8:53"
    ];
    for target in test_targets {
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            if socket.connect(target).is_ok() {
                if let Ok(addr) = socket.local_addr() {
                    let ip_str = addr.ip().to_string();
                    if is_valid_private_ip(&ip_str) && !ips.contains(&ip_str) {
                        ips.push(ip_str);
                    }
                }
            }
        }
    }

    // If UDP found valid IP, store in cache and return immediately (0 processes launched, 0% CPU!)
    if !ips.is_empty() {
        ips.sort_by(|a, b| {
            let score = |ip: &String| {
                if ip.starts_with("192.168.") { 3 }
                else if ip.starts_with("10.") { 2 }
                else if ip.starts_with("172.") { 1 }
                else { 0 }
            };
            score(b).cmp(&score(a))
        });
        if let Ok(mut guard) = NETWORK_CACHE.lock() {
            *guard = Some((Instant::now(), ips.clone()));
        }
        return ips;
    }

    // 2. Windows Fallback: Silent PowerShell query (only executed if UDP completely failed, and cached for 60s)
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let ps_cmd = "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1 | ForEach-Object { (Get-NetIPAddress -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress })";
        if let Ok(output) = std::process::Command::new("powershell")
            .args(&["-NoProfile", "-NonInteractive", "-Command", ps_cmd])
            .creation_flags(CREATE_NO_WINDOW)
            .output() 
        {
            let out_str = String::from_utf8_lossy(&output.stdout);
            for line in out_str.lines() {
                if let Some(clean_ip) = extract_ipv4(line) {
                    if !ips.contains(&clean_ip) {
                        ips.push(clean_ip);
                    }
                }
            }
        }
    }

    // 3. Windows ipconfig fallback (silent)
    #[cfg(target_os = "windows")]
    {
        if ips.is_empty() {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            if let Ok(output) = std::process::Command::new("ipconfig")
                .creation_flags(CREATE_NO_WINDOW)
                .output() 
            {
                let out_str = String::from_utf8_lossy(&output.stdout);
                for line in out_str.lines() {
                    if line.contains("IPv4") || line.contains("IP Address") || line.contains("آدرس IPv4") || line.contains("آدرس IP") {
                        if let Some(pos) = line.rfind(':') {
                            let candidate = &line[pos + 1..];
                            if let Some(clean_ip) = extract_ipv4(candidate) {
                                if !ips.contains(&clean_ip) {
                                    ips.push(clean_ip);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if ips.is_empty() {
        ips.push("192.168.1.100".to_string());
    }

    if let Ok(mut guard) = NETWORK_CACHE.lock() {
        *guard = Some((Instant::now(), ips.clone()));
    }

    ips
}

#[tauri::command]
fn start_lan_server(port: u16) -> Result<String, String> {
    let target_port = if port == 0 { 3000 } else { port };

    // 1. If an existing HTTP server (e.g. node server.js) is already running on this port, keep it active!
    if let Ok(_stream) = TcpStream::connect(format!("127.0.0.1:{}", target_port)) {
        return Ok(format!("Central server is active on port {}", target_port));
    }

    // 2. Try starting node server.js silently in the background if node is present
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let candidate_server_paths = collect_server_script_paths();
        for srv in candidate_server_paths {
            let spawned = std::process::Command::new("node")
                .arg(&srv)
                .arg(target_port.to_string())
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
            if spawned.is_ok() {
                std::thread::sleep(std::time::Duration::from_millis(700));
                if let Ok(_s) = TcpStream::connect(format!("127.0.0.1:{}", target_port)) {
                    return Ok(format!("Central Node.js background server active on port {}", target_port));
                }
                break;
            }
        }
    }

    // If already running on the same port, keep it active
    if SERVER_RUNNING.load(Ordering::SeqCst) && CURRENT_PORT.load(Ordering::SeqCst) == target_port {
        return Ok(format!("Server already active on port {}", target_port));
    }

    CURRENT_PORT.store(target_port, Ordering::SeqCst);
    SERVER_RUNNING.store(true, Ordering::SeqCst);

    let bind_addr = format!("0.0.0.0:{}", target_port);
    let listener = match TcpListener::bind(&bind_addr) {
        Ok(l) => l,
        Err(e) => {
            return Err(format!("Could not bind to {}: {}", bind_addr, e));
        }
    };

    let _ = listener.set_nonblocking(true);

    thread::spawn(move || {
        while SERVER_RUNNING.load(Ordering::SeqCst) && CURRENT_PORT.load(Ordering::SeqCst) == target_port {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    thread::spawn(move || {
                        handle_lan_http_client(&mut stream, target_port);
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(50));
                }
                Err(_) => {
                    thread::sleep(Duration::from_millis(50));
                }
            }
        }
    });

    Ok(format!("LAN HTTP server active on http://0.0.0.0:{}", target_port))
}

fn handle_lan_http_client(stream: &mut TcpStream, port: u16) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));

    let mut buffer = [0u8; 4096];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(n) => n,
        Err(_) => return,
    };

    if bytes_read == 0 {
        return;
    }

    let request_str = String::from_utf8_lossy(&buffer[..bytes_read]);
    let mut lines = request_str.lines();
    let request_line = match lines.next() {
        Some(line) => line,
        None => return,
    };

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let raw_path = parts.next().unwrap_or("/");
    let path = raw_path.split('?').next().unwrap_or("/");

    // Handle CORS preflight
    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE\r\n\
Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
Connection: close\r\n\
Content-Length: 0\r\n\r\n";
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    // Handle /api/network/info
    if path == "/api/network/info" {
        let ips = get_system_network_info();
        let json_body = format!(
            "{{\"status\":\"ok\",\"localIps\":{:?},\"port\":{},\"timestamp\":{}}}",
            ips,
            port,
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()
        );

        let response = format!(
            "HTTP/1.1 200 OK\r\n\
Content-Type: application/json; charset=utf-8\r\n\
Access-Control-Allow-Origin: *\r\n\
Connection: close\r\n\
Content-Length: {}\r\n\r\n{}",
            json_body.len(),
            json_body
        );
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    let candidate_dirs = collect_dist_candidate_dirs();
    let mut served = false;

    for dist_dir in &candidate_dirs {
        let clean_subpath = path.trim_start_matches('/');
        let file_subpath = if clean_subpath.is_empty() { "index.html" } else { clean_subpath };
        let full_path = dist_dir.join(file_subpath);

        if full_path.exists() && full_path.is_file() {
            if let Ok(content) = fs::read(&full_path) {
                let content_type = get_mime_type(file_subpath);
                let response_header = format!(
                    "HTTP/1.1 200 OK\r\n\
Content-Type: {}\r\n\
Access-Control-Allow-Origin: *\r\n\
Connection: close\r\n\
Content-Length: {}\r\n\r\n",
                    content_type,
                    content.len()
                );
                let _ = stream.write_all(response_header.as_bytes());
                let _ = stream.write_all(&content);
                served = true;
                break;
            }
        }
    }

    // SPA Fallback: If not found, serve index.html
    if !served {
        for dist_dir in &candidate_dirs {
            let index_path = dist_dir.join("index.html");
            if index_path.exists() && index_path.is_file() {
                if let Ok(content) = fs::read(&index_path) {
                    let response_header = format!(
                        "HTTP/1.1 200 OK\r\n\
Content-Type: text/html; charset=utf-8\r\n\
Access-Control-Allow-Origin: *\r\n\
Connection: close\r\n\
Content-Length: {}\r\n\r\n",
                        content.len()
                    );
                    let _ = stream.write_all(response_header.as_bytes());
                    let _ = stream.write_all(&content);
                    served = true;
                    break;
                }
            }
        }
    }

    // Helpful Persian responsive fallback page if dist is temporarily empty
    if !served {
        let fallback_html = format!(r#"<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>سرور شبکه محلی آرکا پوز</title>
  <style>
    body {{ font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; text-align: center; }}
    .card {{ background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px 24px; max-width: 480px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }}
    .badge {{ display: inline-block; background: #065f46; color: #34d399; font-size: 12px; font-weight: bold; padding: 4px 12px; border-radius: 9999px; margin-bottom: 16px; }}
    h1 {{ font-size: 20px; font-weight: 800; margin: 0 0 10px; color: #ffffff; }}
    p {{ font-size: 13px; color: #94a3b8; line-height: 1.8; margin: 0 0 20px; }}
    .url-box {{ background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 12px; font-family: monospace; font-size: 14px; font-weight: bold; color: #38bdf8; direction: ltr; margin-bottom: 20px; word-break: break-all; }}
    .btn {{ background: #4f46e5; color: #ffffff; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; font-size: 13px; cursor: pointer; text-decoration: none; display: inline-block; }}
    .btn:hover {{ background: #4338ca; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● سرور محلی فعال است</div>
    <h1>اتصال به سرور آرکا پوز برقرار شد</h1>
    <p>ارتباط شبکه با این کامپیوتر برقرار است. در حال فراخوانی فایل‌های برنامه...</p>
    <div class="url-box">Port: {}</div>
    <button class="btn" onclick="location.reload()">بارگذاری منو و صندوق</button>
  </div>
  <script>setTimeout(function(){{ location.reload(); }}, 3000);</script>
</body>
</html>"#, port);

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
            fallback_html.len(),
            fallback_html
        );
        let _ = stream.write_all(response.as_bytes());
    }
}

fn get_mime_type(path: &str) -> &'static str {
    if path.ends_with(".html") { "text/html; charset=utf-8" }
    else if path.ends_with(".js") || path.ends_with(".mjs") { "application/javascript; charset=utf-8" }
    else if path.ends_with(".css") { "text/css; charset=utf-8" }
    else if path.ends_with(".json") || path.ends_with(".webmanifest") { "application/json; charset=utf-8" }
    else if path.ends_with(".png") { "image/png" }
    else if path.ends_with(".jpg") || path.ends_with(".jpeg") { "image/jpeg" }
    else if path.ends_with(".svg") { "image/svg+xml" }
    else if path.ends_with(".ico") { "image/x-icon" }
    else if path.ends_with(".woff2") { "font/woff2" }
    else if path.ends_with(".woff") { "font/woff" }
    else { "application/octet-stream" }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            // Automatically launch the embedded LAN server on configured port at startup
            let port = read_configured_port();
            let _ = start_lan_server(port);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_system_network_info, start_lan_server])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
