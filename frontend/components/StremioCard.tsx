'use client';

import { useEffect, useState } from 'react';
import type { StremioStatus } from '@/lib/types';

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/stremio`;
}

export default function StremioCard() {
  const [status, setStatus] = useState<StremioStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch(getApiUrl());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: StremioStatus = await res.json();
        if (!cancelled) {
          setStatus(data);
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
  if (!status && !error) {
    return (
      <div className="rounded-xl bg-surface-900 p-5">
        <div className="skeleton mb-3 h-4 w-20" />
        <div className="skeleton mb-2 h-6 w-16" />
        <div className="skeleton h-3 w-32" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error && !status) {
    return (
      <div className="rounded-xl bg-surface-900 p-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          Stremio
        </p>
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          <span className="text-lg font-semibold text-red-400">Unknown</span>
        </div>
        <p className="text-xs text-slate-500">Backend unreachable</p>
      </div>
    );
  }

  // ── Running state ─────────────────────────────────────────────────────
  if (status?.running) {
    return (
      <div className="rounded-xl bg-surface-900 p-5 transition-colors">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          Stremio
        </p>
        <div className="mb-3 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          <span className="text-xl font-semibold text-white">Online</span>
        </div>
        <p className="text-xs text-slate-400">
          Streaming on <span className="font-mono text-slate-300">:11470</span>
        </p>
      </div>
    );
  }

  // ── Not installed / offline state ─────────────────────────────────────
  return (
    <div className="rounded-xl bg-surface-900 p-5 transition-colors">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
        Stremio
      </p>
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-600" />
        <span className="text-xl font-semibold text-slate-400">Not running</span>
      </div>
      <p className="text-xs text-slate-500">
        Run setup script to install
      </p>
    </div>
  );
}
