# CLAUDE.md — Home Dashboard

## Project overview

Centralized home-server dashboard for an **Orange Pi Zero 2** (1 GB RAM). Three-layer architecture:

- **Frontend**: Next.js 14 App Router, Tailwind CSS, `output: 'export'` (static HTML). Talks directly to Supabase for service CRUD.
- **Backend**: Rust binary (Axum + Tokio) on port 8081. Exposes system metrics, nanobot/tailscale status, health checks, and a Supabase keep-alive loop.
- **Infrastructure**: Nginx on port 8082 serves static files and reverse-proxies `/api` to 8081. systemd unit manages the backend.

## Commands

```bash
./deploy.sh              # Build + deploy everything (gitignored, has credentials)
./deploy.sh backend      # Backend only
./deploy.sh frontend     # Frontend only
./deploy.sh --no-build   # Deploy pre-built artifacts

# Frontend dev/build (cd frontend first)
npm run dev              # Next.js dev server
npm run build            # Static export to out/
npm run lint

# Backend build (cross-compile for ARM64)
cd backend
export PATH="/opt/homebrew/opt/aarch64-unknown-linux-gnu/bin:$HOME/.cargo/bin:$PATH"
CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-unknown-linux-gnu-gcc \
CC_aarch64_unknown_linux_gnu=aarch64-unknown-linux-gnu-gcc \
  cargo build --release --target aarch64-unknown-linux-gnu

# Orange Pi (SSH)
systemctl status home-dashboard-backend
journalctl -u home-dashboard-backend -f
curl localhost:8081/api/stats
curl localhost:8082/               # via nginx
```

## Architecture details

### Port map (Orange Pi)
```
:80    → Pi-Hole (lighttpd)
:8080  → Pi-Hole
:8081  → Rust backend (axum)
:8082  → Nginx → static frontend + proxy /api → :8081
:8900  → nanobot API (optional, if enabled)
:18790 → nanobot gateway
```

### Backend (`backend/src/main.rs`)

Single-file binary. Key sections:

- **Response types** (lines ~16–64): `StatsResponse`, `NanobotStatus`, `NanobotDetails`, `TailscaleStatus`, `HealthCheckResult`, `ErrorResponse`
- **AppState** (line ~69): `sys: Mutex<System>` for CPU delta tracking across requests
- **`get_stats`** (line ~102): Two-sample CPU delta, sysinfo for RAM/disk/uptime, thermal zone file read for temp
- **`get_nanobot_status`** (line ~163): Probes gateway port 18790 and API port 8900. Falls back to reading `~/.nanobot/config.json`
- **`get_nanobot_details`** (line ~249): Reads config.json, counts sessions (`.jsonl` files), cron jobs, MEMORY.md lines
- **`get_tailscale_status`** (line ~442): Runs `tailscale status --json`, parses `Self` and `Peer` objects via `serde_json::Value`
- **`get_health_check`** (line ~523): HEAD probe to any URL, returns reachability + latency
- **`supabase_keep_alive_loop`** (line ~563): 30-minute interval, `GET /rest/v1/` with anon key
- **`main`** (line ~597): Tracing init, keep-alive spawn, router build, graceful shutdown
- **Env vars read at runtime**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BIND_PORT` (default 8081)

### Frontend structure

All client components (no server rendering needed — it's static export):

| Component | Purpose | Polls |
|---|---|---|
| `app/page.tsx` | Root page — header + SystemMonitor + ServicesGrid + ServiceModal | — |
| `SystemMonitor.tsx` | Two-row grid: Row 1 (CPU/RAM/Disk), Row 2 (Uptime, nanobot, Tailscale, Temp) | 3s |
| `NanobotCard.tsx` | Online/offline + "View Details" button | 30s |
| `NanobotDetailModal.tsx` | Modal: provider, model, channels, sessions, cron, memory | on open |
| `TailscaleCard.tsx` | Peer count + Tailscale IP | 30s |
| `ServicesGrid.tsx` | Category tabs, search bar, service cards with health dots | on mount |
| `ServiceModal.tsx` | Add/edit/delete form (Supabase CRUD) | — |

**State handling in every component:**
1. Loading → skeleton placeholders
2. Error (first load) → red banner with message
3. Error (subsequent) → keep last data visible, show subtle indicator
4. Empty → CTA to add first item
5. Normal → data rendered

### Supabase schema (`services` table)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT (identity PK) | Auto-increment |
| `name` | TEXT NOT NULL | Display name |
| `url` | TEXT NOT NULL | Link target |
| `icon` | TEXT | Emoji or URL |
| `category` | TEXT | Grouping label |
| `sort_order` | INT DEFAULT 0 | Manual ordering |
| `created_at` | TIMESTAMPTZ | Auto-set |

RLS: open access (`USING (true)` for all operations) since this is a single-user LAN dashboard with no auth.

### Tailwind design system

```ts
colors: {
  surface: { 50..950 }  // slate-like dark palette, 950 = near-black
  accent:  { 400,500,600 } // indigo
}
```

Progress bars: `.progress-cpu`, `.progress-ram`, `.progress-disk`, `.progress-temp-safe/warn/hot`  
Skeletons: `.skeleton` (pulse animation on `bg-surface-800`)  
Scrollbar: `.custom-scrollbar`

## Deployment

### systemd unit (`home-dashboard-backend.service`)
- Runs as user `adhaghani` (needed for tailscale socket access)
- `Environment` vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RUST_LOG`
- `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`
- `ReadOnlyPaths`: `/sys/class/thermal`, `/home/adhaghani/.nanobot/config.json`

### Nginx
- Static files at `/var/www/home-dashboard/`
- `/_next/static/` cached 1 year
- `/api/` proxy to `127.0.0.1:8081`
- Gzip enabled for text-based types

### Cross-compilation
- Target: `aarch64-unknown-linux-gnu`
- Cross-compiler installed via `brew install aarch64-unknown-linux-gnu` (tap `messense/macos-cross-toolchains`)
- Release profile: `opt-level = "s"`, `lto = true`, `strip = "symbols"` → ~3 MB binary

## Adding a new feature

1. **Backend endpoint**: Add handler function + struct in `main.rs`, register route in `main()`
2. **Frontend type**: Add interface in `lib/types.ts`
3. **Frontend component**: New file in `components/`, follow the loading/error/empty/normal pattern
4. **Wire up**: Import in `page.tsx` or `SystemMonitor.tsx`
5. **Deploy**: `./deploy.sh`

## Known constraints

- No server-side rendering (static export). All data fetching is client-side.
- No auth (anon Supabase key only). RLS is open.
- Pi-Hole occupies ports 80 and 8080. Dashboard is on 8082.
- nanobot API port 8900 is optional — the gateway on 18790 is the primary detection method.
- `www-data` → changed to `adhaghani` for tailscale socket access.
- `ProtectSystem=strict` blocks DNS resolution — all internal probes use `127.0.0.1`.
