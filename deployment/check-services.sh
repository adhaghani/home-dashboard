#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Blackout Recovery Check — verify all services came back after a reboot
# ─────────────────────────────────────────────────────────────────────────────
# Usage:  ./check-services.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PASS=0
FAIL=0
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Service Health Check  —  $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════════════"
echo ""

# ── Helper ──────────────────────────────────────────────────────────────────

check() {
    local label="$1"
    local result="$2"
    if [ "$result" = "ok" ]; then
        echo -e "  ${GREEN}✓${NC} $label"
        ((PASS++))
    else
        echo -e "  ${RED}✗${NC} $label  ${RED}— ${result}${NC}"
        ((FAIL++))
    fi
}

# ── section 1: systemd services ─────────────────────────────────────────────

echo "── systemd services ───────────────────────────────────"
echo ""

for svc in nginx home-dashboard-backend pihole-FTL tailscaled ssh filebrowser nanobot; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
        check "$svc" "ok"
    else
        status="inactive"
        if ! systemctl is-enabled --quiet "$svc" 2>/dev/null; then
            status="not found / not enabled"
        fi
        check "$svc" "$status"
    fi
done

# ── section 2: PM2 / stremio ────────────────────────────────────────────────

echo ""
echo "── PM2 services ───────────────────────────────────────"
echo ""

if command -v pm2 &>/dev/null; then
    if pm2 status 2>/dev/null | grep -q "stremio-server.*online"; then
        check "stremio-server (pm2)" "ok"
    else
        check "stremio-server (pm2)" "$(pm2 status 2>/dev/null | grep stremio || echo 'not running')"
    fi
else
    check "stremio-server (pm2)" "pm2 not found"
fi

# ── section 3: port probes ─────────────────────────────────────────────────

echo ""
echo "── HTTP endpoints ─────────────────────────────────────"
echo ""

probe() {
    local label="$1"
    local url="$2"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 5 "$url" 2>/dev/null || echo "000")
    if [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "301" ]; then
        check "$label" "ok"
    else
        check "$label" "HTTP $code"
    fi
}

probe "Dashboard API"    "http://127.0.0.1:8081/api/stats"
probe "Dashboard UI"     "http://127.0.0.1:8082/"
probe "FileBrowser"      "http://127.0.0.1:8083/"
probe "Nanobot Gateway"  "http://127.0.0.1:18790/"
probe "Stremio"          "http://127.0.0.1:11470/"
probe "Pi-Hole"          "http://127.0.0.1:80/admin/"

# ── Summary ──────────────────────────────────────────────────────────────────

TOTAL=$((PASS + FAIL))
echo ""
echo "──────────────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
    echo -e "  ${GREEN}All $TOTAL checks passed ✓${NC}"
else
    echo -e "  ${RED}$FAIL of $TOTAL checks failed ✗${NC}"
fi
echo "──────────────────────────────────────────────────────"
echo ""

exit $FAIL
