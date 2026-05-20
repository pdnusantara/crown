import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import './i18n/index.js'
import './index.css'

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
