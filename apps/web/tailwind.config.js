/** @type {import('tailwindcss').Config} */
// Signal Graphite — neutral graphite surfaces + signature lime accent,
// semantic data colors (up mint / down coral / warn amber / info sky).
// Color NAMES are historical roles kept for backward compatibility with
// existing class names; only the hex values define the theme.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // accent (was cyan role) — signature lime
        cyan: { 50: '#FAFDEF', 100: '#F3FAD8', 200: '#EAF5B3', 300: '#DFF28E', 400: '#C8F169', 500: '#A9D845', 600: '#8BB92E', 700: '#6D9424', 800: '#55731F', 900: '#405818', 950: '#22300B' },
        // info (was blue role)
        blue: { 50: '#EFF7FF', 100: '#DEEDFF', 200: '#B8DBFF', 300: '#8AC4FF', 400: '#6FC7FF', 500: '#45A9F5', 600: '#2E8CDA', 700: '#256FB0', 800: '#205A8E', 900: '#1E4B74', 950: '#132C47' },
        // AI accent (was purple/violet/fuchsia roles)
        purple: { 50: '#F4F2FF', 100: '#EAE6FF', 200: '#D9D2FF', 300: '#C4B5FD', 400: '#A78BFA', 500: '#8B5CF6', 600: '#7C4DEF', 700: '#6B3FD8', 800: '#5936AE', 900: '#4A2F8C', 950: '#2A1A57' },
        violet: { 50: '#F4F2FF', 100: '#EAE6FF', 200: '#D9D2FF', 300: '#C4B5FD', 400: '#A78BFA', 500: '#8B5CF6', 600: '#7C4DEF', 700: '#6B3FD8', 800: '#5936AE', 900: '#4A2F8C', 950: '#2A1A57' },
        fuchsia: { 50: '#F4F2FF', 100: '#EAE6FF', 200: '#D9D2FF', 300: '#C4B5FD', 400: '#A78BFA', 500: '#8B5CF6', 600: '#7C4DEF', 700: '#6B3FD8', 800: '#5936AE', 900: '#4A2F8C', 950: '#2A1A57' },
        // bullish data (was emerald/green roles)
        emerald: { 50: '#EAFBF3', 100: '#D0F6E3', 200: '#A3EDC9', 300: '#7BE4B2', 400: '#57DFA5', 500: '#3DDC97', 600: '#27B87A', 700: '#1E9262', 800: '#1B744F', 900: '#175E41', 950: '#0A3524' },
        green: { 50: '#EAFBF3', 100: '#D0F6E3', 200: '#A3EDC9', 300: '#83E7BB', 400: '#5CE3A9', 500: '#3FD196', 600: '#27B87A', 700: '#1E9262', 800: '#1B744F', 900: '#175E41', 950: '#0A3524' },
        // bearish data (was rose/red roles)
        rose: { 50: '#FFF0F3', 100: '#FFDDE5', 200: '#FFC0CE', 300: '#FFA3B8', 400: '#FF8AA5', 500: '#FF6B8A', 600: '#E84E70', 700: '#C13A58', 800: '#9D3149', 900: '#832C40', 950: '#4C1321' },
        red: { 50: '#FFF0F3', 100: '#FFDDE5', 200: '#FFC0CE', 300: '#FF9AB3', 400: '#FF7C99', 500: '#F4547A', 600: '#D93E63', 700: '#B32F4F', 800: '#932B45', 900: '#7A283C', 950: '#47111F' },
        // warning data (was amber/orange roles)
        amber: { 50: '#FFF9EB', 100: '#FFF0C7', 200: '#FFE39B', 300: '#FFD477', 400: '#FFCA5F', 500: '#FFC24B', 600: '#E0A22F', 700: '#B77E1F', 800: '#8F611D', 900: '#75501B', 950: '#432A0B' },
        orange: { 50: '#FFF9EB', 100: '#FFF0C7', 200: '#FFE39B', 300: '#FFD477', 400: '#FFCA5F', 500: '#FFC24B', 600: '#E0A22F', 700: '#B77E1F', 800: '#8F611D', 900: '#75501B', 950: '#432A0B' },
        // graphite surfaces
        background: {
          DEFAULT: '#0B0D10',
          card: '#12151A',
          surface: '#171B22',
          border: '#232A35',
          hover: '#1D222B'
        },
        cyber: {
          cyan: '#C8F169',
          emerald: '#3DDC97',
          green: '#57DFA5',
          amber: '#FFC24B',
          ruby: '#FF6B8A',
          red: '#E84E70',
          purple: '#8B5CF6',
          blue: '#6FC7FF'
        },
        accent: {
          violet: '#A78BFA',
          gold: '#FFC24B',
          sky: '#6FC7FF',
          rose: '#FF6B8A'
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'sans-serif'],
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
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
