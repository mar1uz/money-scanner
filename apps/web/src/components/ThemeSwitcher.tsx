import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Moon, Palette, Sun } from 'lucide-react';

export type ThemeId = 'dark' | 'l1' | 'l2' | 'l3' | 'l4' | 'l5';

interface ThemeOption {
  id: ThemeId;
  label: string;
  hint: string;
  swatch: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'l1', label: 'L1 · Paper', hint: 'alb rece, minimal', swatch: '#F5F7FA' },
  { id: 'l2', label: 'L2 · Ivory', hint: 'alb cald, de hârtie', swatch: '#F7F4EC' },
  { id: 'l3', label: 'L3 · Liquid', hint: 'sticlă luminoasă', swatch: '#F2F5F9' },
  { id: 'l4', label: 'L4 · Mint', hint: 'verde proaspăt', swatch: '#E9F5EE' },
  { id: 'l5', label: 'L5 · Sorbet', hint: 'pastel multicolor', swatch: '#F6F0FF' }
];

const STORAGE_KEY = 'ms-theme';

export const getStoredTheme = (): ThemeId => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value && ['dark', 'l1', 'l2', 'l3', 'l4', 'l5'].includes(value)) return value as ThemeId;
  } catch {
    /* storage unavailable */
  }
  return 'dark';
};

export const applyTheme = (id: ThemeId) => {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable */
  }
};

export const ThemeSwitcher: React.FC = () => {
  const [theme, setTheme] = useState<ThemeId>(getStoredTheme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const isLight = theme !== 'dark';

  const select = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="theme-switcher">
      <button
        type="button"
        className={`theme-switcher-btn ${isLight ? 'is-light' : ''}`}
        onClick={() => setOpen(value => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Alege tema (zi / seară)"
        title="Temă: zi / seară"
      >
        {isLight ? <Sun size={15} /> : <Moon size={15} />}
        <ChevronDown size={11} className="chev" />
      </button>

      {open && (
        <div className="theme-menu" role="listbox" aria-label="Alege tema">
          <div className="theme-menu-head">
            <Palette size={13} /> Temă
          </div>

          <button type="button" role="option" aria-selected={theme === 'dark'} data-active={theme === 'dark'} onClick={() => select('dark')}>
            <span className="sw sw-dark">
              <Moon size={12} />
            </span>
            <span className="tx">
              <b>Dark</b>
              <i>seara · ca până acum</i>
            </span>
            {theme === 'dark' && <Check size={15} className="check" />}
          </button>

          <div className="theme-menu-sep" />

          {THEME_OPTIONS.map(option => (
            <button key={option.id} type="button" role="option" aria-selected={theme === option.id} data-active={theme === option.id} onClick={() => select(option.id)}>
              <span className="sw" style={{ background: option.swatch }}>
                <Sun size={11} className="sun" />
              </span>
              <span className="tx">
                <b>{option.label}</b>
                <i>{option.hint}</i>
              </span>
              {theme === option.id && <Check size={15} className="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
