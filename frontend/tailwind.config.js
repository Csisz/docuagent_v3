/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cyberpunk dark palette
        bg:     '#07071a',
        bgmid:  '#0d0d24',
        panel:  'rgba(255,255,255,0.035)',
        // Accent
        neon:   '#ff7820',
        neon2:  '#ff4500',
        // Semantic
        navy:   '#0f2040',
        navy2:  '#162d52',
        // Text
        dim:    '#8888aa',
        dimmer: '#44445a',
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'monospace'],
        serif: ['Source Serif 4', 'serif'],
      },
      boxShadow: {
        glow:  '0 0 16px rgba(255,120,32,0.3)',
        glow2: '0 0 28px rgba(255,120,32,0.45)',
        card:  '0 2px 20px rgba(0,0,0,0.5)',
        card2: '0 8px 48px rgba(0,0,0,0.7)',
      },
      backdropBlur: {
        xs: '4px',
      },
      animation: {
        'fade-up':  'fadeUp 0.35s ease both',
        'pulse-dot': 'pulseDot 2s infinite',
        'spin-slow': 'spin 0.7s linear infinite',
        'shimmer':   'shimmer 1.4s infinite',
      },
      keyframes: {
        fadeUp:   { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.25 } },
        shimmer:  { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
      },
    },
  },
  plugins: [],
}
