'use client';

import { useEffect, useState, useCallback } from 'react';
import type { UptimeStatusItem } from '@/lib/types';

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/uptime-status?limit=30`;
}

export default function UptimeMonitor() {
  const [items, setItems] = useState<UptimeStatusItem[] | null>(null);
  const [error, setError] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: UptimeStatusItem[] = await res.json();
      setItems(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (!items && !error) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Uptime Monitor</h2>
        <div className="rounded-xl bg-surface-900 p-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="mb-4 flex items-center gap-4 last:mb-0"
            >
              <div className="skeleton h-3 w-3 rounded-full" />
              <div className="skeleton h-4 w-36" />
              <div className="skeleton h-3 w-16" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error && !items) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Uptime Monitor</h2>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <p className="text-sm text-red-400">
            Unable to fetch uptime status. Check that Supabase is configured and
            the backend is running.
          </p>
        </div>
      </section>
    );
  }

  // ── Empty state (no targets configured) ───────────────────────────────
  if (items && items.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Uptime Monitor</h2>
        <div className="rounded-xl bg-surface-900 p-8 text-center">
          <p className="text-sm text-slate-500">
            No uptime targets configured. Add targets in the{' '}
            <code className="rounded bg-surface-800 px-1.5 py-0.5 text-xs text-slate-300">
              uptime_targets
            </code>{' '}
            Supabase table to start monitoring.
          </p>
        </div>
      </section>
    );
  }

  // ── Normal state ──────────────────────────────────────────────────────
  return (
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Uptime Monitor
        <span className="ml-2 text-sm font-normal text-slate-500">
          ({items!.length} target{items!.length !== 1 ? 's' : ''})
        </span>
      </h2>
      <div className="space-y-3">
        {items!.map((item) => {
          const isExpanded = expandedId === item.target.id;
          const isUp = item.latest?.reachable ?? null;

          return (
            <div
              key={item.target.id}
              className="overflow-hidden rounded-xl bg-surface-900"
            >
              {/* ── Header row (always visible) ──────────────────────── */}
              <button
                onClick={() =>
                  setExpandedId(isExpanded ? null : item.target.id)
                }
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-800/50"
              >
                {/* Status dot */}
                <span
                  className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                    isUp === null
                      ? 'bg-slate-600'
                      : isUp
                        ? 'bg-green-500'
                        : 'bg-red-500'
                  }`}
                />

                {/* Name + URL */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">
                    {item.target.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {item.target.url}
                  </p>
                </div>

                {/* Latency / status */}
                <div className="flex-shrink-0 text-right">
                  <p
                    className={`text-sm font-semibold ${
                      isUp === null
                        ? 'text-slate-500'
                        : isUp
                          ? 'font-mono text-green-400'
                          : 'text-red-400'
                    }`}
                  >
                    {isUp === null
                      ? 'Unknown'
                      : isUp
                        ? `${item.latest!.latency_ms}ms`
                        : 'Down'}
                  </p>
                  {item.latest?.checked_at && (
                    <p className="text-xs text-slate-600">
                      {formatTimeAgo(item.latest.checked_at)}
                    </p>
                  )}
                </div>

                {/* Expand chevron */}
                <svg
                  className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                  />
                </svg>
              </button>

              {/* ── Expanded history sparkline ───────────────────────── */}
              {isExpanded && item.history.length > 0 && (
                <div className="border-t border-surface-800 px-5 py-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Latency history ({item.history.length} checks)
                  </p>

                  {/* Sparkline bars */}
                  <div
                    className="flex items-end gap-px"
                    style={{ height: '48px' }}
                  >
                    {[...item.history].reverse().map((point, i) => (
                      <div
                        key={i}
                        title={`${point.reachable ? 'UP' : 'DOWN'} — ${point.latency_ms}ms — ${new Date(point.checked_at).toLocaleTimeString()}`}
                        className="flex-1 rounded-t-sm"
                        style={{
                          height: point.reachable
                            ? `${Math.max(8, Math.min(100, 100 - point.latency_ms / 10))}%`
                            : '100%',
                          backgroundColor: point.reachable
                            ? point.latency_ms < 100
                              ? '#22c55e'
                              : point.latency_ms < 500
                                ? '#eab308'
                                : '#f97316'
                            : '#ef4444',
                          opacity: 0.85,
                        }}
                      />
                    ))}
                  </div>

                  {/* Time axis labels */}
                  <div className="mt-2 flex justify-between text-xs text-slate-600">
                    <span>
                      {item.history.length > 0
                        ? formatTimeAgo(
                            item.history[item.history.length - 1].checked_at,
                          )
                        : ''}
                    </span>
                    <span>now</span>
                  </div>

                  {/* Error detail for latest check */}
                  {item.latest?.error && (
                    <p className="mt-3 text-xs text-red-400/80">
                      Last error: {item.latest.error}
                    </p>
                  )}
                </div>
              )}

              {/* ── Expanded but no history ──────────────────────────── */}
              {isExpanded && item.history.length === 0 && (
                <div className="border-t border-surface-800 px-5 py-4">
                  <p className="text-xs text-slate-500">
                    No check history yet. The monitor will record results
                    shortly.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Formats an ISO timestamp as a relative time string ("12s ago", "5m ago", etc.). */
function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
