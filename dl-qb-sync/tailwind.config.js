/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Escala un paso mas grande que la de Tailwind por defecto: la app se usa
      // horas seguidas y con 12-14px se leia pequena. Nada baja de 13px.
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],
        sm: ['0.9375rem', { lineHeight: '1.375rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.1875rem', { lineHeight: '1.625rem' }],
        xl: ['1.375rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.625rem', { lineHeight: '2rem' }],
      },
      colors: {
        bg: '#F7F8FA',
        // Azul cielo de la barra del logo de Dental One (#5BC8F3), oscurecido
        // lo justo para que el texto y los botones pasen 4.5:1 sobre blanco.
        primary: {
          DEFAULT: '#0B76A6',
          hover: '#09618A',
          light: '#E8F6FC',
          brand: '#5BC8F3',
        },
        success: {
          DEFAULT: '#1F7A4D',
          light: '#E3F6EA',
        },
        warning: {
          DEFAULT: '#9A5B06',
          light: '#FFF7E6',
        },
        danger: {
          DEFAULT: '#C4242A',
          light: '#FDEDEC',
        },
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        // Las tarjetas en reposo se separan solo por el borde; la sombra queda
        // para lo que flota (menus, popovers, modales).
        card: 'none',
        'card-hover': '0 2px 8px rgba(16, 24, 40, 0.06)',
        popover: '0 8px 24px rgba(16, 24, 40, 0.14)',
      },
    },
  },
  plugins: [],
};
