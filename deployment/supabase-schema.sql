-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Database Schema for Home Dashboard
-- ─────────────────────────────────────────────────────────────────────────────
-- Run this in the Supabase SQL Editor (https://app.supabase.com → SQL Editor)
-- or via the CLI: supabase db push
-- ─────────────────────────────────────────────────────────────────────────────

-- Services table: stores bookmarks/shortcuts for the dashboard
CREATE TABLE IF NOT EXISTS public.services (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    icon        TEXT,                     -- emoji or icon URL (e.g. "🛡️" or "https://...")
    category    TEXT,                     -- grouping label (e.g. "Networking", "Media")
    sort_order  INT NOT NULL DEFAULT 0,   -- manual ordering (lower = first)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for sorted queries (used by the dashboard grid)
CREATE INDEX IF NOT EXISTS idx_services_sort
    ON public.services(sort_order ASC, created_at DESC);

-- ── RLS: open read since we use the anon key with no auth ──────────────────
-- For a single-user LAN dashboard this is fine. For multi-user setups,
-- add a `user_id UUID REFERENCES auth.users(id)` column and restrict policies.

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Allow anyone with the anon key to read
CREATE POLICY "Allow read access"
    ON public.services FOR SELECT
    USING (true);

-- Allow anyone with the anon key to insert
CREATE POLICY "Allow insert access"
    ON public.services FOR INSERT
    WITH CHECK (true);

-- Allow anyone with the anon key to update
CREATE POLICY "Allow update access"
    ON public.services FOR UPDATE
    USING (true);

-- Allow anyone with the anon key to delete
CREATE POLICY "Allow delete access"
    ON public.services FOR DELETE
    USING (true);

-- ── Sample data (optional) ──────────────────────────────────────────────────
-- INSERT INTO public.services (name, url, icon, category, sort_order) VALUES
--     ('Pi-Hole Admin', 'http://pi.hole/admin', '🛡️', 'Networking', 1),
--     ('Portainer',    'https://portainer.local',  '🐳', 'Management', 2),
--     ('Jellyfin',     'http://jellyfin.local',    '🎬', 'Media',      3);
