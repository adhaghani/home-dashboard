'use client';

import { useEffect, useState } from 'react';
import type { TopProcesses } from '@/lib/types';

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/top-processes`;
}

export default function TopProcessesCard() {
  const [data, setData] = useState<TopProcesses | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch(getApiUrl());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: TopProcesses = await res.json();
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchData();
    const id = setInterval(fetchData, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (!data && !error) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Top Processes</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, col) => (
            <div key={col} className="rounded-xl bg-surface-900 p-5">
              <div className="skeleton mb-4 h-4 w-24" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="mb-3 flex items-center gap-3 last:mb-0"
                >
                  <div className="skeleton h-3 w-8" />
                  <div className="skeleton h-3 flex-1" />
                  <div className="skeleton h-3 w-12" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Top Processes</h2>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <p className="text-sm text-red-400">
            Unable to fetch process information.
          </p>
        </div>
      </section>
    );
  }

  // ── Normal state ──────────────────────────────────────────────────────
  return (
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-semibold text-white">Top Processes</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* CPU column */}
        <div className="rounded-xl bg-surface-900 p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-amber-400">
            By CPU
          </p>
          <div className="space-y-3">
            {data!.by_cpu.length === 0 && (
              <p className="text-sm text-slate-500">No process data</p>
            )}
            {data!.by_cpu.map((p) => (
              <div key={`cpu-${p.pid}`} className="flex items-center gap-3">
                <span className="w-10 flex-shrink-0 text-right font-mono text-xs text-slate-600">
                  {p.pid}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                  {p.name}
                </span>
                <span className="flex-shrink-0 text-right font-mono text-sm text-amber-400">
                  {p.cpu_percent.toFixed(1)}%
                </span>
                {/* Mini bar */}
                <div className="h-1.5 w-16 flex-shrink-0 overflow-hidden rounded-full bg-surface-800">
                  <div
                    className="h-full rounded-full bg-amber-500/60 transition-all duration-700"
                    style={{ width: `${Math.min(100, p.cpu_percent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RAM column */}
        <div className="rounded-xl bg-surface-900 p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-blue-400">
            By RAM
          </p>
          <div className="space-y-3">
            {data!.by_mem.length === 0 && (
              <p className="text-sm text-slate-500">No process data</p>
            )}
            {data!.by_mem.map((p) => (
              <div key={`mem-${p.pid}`} className="flex items-center gap-3">
                <span className="w-10 flex-shrink-0 text-right font-mono text-xs text-slate-600">
                  {p.pid}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                  {p.name}
                </span>
                <span className="flex-shrink-0 text-right font-mono text-sm text-blue-400">
                  {formatMem(p.mem_mb)}
                </span>
                <div className="h-1.5 w-16 flex-shrink-0 overflow-hidden rounded-full bg-surface-800">
                  <div
                    className="h-full rounded-full bg-blue-500/60 transition-all duration-700"
                    style={{
                      width: `${Math.min(100, (p.mem_mb / 1024) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatMem(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}
