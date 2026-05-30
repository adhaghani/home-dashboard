/** A service/bookmark shortcut stored in Supabase. */
export interface Service {
  id: number;
  name: string;
  url: string;
  icon: string | null;
  category: string | null;
  sort_order: number;
  created_at: string;
}

/** Payload for creating or updating a service. */
export interface ServicePayload {
  name: string;
  url: string;
  icon?: string | null;
  category?: string | null;
  sort_order?: number;
}

/** Nanobot agent status returned by `/api/nanobot`. */
export interface NanobotStatus {
  running: boolean;
  model: string | null;
  error: string | null;
}

/** Nanobot details returned by `/api/nanobot-details`. */
export interface NanobotDetails {
  provider: string | null;
  model: string | null;
  channels: string[];
  sessions: number;
  memory_lines: number;
  cron_jobs: number;
  gateway_port: number;
  api_port: number;
  error: string | null;
}

/** Stremio streaming server status returned by `/api/stremio`. */
export interface StremioStatus {
  running: boolean;
  error: string | null;
}

/** Tailscale status returned by `/api/tailscale`. */
export interface TailscaleStatus {
  running: boolean;
  hostname: string;
  tailscale_ip: string;
  peers_online: number;
  error: string | null;
}

/** Health check result returned by `/api/health-check`. */
export interface HealthCheckResult {
  reachable: boolean;
  latency_ms: number;
  error: string | null;
}

/** System metrics returned by the Rust backend `/api/stats`. */
export interface SystemStats {
  cpu_percent: number;
  cpu_temp_c: number | null;
  ram_used_mb: number;
  ram_total_mb: number;
  disk_used_mb: number;
  disk_total_mb: number;
  uptime_seconds: number;
}

/** Process info returned by `/api/top-processes`. */
export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_percent: number;
  mem_mb: number;
}

/** Top processes response from `/api/top-processes`. */
export interface TopProcesses {
  by_cpu: ProcessInfo[];
  by_mem: ProcessInfo[];
}

/** systemd service status from `/api/service-status`. */
export interface ServiceStatus {
  name: string;
  active: boolean;
  enabled: boolean;
}

/** SD card wear info from `/api/sd-wear`. */
export interface SdWearInfo {
  device: string;
  life_used_pct: number | null;
  wear_indicator: string | null;
  sectors_written_gb: number | null;
  pre_eol_info: string | null;
}

/** A single SSH failure entry from `/api/ssh-monitor`. */
export interface SshFailure {
  timestamp: string;
  ip: string;
  user: string;
  port: number;
}

/** SSH monitor response from `/api/ssh-monitor`. */
export interface SshMonitorResponse {
  total_failures_24h: number;
  recent: SshFailure[];
}

/** LAN device discovered via ARP table, returned by `/api/devices`. */
export interface LanDevice {
  ip: string;
  mac: string;
  hostname: string | null;
}

/** Bandwidth statistics returned by `/api/bandwidth` (vnstat). */
export interface BandwidthStats {
  interface: string;
  rx_today_mb: number;
  tx_today_mb: number;
  rx_month_mb: number;
  tx_month_mb: number;
  rx_total_gb: number;
  tx_total_gb: number;
  error: string | null;
}

/** Current weather returned by `/api/weather` (Open-Meteo proxy). */
export interface WeatherResponse {
  temperature_c: number;
  condition_text: string;
  humidity_percent: number;
  wind_speed_kmh: number;
}

/** An uptime monitoring target stored in Supabase. */
export interface UptimeTarget {
  id: number;
  name: string;
  url: string;
  interval_seconds: number;
  enabled: boolean;
  created_at?: string;
}

/** A single uptime check result. */
export interface UptimeResult {
  target_id: number;
  reachable: boolean;
  latency_ms: number;
  error: string | null;
  checked_at: string;
}

/** A history data point (lightweight, for sparklines). */
export interface UptimeHistoryPoint {
  reachable: boolean;
  latency_ms: number;
  checked_at: string;
}

/** Combined target + latest result + history returned by `/api/uptime-status`. */
export interface UptimeStatusItem {
  target: UptimeTarget;
  latest: UptimeResult | null;
  history: UptimeHistoryPoint[];
}
