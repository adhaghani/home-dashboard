#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-stremio.sh — Bare-metal Stremio Streaming Server for Orange Pi Zero 2
# ─────────────────────────────────────────────────────────────────────────────
# Installs the official Stremio streaming server directly on the host OS.
# Optimized for 1 GB RAM: V8 heap limit, PM2 memory cap, no Docker.
#
# Usage:
#   chmod +x setup-stremio.sh
#   ./setup-stremio.sh
#
# After setup, the server runs on:
#   HTTP:  http://<orange-pi-ip>:11470
#   HTTPS: https://<orange-pi-ip>:12470
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVER_DIR="$HOME/stremio-server"
SERVER_JS_URL="https://dl.strem.io/server/v4.20.8/desktop/server.js"
PM2_APP_NAME="stremio-server"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Stremio Server Setup — Orange Pi Zero 2${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────
# Step 1: System updates & base packages
# ─────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/7] Updating package index and installing base packages...${NC}"
sudo apt update -qq
sudo apt install -y -qq curl wget xz-utils

# ─────────────────────────────────────────────────────────────────────────
# Step 2: Install Node.js 20 LTS from official ARM64 tarball
# ─────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/7] Installing Node.js 20 LTS (ARM64 pre-built)...${NC}"
if ! command -v node &>/dev/null; then
  NODE_VERSION="20.18.1"
  NODE_TAR="node-v${NODE_VERSION}-linux-arm64.tar.xz"
  NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}"

  echo "  Downloading Node.js ${NODE_VERSION} (~28 MB)..."
  cd "$HOME"
  curl -fsSL -O "$NODE_URL"

  echo "  Extracting to /usr/local..."
  tar -xJf "$NODE_TAR"
  sudo cp -r "node-v${NODE_VERSION}-linux-arm64/"* /usr/local/
  rm -rf "$NODE_TAR" "node-v${NODE_VERSION}-linux-arm64"
  echo "  Node.js installed"
else
  CURRENT_NODE="$(node --version)"
  echo "  Node.js already installed: ${CURRENT_NODE}"
fi
echo "  node: $(node --version)"
echo "  npm:  $(npm --version)"

# ─────────────────────────────────────────────────────────────────────────
# Step 3: Install FFmpeg (required for transcoding)
# ─────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/7] Installing FFmpeg...${NC}"
if ! command -v ffmpeg &>/dev/null; then
  sudo apt install -y -qq ffmpeg
fi
echo "  ffmpeg:  $(ffmpeg -version 2>&1 | head -1 || echo 'installed')"
echo "  ffprobe: $(ffprobe -version 2>&1 | head -1 || echo 'installed')"

# ─────────────────────────────────────────────────────────────────────────
# Step 4: Install PM2 globally + log rotation module
# ─────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[4/7] Installing PM2 process manager...${NC}"
if ! command -v pm2 &>/dev/null; then
  sudo npm install -g pm2
fi
pm2 install pm2-logrotate 2>/dev/null || true
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 3
pm2 set pm2-logrotate:compress true
echo "  pm2: $(pm2 --version)"

# ─────────────────────────────────────────────────────────────────────────
# Step 5: Download the Stremio streaming server
# ─────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[5/7] Downloading Stremio streaming server...${NC}"
mkdir -p "$SERVER_DIR"
cd "$SERVER_DIR"

# Download server.js from Stremio's official CDN
echo "  Fetching server.js from Stremio CDN..."
curl -fsSL -o server.js "$SERVER_JS_URL" || {
  echo -e "${RED}✗ Failed to download server.js${NC}"
  echo "  Check your internet connection or try a different version."
  exit 1
}
echo "  server.js downloaded ($(du -h server.js | cut -f1))"

# Create data directory for server settings/certificates
mkdir -p "$SERVER_DIR/data"

# ─────────────────────────────────────────────────────────────────────────
# Step 6: Create PM2 ecosystem config
# ─────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[6/7] Creating PM2 ecosystem config...${NC}"
cat > "$SERVER_DIR/ecosystem.config.js" << 'ECOSYSTEM_EOF'
// ───────────────────────────────────────────────────────────────────────────
// PM2 Ecosystem Config — Stremio Streaming Server
// ───────────────────────────────────────────────────────────────────────────
// Optimized for Orange Pi Zero 2 (1 GB RAM).
// - V8 heap limited to 150 MB via --max-old-space-size
// - PM2 memory cap at 180 MB with auto-restart
// - NO_CORS=1 allows mobile apps on the local network to connect
// - CASTING_DISABLED=1 prevents network scans on a headless server
// - Log rotation handled by pm2-logrotate module
// ───────────────────────────────────────────────────────────────────────────
module.exports = {
  apps: [
    {
      name: 'stremio-server',
      script: 'server.js',
      cwd: __dirname,

      // ── Node.js runtime flags ──────────────────────────────────────
      node_args: [
        '--max-old-space-size=150',        // V8 heap: 150 MB max
        '--optimize-for-size',             // favour smaller code over speed
        '--gc-interval=50',                // hint GC every 50 allocations
        '--max-semi-space-size=8',         // limit scavenge semi-space
        '--initial-old-space-size=16',     // start small, grow as needed
      ],

      // ── Environment ────────────────────────────────────────────────
      env: {
        NO_CORS: '1',                      // allow LAN clients (mobile, web)
        NODE_ENV: 'production',
        APP_PATH: __dirname + '/data',     // server settings, certs storage
        FFMPEG_BIN: '/usr/bin/ffmpeg',
        FFPROBE_BIN: '/usr/bin/ffprobe',
        CASTING_DISABLED: '1',             // don't scan for Chromecast/DLNA
      },

      // ── Process limits ─────────────────────────────────────────────
      max_memory_restart: '180M',          // restart if RSS exceeds 180 MB
      max_restarts: 5,                     // stop after 5 rapid failures
      min_uptime: '10s',                   // consider stable after 10s
      restart_delay: 5000,                 // 5s between restarts
      kill_timeout: 5000,                  // 5s grace period for shutdown

      // ── Logging ────────────────────────────────────────────────────
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: __dirname + '/logs/error.log',
      out_file: __dirname + '/logs/output.log',
      merge_logs: true,
      autorestart: true,
      watch: false,
    },
  ],
};
ECOSYSTEM_EOF

# ─────────────────────────────────────────────────────────────────────────
# Step 7: Build and clean up
# ─────────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[7/7] Starting the server with PM2...${NC}"

# Stop any existing instance
pm2 stop "$PM2_APP_NAME" 2>/dev/null || true
pm2 delete "$PM2_APP_NAME" 2>/dev/null || true

# Start with ecosystem config
pm2 start "$SERVER_DIR/ecosystem.config.js"

# Save PM2 process list for auto-start on boot
pm2 save

# Configure PM2 to start on system boot
sudo env PATH="$PATH:$(dirname "$(which node)")" pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null || true

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo ""
echo -e "  ${BOLD}Server URLs:${NC}"
echo -e "    HTTP:   ${YELLOW}http://$(hostname -I 2>/dev/null | awk '{print $1}'):11470${NC}"
echo -e "    HTTPS:  ${YELLOW}https://$(hostname -I 2>/dev/null | awk '{print $1}'):12470${NC}"
echo ""
echo -e "  ${BOLD}PM2 Commands:${NC}"
echo -e "    pm2 status            — check if running"
echo -e "    pm2 logs stremio-server — view logs"
echo -e "    pm2 restart stremio-server — restart"
echo -e "    pm2 stop stremio-server — stop"
echo ""
echo -e "  ${BOLD}Dashboard:${NC}"
echo -e "    ${YELLOW}http://$(hostname -I 2>/dev/null | awk '{print $1}'):8082${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
