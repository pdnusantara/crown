// Atribusi marketing first-touch. Ditangkap sekali per sesi (saat pengunjung
// pertama membuka situs lewat link iklan/kampanye), disimpan di sessionStorage,
// lalu disertakan ke /auth/register sebagai `signupMeta`. First-touch menang —
// navigasi internal berikutnya tidak menimpa sumber awal.
const KEY = 'sembapos_attribution'

function trim(v, max = 500) {
  if (!v) return undefined
  const s = String(v).trim()
  return s ? s.slice(0, max) : undefined
}

// Panggil sedini mungkin (main.jsx) di setiap load awal.
export function captureAttribution() {
  if (typeof window === 'undefined') return
  try {
    if (sessionStorage.getItem(KEY)) return // first-touch sudah tersimpan
    const p = new URLSearchParams(window.location.search)
    // Referrer hanya berarti bila dari domain LAIN (bukan navigasi internal).
    let referrer
    try {
      if (document.referrer && new URL(document.referrer).host !== window.location.host) {
        referrer = trim(document.referrer)
      }
    } catch { /* referrer tak valid — abaikan */ }

    const data = {
      utmSource:   trim(p.get('utm_source'), 120),
      utmMedium:   trim(p.get('utm_medium'), 120),
      utmCampaign: trim(p.get('utm_campaign'), 200),
      utmContent:  trim(p.get('utm_content'), 200),
      utmTerm:     trim(p.get('utm_term'), 200),
      fbclid:      trim(p.get('fbclid'), 255),
      gclid:       trim(p.get('gclid'), 255),
      ref:         trim(p.get('ref'), 60),
      referrer,
      landingPath: trim(window.location.pathname + window.location.search),
    }
    // Buang field kosong.
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v))
    sessionStorage.setItem(KEY, JSON.stringify(clean))
  } catch { /* sessionStorage bisa diblok (private mode) — abaikan */ }
}

// Ambil atribusi tersimpan. Mengembalikan objek (mungkin kosong).
export function getAttribution() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
