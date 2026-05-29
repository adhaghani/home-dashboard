# Home Dashboard

A lightweight home-server dashboard for the **Orange Pi Zero 2** (1 GB RAM).  
Monitors system health, manages service bookmarks, and tracks Tailscale & nanobot status — all from a single page.

```
┌─────────────────────────────────────────────────────────┐
│  Home Dashboard                          Updated 3s ago │
├──────────┬──────────┬──────────┬──────────┬────────────┤
│   CPU    │   RAM    │  Disk    │  Uptime  │  nanobot   │
│  12.3%   │ 312 MB   │ 5.2 GB  │  3d 12h  │  ● Online  │
│  ██░░░░  │ ███░░░░  │ ████░░░ │          │  View…     │
├──────────┴──────────┴──────────┼──────────┴────────────┤
│           Tailscale             │      CPU Temp         │
│       2 peers ●                 │      48°C 🟢          │
├────────────────────────────────┴───────────────────────┤
│  [All] [Networking] [AI]          🔍 Filter services…  │
│  ┌─────────●──┐ ┌─────────●──┐ ┌───────────●──┐        │
│  │🛡️ Pi-Hole  │ │🐳 Portainer│ │🤖 nanobot    │        │
│  └────────────┘ └────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────┘
```

## Architecture

```
Browser ──▶ Nginx (:8082) ──▶ Rust backend (:8081) ──▶ sysinfo, tailscale, nanobot
                │                    │
                ▼                    ▼
         Static HTML/CSS/JS    Supabase (keep-alive)
         (Next.js export)
```

| Layer | Stack | Purpose |
|---|---|---|
| **Frontend** | Next.js 14 + Tailwind + Supabase JS | Static-exported dashboard, service CRUD |
| **Backend** | Rust + Axum + Tokio | `/api/stats`, `/api/tailscale`, `/api/nanobot`, `/api/health-check` |
| **Database** | Supabase (PostgreSQL) | `services` table (bookmarks/shortcuts) |
| **Reverse Proxy** | Nginx | Serves static files, proxies `/api` to backend |
| **Deploy** | systemd + `deploy.sh` | One-command build-and-push |

## Features

- **System monitor** — CPU %, temp, RAM, disk, uptime (polls every 3s)
- **Service bookmarks** — CRUD grid stored in Supabase with category tabs & search
- **nanobot status** — Online/offline detection + detail modal (model, channels, sessions, memory)
- **Tailscale status** — Peer count, node IP
- **Health dots** — Green/red indicators on each local service card
- **Supabase keep-alive** — Prevents free-tier pausing (pings every 30 min)

## Quick Start

### Prerequisites
- Orange Pi Zero 2 with Armbian/Ubuntu, Nginx, and a Supabase project
- Mac build machine with Rust, ARM64 cross-compiler, Node.js 18+

### 1. Supabase Setup

Run [`supabase-schema.sql`](deployment/supabase-schema.sql) in the Supabase SQL Editor.

### 2. One-Command Deploy

```bash
./deploy.sh
```

This builds the frontend (static export) and backend (ARM64 binary), then pushes everything to the Orange Pi. See [deployment/DEPLOY.md](deployment/DEPLOY.md) for manual setup.

### 3. Open the Dashboard

- LAN: `http://192.168.0.246:8082`
- Tailscale: `http://100.119.121.115:8082`

## Project Structure

```
home-dashboard/
├── backend/                  # Rust binary (Axum + Tokio)
│   ├── Cargo.toml
│   └── src/main.rs           # All API handlers in one file (compact for 1 GB RAM)
├── frontend/                 # Next.js static export
│   ├── app/
│   │   ├── globals.css       # Tailwind + dark theme
│   │   ├── layout.tsx        # Root layout
│   │   └── page.tsx          # Dashboard page
│   ├── components/
│   │   ├── SystemMonitor.tsx       # CPU/RAM/Disk/Uptime + Temp cards
│   │   ├── NanobotCard.tsx         # nanobot online/offline card
│   │   ├── NanobotDetailModal.tsx  # nanobot detail popup
│   │   ├── TailscaleCard.tsx       # Tailscale peer/status card
│   │   ├── ServicesGrid.tsx        # Service bookmark grid + category tabs + search
│   │   └── ServiceModal.tsx        # Add/edit/delete modal
│   ├── lib/
│   │   ├── types.ts          # TypeScript interfaces
│   │   └── supabase/client.ts       # Supabase client singleton
│   ├── package.json
│   ├── next.config.js        # output: 'export'
│   └── tailwind.config.ts
├── deployment/
│   ├── nginx.conf            # Nginx site config (port 8082)
│   ├── home-dashboard-backend.service  # systemd unit
│   ├── supabase-schema.sql   # DB schema + RLS policies
│   └── DEPLOY.md             # Full deployment guide
├── deploy.sh                 # One-command deploy (gitignored)
└── README.md
```

## API Endpoints

All served by the Rust backend on port `:8081`:

| Endpoint | Returns |
|---|---|
| `GET /api/stats` | CPU %, temp, RAM, disk, uptime |
| `GET /api/nanobot` | Online/offline, model name |
| `GET /api/nanobot-details` | Provider, model, channels, sessions, cron, memory stats |
| `GET /api/tailscale` | Hostname, Tailscale IP, peer count |
| `GET /api/health-check?url=…` | Reachability + latency for any URL |
