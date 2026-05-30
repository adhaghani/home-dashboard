use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use serde::Serialize;
use std::sync::Arc;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use sysinfo::{Disks, System};
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use tracing::{error, info};

// ── Response types ──────────────────────────────────────────────────────────

#[derive(Serialize)]
struct StatsResponse {
    cpu_percent: f32,
    cpu_temp_c: Option<f32>,
    ram_used_mb: u64,
    ram_total_mb: u64,
    disk_used_mb: u64,
    disk_total_mb: u64,
    uptime_seconds: u64,
}

#[derive(Serialize)]
struct NanobotStatus {
    running: bool,
    model: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
struct NanobotDetails {
    provider: Option<String>,
    model: Option<String>,
    channels: Vec<String>,
    sessions: u64,
    memory_lines: u64,
    cron_jobs: u64,
    gateway_port: u16,
    api_port: u16,
    error: Option<String>,
}

#[derive(Serialize)]
struct StremioStatus {
    running: bool,
    error: Option<String>,
}

#[derive(Serialize)]
struct TailscaleStatus {
    running: bool,
    hostname: String,
    tailscale_ip: String,
    peers_online: u64,
    error: Option<String>,
}

#[derive(Serialize)]
struct HealthCheckResult {
    reachable: bool,
    latency_ms: u64,
    error: Option<String>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

// ── LAN device types ─────────────────────────────────────────────────────────

#[derive(Serialize)]
struct LanDevice {
    ip: String,
    mac: String,
    hostname: Option<String>,
}

// ── Bandwidth types ──────────────────────────────────────────────────────────

#[derive(Serialize)]
struct BandwidthStats {
    interface: String,
    rx_today_mb: f64,
    tx_today_mb: f64,
    rx_month_mb: f64,
    tx_month_mb: f64,
    rx_total_gb: f64,
    tx_total_gb: f64,
    error: Option<String>,
}

// ── Weather types ────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct WeatherResponse {
    temperature_c: f64,
    condition_text: String,
    humidity_percent: u32,
    wind_speed_kmh: f64,
}

// ── Uptime monitor types ─────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct UptimeTargetResponse {
    id: i64,
    name: String,
    url: String,
    interval_seconds: i64,
    enabled: bool,
}

#[derive(Serialize, Clone)]
struct UptimeResultResponse {
    target_id: i64,
    reachable: bool,
    latency_ms: u64,
    error: Option<String>,
    checked_at: String,
}

#[derive(Serialize)]
struct UptimeStatusItem {
    target: UptimeTargetResponse,
    latest: Option<UptimeResultResponse>,
    history: Vec<UptimeHistoryPoint>,
}

#[derive(Serialize, Clone)]
struct UptimeHistoryPoint {
    reachable: bool,
    latency_ms: u64,
    checked_at: String,
}

#[derive(serde::Deserialize)]
struct UptimeStatusQuery {
    limit: Option<u64>,
}

// ── Top processes types ──────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct ProcessInfo {
    pid: u32,
    name: String,
    cpu_percent: f32,
    mem_mb: f64,
}

#[derive(Serialize)]
struct TopProcesses {
    by_cpu: Vec<ProcessInfo>,
    by_mem: Vec<ProcessInfo>,
}

// ── systemd service status types ─────────────────────────────────────────────

#[derive(Serialize)]
struct ServiceStatus {
    name: String,
    active: bool,
    enabled: bool,
}

// ── SD card wear types ───────────────────────────────────────────────────────

#[derive(Serialize)]
struct SdWearInfo {
    device: String,
    life_used_pct: Option<u8>,
    wear_indicator: Option<String>,
    sectors_written_gb: Option<f64>,
    pre_eol_info: Option<String>,
}

// ── SSH monitor types ────────────────────────────────────────────────────────

#[derive(Serialize)]
struct SshFailure {
    timestamp: String,
    ip: String,
    user: String,
    port: u16,
}

#[derive(Serialize)]
struct SshMonitorResponse {
    total_failures_24h: u64,
    recent: Vec<SshFailure>,
}

// ── Shared application state ────────────────────────────────────────────────

/// Tracks the first-seen byte counters for an interface so we can compute deltas.
struct NetBaseline {
    iface: String,
    rx_bytes: f64,
    tx_bytes: f64,
}

struct AppState {
    /// We keep a `System` instance to track CPU deltas across requests.
    sys: Mutex<System>,
    /// Cached weather response with its fetch time (15-min TTL).
    weather_cache: Mutex<Option<(WeatherResponse, Instant)>>,
    /// Baseline network counters for interface bandwidth deltas.
    net_baseline: Mutex<NetBaseline>,
}

// ── CPU temperature helper ──────────────────────────────────────────────────

/// Reads CPU temperature from Linux thermal zones.
/// Returns `None` if no readable sensor is found (e.g. non-Linux / containers).
fn read_cpu_temp() -> Option<f32> {
    // Common thermal zone paths for Orange Pi / Armbian / generic SBCs
    let paths = [
        "/sys/class/thermal/thermal_zone0/temp",
        "/sys/class/thermal/thermal_zone1/temp",
        "/sys/class/thermal/thermal_zone2/temp",
        "/sys/devices/virtual/thermal/thermal_zone0/temp",
    ];

    for path in &paths {
        if let Ok(raw) = std::fs::read_to_string(path) {
            let millideg: i64 = raw.trim().parse().unwrap_or(0);
            if millideg > 0 {
                return Some(millideg as f32 / 1000.0);
            }
        }
    }
    None
}

// ── GET /api/stats handler ──────────────────────────────────────────────────

async fn get_stats(
    State(state): State<Arc<AppState>>,
) -> Result<Json<StatsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let mut sys = state.sys.lock().await;

    // ── CPU usage (requires two samples for delta) ───────────────────────
    sys.refresh_cpu_all();
    // Drop the lock briefly so we don't block other requests
    // (sysinfo needs a previous sample to compute per-CPU usage)
    drop(sys);

    // Brief wait so CPU counters can accumulate a meaningful delta
    tokio::time::sleep(Duration::from_millis(200)).await;

    let mut sys = state.sys.lock().await;
    sys.refresh_cpu_all();

    let cpu_percent = sys
        .cpus()
        .iter()
        .map(|cpu| cpu.cpu_usage())
        .sum::<f32>()
        / sys.cpus().len().max(1) as f32;

    // ── CPU temperature ──────────────────────────────────────────────────
    let cpu_temp_c = read_cpu_temp();

    // ── RAM ──────────────────────────────────────────────────────────────
    sys.refresh_memory();
    let ram_used_mb = (sys.used_memory() - sys.used_swap()) / 1_048_576;
    let ram_total_mb = sys.total_memory() / 1_048_576;

    // ── Disk (root filesystem "/") ───────────────────────────────────────
    let disks = Disks::new_with_refreshed_list();
    let (disk_used_mb, disk_total_mb) = disks
        .iter()
        .find(|d| d.mount_point().to_str() == Some("/"))
        .map(|d| {
            (
                (d.total_space() - d.available_space()) / 1_048_576,
                d.total_space() / 1_048_576,
            )
        })
        .unwrap_or((0, 0));

    // ── Uptime ───────────────────────────────────────────────────────────
    let uptime_seconds = System::uptime();

    Ok(Json(StatsResponse {
        cpu_percent: (cpu_percent * 10.0).round() / 10.0, // one decimal
        cpu_temp_c: cpu_temp_c.map(|t| (t * 10.0).round() / 10.0),
        ram_used_mb,
        ram_total_mb,
        disk_used_mb,
        disk_total_mb,
        uptime_seconds,
    }))
}

// ── GET /api/nanobot handler ────────────────────────────────────────────────

/// Probes the nanobot AI agent running on the Orange Pi.
/// Checks the gateway (port 18790) and optional OpenAI API (port 8900).
async fn get_nanobot_status() -> Json<NanobotStatus> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    let gateway_up = client
        .get("http://127.0.0.1:18790/")
        .send()
        .await
        .map(|r| r.status().is_success() || r.status().as_u16() == 404)
        .unwrap_or(false);

    let api_up = client
        .get("http://127.0.0.1:8900/health")
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    if !gateway_up && !api_up {
        return Json(NanobotStatus {
            running: false,
            model: None,
            error: Some("nanobot is not reachable on port 8900 or 18790".into()),
        });
    }

    // ── Resolve model name ──────────────────────────────────────────────
    let model = if api_up {
        fetch_model_from_api(&client).await
    } else {
        read_nanobot_model_from_config()
    };

    Json(NanobotStatus {
        running: true,
        model,
        error: None,
    })
}

#[derive(serde::Deserialize)]
struct ModelsResponse {
    data: Vec<ModelEntry>,
}
#[derive(serde::Deserialize)]
struct ModelEntry {
    id: String,
}

async fn fetch_model_from_api(client: &reqwest::Client) -> Option<String> {
    let resp = client
        .get("http://127.0.0.1:8900/v1/models")
        .send()
        .await
        .ok()?;
    let body = resp.json::<ModelsResponse>().await.ok()?;
    body.data.into_iter().next().map(|m| m.id)
}

/// Parses the model name from nanobot's config.json.
/// Returns None if the file is unreadable or parsing fails.
fn read_nanobot_model_from_config() -> Option<String> {
    let config_paths = [
        "/home/adhaghani/.nanobot/config.json",
        "/root/.nanobot/config.json",
    ];

    for path in &config_paths {
        if let Ok(content) = std::fs::read_to_string(path) {
            // Lightweight parse: find "model" key without pulling in serde for the whole file
            // The config has: "model": "openrouter/free"
            if let Some(model) = content
                .lines()
                .find(|line| line.contains("\"model\""))
                .and_then(|line| line.split('"').nth(3))
                .map(|s| s.to_string())
            {
                if !model.is_empty() && model != "model" {
                    return Some(model);
                }
            }
        }
    }
    None
}

// ── GET /api/nanobot-details handler ──────────────────────────────────────────

/// Reads nanobot details from the filesystem (config.json, sessions, cron, memory).
/// Mirrors the approach used by nanometry.
async fn get_nanobot_details() -> Json<NanobotDetails> {
    let base = std::path::Path::new("/home/adhaghani/.nanobot");
    let config = read_nanobot_config_detail(base);

    let sessions = count_jsonl_files(&base.join("sessions"));
    let cron_jobs = count_cron_jobs(&base.join("cron.json"));
    let memory_lines = count_memory_lines(&base.join("workspace").join("memory").join("MEMORY.md"));

    Json(NanobotDetails {
        provider: config.provider,
        model: config.model,
        channels: config.channels,
        sessions,
        memory_lines,
        cron_jobs,
        gateway_port: config.gateway_port,
        api_port: config.api_port,
        error: None,
    })
}

struct NanobotConfigDetail {
    provider: Option<String>,
    model: Option<String>,
    channels: Vec<String>,
    gateway_port: u16,
    api_port: u16,
}

fn read_nanobot_config_detail(base: &std::path::Path) -> NanobotConfigDetail {
    let path = base.join("config.json");
    let mut detail = NanobotConfigDetail {
        provider: None,
        model: None,
        channels: Vec::new(),
        gateway_port: 18790,
        api_port: 8900,
    };

    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return detail,
    };

    // Parse provider
    if let Some(pos) = content.find("\"provider\"") {
        let after = &content[pos..];
        if let Some(v) = after.split('"').nth(3) {
            detail.provider = Some(v.to_string());
        }
    }

    // Parse model
    if let Some(pos) = content.find("\"model\"") {
        let after = &content[pos..];
        if let Some(v) = after.split('"').nth(3) {
            if v != "model" {
                detail.model = Some(v.to_string());
            }
        }
    }

    // Parse enabled channels — find "enabled": true entries under "channels"
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("\"enabled\": true") || trimmed == "\"enabled\": true," {
            // Walk backwards to find the channel name
            // The structure is: "channelname": { ... "enabled": true }
            // We look for the last '"key"': pattern before this line
            if let Some(chunk) = content[..content.find(line).unwrap_or(0)]
                .lines()
                .rev()
                .find_map(|l| {
                    let t = l.trim();
                    if t.starts_with('"') && t.contains(": {") {
                        Some(t.split('"').nth(1).unwrap_or("").to_string())
                    } else {
                        None
                    }
                })
            {
                // Filter out known non-channel keys
                if !matches!(
                    chunk.as_str(),
                    "sendProgress"
                        | "sendToolHints"
                        | "sendMaxRetries"
                        | "transcriptionProvider"
                        | "channels"
                ) {
                    detail.channels.push(chunk);
                }
            }
        }
    }
    detail.channels.sort();
    detail.channels.dedup();

    // Parse gateway port
    if let Some(pos) = content.find("\"gateway\"") {
        let after = &content[pos..];
        if let Some(port_pos) = after.find("\"port\"") {
            let port_str = &after[port_pos..];
            if let Some(port_val) = port_str.split(':').nth(1) {
                if let Ok(p) = port_val.trim().trim_end_matches(',').parse::<u16>() {
                    detail.gateway_port = p;
                }
            }
        }
    }

    // Parse API port
    if let Some(pos) = content.find("\"api\"") {
        let after = &content[pos..];
        if let Some(port_pos) = after.find("\"port\"") {
            let port_str = &after[port_pos..];
            if let Some(port_val) = port_str.split(':').nth(1) {
                if let Ok(p) = port_val.trim().trim_end_matches(',').parse::<u16>() {
                    detail.api_port = p;
                }
            }
        }
    }

    detail
}

fn count_jsonl_files(dir: &std::path::Path) -> u64 {
    match std::fs::read_dir(dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "jsonl"))
            .count() as u64,
        Err(_) => 0,
    }
}

fn count_cron_jobs(path: &std::path::Path) -> u64 {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return 0,
    };
    content.matches("\"name\"").count() as u64
}

fn count_memory_lines(path: &std::path::Path) -> u64 {
    match std::fs::read_to_string(path) {
        Ok(c) => c.lines().count() as u64,
        Err(_) => 0,
    }
}

// ── GET /api/tailscale handler ───────────────────────────────────────────────

/// Runs `tailscale status --json` to get peer and self info.
/// The service must run as the same user who authenticated tailscale
/// so it can access the tailscaled socket.
async fn get_tailscale_status() -> Json<TailscaleStatus> {
    let output = tokio::process::Command::new("tailscale")
        .args(["status", "--json"])
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);

            // Parse with serde_json for reliability
            let parsed: serde_json::Value = match serde_json::from_str(&stdout) {
                Ok(v) => v,
                Err(_) => {
                    return Json(TailscaleStatus {
                        running: false,
                        hostname: String::new(),
                        tailscale_ip: String::new(),
                        peers_online: 0,
                        error: Some("Failed to parse tailscale JSON".into()),
                    });
                }
            };

            let hostname = parsed
                .pointer("/Self/HostName")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            let tailscale_ip = parsed
                .pointer("/Self/TailscaleIPs/0")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            // Count peers with Online: true inside the Peer map
            let peers_online = parsed
                .get("Peer")
                .and_then(|p| p.as_object())
                .map(|peers| {
                    peers.values().filter(|v| {
                        v.get("Online")
                            .and_then(|o| o.as_bool())
                            .unwrap_or(false)
                    }).count() as u64
                })
                .unwrap_or(0);

            Json(TailscaleStatus {
                running: true,
                hostname,
                tailscale_ip,
                peers_online,
                error: None,
            })
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            Json(TailscaleStatus {
                running: false,
                hostname: String::new(),
                tailscale_ip: String::new(),
                peers_online: 0,
                error: Some(format!("tailscale exited non-zero: {}", stderr.trim())),
            })
        }
        Err(e) => Json(TailscaleStatus {
            running: false,
            hostname: String::new(),
            tailscale_ip: String::new(),
            peers_online: 0,
            error: Some(format!("Cannot run tailscale: {e}")),
        }),
    }
}

// ── GET /api/stremio handler ────────────────────────────────────────────────

/// Probes the Stremio streaming server on port 11470.
/// Returns running status — the server is optional and may not be installed.
async fn get_stremio_status() -> Json<StremioStatus> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    match client.get("http://127.0.0.1:11470/").send().await {
        Ok(r) if r.status().is_success() => Json(StremioStatus {
            running: true,
            error: None,
        }),
        Ok(r) => Json(StremioStatus {
            running: false,
            error: Some(format!("Stremio returned HTTP {}", r.status())),
        }),
        Err(e) => Json(StremioStatus {
            running: false,
            error: Some(format!("{}", e)),
        }),
    }
}

// ── GET /api/health-check handler ────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct HealthCheckQuery {
    url: String,
}

/// Probes an arbitrary URL with a HEAD request and returns reachability + latency.
async fn get_health_check(
    axum::extract::Query(query): axum::extract::Query<HealthCheckQuery>,
) -> Json<HealthCheckResult> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .danger_accept_invalid_certs(true) // many local services use self-signed certs
        .build()
        .unwrap_or_default();

    let start = std::time::Instant::now();

    match client.head(&query.url).send().await {
        Ok(r) => {
            let latency = start.elapsed().as_millis() as u64;
            Json(HealthCheckResult {
                reachable: r.status().is_success()
                    || r.status().is_redirection()
                    || r.status().as_u16() == 401
                    || r.status().as_u16() == 403,
                latency_ms: latency,
                error: None,
            })
        }
        Err(e) => Json(HealthCheckResult {
            reachable: false,
            latency_ms: 0,
            error: Some(format!("{e}")),
        }),
    }
}

// ── GET /api/devices handler ─────────────────────────────────────────────────

/// Reads the kernel ARP table to show devices on the local network.
async fn get_lan_devices() -> Json<Vec<LanDevice>> {
    let mut devices = Vec::new();

    let arp_content = match std::fs::read_to_string("/proc/net/arp") {
        Ok(c) => c,
        Err(_) => return Json(devices),
    };

    for line in arp_content.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 {
            let ip = parts[0].to_string();
            let mac = parts[3].to_string();

            // Skip incomplete or invalid entries
            if ip == "0.0.0.0" || mac == "00:00:00:00:00:00" || mac == "00:00:00:00:00:00" {
                continue;
            }

            devices.push(LanDevice {
                ip,
                mac: mac.to_uppercase(),
                hostname: None,
            });
        }
    }

    Json(devices)
}

// ── GET /api/bandwidth handler ──────────────────────────────────────────────

/// Reads interface traffic stats from /proc/net/dev.
/// Tracks a baseline in AppState so we can show a "since boot" delta.
/// No external dependencies required — works on any Linux system.
async fn get_bandwidth(State(state): State<Arc<AppState>>) -> Json<BandwidthStats> {
    let iface = std::env::var("NET_IFACE")
        .or_else(|_| find_first_physical_iface())
        .unwrap_or_else(|_| "eth0".into());

    let (rx_total_gb, tx_total_gb) = match read_iface_counters(&iface) {
        Some((rx, tx)) => (rx / 1_073_741_824.0, tx / 1_073_741_824.0),
        None => {
            return Json(BandwidthStats {
                interface: iface.clone(),
                rx_today_mb: 0.0,
                tx_today_mb: 0.0,
                rx_month_mb: 0.0,
                tx_month_mb: 0.0,
                rx_total_gb: 0.0,
                tx_total_gb: 0.0,
                error: Some(format!("Interface '{}' not found in /proc/net/dev", iface)),
            });
        }
    };

    // Track baseline for "today" / "this session" delta
    let rx_today_mb;
    let tx_today_mb;
    {
        let mut baseline = state.net_baseline.lock().await;
        if baseline.iface != iface {
            // Interface changed — reset baseline
            baseline.iface = iface.clone();
            baseline.rx_bytes = rx_total_gb * 1_073_741_824.0;
            baseline.tx_bytes = tx_total_gb * 1_073_741_824.0;
            rx_today_mb = 0.0;
            tx_today_mb = 0.0;
        } else {
            rx_today_mb = ((rx_total_gb * 1_073_741_824.0) - baseline.rx_bytes).max(0.0) / 1_048_576.0;
            tx_today_mb = ((tx_total_gb * 1_073_741_824.0) - baseline.tx_bytes).max(0.0) / 1_048_576.0;
        }
    }

    Json(BandwidthStats {
        interface: iface,
        rx_today_mb,
        tx_today_mb,
        rx_month_mb: rx_today_mb,  // no monthly history without vnstat — show session delta
        tx_month_mb: tx_today_mb,
        rx_total_gb,
        tx_total_gb,
        error: None,
    })
}

/// Returns the first non-loopback, non-virtual interface from /proc/net/dev.
fn find_first_physical_iface() -> Result<String, String> {
    let content = std::fs::read_to_string("/proc/net/dev")
        .map_err(|e| format!("Cannot read /proc/net/dev: {e}"))?;
    for line in content.lines().skip(2) {
        let iface = line.split(':').next().map(|s| s.trim());
        if let Some(name) = iface {
            if name != "lo" && !name.is_empty() {
                return Ok(name.to_string());
            }
        }
    }
    Err("No physical interface found".into())
}

/// Reads RX/TX byte counters for an interface from /proc/net/dev.
fn read_iface_counters(iface: &str) -> Option<(f64, f64)> {
    let content = std::fs::read_to_string("/proc/net/dev").ok()?;
    for line in content.lines() {
        if line.trim().starts_with(&format!("{}:", iface)) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 10 {
                let rx = parts[1].parse::<f64>().ok()?;
                let tx = parts[9].parse::<f64>().ok()?;
                return Some((rx, tx));
            }
        }
    }
    None
}

// ── GET /api/weather handler ────────────────────────────────────────────────

/// Proxies the free Open-Meteo API to show current weather.
/// Caches results for 15 minutes. Location configured via WEATHER_LAT / WEATHER_LON env vars.
async fn get_weather(State(state): State<Arc<AppState>>) -> Json<WeatherResponse> {
    // Check cache (15-min TTL)
    {
        let cache = state.weather_cache.lock().await;
        if let Some((ref cached, instant)) = *cache {
            if instant.elapsed() < Duration::from_secs(15 * 60) {
                return Json(cached.clone());
            }
        }
    }

    let lat = std::env::var("WEATHER_LAT").unwrap_or_else(|_| "2.96".into());
    let lon = std::env::var("WEATHER_LON").unwrap_or_else(|_| "101.75".into());

    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
        lat, lon,
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    // Fetch from Open-Meteo; fall back to stale cache on error
    let weather = match fetch_open_meteo(&client, &url).await {
        Ok(w) => w,
        Err(_) => {
            let cache = state.weather_cache.lock().await;
            if let Some((ref cached, _)) = *cache {
                return Json(cached.clone());
            }
            WeatherResponse {
                temperature_c: 0.0,
                condition_text: "Unavailable".into(),
                humidity_percent: 0,
                wind_speed_kmh: 0.0,
            }
        }
    };

    // Update cache
    {
        let mut cache = state.weather_cache.lock().await;
        *cache = Some((weather.clone(), Instant::now()));
    }

    Json(weather)
}

async fn fetch_open_meteo(
    client: &reqwest::Client,
    url: &str,
) -> Result<WeatherResponse, String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Open-Meteo request failed: {e}"))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Open-Meteo JSON parse: {e}"))?;

    let current = json
        .get("current")
        .ok_or("Missing 'current' in Open-Meteo response")?;

    let temp = current
        .get("temperature_2m")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let humidity = current
        .get("relative_humidity_2m")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let wind = current
        .get("wind_speed_10m")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let code = current
        .get("weather_code")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Ok(WeatherResponse {
        temperature_c: temp,
        condition_text: weather_code_to_text(code),
        humidity_percent: humidity,
        wind_speed_kmh: wind,
    })
}

fn weather_code_to_text(code: u64) -> String {
    match code {
        0 => "Clear",
        1 | 2 | 3 => "Partly cloudy",
        45 | 48 => "Foggy",
        51 | 53 | 55 => "Drizzle",
        56 | 57 => "Freezing drizzle",
        61 | 63 | 65 => "Rain",
        66 | 67 => "Freezing rain",
        71 | 73 | 75 => "Snow",
        77 => "Snow grains",
        80 | 81 | 82 => "Rain showers",
        85 | 86 => "Snow showers",
        95 => "Thunderstorm",
        96 | 99 => "Thunderstorm with hail",
        _ => "Unknown",
    }
    .into()
}

// ── GET /api/uptime-status handler ──────────────────────────────────────────

/// Returns the latest status and recent history for all enabled uptime targets.
/// Reads targets and results from Supabase.
async fn get_uptime_status(
    axum::extract::Query(params): axum::extract::Query<UptimeStatusQuery>,
) -> Json<Vec<UptimeStatusItem>> {
    let supabase_url = std::env::var("SUPABASE_URL").unwrap_or_default();
    let anon_key = std::env::var("SUPABASE_ANON_KEY").unwrap_or_default();

    if supabase_url.is_empty() || anon_key.is_empty() {
        return Json(Vec::new());
    }

    let base_url = format!("{}/rest/v1", supabase_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let history_limit = params.limit.unwrap_or(20).min(100);

    // Fetch enabled targets
    let targets_url = format!(
        "{}/uptime_targets?enabled=eq.true&order=name.asc",
        base_url
    );
    let targets: Vec<serde_json::Value> = match client
        .get(&targets_url)
        .header("apikey", &anon_key)
        .header("Authorization", format!("Bearer {}", &anon_key))
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) => resp.json().await.unwrap_or_default(),
        Err(_) => return Json(Vec::new()),
    };

    let mut items = Vec::new();

    for target in &targets {
        let id = target.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let name = target
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let url = target
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let interval = target
            .get("interval_seconds")
            .and_then(|v| v.as_i64())
            .unwrap_or(300);

        // Fetch recent results
        let results_url = format!(
            "{}/uptime_results?target_id=eq.{}&order=checked_at.desc&limit={}",
            base_url, id, history_limit,
        );

        let results: Vec<serde_json::Value> = match client
            .get(&results_url)
            .header("apikey", &anon_key)
            .header("Authorization", format!("Bearer {}", &anon_key))
            .timeout(Duration::from_secs(5))
            .send()
            .await
        {
            Ok(resp) => resp.json().await.unwrap_or_default(),
            Err(_) => Vec::new(),
        };

        let latest = results.first().map(|r| UptimeResultResponse {
            target_id: id,
            reachable: r
                .get("reachable")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            latency_ms: r
                .get("latency_ms")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            error: r
                .get("error")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            checked_at: r
                .get("checked_at")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        });

        let history: Vec<UptimeHistoryPoint> = results
            .iter()
            .map(|r| UptimeHistoryPoint {
                reachable: r
                    .get("reachable")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
                latency_ms: r
                    .get("latency_ms")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                checked_at: r
                    .get("checked_at")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            })
            .collect();

        items.push(UptimeStatusItem {
            target: UptimeTargetResponse {
                id,
                name,
                url,
                interval_seconds: interval,
                enabled: true,
            },
            latest,
            history,
        });
    }

    Json(items)
}

// ── GET /api/top-processes handler ──────────────────────────────────────────

/// Returns top 5 processes by CPU and top 5 by RAM using sysinfo.
async fn get_top_processes(
    State(state): State<Arc<AppState>>,
) -> Json<TopProcesses> {
    let mut sys = state.sys.lock().await;
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All);

    let pid_current = sysinfo::get_current_pid().ok();

    let mut procs: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .filter(|(pid, _)| pid_current.as_ref() != Some(pid))
        .map(|(pid, p)| ProcessInfo {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().into_owned(),
            cpu_percent: (p.cpu_usage() * 100.0 * 10.0).round() / 10.0,
            mem_mb: p.memory() as f64 / 1_048_576.0,
        })
        .collect();

    // Sort by CPU desc — use f32 total_cmp via manual comparison
    procs.sort_by(|a, b| b.cpu_percent.partial_cmp(&a.cpu_percent).unwrap_or(std::cmp::Ordering::Equal));
    let by_cpu: Vec<ProcessInfo> = procs.iter().take(5).cloned().collect();

    // Sort by memory desc
    procs.sort_by(|a, b| b.mem_mb.partial_cmp(&a.mem_mb).unwrap_or(std::cmp::Ordering::Equal));
    let by_mem: Vec<ProcessInfo> = procs.iter().take(5).cloned().collect();

    Json(TopProcesses { by_cpu, by_mem })
}

// ── GET /api/service-status handler ──────────────────────────────────────────

/// Checks whether critical systemd services are active via `systemctl is-active`.
async fn get_service_status() -> Json<Vec<ServiceStatus>> {
    let services = [
        "nginx", "pihole-FTL", "home-dashboard-backend",
        "stremio", "tailscaled", "ssh",
    ];

    let mut results = Vec::new();
    for svc in &services {
        let active = check_systemctl(svc, "is-active").await;
        let enabled = check_systemctl(svc, "is-enabled").await;
        results.push(ServiceStatus {
            name: svc.to_string(),
            active,
            enabled,
        });
    }

    Json(results)
}

async fn check_systemctl(service: &str, cmd: &str) -> bool {
    tokio::process::Command::new("systemctl")
        .args([cmd, "--quiet", service])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// ── GET /api/sd-wear handler ─────────────────────────────────────────────────

/// Reads SD card / eMMC wear indicators from sysfs.
async fn get_sd_wear() -> Json<SdWearInfo> {
    // Try mmcblk0 first, then mmcblk1
    let device = if std::path::Path::new("/sys/block/mmcblk0/device/life_time").exists()
        || std::path::Path::new("/sys/block/mmcblk0/stat").exists()
    {
        "mmcblk0"
    } else if std::path::Path::new("/sys/block/mmcblk1/stat").exists() {
        "mmcblk1"
    } else {
        return Json(SdWearInfo {
            device: "unknown".into(),
            life_used_pct: None,
            wear_indicator: None,
            sectors_written_gb: None,
            pre_eol_info: None,
        });
    };

    let life_used_pct = read_sysfs_u8(&format!("/sys/block/{device}/device/life_time"))
        .map(|raw| match raw {
            // eMMC 5.0 life_time: 0x01=0-10%, 0x02=10-20%, ... 0x0A=90-100%, 0x0B=exceeded
            0x00 => 0,
            n if n <= 0x0A => (n as u8 - 1) * 10 + 5,
            _ => 100,
        });

    let pre_eol = read_sysfs_line(&format!("/sys/block/{device}/device/pre_eol_info"))
        .map(|s| {
            match s.trim() {
                "0x01" => "Normal".into(),
                "0x02" => "Warning".into(),
                other => format!("Unknown ({other})"),
            }
        });

    let sectors_written_gb = read_diskstat_writes(device).map(|s| s * 512.0 / 1_073_741_824.0);

    let wear_indicator = life_used_pct.map(|pct| {
        if pct < 50 { "Good" } else if pct < 80 { "Warning" } else { "Critical" }
    }).or_else(|| pre_eol.as_deref()).map(|s| s.to_string());

    Json(SdWearInfo {
        device: device.into(),
        life_used_pct,
        wear_indicator,
        sectors_written_gb: sectors_written_gb.map(|g| (g * 10.0).round() / 10.0),
        pre_eol_info: pre_eol,
    })
}

fn read_sysfs_u8(path: &str) -> Option<u8> {
    let raw = std::fs::read_to_string(path).ok()?;
    let trimmed = raw.trim();
    if trimmed.starts_with("0x") {
        u8::from_str_radix(trimmed.trim_start_matches("0x"), 16).ok()
    } else {
        trimmed.parse::<u8>().ok()
    }
}

fn read_sysfs_line(path: &str) -> Option<String> {
    std::fs::read_to_string(path).ok().map(|s| s.trim().to_string())
}

/// Reads field 7 (write sectors) from /sys/block/<dev>/stat.
fn read_diskstat_writes(device: &str) -> Option<f64> {
    let stat = std::fs::read_to_string(format!("/sys/block/{device}/stat")).ok()?;
    stat.split_whitespace().nth(6)?.parse::<f64>().ok()
}

// ── GET /api/ssh-monitor handler ─────────────────────────────────────────────

/// Parses /var/log/auth.log for failed SSH password attempts.
async fn get_ssh_monitor() -> Json<SshMonitorResponse> {
    let content = match std::fs::read_to_string("/var/log/auth.log") {
        Ok(c) => c,
        Err(_) => {
            return Json(SshMonitorResponse {
                total_failures_24h: 0,
                recent: Vec::new(),
            });
        }
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let cutoff = now.saturating_sub(24 * 3600);

    let mut recent: Vec<SshFailure> = Vec::new();
    let mut total_24h: u64 = 0;

    for line in content.lines().rev() {
        if !line.contains("Failed password for") {
            continue;
        }

        // Parse timestamp from syslog format: "May 30 14:22:15"
        let ts = line.get(0..15).unwrap_or("").to_string();

        let ip = line
            .split(" from ")
            .nth(1)
            .and_then(|s| s.split_whitespace().next())
            .unwrap_or("?")
            .to_string();

        let user = line
            .split("Failed password for ")
            .nth(1)
            .and_then(|s| s.split_whitespace().next())
            .unwrap_or("?")
            .to_string();

        let port = line
            .split(" port ")
            .nth(1)
            .and_then(|s| s.split_whitespace().next())
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(22);

        // Crude timestamp check: parse syslog timestamp relative to current year
        if let Ok(parsed) = parse_syslog_timestamp(&ts) {
            if parsed >= cutoff {
                total_24h += 1;
            }
        } else {
            // If we can't parse, count it anyway
            total_24h += 1;
        }

        if recent.len() < 20 {
            recent.push(SshFailure { timestamp: ts, ip, user, port });
        }
    }

    Json(SshMonitorResponse {
        total_failures_24h: total_24h,
        recent,
    })
}

/// Parses a syslog timestamp like "May 30 14:22:15" into a Unix timestamp.
/// Assumes the current year.
fn parse_syslog_timestamp(ts: &str) -> Result<u64, ()> {
    let months: std::collections::HashMap<&str, u32> = [
        ("Jan", 1), ("Feb", 2), ("Mar", 3), ("Apr", 4),
        ("May", 5), ("Jun", 6), ("Jul", 7), ("Aug", 8),
        ("Sep", 9), ("Oct", 10), ("Nov", 11), ("Dec", 12),
    ].into_iter().collect();

    let parts: Vec<&str> = ts.trim().split_whitespace().collect();
    if parts.len() < 3 { return Err(()); }

    let month = *months.get(parts[0]).ok_or(())?;
    let day: u32 = parts[1].parse().map_err(|_| ())?;
    let time_parts: Vec<&str> = parts[2].split(':').collect();
    if time_parts.len() < 2 { return Err(()); }
    let hour: u32 = time_parts[0].parse().map_err(|_| ())?;
    let min: u32 = time_parts[1].parse().map_err(|_| ())?;

    // Use current year — we fetch the year at runtime
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    // Rough: extract year from now
    let secs_per_year = 365.25 * 86400.0;
    let year = 1970 + (now.as_secs() as f64 / secs_per_year) as i32;

    let mut days_before = 0;
    let month_days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for m in 0..(month as usize - 1) {
        days_before += month_days[m];
    }

    let total_days = (year - 1970) as u64 * 365
        + ((year - 1969) / 4) as u64
        - ((year - 1901) / 100) as u64
        + ((year - 1601) / 400) as u64
        + days_before as u64
        + day as u64
        - 1;

    let ts = total_days * 86400 + hour as u64 * 3600 + min as u64 * 60;
    Ok(ts)
}

// ── Uptime monitor background task ──────────────────────────────────────────

/// Periodically probes all enabled uptime targets and stores results in Supabase.
/// Runs independently of the uptime-status API handler.
async fn uptime_monitor_loop(supabase_url: String, anon_key: String) {
    let client = reqwest::Client::new();
    let base_url = format!("{}/rest/v1", supabase_url.trim_end_matches('/'));

    // Track last probe time per target in memory
    let mut last_probes: HashMap<i64, Instant> = HashMap::new();

    // Startup delay so the server is fully up
    tokio::time::sleep(Duration::from_secs(30)).await;

    loop {
        // Fetch enabled targets from Supabase
        let targets_url = format!("{}/uptime_targets?enabled=eq.true&select=*", base_url);
        let targets: Vec<serde_json::Value> = match client
            .get(&targets_url)
            .header("apikey", &anon_key)
            .header("Authorization", format!("Bearer {}", &anon_key))
            .timeout(Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) => match resp.json().await {
                Ok(v) => v,
                Err(e) => {
                    error!("Failed to parse uptime targets: {e}");
                    tokio::time::sleep(Duration::from_secs(60)).await;
                    continue;
                }
            },
            Err(e) => {
                error!("Failed to fetch uptime targets: {e}");
                tokio::time::sleep(Duration::from_secs(60)).await;
                continue;
            }
        };

        for target in &targets {
            let id = target.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
            let url = target
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let interval_secs = target
                .get("interval_seconds")
                .and_then(|v| v.as_i64())
                .unwrap_or(300) as u64;

            if url.is_empty() {
                continue;
            }

            // Check if it's time to probe this target
            let should_probe = last_probes
                .get(&id)
                .map_or(true, |last| last.elapsed() >= Duration::from_secs(interval_secs));

            if !should_probe {
                continue;
            }

            // Probe the URL
            let start = Instant::now();
            let probe_result = client
                .head(url)
                .timeout(Duration::from_secs(10))
                .send()
                .await;

            let latency = start.elapsed().as_millis() as u64;

            let (reachable, error_msg) = match probe_result {
                Ok(r) => {
                    let ok = r.status().is_success()
                        || r.status().is_redirection()
                        || r.status().as_u16() == 401
                        || r.status().as_u16() == 403;
                    let err = if ok {
                        None
                    } else {
                        Some(format!("HTTP {}", r.status()))
                    };
                    (ok, err)
                }
                Err(e) => (false, Some(format!("{e}"))),
            };

            // Store result in Supabase
            let result_body = serde_json::json!({
                "target_id": id,
                "reachable": reachable,
                "latency_ms": latency,
                "error": error_msg,
            });

            let _ = client
                .post(format!("{}/uptime_results", base_url))
                .header("apikey", &anon_key)
                .header("Authorization", format!("Bearer {}", &anon_key))
                .header("Prefer", "return=minimal")
                .json(&result_body)
                .timeout(Duration::from_secs(5))
                .send()
                .await;

            last_probes.insert(id, Instant::now());

            info!(
                "Uptime check: {} ({}) -> {} ({}ms)",
                url,
                target
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?"),
                if reachable { "UP" } else { "DOWN" },
                latency,
            );
        }

        // Check for new/changed targets every 60 seconds
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}

// ── Supabase keep-alive background task ─────────────────────────────────────

async fn supabase_keep_alive_loop(supabase_url: String, anon_key: String) {
    let client = reqwest::Client::new();
    let interval = Duration::from_secs(30 * 60); // 30 minutes
    let url = format!("{}/rest/v1/", supabase_url.trim_end_matches('/'));

    // First ping after 60 seconds so the server is fully up
    tokio::time::sleep(Duration::from_secs(60)).await;

    loop {
        info!("Pinging Supabase keep-alive: {}", url);

        match client
            .get(&url)
            .header("apikey", &anon_key)
            .header("Authorization", format!("Bearer {}", &anon_key))
            .timeout(Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) => {
                let status = resp.status();
                info!("Supabase keep-alive response: {}", status);
            }
            Err(e) => {
                error!("Supabase keep-alive failed: {e}");
            }
        }

        tokio::time::sleep(interval).await;
    }
}

// ── Main ────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    // Init structured logging (RUST_LOG env var controls level)
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "home_dashboard_backend=info,tower_http=warn".into()),
        )
        .compact()
        .init();

    info!("Starting Home Dashboard Backend");

    // ── Read keep-alive credentials ──────────────────────────────────────
    let supabase_url = std::env::var("SUPABASE_URL").unwrap_or_default();
    let supabase_anon_key = std::env::var("SUPABASE_ANON_KEY").unwrap_or_default();

    // Spawn keep-alive only if credentials are configured
    if !supabase_url.is_empty() && !supabase_anon_key.is_empty() {
        info!(
            "Spawning Supabase keep-alive task (every 30 min) for: {}",
            supabase_url
        );
        let keepalive_url = supabase_url.clone();
        let keepalive_key = supabase_anon_key.clone();
        tokio::spawn(supabase_keep_alive_loop(keepalive_url, keepalive_key));

        info!("Spawning uptime monitor background task");
        tokio::spawn(uptime_monitor_loop(
            supabase_url.clone(),
            supabase_anon_key.clone(),
        ));
    } else {
        info!("SUPABASE_URL / SUPABASE_ANON_KEY not set — keep-alive and uptime monitor skipped");
    }

    // ── Build application state ──────────────────────────────────────────
    let mut sys = System::new_all();
    // Initial refresh to populate CPU counters
    sys.refresh_all();
    let state = Arc::new(AppState {
        sys: Mutex::new(sys),
        weather_cache: Mutex::new(None),
        net_baseline: Mutex::new(NetBaseline {
            iface: String::new(),
            rx_bytes: 0.0,
            tx_bytes: 0.0,
        }),
    });

    // ── Build router ─────────────────────────────────────────────────────
    let app = Router::new()
        .route("/api/stats", get(get_stats))
        .route("/api/nanobot", get(get_nanobot_status))
        .route("/api/nanobot-details", get(get_nanobot_details))
        .route("/api/tailscale", get(get_tailscale_status))
        .route("/api/stremio", get(get_stremio_status))
        .route("/api/health-check", get(get_health_check))
        .route("/api/devices", get(get_lan_devices))
        .route("/api/bandwidth", get(get_bandwidth))
        .route("/api/weather", get(get_weather))
        .route("/api/uptime-status", get(get_uptime_status))
        .route("/api/top-processes", get(get_top_processes))
        .route("/api/service-status", get(get_service_status))
        .route("/api/sd-wear", get(get_sd_wear))
        .route("/api/ssh-monitor", get(get_ssh_monitor))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // ── Start server with graceful shutdown ──────────────────────────────
    let port = std::env::var("BIND_PORT")
        .unwrap_or_else(|_| "8081".into());
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    info!("Listening on http://{addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();

    info!("Server shut down cleanly");
}

/// Returns a future that completes on SIGTERM or SIGINT (Ctrl-C).
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl-C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(unix)]
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    #[cfg(not(unix))]
    ctrl_c.await;
}
