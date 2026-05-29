'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Service, ServicePayload } from '@/lib/types';

const SERVICES_TABLE = 'services';

export type ModalMode = 'add' | 'edit' | 'delete';

interface ServiceModalProps {
  isOpen: boolean;
  mode: ModalMode;
  service: Service | null;
  onClose: () => void;
  onSaved: () => void; // callback to refresh the parent list
}

export default function ServiceModal({
  isOpen,
  mode,
  service,
  onClose,
  onSaved,
}: ServiceModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Populate form when editing ────────────────────────────────────────
  useEffect(() => {
    if (service && (mode === 'edit' || mode === 'delete')) {
      setName(service.name);
      setUrl(service.url);
      setIcon(service.icon ?? '');
      setCategory(service.category ?? '');
    } else {
      setName('');
      setUrl('');
      setIcon('');
      setCategory('');
    }
    setError(null);
  }, [service, mode, isOpen]);

  // ── Escape key to close ───────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // ── Save handler (add or update) ──────────────────────────────────────
  const handleSave = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      // Validate
      const trimmedName = name.trim();
      let trimmedUrl = url.trim();
      if (!trimmedName || !trimmedUrl) {
        setError('Name and URL are required.');
        return;
      }

      // Prepend https:// if no protocol is specified
      if (!/^https?:\/\//i.test(trimmedUrl)) {
        trimmedUrl = `https://${trimmedUrl}`;
      }

      setSaving(true);

      const payload: ServicePayload = {
        name: trimmedName,
        url: trimmedUrl,
        icon: icon.trim() || null,
        category: category.trim() || null,
      };

      if (mode === 'add') {
        const { error: err } = await supabase
          .from(SERVICES_TABLE)
          .insert({ ...payload, sort_order: 0 });
        if (err) setError(err.message);
        else {
          onSaved();
          onClose();
        }
      } else if (mode === 'edit' && service) {
        const { error: err } = await supabase
          .from(SERVICES_TABLE)
          .update(payload)
          .eq('id', service.id);
        if (err) setError(err.message);
        else {
          onSaved();
          onClose();
        }
      }

      setSaving(false);
    },
    [name, url, icon, category, mode, service, onSaved, onClose]
  );

  // ── Delete handler ────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!service) return;
    setSaving(true);
    setError(null);

    const { error: err } = await supabase
      .from(SERVICES_TABLE)
      .delete()
      .eq('id', service.id);

    if (err) setError(err.message);
    else {
      onSaved();
      onClose();
    }

    setSaving(false);
  }, [service, onSaved, onClose]);

  // ── Don't render if closed ────────────────────────────────────────────
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-surface-900 p-6 shadow-2xl">
        {/* ── Header ───────────────────────────────────────────────── */}
        <h2 className="mb-1 text-lg font-semibold text-white">
          {mode === 'add' && 'Add Service'}
          {mode === 'edit' && 'Edit Service'}
          {mode === 'delete' && 'Delete Service'}
        </h2>
        {mode === 'delete' ? (
          <p className="mb-5 text-sm text-slate-400">
            Are you sure you want to remove{' '}
            <strong className="text-white">{service?.name}</strong>? This
            action cannot be undone.
          </p>
        ) : (
          <p className="mb-5 text-sm text-slate-400">
            {mode === 'add'
              ? 'Add a shortcut to a service or web app.'
              : 'Update the details for this service.'}
          </p>
        )}

        {/* ── Error ────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ── Form (add / edit) ─────────────────────────────────────── */}
        {mode !== 'delete' && (
          <form onSubmit={handleSave} className="space-y-4">
            <Field label="Name" value={name} onChange={setName} placeholder="e.g. Pi-Hole Admin" autoFocus />
            <Field label="URL" value={url} onChange={setUrl} placeholder="e.g. pi.hole/admin" type="url" />
            <Field label="Icon (emoji)" value={icon} onChange={setIcon} placeholder="e.g. 🛡️" optional />
            <Field label="Category" value={category} onChange={setCategory} placeholder="e.g. Networking" optional />

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving…' : mode === 'add' ? 'Add Service' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        {/* ── Delete confirmation ───────────────────────────────────── */}
        {mode === 'delete' && (
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Reusable form field ─────────────────────────────────────────────────── */

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  optional = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  optional?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400">
        {label}
        {optional && <span className="ml-1 text-slate-600">(optional)</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-slate-700 bg-surface-800 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
      />
    </div>
  );
}
