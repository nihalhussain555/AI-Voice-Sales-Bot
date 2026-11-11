/** @type {import('tailwindcss').Config} */
// Every colour is an rgb() channel triplet declared in styles/index.css, so
// `bg-surface/70` keeps working while the whole palette flips with
// <html data-theme="...">. Adding a hardcoded slate-* class bypasses theming.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        'canvas-deep': 'rgb(var(--canvas-deep) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-hover': 'rgb(var(--primary-hover) / <alpha-value>)',
        'primary-ink': 'rgb(var(--primary-ink) / <alpha-value>)',
        violet: 'rgb(var(--violet) / <alpha-value>)',
        electric: 'rgb(var(--electric) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        focus: 'rgb(var(--focus) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(var(--shadow-1)), 0 8px 24px -12px rgb(var(--shadow-2))',
        lifted: '0 2px 4px rgb(var(--shadow-1)), 0 20px 44px -20px rgb(var(--shadow-2))',
        glow: '0 0 0 1px rgb(var(--primary) / 0.35), 0 12px 40px -12px rgb(var(--primary) / 0.5)',
        inset: 'inset 0 1px 0 rgb(var(--highlight) / 0.06)',
      },
      borderRadius: {
        card: '16px',
        field: '10px',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in': 'slideIn 0.26s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scaleIn 0.18s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        'pulse-ring': 'pulseRing 2s ease-out infinite',
        'wave-idle': 'waveIdle 1.8s ease-in-out infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        ripple: 'ripple 2s linear infinite',
        'indeterminate': 'indeterminate 1.25s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { opacity: '0.45' },
          '50%': { opacity: '0.9' },
          '100%': { opacity: '0.45' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.85)', opacity: '0.6' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        waveIdle: {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        indeterminate: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(320%)' },
        },
      },
    },
  },
  plugins: [],
}
