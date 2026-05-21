import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    // Keep previous hashed chunks so existing open tabs
    // don't crash with failed dynamic-import after deploy.
    emptyOutDir: false,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registrasi SW dilakukan manual di src/main.jsx supaya bisa DILEWATI di
      // halaman publik pelanggan (mis. /rating/* dari link WhatsApp) yang tak
      // boleh dikontrol SW. Tanpa ini, registerSW.js auto-inject mendaftarkan SW
      // di semua halaman.
      injectRegister: false,
      manifest: {
        name: 'BarberOS',
        short_name: 'BarberOS',
        description: 'Multi-tenant Barbershop Management System',
        theme_color: '#0A0A0A',
        background_color: '#0A0A0A',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Precache HANYA shell tak-ber-hash (HTML + ikon + manifest). Bundel
        // JS/CSS di /assets/ sengaja tidak di-precache: dengan emptyOutDir:false
        // folder dist menyimpan chunk dari banyak build lama, jadi memindai
        // direktori akan menyeret ribuan file usang ke precache (dulu 48MB /
        // 2742 entri) — precache raksasa bisa lewati kuota storage HP dan bikin
        // instalasi SW GAGAL, sehingga update tak pernah aktif. Chunk di-cache
        // saat dipakai via runtimeCaching di bawah (CacheFirst, sebab nama file
        // ber-hash = immutable) dengan batas entri yang merawat dirinya sendiri.
        globPatterns: ['index.html', 'manifest.webmanifest', 'icon-*.png'],
        // navigateFallback DIMATIKAN (null). vite-plugin-pwa default-nya
        // 'index.html', yang membuat SW menyajikan index.html PRECACHE (basi) di
        // setiap navigasi/reload → referensi hash chunk lama → "Failed to fetch
        // dynamically imported module" pasca-deploy, dan reload pun tak memulihkan
        // sampai SW ter-update. Dengan null, navigasi selalu ambil index.html
        // SEGAR dari jaringan (nginx no-cache). Aset /assets/ tetap di-cache di
        // bawah. (Trade-off: shell tak tersaji saat OFFLINE — app ini online-first.)
        navigateFallback: null,
        // directoryIndex default 'index.html' membuat request ke root '/' tetap
        // dilayani index.html precache (basi). Null → '/' ikut ke jaringan.
        // index.html tetap di-precache hanya sebagai sinyal versi (revision
        // berubah tiap deploy → sw.js berubah → update SW terdeteksi).
        directoryIndex: null,
        runtimeCaching: [
          {
            // Bundel aplikasi ber-hash konten → immutable. CacheFirst: ambil
            // dari cache, fetch jaringan hanya bila belum ada. Batas maxEntries
            // + purgeOnQuotaError menjaga cache perangkat tetap terbatas.
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-assets',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
