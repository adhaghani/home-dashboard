#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FileBrowser one-time setup script for Orange Pi Zero 2 (ARM64)
# ─────────────────────────────────────────────────────────────────────────────
# Usage:  chmod +x setup-filebrowser.sh && sudo ./setup-filebrowser.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

INSTALL_PATH="/usr/local/bin/filebrowser"
CONFIG_DIR="/etc/filebrowser"
DATA_DIR="/var/lib/filebrowser"
USER="${1:-adhaghani}"
ROOT_DIR="/home/${USER}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> Resolving latest FileBrowser release..."
API_URL="https://api.github.com/repos/filebrowser/filebrowser/releases/latest"
TAG=$(curl -fsSL "$API_URL" | grep -o '"tag_name": "[^"]*"' | cut -d'"' -f4)
if [ -z "$TAG" ]; then
    echo "ERROR: Could not determine latest release tag from GitHub API."
    exit 1
fi
echo "    Latest release: ${TAG}"

echo "==> Downloading FileBrowser ARM64 binary..."
TARBALL_URL="https://github.com/filebrowser/filebrowser/releases/download/${TAG}/linux-arm64-filebrowser.tar.gz"
curl -fsSL -o "${TMP_DIR}/filebrowser.tar.gz" "${TARBALL_URL}"
tar xzf "${TMP_DIR}/filebrowser.tar.gz" -C "${TMP_DIR}"
# The tarball contains just the binary at the root
cp "${TMP_DIR}/filebrowser" "${INSTALL_PATH}"
chmod +x "${INSTALL_PATH}"
echo "    Installed: ${INSTALL_PATH} ($(filebrowser version 2>/dev/null || echo 'ok'))"

echo "==> Creating directories..."
mkdir -p "${CONFIG_DIR}" "${DATA_DIR}"
chown "${USER}:${USER}" "${DATA_DIR}"

echo "==> Initializing config..."
if [ -f "${CONFIG_DIR}/config.json" ]; then
    echo "    Config already exists at ${CONFIG_DIR}/config.json — skipping init"
else
    filebrowser config init \
        --database "${DATA_DIR}/filebrowser.db" \
        --address 127.0.0.1 \
        --port 8083 \
        --root "${ROOT_DIR}" \
        --auth.method=json
    echo "    Config written to ${CONFIG_DIR}/config.json"
fi

echo "==> Setting up admin user..."
echo -n "Enter password for user '${USER}': "
read -rs PASSWORD
echo
filebrowser users add "${USER}" "${PASSWORD}" --perm.admin \
    --database "${DATA_DIR}/filebrowser.db" 2>/dev/null && \
    echo "    User '${USER}' created with admin permissions." || \
    echo "    User '${USER}' may already exist — skipping."

echo "==> Installing systemd unit..."
cp "$(dirname "$0")/filebrowser.service" /etc/systemd/system/filebrowser.service
systemctl daemon-reload
systemctl enable --now filebrowser

echo "==> Checking service..."
sleep 2
if systemctl is-active --quiet filebrowser; then
    echo "    ✓ filebrowser is running"
else
    echo "    ✗ filebrowser failed to start — check: journalctl -u filebrowser"
    exit 1
fi

echo "==> Verifying..."
curl -s -o /dev/null -w "    HTTP %{http_code}" http://127.0.0.1:8083/
echo
curl -s -o /dev/null -w "    Nginx proxy HTTP %{http_code}" http://127.0.0.1:8082/files/
echo

echo
echo "──────────────────────────────────────────────────────────────────────"
echo "FileBrowser is ready!"
echo "  Local:    http://127.0.0.1:8082/files/"
echo "  LAN:      http://<orange-pi-ip>:8082/files/"
echo "  Tailscale: http://<tailscale-ip>:8082/files/"
echo
echo "Login: ${USER} / <your-password>"
echo "──────────────────────────────────────────────────────────────────────"
