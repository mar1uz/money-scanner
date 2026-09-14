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
        cyan: { 50: '#f7fce9', 100: '#edf8cb', 200: '#dfefa7', 300: '#d2ea8c', 400: '#c5e478', 500: '#a4c65b', 600: '#819e43', 700: '#607832', 800: '#43582c', 900: '#303e25', 950: '#1b2516' },
        blue: { 50: '#effcf5', 100: '#d9f8e7', 200: '#b6efcf', 300: '#7ee0ad', 400: '#45cb88', 500: '#20ae6c', 600: '#168b56', 700: '#166f48', 800: '#15583b', 900: '#134932', 950: '#08291c' },
        purple: { 50: '#f6fbea', 100: '#ebf6d1', 200: '#d9edaa', 300: '#bfdf78', 400: '#a2cd4e', 500: '#83b32f', 600: '#658f22', 700: '#506e20', 800: '#42571f', 900: '#394a1e', 950: '#1d290b' },
        violet: { 50: '#f4fceb', 100: '#e5f8d4', 200: '#cbf0ad', 300: '#a9e37b', 400: '#84d14e', 500: '#65b82f', 600: '#4c9222', 700: '#3d7020', 800: '#355a20', 900: '#2e4b1f', 950: '#16290c' },
        background: {
          DEFAULT: '#181f13',
          card: '#24301f',
          surface: '#2e3b28',
          border: '#485b3d',
          hover: '#35452e'
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
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Helvetica Neue', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'sans-serif'],
        mono: ['-apple-system', 'BlinkMacSystemFont', 'sans-serif']
      },
      boxShadow: {
        'glow-cyan': 'none',
        'glow-emerald': 'none',
        'glow-ruby': 'none',
        'glow-gold': 'none',
        'glow-violet': 'none',
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
