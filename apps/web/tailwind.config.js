/** @type {import('tailwindcss').Config} */
// Theme engine (2026-09-16): color values resolve to CSS variables defined in
// src/theme.css (`--t-*`), switched via <html data-theme="dark|l1…l5">.
// Dark values are identical to the previous Signal Graphite palette, so the
// default theme is unchanged. Scale steps without a var entry keep literal
// values (rarely used on themed surfaces).
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // surfaces
        background: {
          DEFAULT: 'rgb(var(--t-bg-rgb) / <alpha-value>)',
          card: 'rgb(var(--t-surface-rgb) / <alpha-value>)',
          surface: 'rgb(var(--t-surface-2-rgb) / <alpha-value>)',
          border: 'rgb(var(--t-line-rgb) / <alpha-value>)',
          hover: 'rgb(var(--t-hover-rgb) / <alpha-value>)'
        },
        // primary text role (dark: white; light themes: near-black)
        white: 'rgb(var(--t-white-rgb) / <alpha-value>)',
        // accent (lime family), was cyan role
        cyan: {
          50: '#FAFDEF',
          100: 'rgb(var(--t-cyan-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--t-cyan-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-cyan-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-cyan-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-cyan-500-rgb) / <alpha-value>)',
          600: '#8BB92E',
          700: '#6D9424',
          800: '#55731F',
          900: '#405818',
          950: 'rgb(var(--t-cyan-950-rgb) / <alpha-value>)'
        },
        // info (was blue role)
        blue: {
          50: '#EFF7FF',
          100: '#DEEDFF',
          200: '#B8DBFF',
          300: 'rgb(var(--t-blue-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-blue-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-blue-500-rgb) / <alpha-value>)',
          600: '#2E8CDA',
          700: '#256FB0',
          800: '#205A8E',
          900: '#1E4B74',
          950: 'rgb(var(--t-blue-950-rgb) / <alpha-value>)'
        },
        // AI accent (purple / violet / fuchsia roles share one ramp)
        purple: {
          50: '#F4F2FF',
          100: 'rgb(var(--t-purple-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--t-purple-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-purple-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-purple-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-purple-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--t-purple-600-rgb) / <alpha-value>)',
          700: '#6B3FD8',
          800: '#5936AE',
          900: '#4A2F8C',
          950: 'rgb(var(--t-purple-950-rgb) / <alpha-value>)'
        },
        violet: {
          50: '#F4F2FF',
          100: 'rgb(var(--t-purple-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--t-purple-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-purple-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-purple-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-purple-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--t-purple-600-rgb) / <alpha-value>)',
          700: '#6B3FD8',
          800: '#5936AE',
          900: '#4A2F8C',
          950: 'rgb(var(--t-purple-950-rgb) / <alpha-value>)'
        },
        fuchsia: {
          50: '#F4F2FF',
          100: 'rgb(var(--t-purple-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--t-purple-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-purple-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-purple-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-purple-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--t-purple-600-rgb) / <alpha-value>)',
          700: '#6B3FD8',
          800: '#5936AE',
          900: '#4A2F8C',
          950: 'rgb(var(--t-purple-950-rgb) / <alpha-value>)'
        },
        // bullish data (emerald / green roles)
        emerald: {
          50: 'rgb(var(--t-emerald-50-rgb) / <alpha-value>)',
          100: '#D0F6E3',
          200: 'rgb(var(--t-emerald-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-emerald-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-emerald-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-emerald-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--t-emerald-600-rgb) / <alpha-value>)',
          700: '#1E9262',
          800: '#1B744F',
          900: '#175E41',
          950: '#0A3524'
        },
        green: {
          50: 'rgb(var(--t-emerald-50-rgb) / <alpha-value>)',
          100: '#D0F6E3',
          200: 'rgb(var(--t-emerald-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-emerald-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-emerald-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-emerald-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--t-emerald-600-rgb) / <alpha-value>)',
          700: '#1E9262',
          800: '#1B744F',
          900: '#175E41',
          950: '#0A3524'
        },
        // bearish data (rose / red roles)
        rose: {
          50: 'rgb(var(--t-rose-50-rgb) / <alpha-value>)',
          100: '#FFDDE5',
          200: 'rgb(var(--t-rose-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-rose-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-rose-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-rose-500-rgb) / <alpha-value>)',
          600: '#E84E70',
          700: '#C13A58',
          800: '#9D3149',
          900: '#832C40',
          950: 'rgb(var(--t-rose-950-rgb) / <alpha-value>)'
        },
        red: {
          50: 'rgb(var(--t-rose-50-rgb) / <alpha-value>)',
          100: '#FFDDE5',
          200: 'rgb(var(--t-rose-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-rose-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-rose-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-rose-500-rgb) / <alpha-value>)',
          600: '#D93E63',
          700: '#B32F4F',
          800: '#932B45',
          900: '#7A283C',
          950: '#47111F'
        },
        // warning data (amber / orange roles)
        amber: {
          50: '#FFF9EB',
          100: 'rgb(var(--t-amber-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--t-amber-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-amber-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-amber-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-amber-500-rgb) / <alpha-value>)',
          600: '#E0A22F',
          700: '#B77E1F',
          800: '#8F611D',
          900: '#75501B',
          950: '#432A0B'
        },
        orange: {
          50: '#FFF9EB',
          100: 'rgb(var(--t-amber-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--t-amber-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-amber-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-amber-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-amber-500-rgb) / <alpha-value>)',
          600: '#E0A22F',
          700: '#B77E1F',
          800: '#8F611D',
          900: '#75501B',
          950: '#432A0B'
        },
        // neutral text scale (default tailwind slate in dark, inverted in light)
        slate: {
          50: 'rgb(var(--t-slate-50-rgb) / <alpha-value>)',
          100: 'rgb(var(--t-slate-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--t-slate-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--t-slate-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--t-slate-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--t-slate-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--t-slate-600-rgb) / <alpha-value>)',
          700: 'rgb(var(--t-slate-700-rgb) / <alpha-value>)',
          800: 'rgb(var(--t-slate-800-rgb) / <alpha-value>)',
          900: 'rgb(var(--t-slate-900-rgb) / <alpha-value>)',
          950: 'rgb(var(--t-slate-950-rgb) / <alpha-value>)'
        },
        cyber: {
          cyan: 'rgb(var(--t-cyan-400-rgb) / <alpha-value>)',
          emerald: 'rgb(var(--t-emerald-500-rgb) / <alpha-value>)',
          green: 'rgb(var(--t-emerald-400-rgb) / <alpha-value>)',
          amber: 'rgb(var(--t-amber-500-rgb) / <alpha-value>)',
          ruby: 'rgb(var(--t-rose-500-rgb) / <alpha-value>)',
          red: '#E84E70',
          purple: 'rgb(var(--t-purple-500-rgb) / <alpha-value>)',
          blue: 'rgb(var(--t-blue-400-rgb) / <alpha-value>)'
        },
        accent: {
          violet: 'rgb(var(--t-purple-400-rgb) / <alpha-value>)',
          gold: 'rgb(var(--t-amber-500-rgb) / <alpha-value>)',
          sky: 'rgb(var(--t-blue-400-rgb) / <alpha-value>)',
          rose: 'rgb(var(--t-rose-500-rgb) / <alpha-value>)'
        }
      },
      fontFamily: {
        sans: ['Quicksand', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'sans-serif'],
        display: ['Quicksand', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        'glow-cyan': 'none',
        'glow-emerald': 'none',
        'glow-ruby': 'none',
        'glow-gold': 'none',
        'glow-violet': 'none',
        'card': '0 8px 24px rgba(0, 0, 0, 0.16)',
        'card-hover': '0 10px 28px rgba(0, 0, 0, 0.2)',
        'elevated': '0 18px 44px rgba(0, 0, 0, 0.35)'
      },
      keyframes: {
        'fade-slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      },
      animation: {
        'fade-slide-up': 'fade-slide-up 0.4s ease-out',
        'fade-in': 'fade-in 0.3s ease-out'
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem'
      }
    },
  },
  plugins: [],
}
