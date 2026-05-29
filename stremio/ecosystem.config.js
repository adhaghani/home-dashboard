// ───────────────────────────────────────────────────────────────────────────
// PM2 Ecosystem Config — Stremio Streaming Server
// ───────────────────────────────────────────────────────────────────────────
// Optimized for Orange Pi Zero 2 (1 GB RAM).
//
// Memory limits:
//   - V8 heap: 150 MB (--max-old-space-size)
//   - PM2 auto-restart at 180 MB RSS
//
// Environment:
//   - NO_CORS=1 — allow LAN clients (mobile phones, tablets)
//   - CASTING_DISABLED=1 — skip Chromecast/DLNA scanning on headless server
//   - FFMPEG_BIN/FFPROBE_BIN — using system ffmpeg
//
// After deploying this file:
//   pm2 start ecosystem.config.js
//   pm2 save
// ───────────────────────────────────────────────────────────────────────────
module.exports = {
  apps: [
    {
      name: "stremio-server",
      script: "server.js",
      cwd: __dirname,

      // ── V8 engine flags (low-memory optimization) ──────────────────
      node_args: [
        "--max-old-space-size=150",       // V8 heap: 150 MB max
        "--optimize-for-size",            // favour smaller bytecode
        "--gc-interval=50",               // hint GC every 50 allocations
        "--max-semi-space-size=8",        // limit scavenge semi-space
        "--initial-old-space-size=16",    // start small, grow as needed
      ],

      // ── Runtime environment ────────────────────────────────────────
      env: {
        NO_CORS: "1",                     // allow LAN clients
        NODE_ENV: "production",
        APP_PATH: __dirname + "/data",    // server settings & certs storage
        FFMPEG_BIN: "/usr/bin/ffmpeg",
        FFPROBE_BIN: "/usr/bin/ffprobe",
        CASTING_DISABLED: "1",            // no network device scans
      },

      // ── Process controls ───────────────────────────────────────────
      max_memory_restart: "180M",         // restart if RSS exceeds 180 MB
      max_restarts: 5,                    // stop after 5 rapid failures
      min_uptime: "10s",                  // consider stable after 10s
      restart_delay: 5000,               // 5s between restarts
      kill_timeout: 5000,                // 5s grace for shutdown

      // ── Logging ────────────────────────────────────────────────────
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: __dirname + "/logs/error.log",
      out_file: __dirname + "/logs/output.log",
      merge_logs: true,
      autorestart: true,
      watch: false,
    },
  ],
};
