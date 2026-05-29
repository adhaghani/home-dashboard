# Stremio Streaming Server — Orange Pi Zero 2

Bare-metal installation of the official Stremio streaming server with low-memory
optimizations for 1 GB RAM. No Docker required.

## Architecture

```
Mobile/Tablet                                 Orange Pi Zero 2
(Stremio app)                                ┌─────────────────┐
     │                                        │  PM2             │
     │  http://192.168.0.246:11470 ──────────▶│  │               │
     │                                        │  ├─ server.js    │
     │                                        │  │  (Node.js 20) │
     │                                        │  │  heap: 150 MB │
     │                                        │  ├─ ffmpeg       │
     │                                        │  └─ ffprobe      │
     │                                        └─────────────────┘
```

## Quick Setup

### 1. Copy files to the Orange Pi

```bash
# From your Mac:
scp -r stremio/ adhaghani@192.168.0.246:~/stremio-setup/
```

### 2. SSH in and run the installer

```bash
ssh adhaghani@192.168.0.246
cd ~/stremio-setup
chmod +x setup-stremio.sh
./setup-stremio.sh
```

The script handles everything: installs Node.js 20, ffmpeg, PM2, downloads the
Stremio server binary, and starts it with memory-optimized settings.

### 3. Check it's running

```bash
pm2 status
# Should show stremio-server → online

# Test the endpoint
curl -s http://localhost:11470 | head -5
```

### 4. Connect from your phone

1. Open the Stremio app on your phone
2. Go to **Settings → Streaming Server**
3. Enter: `http://192.168.0.246:11470` (or your Tailscale IP if remote)
4. The app will connect and use the Orange Pi for streaming/transcoding

## PM2 Commands

| Command | What it does |
|---|---|
| `pm2 status` | Show all managed processes |
| `pm2 logs stremio-server` | View real-time logs |
| `pm2 logs stremio-server --lines 50` | Last 50 lines |
| `pm2 restart stremio-server` | Restart the server |
| `pm2 stop stremio-server` | Stop the server |
| `pm2 monit` | Live CPU/Memory dashboard |

## Memory Tuning

The server is configured conservatively for 1 GB RAM. If you need to adjust:

| V8 Flag | Default | Purpose |
|---|---|---|
| `--max-old-space-size` | 150 MB | Max V8 heap before GC panic |
| `--optimize-for-size` | on | Smaller bytecode, slower startup |
| `--initial-old-space-size` | 16 MB | Start heap small |

| PM2 Config | Default | Purpose |
|---|---|---|
| `max_memory_restart` | 180M | Auto-restart if RSS exceeds this |
| `max_restarts` | 5 | Give up after 5 rapid crashes |

Edit `ecosystem.config.js` and run `pm2 restart stremio-server` to apply changes.

## Ports

| Port | Protocol | Purpose |
|---|---|---|
| 11470 | HTTP | Streaming server (used by Stremio apps) |
| 12470 | HTTPS | Streaming server (TLS) |

## Updating the Server

```bash
cd ~/stremio-server
pm2 stop stremio-server

# Download latest server.js from Stremio CDN
curl -fsSL -o server.js https://dl.strem.io/server/v4.20.8/desktop/server.js

pm2 start stremio-server
```

Check [Stremio/server-docker](https://github.com/Stremio/server-docker) for version
updates.

## Troubleshooting

| Problem | Fix |
|---|---|
| Port 11470 already in use | `sudo lsof -i :11470` to find what's using it |
| Server won't start | `pm2 logs stremio-server --err --lines 20` |
| Out of memory | Lower `max-old-space-size` to 100 in ecosystem.config.js |
| Mobile can't connect | Make sure `NO_CORS=1` is set and firewall allows port 11470 |
| FFmpeg errors | Verify with `ffmpeg -version` and `ffprobe -version` |
