import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

// Flat config (ESLint 9). Tujuan utama: GERBANG KEBENARAN, bukan gaya.
// Aturan `no-undef` di sinilah yang akan menangkap bug kelas
// "api is not defined" (import lupa) SEBELUM ke-deploy.
//
// Filosofi: error = bug nyata yang menggagalkan deploy; warn = utang
// kerapian yang tidak memblokir. Codebase ini belum pernah di-lint, jadi
// aturan berisik (gaya, hooks-compiler v7) sengaja diturunkan ke warn/off
// agar gerbang tetap bisa lolos & tepercaya.
export default [
  {
    ignores: [
      'dist/**',
      'dev-dist/**',
      '.deploy/**',
      'node_modules/**',
      'backend/**', // backend = CommonJS/Node, world berbeda — lint terpisah nanti
      'public/**',
      '*.config.js', // file config (vite/eslint) konteks Node
    ],
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    // Komentar eslint-disable yang sudah mati = WARNING (kebersihan), bukan
    // error — supaya tidak memblokir deploy seperti bug nyata.
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,

      // --- Gerbang utama: variabel tak terdefinisi = ERROR (blokir deploy) ---
      'no-undef': 'error',

      // --- Hooks klasik bernilai tinggi (hindari aturan compiler v7 yg berisik) ---
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // --- Turunkan kebisingan: fokus ke bug, bukan gaya ---
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      // Karakter whitespace tak-biasa (mis. NBSP) sah di dalam regex/komentar —
      // src/utils/escpos.js sengaja memuatnya untuk membersihkan struk. Tetap
      // error bila muncul di kode biasa.
      'no-irregular-whitespace': ['error', { skipRegExps: true, skipComments: true, skipTemplates: true, skipStrings: true }],
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react/display-name': 'off',
    },
  },
]
