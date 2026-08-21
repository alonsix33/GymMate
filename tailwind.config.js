/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta profesional - Negro puro para OLED
        dark: {
          // FIERRO: la utilidad bg-dark-bg del <body> gana por especificidad a
          // la regla de main.css, asi que el suelo tambien sale del token.
          bg: 'var(--page-bg)',
          surface: '#1e293b',
          border: 'rgba(255, 255, 255, 0.05)',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          subtle: '#1d4ed8',
        },
        text: {
          primary: '#f1f5f9',
          secondary: '#94a3b8',
          muted: '#64748b',
        },
        status: {
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#06b6d4',
        },
      },
      fontFamily: {
        // FIERRO: las familias reales viven en src/styles/tokens.css.
        sans: ['Instrument Sans', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Archivo', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        shake: 'shake 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-5px)' },
          '75%': { transform: 'translateX(5px)' },
        },
      },
    },
  },
  plugins: [],
};
