import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { reloadOnceForChunkError } from './lib/chunkReload.js'
import './i18n/index.js'
import './index.css'

// Vite memancarkan 'vite:preloadError' saat sebuah chunk dynamic-import gagal
// dimuat — hampir selalu karena deploy baru me-rotate hash file sementara tab
// ini masih memegang index.html lama. Pulihkan otomatis dengan reload sekali
// (ambil index.html segar) sebelum error itu sempat menjadi layar error.
// Kalau reload diblok cooldown (baru saja reload tapi masih gagal), biarkan
// error menjalar ke ErrorBoundary.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadOnceForChunkError()) e.preventDefault()
})

// Service worker baru sudah aktif (skipWaiting+clientsClaim di vite.config.js).
// Alih-alih reload paksa — yang bisa menghapus form yang sedang diisi user —
// kita dispatch event supaya komponen SWUpdateBanner tampil dan user yang
// memilih kapan reload. Flag sessionStorage cegah event berulang dalam sesi
// yang sama.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sessionStorage.getItem('sw-update-shown') === '1') return
    sessionStorage.setItem('sw-update-shown', '1')
    window.dispatchEvent(new Event('app:update-available'))
  })

  // Aplikasi ini SPA: pindah halaman pakai History API, BUKAN navigasi browser,
  // jadi browser bisa tidak pernah mengambil ulang /sw.js dengan sendirinya. Tab
  // yang dibiarkan terbuka seharian akhirnya tak pernah tahu ada deploy baru —
  // inilah sebab "fitur baru muncul telat / tidak muncul" di sebagian sesi.
  // Maka kita minta browser cek update secara berkala, dan tiap tab kembali
  // aktif atau koneksi pulih. Saat SW baru ketemu, ia langsung aktif
  // (skipWaiting+clientsClaim) → controllerchange di atas → banner muncul.
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
