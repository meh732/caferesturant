use std::net::{TcpListener, TcpStream, UdpSocket};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::thread;
use std::fs;
use std::path::{Path, PathBuf};

static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static CURRENT_PORT: AtomicU16 = AtomicU16::new(0);

#[tauri::command]
fn get_system_network_info() -> Vec<String> {
    let mut ips = Vec::new();
    
    // Test active default gateway / interface via UDP socket connection
    let test_targets = ["8.8.8.8:80", "1.1.1.1:80", "114.114.114.114:80", "192.168.1.1:80", "192.168.0.1:80"];
    for target in test_targets {
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            if socket.connect(target).is_ok() {
                if let Ok(addr) = socket.local_addr() {
                    let ip_str = addr.ip().to_string();
                    if ip_str != "0.0.0.0" && !ip_str.starts_with("127.") && !ips.contains(&ip_str) {
                        ips.push(ip_str);
                    }
                }
            }
        }
    }

    if ips.is_empty() {
        ips.push("192.168.1.100".to_string());
    }

    ips
}

#[tauri::command]
fn start_lan_server(port: u16) -> Result<String, String> {
    let target_port = if port == 0 { 3000 } else { port };

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

    thread::spawn(move || {
        for stream in listener.incoming() {
            if !SERVER_RUNNING.load(Ordering::SeqCst) || CURRENT_PORT.load(Ordering::SeqCst) != target_port {
                break;
            }
            if let Ok(mut stream) = stream {
                thread::spawn(move || {
                    handle_lan_http_client(&mut stream, target_port);
                });
            }
        }
    });

    Ok(format!("LAN HTTP server successfully active on http://0.0.0.0:{}", target_port))
}

fn handle_lan_http_client(stream: &mut TcpStream, port: u16) {
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
Content-Length: {}\r\n\r\n{}",
            json_body.len(),
            json_body
        );
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    // Try finding and serving static files from dist or current directory
    let dist_dirs = ["dist", "../dist", "target/release/dist", "."];
    let mut served = false;

    for dist_dir in dist_dirs {
        let clean_subpath = path.trim_start_matches('/');
        let file_subpath = if clean_subpath.is_empty() { "index.html" } else { clean_subpath };
        let full_path = Path::new(dist_dir).join(file_subpath);

        if full_path.exists() && full_path.is_file() {
            if let Ok(content) = fs::read(&full_path) {
                let content_type = get_mime_type(file_subpath);
                let response_header = format!(
                    "HTTP/1.1 200 OK\r\n\
Content-Type: {}\r\n\
Access-Control-Allow-Origin: *\r\n\
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
        for dist_dir in dist_dirs {
            let index_path = Path::new(dist_dir).join("index.html");
            if index_path.exists() {
                if let Ok(content) = fs::read(&index_path) {
                    let response_header = format!(
                        "HTTP/1.1 200 OK\r\n\
Content-Type: text/html; charset=utf-8\r\n\
Access-Control-Allow-Origin: *\r\n\
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

    // Basic 404 if no files located
    if !served {
        let msg = "Arka POS Local Network Server is Active. Build web assets with 'npm run build'.";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
            msg.len(),
            msg
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
        .invoke_handler(tauri::generate_handler![get_system_network_info, start_lan_server])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
