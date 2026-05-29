'use client';

import { useEffect, useState, useMemo } from 'react';
import type { LanDevice } from '@/lib/types';

const PAGE_SIZE = 15;

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/devices`;
}

export default function LanDevices() {
  const [devices, setDevices] = useState<LanDevice[] | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);

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

  // Reset page if it goes out of bounds after a refresh
  const totalPages = useMemo(
    () => (devices ? Math.max(1, Math.ceil(devices.length / PAGE_SIZE)) : 1),
    [devices],
  );

  const pageDevices = useMemo(
    () => devices?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [],
    [devices, page],
  );

  // Clamp page if data changed and we're past the last page
  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

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
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, devices!.length);

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
              {pageDevices.map((d) => (
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

        {/* ── Pagination bar ───────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-surface-800 px-5 py-3">
            <p className="text-xs text-slate-500">
              {start}–{end} of {devices!.length}
            </p>
            <div className="flex items-center gap-1">
              <PageButton
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                « Prev
              </PageButton>

              {/* Page number buttons */}
              {Array.from({ length: totalPages }, (_, i) => {
                // Show first, last, current ±1, and ellipsis dots
                const show =
                  i === 0 ||
                  i === totalPages - 1 ||
                  Math.abs(i - page) <= 1;
                if (!show) {
                  // Only show one ellipsis marker between groups
                  if (i === 1 && page > 2) {
                    return (
                      <span
                        key={i}
                        className="px-2 text-xs text-slate-600"
                      >
                        …
                      </span>
                    );
                  }
                  if (
                    i === totalPages - 2 &&
                    page < totalPages - 3
                  ) {
                    return (
                      <span
                        key={i}
                        className="px-2 text-xs text-slate-600"
                      >
                        …
                      </span>
                    );
                  }
                  return null;
                }

                return (
                  <PageButton
                    key={i}
                    active={i === page}
                    onClick={() => setPage(i)}
                  >
                    {i + 1}
                  </PageButton>
                );
              })}

              <PageButton
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next »
              </PageButton>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Mini pagination button ─────────────────────────────────────────────── */

function PageButton({
  children,
  disabled,
  active,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs font-medium transition ${
        active
          ? 'bg-accent-600 text-white'
          : disabled
            ? 'cursor-not-allowed text-slate-700'
            : 'text-slate-400 hover:bg-surface-800 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
