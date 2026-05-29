# Deployment Guide — Home Dashboard

This guide covers deploying the Home Dashboard on an Orange Pi Zero 2 (ARM64)
running Armbian or Ubuntu Server.

---

## Prerequisites

- Orange Pi Zero 2 (or any ARM64 SBC) with 1GB+ RAM
- Rust toolchain (install via [rustup](https://rustup.rs))
- Node.js 18+ and npm
- Nginx
- A [Supabase](https://supabase.com) project (free tier works)

---

## 1. Supabase Setup

1. Create a Supabase project at https://app.supabase.com
2. Go to the **SQL Editor** and run the contents of [`supabase-schema.sql`](./supabase-schema.sql)
3. Note your **Project URL** and **anon public key** from Settings → API

---

## 2. Cross-Compile the Rust Backend (ARM64)

On your build machine (likely x86_64):

```bash
# Add ARM64 target
rustup target add aarch64-unknown-linux-gnu

# Install cross-linker (Ubuntu/Debian)
sudo apt install gcc-aarch64-linux-gnu

# Build for ARM64
cd backend
CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
  cargo build --release --target aarch64-unknown-linux-gnu

# Copy the binary to the Orange Pi
scp target/aarch64-unknown-linux-gnu/release/home-dashboard-backend \
    orangepi:/tmp/
```

**On the Orange Pi:**

```bash
sudo mv /tmp/home-dashboard-backend /usr/local/bin/
sudo chmod +x /usr/local/bin/home-dashboard-backend
```

---

## 3. Build the Frontend

```bash
cd frontend

# Copy and fill in your Supabase credentials
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL and anon key
# Set NEXT_PUBLIC_BACKEND_URL= (empty — Nginx proxies /api)

npm install
npm run build
```

The static output is in `frontend/out/`. Copy it to the Orange Pi:

```bash
scp -r out/ orangepi:/tmp/home-dashboard-out/
```

**On the Orange Pi:**

```bash
sudo mkdir -p /var/www/home-dashboard
sudo cp -r /tmp/home-dashboard-out/* /var/www/home-dashboard/
sudo chown -R www-data:www-data /var/www/home-dashboard
```

---

## 4. Configure Nginx

```bash
sudo cp deployment/nginx.conf /etc/nginx/sites-available/home-dashboard
sudo ln -s /etc/nginx/sites-available/home-dashboard /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default  # optional: remove default site
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Configure the Systemd Service

1. Edit [`home-dashboard-backend.service`](./home-dashboard-backend.service) and
   replace the placeholder Supabase values with your real credentials.

2. Install and start:

```bash
sudo cp deployment/home-dashboard-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now home-dashboard-backend
```

3. Verify it's running:

```bash
systemctl status home-dashboard-backend
curl http://localhost:8080/api/stats | jq
```

---

## 6. Verify Everything

1. Open `http://<orange-pi-ip>` in your browser
2. You should see the dashboard with system metrics
3. Click **Add Service** to add your first shortcut
4. Check that the keep-alive logs appear every 30 minutes:

```bash
journalctl -u home-dashboard-backend -f | grep keep-alive
```

---

## Updating

### Backend
```bash
# Rebuild, scp the new binary, then:
sudo systemctl restart home-dashboard-backend
```

### Frontend
```bash
# Rebuild, scp the out/ directory, then:
sudo cp -r out/* /var/www/home-dashboard/
# Nginx picks up new files immediately — no restart needed
```
