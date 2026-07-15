/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        bg: '#F8FAFC',
        primary: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
          light: '#EFF6FF',
        },
        success: {
          DEFAULT: '#22C55E',
          light: '#F0FDF4',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FFFBEB',
        },
        danger: {
          DEFAULT: '#EF4444',
          light: '#FEF2F2',
        },
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.06)',
        'card-hover': '0 4px 12px rgba(16, 24, 40, 0.10)',
        popover: '0 8px 24px rgba(16, 24, 40, 0.14)',
      },
    },
  },
  plugins: [],
};
