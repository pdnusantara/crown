import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { reloadOnceForChunkError } from './lib/chunkReload.js'
import { installGlobalErrorHandlers } from './lib/errorReporter.js'
import { captureAttribution } from './utils/attribution.js'
import './i18n/index.js'
import './index.css'

// Pasang penangkap error global sedini mungkin: error di event handler &
// promise rejection tanpa .catch() tak menjalar ke React Error Boundary, jadi
// tanpa ini bug semacam itu bisa "diam" di produksi berhari-hari.
installGlobalErrorHandlers()

// Tangkap atribusi marketing first-touch sedini mungkin (sebelum navigasi
// client-side menghapus query ?utm_*/?ref= dari URL).
captureAttribution()

// Vite memancarkan 'vite:preloadError' saat sebuah chunk dynamic-import gagal
// dimuat — hampir selalu karena deploy baru me-rotate hash file sementara tab
// ini masih memegang index.html lama. Pulihkan otomatis dengan reload sekali
// (ambil index.html segar) sebelum error itu sempat menjadi layar error.
// Kalau reload diblok cooldown (baru saja reload tapi masih gagal), biarkan
// error menjalar ke ErrorBoundary.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadOnceForChunkError()) e.preventDefault()
})

// Halaman rating publik (link WhatsApp yang diklik pelanggan) sengaja TIDAK
// pakai service worker. SW — terutama versi lama yang masih nyangkut di HP
// pelanggan yang pernah membuka app/booking — bisa menyajikan index.html basi
// sehingga halaman "terbuka lalu reload sendiri beberapa detik". Registrasi SW
// dilakukan MANUAL di sini (injectRegister:false di vite.config) supaya bisa
// dilewati untuk route ini.
const SW_EXCLUDED = location.pathname.startsWith('/rating')

if ('serviceWorker' in navigator && SW_EXCLUDED) {
  // Jangan daftarkan SW. Kalau pengunjung kebetulan masih punya SW lama →
  // unregister + bersihkan cache, lalu SATU reload bersih untuk lepas dari
  // kontrolnya. Pengunjung baru (mayoritas) tak punya SW → tanpa reload.
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (!regs.length) return
    Promise.all(regs.map((r) => r.unregister()))
      .then(() => (window.caches ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : null))
      .catch(() => {})
      .finally(() => {
        if (navigator.serviceWorker.controller && !sessionStorage.getItem('rating-sw-cleared')) {
          sessionStorage.setItem('rating-sw-cleared', '1')
          location.reload()
        }
      })
  }).catch(() => {})
} else if ('serviceWorker' in navigator) {
  // Halaman aplikasi biasa: daftarkan SW secara manual.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  })

  // SW baru aktif (skipWaiting+clientsClaim) → tampilkan SWUpdateBanner alih-alih
  // reload paksa (yang bisa menghapus form yang sedang diisi user). Flag
  // sessionStorage cegah event berulang dalam sesi yang sama.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sessionStorage.getItem('sw-update-shown') === '1') return
    sessionStorage.setItem('sw-update-shown', '1')
    window.dispatchEvent(new Event('app:update-available'))
  })

  // SPA pindah halaman via History API (bukan navigasi browser), jadi browser
  // bisa tak pernah ambil ulang /sw.js → tab lama tak tahu ada deploy baru.
  // Maka cek update berkala + tiap tab kembali aktif / online lagi.
  navigator.serviceWorker.ready.then((registration) => {
    const UPDATE_INTERVAL_MS = 15 * 60 * 1000 // cek berkala tiap 15 menit
    const MIN_GAP_MS = 30 * 1000              // jangan cek lebih sering dari 30 dtk
    let lastCheck = 0

    const checkForUpdate = () => {
      if (Date.now() - lastCheck < MIN_GAP_MS) return
      lastCheck = Date.now()
      registration.update().catch(() => {})
    }

    setInterval(checkForUpdate, UPDATE_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    })
    window.addEventListener('online', checkForUpdate)
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
