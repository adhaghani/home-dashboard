'use client';

import { useEffect, useState } from 'react';
import type { LanDevice } from '@/lib/types';

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/devices`;
}

export default function LanDevices() {
  const [devices, setDevices] = useState<LanDevice[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchDevices() {
      try {
        const res = await fetch(getApiUrl());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: LanDevice[] = await res.json();
        if (!cancelled) {
          setDevices(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchDevices();
    const id = setInterval(fetchDevices, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (!devices && !error) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Network Devices</h2>
        <div className="rounded-xl bg-surface-900 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-surface-800 py-3 last:border-0"
            >
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-3 w-40" />
              <div className="skeleton h-3 w-24" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error && !devices) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Network Devices</h2>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <p className="text-sm text-red-400">
            Unable to read ARP table. The backend may be offline or running on a
            non-Linux system.
          </p>
        </div>
      </section>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────
  if (devices && devices.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Network Devices</h2>
        <div className="rounded-xl bg-surface-900 p-8 text-center">
          <p className="text-sm text-slate-500">
            No devices found on the local network. The ARP table may be empty.
          </p>
        </div>
      </section>
    );
  }

  // ── Normal state ──────────────────────────────────────────────────────
  return (
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Network Devices
        <span className="ml-2 text-sm font-normal text-slate-500">
          ({devices!.length})
        </span>
      </h2>
      <div className="overflow-hidden rounded-xl bg-surface-900">
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-800">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                  IP Address
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                  MAC Address
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Hostname
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {devices!.map((d) => (
                <tr
                  key={`${d.ip}-${d.mac}`}
                  className="transition-colors hover:bg-surface-800/50"
                >
                  <td className="px-5 py-3 font-mono text-sm text-slate-300">
                    {d.ip}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-400">
                    {d.mac}
                  </td>
                  <td className="px-5 py-3 text-slate-400">
                    {d.hostname || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
