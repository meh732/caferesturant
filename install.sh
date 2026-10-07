#!/usr/bin/env bash

# ==============================================================================
#                 Arka POS System - Linux Server Manager & Installer
#              Production Setup with Nginx, SSL (Let's Encrypt) & PM2
# ==============================================================================

set -e

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

# Create backup directory
ensure_backup_dir() {
  mkdir -p "$BACKUP_DIR"
}

# Take a full automated backup
take_backup() {
  ensure_backup_dir
  local timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_file="$BACKUP_DIR/${APP_NAME}_backup_${timestamp}.tar.gz"

  echo -e "${CYAN}[BACKUP] Creating automated full backup before proceeding...${NC}"
  if [ -d "$DEFAULT_INSTALL_DIR" ]; then
    tar -czf "$backup_file" -C "$(dirname "$DEFAULT_INSTALL_DIR")" "$(basename "$DEFAULT_INSTALL_DIR")" 2>/dev/null || true
    echo -e "${GREEN}[SUCCESS] Backup saved securely at:${NC} $backup_file"
  else
    echo -e "${YELLOW}[INFO] Installation directory not found. Skipping file backup.${NC}"
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
  DOMAIN_NAME=${DOMAIN_NAME:-localhost}

  read -rp "Do you want to configure Let's Encrypt SSL for this domain? (y/N): " SETUP_SSL

  echo -e "\n${CYAN}[1/6] Updating system packages...${NC}"
  apt-get update -y

  echo -e "\n${CYAN}[2/6] Installing dependencies (Node.js 20, Git, Nginx, Certbot, Build Tools)...${NC}"
  apt-get install -y curl git ufw nginx build-essential

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
  mkdir -p "$INSTALL_DIR"

  if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}Existing Git repository found. Pulling latest code...${NC}"
    cd "$INSTALL_DIR"
    git pull || true
  elif [ -n "$REPO_URL" ] && [ "$REPO_URL" != "local" ]; then
    echo -e "${CYAN}Cloning from repository: $REPO_URL...${NC}"
    rm -rf "$INSTALL_DIR"/* "$INSTALL_DIR"/.[!.]* 2>/dev/null || true
    git clone "$REPO_URL" "$INSTALL_DIR" || {
      echo -e "${RED}[ERROR] Git clone failed for $REPO_URL.${NC}"
      if [ -f "./package.json" ]; then
        echo -e "${YELLOW}Copying local project directory to $INSTALL_DIR...${NC}"
        cp -r ./* "$INSTALL_DIR"/ 2>/dev/null || true
      fi
    }
  else
    echo -e "${CYAN}Copying local project directory to $INSTALL_DIR...${NC}"
    cp -r ./* "$INSTALL_DIR"/ 2>/dev/null || true
  fi

  if [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo -e "${RED}[ERROR] package.json not found in $INSTALL_DIR!${NC}"
    echo -e "${YELLOW}Please ensure your repository URL is valid and public: $REPO_URL${NC}"
    return 1
  fi

  cd "$INSTALL_DIR"

  echo -e "\n${CYAN}[4/6] Installing NPM packages and building production assets...${NC}"
  npm install
  npm run build

  echo -e "\n${CYAN}[5/6] Configuring PM2 Background Daemon...${NC}"
  pm2 delete "$APP_NAME" 2>/dev/null || true
  pm2 start npm --name "$APP_NAME" -- run preview -- --port "$APP_PORT" --host 0.0.0.0
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
    }
}
EOF

  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$APP_NAME"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t && systemctl reload nginx

  # Configure SSL if requested
  if [[ "$SETUP_SSL" =~ ^[Yy]$ ]] && [ "$DOMAIN_NAME" != "localhost" ] && [ "$DOMAIN_NAME" != "127.0.0.1" ]; then
    echo -e "\n${CYAN}Obtaining Let's Encrypt SSL Certificate for $DOMAIN_NAME...${NC}"
    apt-get install -y certbot python3-certbot-nginx
    certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos -m "admin@$DOMAIN_NAME" --redirect || {
      echo -e "${YELLOW}[WARNING] Automated SSL registration failed. Please ensure DNS A-record points to this server IP.${NC}"
    }
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
  take_backup

  echo -e "\n${CYAN}[1/3] Pulling latest updates from Git...${NC}"
  cd "$INSTALL_DIR"
  if [ -d ".git" ]; then
    git pull
  else
    echo -e "${YELLOW}[INFO] Not a git repository. Updating dependencies and rebuilding directly.${NC}"
  fi

  echo -e "\n${CYAN}[2/3] Updating NPM dependencies and rebuilding assets...${NC}"
  npm install
  npm run build

  echo -e "\n${CYAN}[3/3] Reloading PM2 Service without downtime...${NC}"
  pm2 reload "$APP_NAME" || pm2 restart "$APP_NAME" || pm2 start npm --name "$APP_NAME" -- run preview -- --port "$DEFAULT_PORT" --host 0.0.0.0

  echo -e "\n${GREEN}[SUCCESS] Arka POS updated successfully with zero downtime!${NC}"
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
  take_backup

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
  take_backup
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
    echo -e " 0. Exit"
    echo -e "${BLUE}======================================================${NC}"
    read -rp "Please enter your choice [0-5]: " CHOICE

    case "$CHOICE" in
      1) install_arka ;;
      2) update_arka ;;
      3) uninstall_arka ;;
      4) manual_backup ;;
      5) service_manager ;;
      0) 
        echo -e "${GREEN}Goodbye!${NC}"
        exit 0 
        ;;
      *) 
        echo -e "${RED}Invalid selection. Please choose 0, 1, 2, 3, 4, or 5.${NC}" 
        ;;
    esac
  done
}

main_menu
