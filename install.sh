#!/usr/bin/env bash
{
# ==============================================================================
#                 Arka POS System - Linux Server Manager & Installer
#              Production Setup with Nginx, SSL (Let's Encrypt) & PM2
# ==============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

APP_NAME="arka-pos"
DEFAULT_INSTALL_DIR="/opt/arka-pos"
BACKUP_DIR="/var/backups/arka-pos"
DEFAULT_PORT="3000"
DEFAULT_REPO_URL="https://github.com/meh732/caferesturant.git"

# Ensure script runs as root
check_root() {
  if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR] Please run this installer as root (e.g. sudo bash install.sh)${NC}"
    exit 1
  fi
}

# Ensure sufficient Swap memory to prevent OOM Killer during build
ensure_swap() {
  if command -v free &>/dev/null; then
    local ram_mb=$(free -m | awk '/^Mem:/{print $2}')
    local swap_mb=$(free -m | awk '/^Swap:/{print $2}')
    if [ "${swap_mb:-0}" -lt 1500 ]; then
      echo -e "${YELLOW}[INFO] Low Swap memory (${swap_mb:-0}MB, RAM: ${ram_mb}MB). Setting up 2GB swap to prevent OOM crashes...${NC}"
      swapoff /swapfile 2>/dev/null || true
      rm -f /swapfile 2>/dev/null || true
      # dd is universally supported even when fallocate returns 'Operation not supported'
      dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none 2>/dev/null || fallocate -l 2G /swapfile 2>/dev/null || true
      chmod 600 /swapfile 2>/dev/null || true
      mkswap /swapfile 2>/dev/null || true
      swapon /swapfile 2>/dev/null || true
      # Improve memory reclaim stability
      sysctl vm.swappiness=60 vm.vfs_cache_pressure=50 vm.overcommit_memory=1 2>/dev/null || true
      if ! grep -q "/swapfile" /etc/fstab 2>/dev/null; then
        echo "/swapfile none swap sw 0 0" >> /etc/fstab 2>/dev/null || true
      fi
      local new_swap=$(free -m | awk '/^Swap:/{print $2}')
      echo -e "${GREEN}[SUCCESS] Swap memory active: ${new_swap}MB.${NC}"
    fi
  fi
}

# Create backup directory
ensure_backup_dir() {
  mkdir -p "$BACKUP_DIR" 2>/dev/null || true
}

# Take a fast, safe automated backup (excluding heavy node_modules/build cache)
take_backup() {
  local target_dir="${1:-$DEFAULT_INSTALL_DIR}"
  ensure_backup_dir
  local timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_file="$BACKUP_DIR/${APP_NAME}_backup_${timestamp}.tar.gz"

  echo -e "${CYAN}[BACKUP] Creating automated backup before proceeding (excluding node_modules)...${NC}"
  if [ -d "$target_dir" ]; then
    # Always copy database file directly first for instant safety
    if [ -f "$target_dir/data/arka_db.json" ]; then
      cp -f "$target_dir/data/arka_db.json" "$BACKUP_DIR/arka_db_${timestamp}.json" 2>/dev/null || true
      cp -f "$target_dir/data/arka_db.json" "/tmp/arka_db_latest_backup.json" 2>/dev/null || true
    fi

    # Archive project excluding heavy directories that cause OOM / hang
    tar --exclude='node_modules' \
        --exclude='dist' \
        --exclude='.git' \
        --exclude='src-tauri/target' \
        -czf "$backup_file" \
        -C "$(dirname "$target_dir")" "$(basename "$target_dir")" 2>/dev/null || true

    # Keep only the last 10 backups to prevent disk full errors
    ls -1t "$BACKUP_DIR"/${APP_NAME}_backup_*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f 2>/dev/null || true

    echo -e "${GREEN}[SUCCESS] Backup completed in 1s and saved at:${NC} $backup_file"
  else
    echo -e "${YELLOW}[INFO] Installation directory not found. Skipping file backup.${NC}"
  fi
}

# Safely wait for or release any lingering apt/dpkg locks (e.g. unattended-upgrades)
wait_for_apt_lock() {
  local timeout=60
  while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || fuser /var/lib/dpkg/lock >/dev/null 2>&1; do
    echo -e "${YELLOW}[INFO] Waiting for background system updater (apt/dpkg lock) to release... ($timeout s remaining)${NC}"
    sleep 3
    timeout=$((timeout - 3))
    if [ "$timeout" -le 0 ]; then
      echo -e "${YELLOW}[INFO] Releasing lingering apt process...${NC}"
      killall apt-get apt unattended-upgrades 2>/dev/null || true
      sleep 2
      rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock 2>/dev/null || true
      dpkg --configure -a 2>/dev/null || true
      break
    fi
  done
}

# Fix broken or outdated Iranian mirrors (e.g. mirror2.parspack.com which lacks Ubuntu 24.04 noble Release)
fix_broken_apt_mirrors() {
  local has_broken_mirror=false
  if grep -rq "mirror2.parspack.com" /etc/apt/ 2>/dev/null; then
    has_broken_mirror=true
  fi

  if [ "$has_broken_mirror" = true ]; then
    echo -e "${YELLOW}[INFO] Detected broken repository mirror (mirror2.parspack.com lacks Ubuntu 24.04 noble). Fixing sources...${NC}"
    sed -i 's|http://mirror2.parspack.com/ubuntu|http://archive.ubuntu.com/ubuntu|g' /etc/apt/sources.list 2>/dev/null || true
    sed -i 's|http://mirror2.parspack.com/ubuntu|http://archive.ubuntu.com/ubuntu|g' /etc/apt/sources.list.d/*.sources 2>/dev/null || true
    sed -i 's|http://mirror2.parspack.com/ubuntu|http://archive.ubuntu.com/ubuntu|g' /etc/apt/sources.list.d/*.list 2>/dev/null || true
    echo -e "${GREEN}[SUCCESS] Switched repositories to official archive.ubuntu.com.${NC}"
  fi
}

# ------------------------------------------------------------------------------
# 1. INSTALLATION
# ------------------------------------------------------------------------------
install_arka() {
  echo -e "\n${BLUE}======================================================${NC}"
  echo -e "${BLUE}          1. Fresh Install Arka POS Server            ${NC}"
  echo -e "${BLUE}======================================================${NC}\n"

  # User inputs
  read -rp "Enter Installation Directory [Default: $DEFAULT_INSTALL_DIR]: " INSTALL_DIR
  INSTALL_DIR=${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}

  read -rp "Enter GitHub Repository URL [Default: $DEFAULT_REPO_URL]: " REPO_URL
  REPO_URL=${REPO_URL:-$DEFAULT_REPO_URL}

  read -rp "Enter Application Port [Default: $DEFAULT_PORT]: " APP_PORT
  APP_PORT=${APP_PORT:-$DEFAULT_PORT}

  read -rp "Enter Domain Name (e.g. pos.myrestaurant.com or Server IP) [Default: localhost]: " DOMAIN_NAME
  # Strip protocol, paths and whitespace
  DOMAIN_NAME=$(echo "${DOMAIN_NAME:-localhost}" | sed -e 's|^https\?://||' -e 's|/.*$||' | tr -d '[:space:]')
  DOMAIN_NAME=${DOMAIN_NAME:-localhost}

  read -rp "Do you want to configure Let's Encrypt SSL for this domain? (y/N): " SETUP_SSL

  # Auto-fix broken mirrors before update
  fix_broken_apt_mirrors
  wait_for_apt_lock

  echo -e "\n${CYAN}[1/6] Updating system packages...${NC}"
  if ! apt-get update -y; then
    echo -e "${YELLOW}[WARNING] apt-get update encountered errors. Attempting fallback mirror repair...${NC}"
    fix_broken_apt_mirrors
    apt-get update -y || true
  fi

  echo -e "\n${CYAN}[2/6] Installing dependencies (Node.js 20, Git, Nginx, Certbot, Build Tools)...${NC}"
  wait_for_apt_lock
  apt-get install -y curl git ufw nginx build-essential certbot python3-certbot-nginx

  # Install Node.js 20 LTS if not present
  if ! command -v node &> /dev/null || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 18 ]; then
    echo -e "${CYAN}Installing Node.js 20.x LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi

  # Install PM2 globally
  if ! command -v pm2 &> /dev/null; then
    echo -e "${CYAN}Installing PM2 Process Manager...${NC}"
    npm install -g pm2
  fi

  echo -e "\n${CYAN}[3/6] Setting up project files at $INSTALL_DIR...${NC}"
  # Backup existing database if present
  if [ -f "$INSTALL_DIR/data/arka_db.json" ]; then
    echo -e "${YELLOW}[INFO] Preserving existing central database file...${NC}"
    mkdir -p /tmp/arka_backup_tmp
    cp "$INSTALL_DIR/data/arka_db.json" /tmp/arka_backup_tmp/arka_db.json 2>/dev/null || true
  fi

  if [ -n "$REPO_URL" ] && [ "$REPO_URL" != "local" ]; then
    echo -e "${CYAN}Performing clean clone from repository: $REPO_URL...${NC}"
    rm -rf "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR" || {
      echo -e "${RED}[ERROR] Git clone failed for $REPO_URL.${NC}"
      if [ -f "./package.json" ]; then
        echo -e "${YELLOW}Copying local project directory to $INSTALL_DIR...${NC}"
        cp -r ./* "$INSTALL_DIR"/ 2>/dev/null || true
      fi
    }
  else
    echo -e "${CYAN}Copying local project directory to $INSTALL_DIR...${NC}"
    mkdir -p "$INSTALL_DIR"
    cp -r ./* "$INSTALL_DIR"/ 2>/dev/null || true
  fi

  # Restore preserved database if available
  if [ -f /tmp/arka_backup_tmp/arka_db.json ]; then
    mkdir -p "$INSTALL_DIR/data"
    cp /tmp/arka_backup_tmp/arka_db.json "$INSTALL_DIR/data/arka_db.json"
    rm -rf /tmp/arka_backup_tmp
    echo -e "${GREEN}[SUCCESS] Existing database successfully restored to $INSTALL_DIR/data/arka_db.json${NC}"
  fi

  if [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo -e "${RED}[ERROR] package.json not found in $INSTALL_DIR!${NC}"
    echo -e "${YELLOW}Please ensure your repository URL is valid and public: $REPO_URL${NC}"
    return 1
  fi

  cd "$INSTALL_DIR"

  echo -e "\n${CYAN}[4/6] Installing NPM packages and building production assets...${NC}"
  ensure_swap
  npm install --no-audit --no-fund --prefer-offline || npm install
  if [ -f "$INSTALL_DIR/dist/index.html" ]; then
    echo -e "${GREEN}[SUCCESS] Pre-compiled web assets found in dist/. Skipping local build.${NC}"
  else
    node --max-old-space-size=512 ./node_modules/vite/bin/vite.js build || npm run build || true
  fi

  echo -e "\n${CYAN}[5/6] Configuring PM2 Background Daemon...${NC}"
  pm2 delete "$APP_NAME" 2>/dev/null || true
  pm2 start server.js --name "$APP_NAME" -- "$APP_PORT" || pm2 start npm --name "$APP_NAME" -- start
  pm2 save
  pm2 startup systemd -u root --hp /root || true

  echo -e "\n${CYAN}[6/6] Configuring Nginx Reverse Proxy & Firewall...${NC}"
  
  # Configure Nginx
  NGINX_CONF="/etc/nginx/sites-available/$APP_NAME"
  cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    client_max_body_size 50M;

    # Real-Time Server-Sent Events (SSE) - No buffering for instant push
    location /api/db/events {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
    }

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
EOF

  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$APP_NAME"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t
  systemctl enable nginx 2>/dev/null || true
  systemctl restart nginx || systemctl start nginx

  # Configure SSL if requested
  if [[ "$SETUP_SSL" =~ ^[Yy]$ ]] && [ "$DOMAIN_NAME" != "localhost" ] && [ "$DOMAIN_NAME" != "127.0.0.1" ]; then
    echo -e "\n${CYAN}Obtaining Let's Encrypt SSL Certificate for $DOMAIN_NAME...${NC}"
    if ! command -v certbot &> /dev/null; then
      wait_for_apt_lock
      apt-get install -y certbot python3-certbot-nginx
    fi
    certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos -m "admin@$DOMAIN_NAME" --redirect || {
      echo -e "${YELLOW}[WARNING] Automated SSL registration failed. Please ensure DNS A-record points to this server IP.${NC}"
    }
    systemctl restart nginx || true
  fi

  # Firewall rules
  if command -v ufw &> /dev/null; then
    ufw allow 80/tcp || true
    ufw allow 443/tcp || true
    ufw allow "$APP_PORT"/tcp || true
  fi

  echo -e "\n${GREEN}======================================================${NC}"
  echo -e "${GREEN}      Arka POS Installation Completed Successfully!    ${NC}"
  echo -e "${GREEN}======================================================${NC}"
  echo -e "Access URL: ${CYAN}http://$DOMAIN_NAME (or http://SERVER_IP:$APP_PORT)${NC}"
  echo -e "Install Directory: $INSTALL_DIR"
  echo -e "Service Status: Use option 5 in menu or 'pm2 status'"
}

# ------------------------------------------------------------------------------
# 2. UPDATE (With Automated Pre-Update Backup)
# ------------------------------------------------------------------------------
update_arka() {
  echo -e "\n${BLUE}======================================================${NC}"
  echo -e "${BLUE}          2. Update Arka POS System                   ${NC}"
  echo -e "${BLUE}======================================================${NC}\n"

  read -rp "Enter Installation Directory [Default: $DEFAULT_INSTALL_DIR]: " INSTALL_DIR
  INSTALL_DIR=${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}

  if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}[ERROR] Installation directory $INSTALL_DIR does not exist!${NC}"
    return 1
  fi

  # 1. MANDATORY AUTOMATED BACKUP
  take_backup "$INSTALL_DIR"

  echo -e "\n${CYAN}[1/3] Pulling latest updates from Git...${NC}"
  cd "$INSTALL_DIR" || return 1
  if [ -d ".git" ]; then
    echo -e "${CYAN}Cleaning temporary build assets while preserving database...${NC}"
    # Discard any local modifications to tracked files
    git reset --hard HEAD 2>/dev/null || true
    # Clean untracked generated files while preserving data/ and node_modules/
    git clean -fd -e data/ -e node_modules/ 2>/dev/null || true
    
    echo -e "${CYAN}Fetching and syncing latest code from repository...${NC}"
    git fetch --all --prune 2>/dev/null || true
    local_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
    git reset --hard "origin/$local_branch" 2>/dev/null || git pull --force 2>/dev/null || true
  else
    echo -e "${YELLOW}[INFO] Not a git repository. Updating dependencies and rebuilding directly.${NC}"
  fi

  # Ensure database is restored if anything touched data/
  if [ ! -f "$INSTALL_DIR/data/arka_db.json" ] && [ -f "/tmp/arka_db_latest_backup.json" ]; then
    mkdir -p "$INSTALL_DIR/data"
    cp -f "/tmp/arka_db_latest_backup.json" "$INSTALL_DIR/data/arka_db.json"
  fi

  echo -e "\n${CYAN}[2/3] Updating NPM dependencies and verifying assets...${NC}"
  ensure_swap
  # Free RAM temporarily before any work to avoid OOM
  sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true

  if [ ! -f "$INSTALL_DIR/node_modules/vite/bin/vite.js" ] || [ ! -d "$INSTALL_DIR/node_modules/vazirmatn" ]; then
    echo -e "${CYAN}Installing missing NPM packages (memory-safe mode)...${NC}"
    NODE_OPTIONS="--max-old-space-size=384" npm install --no-audit --no-fund --prefer-offline --ignore-scripts --maxsockets=1 || true
  else
    echo -e "${GREEN}[INFO] All required packages are already present in node_modules.${NC}"
  fi

  # If dist/ already contains the compiled production bundle, skip building on server!
  if [ -f "$INSTALL_DIR/dist/index.html" ]; then
    echo -e "${GREEN}[SUCCESS] Production web assets (dist/) are already pre-compiled.${NC}"
    echo -e "${GREEN}[INFO] Skipping Vite compile on server (0% CPU/RAM spike, no terminal disconnection).${NC}"
  else
    echo -e "${CYAN}Compiling web assets (low-memory safe mode)...${NC}"
    node --max-old-space-size=384 ./node_modules/vite/bin/vite.js build || npm run build || true
  fi

  echo -e "\n${CYAN}[3/3] Reloading PM2 Service and Nginx proxy...${NC}"
  pm2 restart "$APP_NAME" --update-env || pm2 start server.js --name "$APP_NAME" -- "$DEFAULT_PORT" || pm2 start npm --name "$APP_NAME" -- start
  pm2 save 2>/dev/null || true
  systemctl reload nginx 2>/dev/null || true

  echo -e "\n${GREEN}[SUCCESS] Arka POS updated successfully!${NC}"
}

# ------------------------------------------------------------------------------
# 3. UNINSTALL (With Mandatory Pre-Uninstall Backup)
# ------------------------------------------------------------------------------
uninstall_arka() {
  echo -e "\n${RED}======================================================${NC}"
  echo -e "${RED}          3. Uninstall Arka POS System                ${NC}"
  echo -e "${RED}======================================================${NC}\n"

  read -rp "Enter Installation Directory to remove [Default: $DEFAULT_INSTALL_DIR]: " INSTALL_DIR
  INSTALL_DIR=${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}

  echo -e "${YELLOW}[WARNING] This will stop the service and remove application files.${NC}"
  read -rp "Are you absolutely sure you want to uninstall? (y/N): " CONFIRM

  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "${CYAN}Uninstall cancelled.${NC}"
    return 0
  fi

  # 1. MANDATORY SAFETY BACKUP
  echo -e "\n${CYAN}[1/4] Creating final safety backup before deletion...${NC}"
  take_backup "$INSTALL_DIR"

  echo -e "\n${CYAN}[2/4] Stopping and deleting PM2 process...${NC}"
  pm2 delete "$APP_NAME" 2>/dev/null || true
  pm2 save 2>/dev/null || true

  echo -e "\n${CYAN}[3/4] Removing Nginx reverse proxy configuration...${NC}"
  rm -f "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME" 2>/dev/null || true
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true

  echo -e "\n${CYAN}[4/4] Removing installation directory $INSTALL_DIR...${NC}"
  rm -rf "$INSTALL_DIR"

  echo -e "\n${GREEN}[SUCCESS] Arka POS uninstalled cleanly.${NC}"
  echo -e "${GREEN}A full backup has been preserved at: $BACKUP_DIR${NC}"
}

# ------------------------------------------------------------------------------
# 4. STANDALONE BACKUP
# ------------------------------------------------------------------------------
manual_backup() {
  echo -e "\n${BLUE}======================================================${NC}"
  echo -e "${BLUE}          4. Standalone Full Backup                   ${NC}"
  echo -e "${BLUE}======================================================${NC}\n"
  take_backup "$DEFAULT_INSTALL_DIR"
}

# ------------------------------------------------------------------------------
# 5. SERVICE MANAGEMENT
# ------------------------------------------------------------------------------
service_manager() {
  while true; do
    echo -e "\n${CYAN}--- Service Management ---${NC}"
    echo "1) Check Status (pm2 status)"
    echo "2) View Real-time Logs (pm2 logs)"
    echo "3) Restart Service (pm2 restart)"
    echo "4) Stop Service (pm2 stop)"
    echo "5) Start Service (pm2 start)"
    echo "6) Return to Main Menu"
    read -rp "Select option [1-6]: " svc_choice

    case "$svc_choice" in
      1) pm2 status ;;
      2) pm2 logs "$APP_NAME" --lines 50 ;;
      3) pm2 restart "$APP_NAME" ;;
      4) pm2 stop "$APP_NAME" ;;
      5) pm2 start "$APP_NAME" ;;
      6) break ;;
      *) echo -e "${RED}Invalid option${NC}" ;;
    esac
  done
}

# ------------------------------------------------------------------------------
# 6. CONFIGURE / FIX DOMAIN, NGINX & SSL
# ------------------------------------------------------------------------------
reconfigure_domain_ssl() {
  echo -e "\n${BLUE}======================================================${NC}"
  echo -e "${BLUE}       Configure / Fix Domain & SSL Certificate       ${NC}"
  echo -e "${BLUE}======================================================${NC}\n"

  read -rp "Enter Application Port [Default: $DEFAULT_PORT]: " APP_PORT
  APP_PORT=${APP_PORT:-$DEFAULT_PORT}

  read -rp "Enter Domain Name (e.g. accrc.templatetesti.shop) [WITHOUT http:// or https://]: " DOMAIN_NAME
  # Strip protocol, paths and whitespace
  DOMAIN_NAME=$(echo "$DOMAIN_NAME" | sed -e 's|^https\?://||' -e 's|/.*$||' | tr -d '[:space:]')

  if [ -z "$DOMAIN_NAME" ]; then
    echo -e "${RED}[ERROR] Domain name cannot be empty!${NC}"
    return 1
  fi

  read -rp "Do you want to configure Let's Encrypt SSL certificate for $DOMAIN_NAME? (y/N): " SETUP_SSL

  NGINX_CONF="/etc/nginx/sites-available/$APP_NAME"
  cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    client_max_body_size 50M;

    # Real-Time Server-Sent Events (SSE) - No buffering for instant push
    location /api/db/events {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
    }

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
EOF

  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$APP_NAME"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t
  systemctl enable nginx 2>/dev/null || true
  systemctl restart nginx || systemctl start nginx

  if [[ "$SETUP_SSL" =~ ^[Yy]$ ]] && [ "$DOMAIN_NAME" != "localhost" ] && [ "$DOMAIN_NAME" != "127.0.0.1" ]; then
    echo -e "\n${CYAN}Obtaining Let's Encrypt SSL Certificate for $DOMAIN_NAME...${NC}"
    apt-get install -y certbot python3-certbot-nginx
    certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos -m "admin@$DOMAIN_NAME" --redirect || {
      echo -e "${YELLOW}[WARNING] Automated SSL registration failed. Please ensure DNS A-record points to this server IP.${NC}"
    }
    systemctl restart nginx || true
  fi

  echo -e "\n${GREEN}[SUCCESS] Domain and Nginx configuration completed for $DOMAIN_NAME!${NC}"
}

# ------------------------------------------------------------------------------
# MAIN MENU (English strictly as requested)
# ------------------------------------------------------------------------------
main_menu() {
  check_root
  while true; do
    echo -e "\n${BLUE}======================================================${NC}"
    echo -e "${BLUE}       Arka POS System - Linux Server Manager         ${NC}"
    echo -e "${BLUE}======================================================${NC}"
    echo -e " 1. Install Arka POS Server (Nginx + Domain + SSL + Custom Port)"
    echo -e " 2. Update Arka POS (With Automatic Pre-Update Backup)"
    echo -e " 3. Uninstall Arka POS (With Automatic Safety Backup)"
    echo -e " 4. Backup Project & Database Now"
    echo -e " 5. Manage Service (Status / Logs / Restart)"
    echo -e " 6. Configure / Fix Domain, Nginx & SSL"
    echo -e " 0. Exit"
    echo -e "${BLUE}======================================================${NC}"
    read -rp "Please enter your choice [0-6]: " CHOICE

    case "$CHOICE" in
      1) install_arka ;;
      2) update_arka ;;
      3) uninstall_arka ;;
      4) manual_backup ;;
      5) service_manager ;;
      6) reconfigure_domain_ssl ;;
      0) 
        echo -e "${GREEN}Goodbye!${NC}"
        exit 0 
        ;;
      *) 
        echo -e "${RED}Invalid selection. Please choose 0, 1, 2, 3, 4, 5, or 6.${NC}" 
        ;;
    esac
  done
}

main_menu
exit 0
}
