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
