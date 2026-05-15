import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import './i18n/index.js'
import './index.css'

// Auto-reload sekali ketika service worker baru ambil alih (skipWaiting+clientsClaim
// di vite.config.js). Tanpa ini, user lihat versi lama sampai refresh manual.
// sessionStorage flag cegah infinite reload loop dalam satu sesi tab.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sessionStorage.getItem('sw-reloaded') === '1') return
    sessionStorage.setItem('sw-reloaded', '1')
    window.location.reload()
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
