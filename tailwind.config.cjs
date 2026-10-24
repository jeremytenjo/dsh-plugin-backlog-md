/** @type {import('tailwindcss').Config} */
module.exports = {
  prefix: 'dshbm-',
  content: ['./src/**/*.{ts,tsx,js,jsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        tooltip: {
          DEFAULT: 'var(--dsw-alias-tooltip-bg)',
          foreground: 'var(--dsw-alias-tooltip-label)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: 'var(--dshbm-font-sans)',
        mono: 'var(--dshbm-font-mono)',
      },
      fontSize: {
        // Nothing in the panel sets type below 11px.
        '2xs': ['11px', '15px'],
      },
    },
  },
  plugins: [],
};
