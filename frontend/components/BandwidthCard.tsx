'use client';

import { useEffect, useState } from 'react';
import type { BandwidthStats } from '@/lib/types';

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/bandwidth`;
}

export default function BandwidthCard() {
  const [stats, setStats] = useState<BandwidthStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        const res = await fetch(getApiUrl());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: BandwidthStats = await res.json();
        if (!cancelled) {
          setStats(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchStats();
    const id = setInterval(fetchStats, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (!stats && !error) {
    return (
      <div className="rounded-xl bg-surface-900 p-5">
        <div className="skeleton mb-3 h-4 w-24" />
        <div className="skeleton mb-2 h-6 w-20" />
        <div className="skeleton h-3 w-36" />
      </div>
    );
  }

  // ── Error / interface not found ─────────────────────────────────────
  if (error && !stats) {
    return (
      <div className="rounded-xl bg-surface-900 p-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          Bandwidth
        </p>
        <div className="mb-3">
          <span className="text-lg font-semibold text-slate-500">N/A</span>
        </div>
        <p className="text-xs text-slate-500">Interface not found</p>
      </div>
    );
  }

  // ── Normal state ──────────────────────────────────────────────────────
  const s = stats!;
  const hasError = !!s.error;

  return (
    <div className="rounded-xl bg-surface-900 p-5 transition-colors">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
        Bandwidth
      </p>
      <div className="mb-3">
        <span className="text-xl font-semibold text-white">
          {hasError ? 'N/A' : formatMb(s.rx_today_mb + s.tx_today_mb)}
        </span>
        <span className="ml-1 text-xs text-slate-500">session</span>
      </div>
      {hasError ? (
        <p className="text-xs text-slate-500">{s.error}</p>
      ) : (
        <p className="text-xs leading-relaxed text-slate-400">
          <span className="text-green-400">↓ {formatMb(s.rx_today_mb)}</span>
          {' · '}
          <span className="text-blue-400">↑ {formatMb(s.tx_today_mb)}</span>
          <br />
          <span className="text-slate-500">
            Total ↓{s.rx_total_gb.toFixed(1)} GB ↑{s.tx_total_gb.toFixed(1)} GB
          </span>
        </p>
      )}
    </div>
  );
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}
