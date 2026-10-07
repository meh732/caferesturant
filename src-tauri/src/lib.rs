#[tauri::command]
fn get_system_network_info() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip_str = addr.ip().to_string();
                if ip_str != "0.0.0.0" && !ip_str.starts_with("127.") {
                    ips.push(ip_str);
                }
            }
        }
    }
    ips
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_system_network_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

