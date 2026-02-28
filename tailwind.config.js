/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0f1a',
        surface: '#111827',
        border: '#1e293b',
        primary: '#f1f5f9',
        secondary: 'rgba(241, 245, 249, 0.5)',
        accent: '#60a5fa',
        strain: {
          low: '#22c55e',
          medium: '#eab308',
          high: '#ef4444',
        }
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'monospace'],
        sans: ['IBM Plex Sans', 'sans-serif'],
      },
      fontSize: {
        'display': ['72px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'stat': ['48px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'stat-lg': ['36px', { lineHeight: '1', letterSpacing: '-0.01em' }],
        'stat-md': ['24px', { lineHeight: '1' }],
        'stat-sm': ['20px', { lineHeight: '1' }],
        'label': ['10px', { lineHeight: '1', letterSpacing: '0.1em' }],
      }
    },
  },
  plugins: [],
}
