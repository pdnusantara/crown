// Meta (Facebook) Pixel — disuntik saat runtime karena Pixel ID dikonfigurasi
// super-admin lewat /api/landing, bukan variabel build-time. Pixel ID bukan
// rahasia (selalu terlihat di HTML halaman), jadi aman dikirim publik.

let injectedId = null

// Base code resmi Meta Pixel — versi minified standar dari Events Manager.
function injectBaseCode() {
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js')
  /* eslint-enable */
}

// Aktifkan pixel & catat kunjungan halaman. Aman dipanggil berkali-kali —
// base code hanya disuntik sekali; `PageView` dikirim tiap pemanggilan supaya
// navigasi SPA tetap tercatat.
export function initMetaPixel(pixelId) {
  const id = String(pixelId || '').trim()
  if (!id || typeof window === 'undefined') return
  if (injectedId !== id) {
    if (!window.fbq) injectBaseCode()
    window.fbq('init', id)
    injectedId = id
  }
  window.fbq('track', 'PageView')
}

// Kirim event (event standar Meta atau kustom). No-op bila pixel belum aktif.
export function trackPixel(event, params) {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', event, params || undefined)
  }
}
