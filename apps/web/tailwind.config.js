/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#0a0e17',
          card: '#0f1420',
          surface: '#151c2c',
          border: '#1c2438',
          hover: '#1a2236'
        },
        cyber: {
          cyan: '#00f2fe',
          emerald: '#10b981',
          green: '#34d399',
          amber: '#f59e0b',
          ruby: '#f43f5e',
          red: '#ef4444',
          purple: '#8b5cf6',
          blue: '#3b82f6'
        },
        accent: {
          violet: '#a78bfa',
          gold: '#fbbf24',
          sky: '#38bdf8',
          rose: '#fb7185'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      boxShadow: {
        'glow-cyan': '0 0 20px -5px rgba(0, 242, 254, 0.3)',
        'glow-emerald': '0 0 20px -5px rgba(16, 185, 129, 0.3)',
        'glow-ruby': '0 0 20px -5px rgba(244, 63, 94, 0.3)',
        'glow-gold': '0 0 20px -5px rgba(251, 191, 36, 0.3)',
        'glow-violet': '0 0 20px -5px rgba(167, 139, 250, 0.3)',
        'card': '0 4px 24px -4px rgba(0, 0, 0, 0.5)',
        'card-hover': '0 8px 32px -4px rgba(0, 0, 0, 0.6)',
        'elevated': '0 8px 40px -8px rgba(0, 0, 0, 0.7)'
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
