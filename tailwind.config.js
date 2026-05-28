/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── GOLD (LEGACY / PREMIUM ACCENT) ─────────────────────────────────
        // Fase C: text-gold di "primary action" akan dimigrasi ke text-brand;
        // pemakaian loyalti/trial/achievement tetap pakai gold (alias premium).
        gold: {
          DEFAULT: '#C9A84C',
          light:   '#E8C875',
          dark:    '#A8893A',
        },

        // ── DARK SURFACES — indigo-tinted (1-3% saturation, nyaris tak terasa
        //    tapi harmonis dengan brand indigo baru di Fase B/C) ────────────
        dark: {
          DEFAULT: '#0E0E1A',
          bg:      '#0E0E1A',  // was #0A0A0A
          surface: '#1A1A2E',  // was #1A1A1A
          card:    '#222236',  // was #222222
          border:  '#2A2A40',  // was #2A2A2A
        },

        'off-white': '#F5F5F0',
        muted:       '#6B7280',

        // ── NEW: ELECTRIC INDIGO scale (brand primary) ─────────────────────
        // 500 = brand, 400 = hover, 600 = strong, 300 = "on-anchor" bright,
        // 800–900 = sidebar/anchor backgrounds (deep indigo).
        indigo: {
          50:  '#F3F2F8',
          100: '#E8EAF5',
          200: '#D5D8E8',
          300: '#A5A2FF',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#3F37C7',
          800: '#2D2870',
          900: '#1E1B4B',
        },

        // ── NEW: MINT scale (fresh accent — pertumbuhan, Live, success) ────
        mint: {
          50:  '#F0FDF9',
          100: '#D1FAEC',
          200: '#A4F4D6',
          300: '#5EE3B5',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },

        // ── NEW: SEMANTIC ALIAS (pakai ini di komponen baru Fase B+) ───────
        brand: {
          DEFAULT: '#6366F1',  // indigo-500 — tombol primer, link, fokus
          hover:   '#818CF8',  // indigo-400 — hover state
          strong:  '#4F46E5',  // indigo-600 — text di card terang
          light:   '#A5A2FF',  // indigo-300 — di atas anchor gelap
          anchor:  '#1E1B4B',  // indigo-900 — sidebar/header bg
        },
        fresh: {
          DEFAULT: '#10B981',  // mint-500 — Live, delta naik, success
          hover:   '#34D399',
          strong:  '#059669',
        },
        // Alias premium = gold lama. Pakai ini di Fase C untuk loyalti/trial
        // supaya intent-nya eksplisit (bukan "ini warna kuning" tapi "ini premium").
        premium: {
          DEFAULT: '#C9A84C',
          light:   '#E8C875',
          dark:    '#A8893A',
        },
      },

      backgroundImage: {
        'gold-gradient':  'linear-gradient(135deg, #C9A84C 0%, #E8C875 50%, #C9A84C 100%)',
        'dark-gradient':  'linear-gradient(180deg, #1A1A2E 0%, #0E0E1A 100%)',
        // NEW
        'brand-gradient': 'linear-gradient(135deg, #6366F1 0%, #A5A2FF 50%, #6366F1 100%)',
        'fresh-gradient': 'linear-gradient(135deg, #10B981 0%, #34D399 50%, #10B981 100%)',
      },

      boxShadow: {
        'gold':    '0 0 20px rgba(201, 168, 76, 0.15)',
        'gold-lg': '0 0 40px rgba(201, 168, 76, 0.25)',
        'card':    '0 4px 24px rgba(0, 0, 0, 0.4)',
        // NEW (soft elevation, bukan neon glow — 2026-05-28 user feedback:
        // halo terlalu 'rame' di white card. Bentuknya jadi drop shadow lembut
        // dengan brand tint, bukan box-shadow simetris 0 0 X 0.X).
        'brand':    '0 4px 14px rgba(99, 102, 241, 0.10)',
        'brand-lg': '0 8px 24px rgba(99, 102, 241, 0.14)',
        'fresh':    '0 4px 14px rgba(16, 185, 129, 0.10)',
      },

      animation: {
        'shimmer':     'shimmer 1.5s infinite',
        'pulse-gold':  'pulseGold 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        // NEW
        'pulse-fresh': 'pulseFresh 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-brand': 'pulseBrand 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },

      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseGold: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
        pulseFresh: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.55' },
        },
        pulseBrand: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
}

