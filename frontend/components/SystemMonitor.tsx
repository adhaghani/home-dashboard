'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { SystemStats } from '@/lib/types';
import NanobotCard from '@/components/NanobotCard';
import NanobotDetailModal from '@/components/NanobotDetailModal';
import TailscaleCard from '@/components/TailscaleCard';
import StremioCard from '@/components/StremioCard';
import WeatherCard from '@/components/WeatherCard';
import BandwidthCard from '@/components/BandwidthCard';

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/stats`;
}

export default function SystemMonitor() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [nanobotDetailOpen, setNanobotDetailOpen] = useState(false);
  const isFirstLoad = useRef(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SystemStats = await res.json();
      setStats(data);
      setError(false);
      setLastUpdated(Date.now());
      isFirstLoad.current = false;
    } catch {
      setError(true);
      // Keep the last known stats visible even on error
      if (isFirstLoad.current) setStats(null);
      isFirstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 3000);
    return () => clearInterval(id);
  }, [fetchStats]);

  // ── Initial loading skeleton ───────────────────────────────────────────
  if (!stats && !error) {
    return (
      <div className="space-y-4">
        {/* Row 1: 3 large cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-900 p-5">
              <div className="skeleton mb-3 h-4 w-20" />
              <div className="skeleton mb-2 h-10 w-20" />
              <div className="skeleton h-3 w-full" />
            </div>
          ))}
        </div>
        {/* Row 2: 5 compact cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-900 p-5">
              <div className="skeleton mb-3 h-4 w-20" />
              <div className="skeleton mb-2 h-6 w-16" />
              <div className="skeleton h-3 w-36" />
            </div>
          ))}
        </div>
        {/* Row 3: 2 compact cards */}
        <div className="grid gap-4 grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-900 p-5">
              <div className="skeleton mb-3 h-4 w-20" />
              <div className="skeleton mb-2 h-6 w-16" />
              <div className="skeleton h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Full error state (only on first load) ────────────────────────────
  if (error && !stats) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
        <p className="text-sm text-red-400">
          Unable to reach the system backend. Make sure the Rust service is running.
        </p>
      </div>
    );
  }

  const s = stats!;
  const cpuTemp = s.cpu_temp_c ?? null;

  return (
    <div className="space-y-4">
      {/* ── Row 1: Primary metrics (3 cols) ─────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="CPU"
          value={`${s.cpu_percent.toFixed(1)}%`}
          sub={cpuTemp ? `${cpuTemp.toFixed(1)}°C` : undefined}
          percentage={s.cpu_percent}
          barClass={cpuTemp ? tempBarClass(cpuTemp) : 'progress-cpu'}
        />
        <StatCard
          label="RAM"
          value={formatMb(s.ram_used_mb)}
          sub={`of ${formatMb(s.ram_total_mb)}`}
          percentage={s.ram_total_mb > 0 ? (s.ram_used_mb / s.ram_total_mb) * 100 : 0}
          barClass="progress-ram"
        />
        <StatCard
          label="Disk /"
          value={formatMb(s.disk_used_mb)}
          sub={`of ${formatMb(s.disk_total_mb)}`}
          percentage={s.disk_total_mb > 0 ? (s.disk_used_mb / s.disk_total_mb) * 100 : 0}
          barClass="progress-disk"
        />
      </div>

      {/* ── Row 2: Status cards (5 cols) ────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <UptimeCard
          seconds={s.uptime_seconds}
          error={error}
          lastUpdated={lastUpdated}
        />
        <NanobotCard onShowDetails={() => setNanobotDetailOpen(true)} />
        <TailscaleCard />
        <StremioCard />
        <TempMiniCard tempC={cpuTemp} />
      </div>

      {/* ── Row 3: Weather + Bandwidth (2 cols on mobile, 2 on desktop) ── */}
      <div className="grid gap-4 grid-cols-2">
        <WeatherCard />
        <BandwidthCard />
      </div>

      {/* ── Nanobot Detail Modal ────────────────────────────────────── */}
      <NanobotDetailModal
        isOpen={nanobotDetailOpen}
        onClose={() => setNanobotDetailOpen(false)}
      />
    </div>
  );
}

/* ─── Row 1: Large stat card with progress bar ────────────────────────────── */

function StatCard({
  label,
  value,
  sub,
  percentage,
  barClass,
}: {
  label: string;
  value: string;
  sub?: string;
  percentage: number;
  barClass: string;
}) {
  const clampedPct = Math.min(100, Math.max(0, percentage));

  return (
    <div className="rounded-xl bg-surface-900 p-5 transition-colors">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <div className="mb-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold text-white">{value}</span>
        {sub && <span className="text-sm text-slate-500">{sub}</span>}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barClass}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Row 2: Uptime card with last-updated indicator ──────────────────────── */

function UptimeCard({
  seconds,
  error,
  lastUpdated,
}: {
  seconds: number;
  error: boolean;
  lastUpdated: number | null;
}) {
  const [agoText, setAgoText] = useState('');

  useEffect(() => {
    if (lastUpdated == null) return;
    const ts = lastUpdated;
    function tick() {
      const diff = Math.floor((Date.now() - ts) / 1000);
      setAgoText(diff <= 1 ? 'just now' : `${diff}s ago`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  return (
    <div className="rounded-xl bg-surface-900 p-5 transition-colors">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
        Uptime
      </p>
      <div className="mb-3">
        <span className="text-xl font-semibold text-white">
          {formatUptime(seconds)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            error ? 'bg-red-500' : 'bg-green-500'
          }`}
        />
        <span className="text-slate-500">{error ? 'Disconnected' : agoText || '…'}</span>
      </div>
    </div>
  );
}

/* ─── Row 2: Temperature mini card ────────────────────────────────────────── */

function TempMiniCard({ tempC }: { tempC: number | null }) {
  return (
    <div className="rounded-xl bg-surface-900 p-5 transition-colors">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
        CPU Temp
      </p>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            !tempC ? 'bg-slate-600' : tempC < 50 ? 'bg-green-500' : tempC < 70 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
        />
        <span
          className={`text-xl font-semibold ${
            !tempC
              ? 'text-slate-500'
              : tempC < 50
                ? 'text-green-400'
                : tempC < 70
                  ? 'text-yellow-400'
                  : 'text-red-400'
          }`}
        >
          {tempC ? `${tempC.toFixed(1)}°C` : 'N/A'}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        {!tempC
          ? 'No sensor'
          : tempC < 50
            ? 'Cool'
            : tempC < 70
              ? 'Warm'
              : 'Hot'}
      </p>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function tempBarClass(tempC: number): string {
  if (tempC < 50) return 'progress-temp-safe';
  if (tempC < 70) return 'progress-temp-warn';
  return 'progress-temp-hot';
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function formatUptime(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
