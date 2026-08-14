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
          DEFAULT: '#080b11',
          card: '#0e131f',
          surface: '#151b2b',
          border: '#1f293d',
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
        'card': '0 4px 20px -2px rgba(0, 0, 0, 0.5)'
      }
    },
  },
  plugins: [],
}
