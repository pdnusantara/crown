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
        // Selaras dengan landing publik (tone indigo, token --accent #6d5fe8):
        // 500/600 digeser ke violet landing supaya app & landing satu warna.
        indigo: {
          50:  '#F3F4FB',
          100: '#E8E9F5',
          200: '#D5D8E8',
          300: '#A79FF2',
          400: '#8478F0',
          500: '#6D5FE8',
          600: '#5B54D6',
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
          DEFAULT: '#6D5FE8',  // landing --accent — tombol primer, link, fokus
          hover:   '#8478F0',  // violet terang — hover state
          strong:  '#5B54D6',  // landing --accent-deep — text di card terang
          light:   '#A79FF2',  // violet muda — di atas anchor gelap
          anchor:  '#1E1B4B',  // landing --ink-fixed — sidebar/header bg
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
        'brand-gradient': 'linear-gradient(135deg, #6D5FE8 0%, #A79FF2 50%, #6D5FE8 100%)',
        'fresh-gradient': 'linear-gradient(135deg, #10B981 0%, #34D399 50%, #10B981 100%)',
      },

      boxShadow: {
        'gold':    '0 0 20px rgba(201, 168, 76, 0.15)',
        'gold-lg': '0 0 40px rgba(201, 168, 76, 0.25)',
        'card':    '0 4px 24px rgba(0, 0, 0, 0.4)',
        // NEW (2026-05-28 user feedback v2: 'glow masih kebanyakan, hilangkan
        // saja'). Drop shadow netral abu-abu untuk elevasi natural — tanpa
        // warna brand sama sekali. Element tetap punya 'kedalaman' tapi tidak
        // nge-glow. Pakai sangat lembut untuk avatar/logo kecil; lebih dalam
        // untuk kartu besar.
        'brand':    '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'brand-lg': '0 4px 12px rgba(0, 0, 0, 0.10), 0 1px 3px rgba(0, 0, 0, 0.06)',
        'fresh':    '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
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

