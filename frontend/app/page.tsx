'use client';

import { useState, useCallback } from 'react';
import SystemMonitor from '@/components/SystemMonitor';
import ServicesGrid from '@/components/ServicesGrid';
import ServiceModal, { ModalMode } from '@/components/ServiceModal';
import type { Service } from '@/lib/types';
import { useServices } from '@/components/ServicesGrid';

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const { services, loading, error, refresh } = useServices();

  const handleAdd = useCallback(() => {
    setModalMode('add');
    setSelectedService(null);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((service: Service) => {
    setModalMode('edit');
    setSelectedService(service);
    setModalOpen(true);
  }, []);

  const handleDelete = useCallback((service: Service) => {
    setModalMode('delete');
    setSelectedService(service);
    setModalOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setModalOpen(false);
    setSelectedService(null);
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Home Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            System overview &amp; service shortcuts
          </p>
        </div>

        {/* Connection status dot */}
        <div className="flex items-center gap-2 rounded-full bg-surface-800/50 px-3 py-1.5 text-xs text-slate-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          Live
        </div>
      </header>

      {/* ── System Monitor ─────────────────────────────────────────── */}
      <section className="mb-8">
        <SystemMonitor />
      </section>

      {/* ── Services Grid ──────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Services</h2>
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 focus:ring-offset-surface-950"
          >
            <PlusIcon />
            Add Service
          </button>
        </div>

        <ServicesGrid
          services={services}
          loading={loading}
          error={error}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      </section>

      {/* ── Service Modal ──────────────────────────────────────────── */}
      <ServiceModal
        isOpen={modalOpen}
        mode={modalMode}
        service={selectedService}
        onClose={handleClose}
        onSaved={refresh}
      />
    </main>
  );
}

/** Simple inline SVG to avoid an icon dependency. */
function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
