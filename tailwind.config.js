/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 背景色系
        'bg-deepest': '#0d1117',
        'bg-card': '#161b22',
        'bg-component': '#21262d',
        'border-default': '#30363d',

        // 强调色
        'accent-primary': '#00d4ff',
        'accent-danger': '#ff4444',
        'accent-warning': '#ffaa00',
        'accent-success': '#00cc66',

        // 文字色
        'text-primary': '#e6edf3',
        'text-secondary': '#8b949e',
        'text-muted': '#484f58',
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', 'monospace'],
        'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'number-roll': 'numberRoll 0.3s ease-out',
        'border-breathe': 'borderBreathe 1.5s ease-in-out infinite',
        'goal-flash': 'goalFlash 1s ease-out forwards',
        'chart-smooth': 'chartSmooth 0.5s ease-in-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        numberRoll: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        borderBreathe: {
          '0%, 100%': { boxShadow: '0 0 0 2px rgba(0, 212, 255, 0.3)' },
          '50%': { boxShadow: '0 0 20px 4px rgba(0, 212, 255, 0.6)' },
        },
        goalFlash: {
          '0%': { backgroundColor: 'rgba(0, 212, 255, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
        chartSmooth: {
          '0%': { opacity: '0.5', transform: 'scaleY(0.95)' },
          '100%': { opacity: '1', transform: 'scaleY(1)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 212, 255, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.8), 0 0 30px rgba(0, 212, 255, 0.4)' },
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(0, 212, 255, 0.3)',
        'glow-danger': '0 0 20px rgba(255, 68, 68, 0.3)',
        'glow-warning': '0 0 20px rgba(255, 170, 0, 0.3)',
        'glow-success': '0 0 20px rgba(0, 204, 102, 0.3)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-terminal': 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)',
      },
    },
  },
  plugins: [],
}
