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

-- ── Uptime Monitor: target URLs to probe ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.uptime_targets (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name             TEXT NOT NULL,               -- display label (e.g. "Pi-Hole")
    url              TEXT NOT NULL,               -- URL to probe (e.g. "http://pi.hole/admin")
    interval_seconds INT NOT NULL DEFAULT 300,    -- probe frequency (default 5 min)
    enabled          BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Uptime Monitor: individual check results ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.uptime_results (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    target_id   BIGINT NOT NULL REFERENCES public.uptime_targets(id) ON DELETE CASCADE,
    reachable   BOOLEAN NOT NULL,
    latency_ms  INT NOT NULL DEFAULT 0,
    error       TEXT,                            -- error message if unreachable
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for querying results by target and time
CREATE INDEX IF NOT EXISTS idx_uptime_results_target_id
    ON public.uptime_results(target_id);
CREATE INDEX IF NOT EXISTS idx_uptime_results_checked_at
    ON public.uptime_results(checked_at DESC);

-- Optional: auto-cleanup of old results (keep last 30 days)
-- Uncomment if the table grows too large over time:
-- CREATE OR REPLACE FUNCTION cleanup_old_uptime_results()
-- RETURNS void AS $$
-- BEGIN
--     DELETE FROM public.uptime_results
--     WHERE checked_at < now() - INTERVAL '30 days';
-- END;
-- $$ LANGUAGE plpgsql;
-- SELECT cron.schedule('cleanup-uptime-results', '0 3 * * *', 'SELECT cleanup_old_uptime_results()');

-- ── RLS: open access (single-user LAN dashboard, same pattern as services) ───

ALTER TABLE public.uptime_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uptime_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on uptime_targets"
    ON public.uptime_targets FOR ALL
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on uptime_results"
    ON public.uptime_results FOR ALL
    USING (true) WITH CHECK (true);

-- ── Sample data (optional) ──────────────────────────────────────────────────
-- INSERT INTO public.services (name, url, icon, category, sort_order) VALUES
--     ('Pi-Hole Admin', 'http://pi.hole/admin', '🛡️', 'Networking', 1),
--     ('Portainer',    'https://portainer.local',  '🐳', 'Management', 2),
--     ('Jellyfin',     'http://jellyfin.local',    '🎬', 'Media',      3);

-- ── Sample uptime targets ───────────────────────────────────────────────────
INSERT INTO public.uptime_targets (name, url, interval_seconds) VALUES
    ('Pi-Hole DNS',  'http://127.0.0.1:80/admin/api.php', 120),
    ('Dashboard API', 'http://127.0.0.1:8081/api/stats',  60),
     ('Google DNS',   'https://8.8.8.8',                   300);
