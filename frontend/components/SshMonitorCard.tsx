'use client';

import { useEffect, useState } from 'react';
import type { SshMonitorResponse } from '@/lib/types';

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/ssh-monitor`;
}

export default function SshMonitorCard() {
  const [data, setData] = useState<SshMonitorResponse | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch(getApiUrl());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: SshMonitorResponse = await res.json();
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (!data && !error) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">
          SSH Monitor
        </h2>
        <div className="rounded-xl bg-surface-900 p-5">
          <div className="skeleton mb-3 h-10 w-20" />
          <div className="skeleton h-3 w-44" />
        </div>
      </section>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">
          SSH Monitor
        </h2>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <p className="text-sm text-red-400">
            Unable to read auth log. The log file may not exist or be inaccessible.
          </p>
        </div>
      </section>
    );
  }

  // ── Normal state ──────────────────────────────────────────────────────
  const count = data!.total_failures_24h;
  const severity =
    count === 0 ? 'safe' : count <= 5 ? 'warn' : 'critical';

  return (
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-semibold text-white">SSH Monitor</h2>
      <div className="rounded-xl bg-surface-900 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              Failed attempts (24h)
            </p>
            <div className="mb-3 flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold ${
                  severity === 'safe'
                    ? 'text-green-400'
                    : severity === 'warn'
                      ? 'text-yellow-400'
                      : 'text-red-400'
                }`}
              >
                {count}
              </span>
              <span className="text-sm text-slate-500">
                {severity === 'safe'
                  ? 'All clear'
                  : severity === 'warn'
                    ? 'Low activity'
                    : 'High activity'}
              </span>
            </div>
          </div>

          {count > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-surface-800 hover:text-white"
            >
              {expanded ? 'Hide' : 'Show'} details
            </button>
          )}
        </div>

        {/* Expandable failure list */}
        {expanded && data!.recent.length > 0 && (
          <div className="mt-4 border-t border-surface-800 pt-4">
            <div className="custom-scrollbar max-h-64 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-surface-800">
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Time
                    </th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                      User
                    </th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                      IP
                    </th>
                    <th className="pb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Port
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {data!.recent.map((f, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4 font-mono text-slate-500">
                        {f.timestamp}
                      </td>
                      <td className="py-2 pr-4 font-mono text-slate-400">
                        {f.user}
                      </td>
                      <td className="py-2 pr-4 font-mono text-slate-400">
                        {f.ip}
                      </td>
                      <td className="py-2 font-mono text-slate-500">
                        {f.port}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state inside card */}
        {count === 0 && (
          <p className="text-xs text-slate-500">
            No failed SSH attempts detected in the last 24 hours.
          </p>
        )}
      </div>
    </section>
  );
}
