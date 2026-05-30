'use client';

import { useEffect, useState } from 'react';
import type { ServiceStatus } from '@/lib/types';

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/service-status`;
}

/** Friendly display names for systemd units. */
const DISPLAY_NAMES: Record<string, string> = {
  nginx: 'Nginx',
  'pihole-FTL': 'Pi-Hole',
  'home-dashboard-backend': 'Dashboard',
  stremio: 'Stremio',
  tailscaled: 'Tailscale',
  ssh: 'SSH',
};

export default function ServiceStatusCard() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch(getApiUrl());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ServiceStatus[] = await res.json();
        if (!cancelled) {
          setServices(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (!services && !error) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Services</h2>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-full bg-surface-900 px-4 py-2"
            >
              <div className="skeleton h-2.5 w-2.5 rounded-full" />
              <div className="skeleton h-3 w-16" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error && !services) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Services</h2>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <p className="text-sm text-red-400">
            Unable to check service status. systemd may not be available.
          </p>
        </div>
      </section>
    );
  }

  // ── Normal state ──────────────────────────────────────────────────────
  return (
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-semibold text-white">Services</h2>
      <div className="flex flex-wrap gap-3">
        {services!.map((svc) => {
          const displayName = DISPLAY_NAMES[svc.name] || svc.name;
          return (
            <div
              key={svc.name}
              className="flex items-center gap-2 rounded-full bg-surface-900 px-4 py-2 transition-colors"
              title={`${svc.name}: ${svc.active ? 'active' : 'inactive'}${svc.enabled ? ', enabled at boot' : ''}`}
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  svc.active
                    ? 'bg-green-500'
                    : 'bg-red-500'
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  svc.active ? 'text-slate-200' : 'text-slate-500'
                }`}
              >
                {displayName}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
