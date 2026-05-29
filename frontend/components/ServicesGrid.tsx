'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Service } from '@/lib/types';

const SERVICES_TABLE = 'services';

/* ─── Hook ────────────────────────────────────────────────────────────────── */

export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from(SERVICES_TABLE)
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
      setServices([]);
    } else {
      setServices((data as Service[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { services, loading, error, refresh };
}

/* ─── Props ────────────────────────────────────────────────────────────────── */

interface ServicesGridProps {
  services: Service[];
  loading: boolean;
  error: string | null;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
  onAdd: () => void;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function ServicesGrid({
  services,
  loading,
  error,
  onEdit,
  onDelete,
  onAdd,
}: ServicesGridProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    services.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats).sort();
  }, [services]);

  // Filter
  const filtered = useMemo(() => {
    let list = services;
    if (activeCategory) {
      list = list.filter((s) => s.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.url.toLowerCase().includes(q) ||
          (s.category && s.category.toLowerCase().includes(q))
      );
    }
    return list;
  }, [services, activeCategory, search]);

  // ── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-surface-900 p-5">
            <div className="skeleton mb-3 h-8 w-8 rounded-lg" />
            <div className="skeleton mb-2 h-4 w-24" />
            <div className="skeleton h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="mb-2 text-sm text-red-400">
          Failed to load services: {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm font-medium text-accent-400 transition hover:text-accent-500"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────
  if (services.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center">
        <div className="mb-3 text-4xl">📌</div>
        <p className="mb-1 text-sm font-medium text-slate-300">
          No services configured yet
        </p>
        <p className="mb-4 text-xs text-slate-500">
          Add shortcuts to your most-used apps, dashboards, and tools.
        </p>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500"
        >
          Add your first service
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Search + Category tabs ──────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Category pills */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveCategory(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeCategory === null
                  ? 'bg-accent-600 text-white'
                  : 'bg-surface-800 text-slate-400 hover:bg-surface-700 hover:text-slate-200'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setActiveCategory(activeCategory === cat ? null : cat)
                }
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeCategory === cat
                    ? 'bg-accent-600 text-white'
                    : 'bg-surface-800 text-slate-400 hover:bg-surface-700 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter services…"
            className="w-full rounded-lg border border-slate-700 bg-surface-800 py-1.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 sm:w-56"
          />
        </div>
      </div>

      {/* ── Empty filter result ──────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
          <p className="text-sm text-slate-400">
            No services match &ldquo;{search}&rdquo;
            {activeCategory && (
              <>
                {' '}
                in <span className="text-accent-400">{activeCategory}</span>
              </>
            )}
          </p>
          <button
            onClick={() => {
              setSearch('');
              setActiveCategory(null);
            }}
            className="mt-2 text-xs font-medium text-accent-400 transition hover:text-accent-500"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((svc) => (
          <ServiceCard
            key={svc.id}
            service={svc}
            onEdit={() => onEdit(svc)}
            onDelete={() => onDelete(svc)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Service Card with health dot ─────────────────────────────────────────── */

function ServiceCard({
  service,
  onEdit,
  onDelete,
}: {
  service: Service;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [health, setHealth] = useState<'checking' | 'up' | 'down'>('checking');

  useEffect(() => {
    let cancelled = false;

    // Only health-check local network services
    const isLocal = /^(https?:\/\/)?(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.0\.0\.1)/.test(
      service.url
    );
    if (!isLocal) {
      setHealth('up'); // assume external services are fine
      return;
    }

    async function check() {
      try {
        const res = await fetch(
          `/api/health-check?url=${encodeURIComponent(service.url)}`
        );
        if (!cancelled) {
          const data = await res.json();
          setHealth(data.reachable ? 'up' : 'down');
        }
      } catch {
        if (!cancelled) setHealth('down');
      }
    }

    // Delay checks to avoid thundering herd on page load
    const id = setTimeout(check, 1000 + Math.random() * 2000);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [service.url]);

  return (
    <div className="group relative rounded-xl bg-surface-900 p-4 transition-colors hover:bg-surface-800/80">
      {/* Main click target — opens service URL */}
      <a
        href={service.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        title={`Open ${service.name}`}
      >
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-800 text-xl">
          {service.icon || '🔗'}
        </div>
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium text-white">
            {service.name}
          </h3>
          {/* Health dot */}
          <span
            className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
              health === 'up'
                ? 'bg-green-500'
                : health === 'down'
                  ? 'bg-red-500'
                  : 'bg-slate-600 animate-pulse'
            }`}
            title={
              health === 'up'
                ? 'Reachable'
                : health === 'down'
                  ? 'Unreachable'
                  : 'Checking…'
            }
          />
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{service.url}</p>
      </a>

      {/* Action buttons — visible on hover */}
      <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.preventDefault();
            onEdit();
          }}
          className="rounded-md bg-surface-700 p-1.5 text-slate-400 transition hover:bg-surface-600 hover:text-white"
          title="Edit"
        >
          <PencilIcon />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete();
          }}
          className="rounded-md bg-surface-700 p-1.5 text-slate-400 transition hover:bg-red-500/20 hover:text-red-400"
          title="Delete"
        >
          <TrashIcon />
        </button>
      </div>

      {/* Category badge */}
      {service.category && (
        <div className="mt-3">
          <span className="inline-block rounded-full bg-surface-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
            {service.category}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Inline SVG icons ────────────────────────────────────────────────────── */

function PencilIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}
