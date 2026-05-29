use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
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

// ── Shared application state ────────────────────────────────────────────────

struct AppState {
    /// We keep a `System` instance to track CPU deltas across requests.
    sys: Mutex<System>,
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
        tokio::spawn(supabase_keep_alive_loop(supabase_url, supabase_anon_key));
    } else {
        info!("SUPABASE_URL / SUPABASE_ANON_KEY not set — keep-alive task skipped");
    }

    // ── Build application state ──────────────────────────────────────────
    let mut sys = System::new_all();
    // Initial refresh to populate CPU counters
    sys.refresh_all();
    let state = Arc::new(AppState {
        sys: Mutex::new(sys),
    });

    // ── Build router ─────────────────────────────────────────────────────
    let app = Router::new()
        .route("/api/stats", get(get_stats))
        .route("/api/nanobot", get(get_nanobot_status))
        .route("/api/nanobot-details", get(get_nanobot_details))
        .route("/api/tailscale", get(get_tailscale_status))
        .route("/api/health-check", get(get_health_check))
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
