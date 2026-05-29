# Home Dashboard — Step-by-Step Deployment Guide

**Target:** Orange Pi Zero 2 at `192.168.0.246` (user: `adhaghani`)  
**⚠️ Pi-Hole is already on port 80** — the dashboard will live on **port 8082** so they don't conflict.  
**Build machine:** Apple Silicon Mac (ARM64)

---

## Step 0: One-Time Setup (Run on Orange Pi via SSH)

SSH into the Orange Pi and install Nginx (if not already installed):

```bash
ssh adhaghani@192.168.0.246

# Install Nginx
sudo apt update && sudo apt install nginx -y

# Verify it's running
sudo systemctl status nginx
```

Keep this SSH session open — you'll need it for Steps 4-7.

---

## Step 1: Set Up the Supabase Database

Open in your browser: `https://supabase.com/dashboard/project/tytyvuiftcfjzosglsbm`

1. Click **SQL Editor** in the left sidebar
2. Click **New query**
3. Copy the entire contents of [`deployment/supabase-schema.sql`](./supabase-schema.sql), paste, and click **Run**

---

## Step 2: Copy the Frontend to the Orange Pi (Run on your Mac)

```bash
# Frontend is already built in frontend/out/
scp -r /Users/adhaghani/Desktop/Projects/home-dashboard/frontend/out/ adhaghani@192.168.0.246:/tmp/home-dashboard-out/
```

---

## Step 3: Copy the Backend Binary to the Orange Pi (Run on your Mac)

```bash
# Binary is already cross-compiled for ARM64
scp /Users/adhaghani/Desktop/Projects/home-dashboard/backend/target/aarch64-unknown-linux-gnu/release/home-dashboard-backend adhaghani@192.168.0.246:/tmp/
```

---

## Step 4: Install Files on the Orange Pi (Run in your SSH session)

```bash
# ── Backend binary ───────────────────────────────────────────────────────
sudo cp /tmp/home-dashboard-backend /usr/local/bin/
sudo chmod +x /usr/local/bin/home-dashboard-backend

# ── Frontend static files ────────────────────────────────────────────────
sudo mkdir -p /var/www/home-dashboard
sudo cp -r /tmp/home-dashboard-out/* /var/www/home-dashboard/
sudo chown -R www-data:www-data /var/www/home-dashboard
```

---

## Step 5: Configure Nginx on Port 8082 (Still on Orange Pi)

⚠️ Pi-Hole uses ports 80 and 8080, so we put the dashboard on port **8082**:

```bash
sudo tee /etc/nginx/sites-available/home-dashboard << 'NGINX_EOF'
server {
    listen 8082;
    server_name _;
    root /var/www/home-dashboard;
    index index.html;

    location ~ /\. { deny all; }

    location /_next/static/ {
        alias /var/www/home-dashboard/_next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_send_timeout 5s;
    }

    gzip on;
    gzip_vary on;
    gzip_min_length 512;
    gzip_types text/html text/css text/plain application/javascript application/json application/xml image/svg+xml;
}
NGINX_EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/home-dashboard /etc/nginx/sites-enabled/

# Make sure default site doesn't conflict on port 8082 (it only binds port 80, so fine)
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 6: Create the Systemd Service (Still on Orange Pi)

The backend binds to port **8081** — nginx proxies `/api` to it:

```bash
sudo tee /etc/systemd/system/home-dashboard-backend.service << 'SERVICE_EOF'
[Unit]
Description=Home Dashboard Backend — System Metrics & Supabase Keep-Alive
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
ExecStart=/usr/local/bin/home-dashboard-backend
Restart=always
RestartSec=5
StartLimitInterval=60
StartLimitBurst=3

Environment=SUPABASE_URL=https://tytyvuiftcfjzosglsbm.supabase.co
Environment=SUPABASE_ANON_KEY=sb_publishable_Ya6Hz0s1O_nY92JrlEV4iw_fgr_kj6Q
Environment=RUST_LOG=home_dashboard_backend=info

StandardOutput=journal
StandardError=journal
SyslogIdentifier=home-dashboard-backend

NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/tmp
ReadOnlyPaths=/sys/class/thermal

[Install]
WantedBy=multi-user.target
SERVICE_EOF

sudo systemctl daemon-reload
sudo systemctl enable --now home-dashboard-backend
```

---

## Step 7: Verify Everything (Still on Orange Pi)

```bash
# 1. Check the service is running
sudo systemctl status home-dashboard-backend

# 2. Test the backend directly (port 8081)
curl -s http://localhost:8081/api/stats
# Should return JSON with cpu_percent, ram_used_mb, etc.

# 3. Test through nginx (port 8082)
curl -s http://localhost:8082/api/stats
# Same JSON — proves nginx is proxying correctly

# 4. Test the frontend
curl -s http://localhost:8082/ | head -20
# Should return HTML, not a 403

# 5. Watch the keep-alive log
sudo journalctl -u home-dashboard-backend -f
# Press Ctrl+C after you see "Pinging Supabase keep-alive"
```

---

## Step 8: Open in Browser

Go to: **http://192.168.0.246:8082**

You should see the dashboard with system metrics and an "Add Service" button.

---

## Port Map

```
Port 80   → Pi-Hole admin (unchanged)
Port 8080 → Pi-Hole (unchanged)
Port 8081 → Rust backend (system metrics + keep-alive)
Port 8082 → Nginx: serves dashboard + proxies /api → :8081
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Port 8082 returns 403 | Check nginx config: `sudo nginx -t` and `sudo systemctl reload nginx` |
| Nginx "502 Bad Gateway" | Backend isn't running — `sudo systemctl restart home-dashboard-backend` |
| Backend keeps restarting | Check logs: `sudo journalctl -u home-dashboard-backend -n 50` |
| Services don't save | Verify Supabase anon key in the systemd service file |
| Nginx config test fails | Check the pasted config for typos |

---

## How to Update After Changes

### Update frontend:
```bash
# On Mac:
cd /Users/adhaghani/Desktop/Projects/home-dashboard/frontend
/opt/homebrew/bin/npm run build
scp -r out/ adhaghani@192.168.0.246:/tmp/home-dashboard-out/

# On Orange Pi:
sudo cp -r /tmp/home-dashboard-out/* /var/www/home-dashboard/
# Ready immediately — no restart needed
```

### Update backend:
```bash
# On Mac:
cd /Users/adhaghani/Desktop/Projects/home-dashboard/backend
export PATH="/opt/homebrew/opt/aarch64-unknown-linux-gnu/bin:$HOME/.cargo/bin:$PATH"
CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-unknown-linux-gnu-gcc \
CC_aarch64_unknown_linux_gnu=aarch64-unknown-linux-gnu-gcc \
cargo build --release --target aarch64-unknown-linux-gnu
scp target/aarch64-unknown-linux-gnu/release/home-dashboard-backend \
    adhaghani@192.168.0.246:/tmp/

# On Orange Pi:
sudo systemctl stop home-dashboard-backend
sudo cp /tmp/home-dashboard-backend /usr/local/bin/
sudo systemctl start home-dashboard-backend
```
