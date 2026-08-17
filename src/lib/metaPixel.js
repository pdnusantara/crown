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
//
// `eventId` dipakai untuk event yang JUGA dikirim server lewat Conversions API.
// Meta membuang duplikat bila id-nya sama; tanpa itu satu konversi terhitung
// dua kali (browser + server).
export function trackPixel(event, params, eventId) {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', event, params || undefined, eventId ? { eventID: eventId } : undefined)
  }
}

// Cookie pixel Meta. `_fbp` menandai browser, `_fbc` menyimpan klik iklan
// (turunan dari fbclid). Keduanya sinyal pencocokan terkuat untuk Conversions
// API, jadi ikut dikirim ke server saat pendaftaran.
function readCookie(name) {
  if (typeof document === 'undefined') return ''
  const hit = document.cookie.split('; ').find(c => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ''
}

export function getPixelCookies() {
  const out = {}
  const fbp = readCookie('_fbp')
  const fbc = readCookie('_fbc')
  if (fbp) out.fbp = fbp
  if (fbc) out.fbc = fbc
  return out
}

// Id unik untuk satu event konversi, dipakai bersama browser & server.
export function newEventId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* fallback di bawah */ }
  return `e_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
