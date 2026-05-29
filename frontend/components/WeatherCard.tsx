'use client';

import { useEffect, useState } from 'react';
import type { WeatherResponse } from '@/lib/types';

function getApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return `${base}/api/weather`;
}

export default function WeatherCard() {
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather() {
      try {
        const res = await fetch(getApiUrl());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: WeatherResponse = await res.json();
        if (!cancelled) {
          setWeather(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchWeather();
    // Poll every 15 minutes to match backend cache TTL
    const id = setInterval(fetchWeather, 15 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (!weather && !error) {
    return (
      <div className="rounded-xl bg-surface-900 p-5">
        <div className="skeleton mb-3 h-4 w-20" />
        <div className="skeleton mb-2 h-6 w-16" />
        <div className="skeleton h-3 w-32" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error && !weather) {
    return (
      <div className="rounded-xl bg-surface-900 p-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          Weather
        </p>
        <div className="mb-3">
          <span className="text-lg font-semibold text-slate-500">--°C</span>
        </div>
        <p className="text-xs text-slate-500">Unavailable</p>
      </div>
    );
  }

  // ── Normal state ──────────────────────────────────────────────────────
  const w = weather!;
  const isCold = w.temperature_c < 10;
  const isHot = w.temperature_c > 30;
  const tempColor = isCold ? 'text-blue-400' : isHot ? 'text-red-400' : 'text-white';

  return (
    <div className="rounded-xl bg-surface-900 p-5 transition-colors">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
        Weather
      </p>
      <div className="mb-3">
        <span className={`text-xl font-semibold ${tempColor}`}>
          {w.temperature_c.toFixed(1)}°C
        </span>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        {w.condition_text}
        <br />
        {w.humidity_percent}% humidity · {w.wind_speed_kmh.toFixed(0)} km/h wind
      </p>
    </div>
  );
}
