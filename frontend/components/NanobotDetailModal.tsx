'use client';

import { useEffect, useState } from 'react';
import type { NanobotDetails } from '@/lib/types';

interface NanobotDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NanobotDetailModal({
  isOpen,
  onClose,
}: NanobotDetailModalProps) {
  const [details, setDetails] = useState<NanobotDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function fetchDetails() {
      setLoading(true);
      setError(null);
      try {
        const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
        const res = await fetch(`${base}/api/nanobot-details`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: NanobotDetails = await res.json();
        if (!cancelled) setDetails(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) setLoading(false);
    }

    fetchDetails();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-surface-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-white">
          nanobot Details
        </h2>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="skeleton h-4 w-20" />
                <div className="skeleton h-4 w-32" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Details */}
        {details && !loading && (
          <div className="space-y-3">
            <DetailRow label="Provider" value={details.provider ?? 'Unknown'} />
            <DetailRow label="Model" value={details.model ?? 'Unknown'} />
            <DetailRow label="Sessions" value={String(details.sessions)} />
            <DetailRow
              label="Channels"
              value={
                details.channels.length > 0
                  ? details.channels.join(', ')
                  : 'None'
              }
            />
            <DetailRow label="Cron Jobs" value={String(details.cron_jobs)} />
            <DetailRow
              label="Memory (lines)"
              value={String(details.memory_lines)}
            />
            <DetailRow
              label="Gateway Port"
              value={String(details.gateway_port)}
            />
            <DetailRow label="API Port" value={String(details.api_port)} />
          </div>
        )}

        {/* Close button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-surface-800 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-surface-700 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-200">{value}</span>
    </div>
  );
}
