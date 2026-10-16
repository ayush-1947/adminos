'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      let preference: string | null = null;
      try {
        preference = localStorage.getItem('os-theme');
      } catch {}
      const enabled = preference === 'dark' || (preference !== 'light' && media.matches);
      document.documentElement.dataset.theme = enabled ? 'dark' : 'light';
      setDark(enabled);
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => {
        const next = !dark;
        document.documentElement.dataset.theme = next ? 'dark' : 'light';
        setDark(next);
        try {
          localStorage.setItem('os-theme', next ? 'dark' : 'light');
        } catch {}
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
