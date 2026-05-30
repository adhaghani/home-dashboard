'use client';

import { useEffect, useState } from 'react';
import type { SdWearInfo } from '@/lib/types';

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/sd-wear`;
}

export default function SdWearCard() {
  const [info, setInfo] = useState<SdWearInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchInfo() {
      try {
        const res = await fetch(getApiUrl());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: SdWearInfo = await res.json();
        if (!cancelled) {
          setInfo(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchInfo();
    // Wear doesn't change fast — poll every 5 min
    const id = setInterval(fetchInfo, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (!info && !error) {
    return (
      <div className="rounded-xl bg-surface-900 p-5">
        <div className="skeleton mb-3 h-4 w-24" />
        <div className="skeleton mb-2 h-6 w-16" />
        <div className="skeleton h-3 w-32" />
      </div>
    );
  }

  // ── Not available (unknown device) ────────────────────────────────────
  if (info && info.device === 'unknown' && !error) {
    return (
      <div className="rounded-xl bg-surface-900 p-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          SD Wear
        </p>
        <div className="mb-3">
          <span className="text-lg font-semibold text-slate-500">N/A</span>
        </div>
        <p className="text-xs text-slate-500">No eMMC/SD device detected</p>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error && !info) {
    return (
      <div className="rounded-xl bg-surface-900 p-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          SD Wear
        </p>
        <div className="mb-3">
          <span className="text-lg font-semibold text-slate-500">N/A</span>
        </div>
        <p className="text-xs text-slate-500">Unable to read wear info</p>
      </div>
    );
  }

  // ── Normal state ──────────────────────────────────────────────────────
  const i = info!;
  const wearPct = i.life_used_pct ?? null;
  const indicator = i.wear_indicator ?? (wearPct === null ? 'Unknown' : undefined);
  const barColor =
    wearPct === null
      ? 'bg-slate-600'
      : wearPct < 50
        ? 'bg-green-500'
        : wearPct < 80
          ? 'bg-yellow-500'
          : 'bg-red-500';

  return (
    <div className="rounded-xl bg-surface-900 p-5 transition-colors">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
        SD Wear
      </p>
      <div className="mb-4 flex items-baseline gap-1.5">
        <span
          className={`text-2xl font-bold ${
            wearPct === null
              ? 'text-slate-500'
              : wearPct < 50
                ? 'text-green-400'
                : wearPct < 80
                  ? 'text-yellow-400'
                  : 'text-red-400'
          }`}
        >
          {wearPct !== null ? `${wearPct}%` : 'N/A'}
        </span>
        {indicator && (
          <span className="text-sm text-slate-500">{indicator}</span>
        )}
      </div>
      <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${wearPct ?? 0}%` }}
        />
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        {i.sectors_written_gb !== null
          ? `Written: ${formatGb(i.sectors_written_gb)}`
          : 'Write data unavailable'}
        {i.pre_eol_info && (
          <>
            <br />
            <span
              className={
                i.pre_eol_info === 'Normal'
                  ? 'text-green-400'
                  : 'text-red-400'
              }
            >
              Pre-EOL: {i.pre_eol_info}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function formatGb(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(1)} GB`;
}
