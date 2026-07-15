/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#0A0D13',
        surface: '#12151D',
        'surface-raised': '#191D27',
        'surface-hover': '#1E2330',
        ink: '#F2F3F5',
        'ink-soft': '#9BA3AF',
        'ink-faint': '#5B6472',
        line: 'rgba(255,255,255,0.07)',
        'line-strong': 'rgba(255,255,255,0.14)',
        navy: '#3B82F6',
        'navy-soft': '#60A0FA',
        purple: '#8B5CF6',
        tier: {
          critical: '#EF4444',
          'critical-bg': 'rgba(239,68,68,0.12)',
          'critical-border': 'rgba(239,68,68,0.28)',
          high: '#F59E0B',
          'high-bg': 'rgba(245,158,11,0.12)',
          'high-border': 'rgba(245,158,11,0.28)',
          medium: '#3B82F6',
          'medium-bg': 'rgba(59,130,246,0.12)',
          'medium-border': 'rgba(59,130,246,0.28)',
          low: '#10B981',
          'low-bg': 'rgba(16,185,129,0.12)',
          'low-border': 'rgba(16,185,129,0.28)',
        },
      },
      fontFamily: {
        display: ['Poppins', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        sans: ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
