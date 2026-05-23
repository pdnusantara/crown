// Pembuat byte ESC/POS untuk printer thermal (58mm = 32 kolom, 80mm = 42 kolom).
// Dipakai oleh cetak struk Bluetooth di kasir. Output: Uint8Array siap dikirim
// ke karakteristik GATT printer.

const ESC = 0x1b
const GS = 0x1d

// Ganti karakter non-ASCII yang umum muncul di struk agar tak jadi sampah di
// printer (ruang tak-putus dari Intl currency, bullet, panah, em/en-dash, dll).
function sanitize(str) {
  return String(str == null ? '' : str)
    .replace(/ /g, ' ')   // NBSP (mis. dari "Rp 75.000")
    .replace(/[•·]/g, '-')
    .replace(/[↳→»]/g, '>')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e]/g, '') // sisanya: buang non-ASCII (emoji dll)
}

class EscPosBuilder {
  constructor(width = 32) {
    this.width = width
    this.bytes = []
  }
  raw(...b) { this.bytes.push(...b); return this }
  init() { return this.raw(ESC, 0x40) }                 // ESC @ reset
  align(a) { return this.raw(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0) }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0) }
  size(double) { return this.raw(GS, 0x21, double ? 0x11 : 0x00) } // GS ! double w+h / normal
  feed(n = 1) { for (let i = 0; i < n; i++) this.bytes.push(0x0a); return this }
  cut() { return this.raw(GS, 0x56, 0x42, 0x00) }       // partial cut (diabaikan jika tak didukung)

  // Tulis teks (di-encode ASCII). Tidak menambah newline.
  text(str) {
    const s = sanitize(str)
    for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i) & 0xff)
    return this
  }
  line(str = '') { return this.text(str).feed() }

  // Pembatas garis putus-putus selebar kertas.
  divider(ch = '-') { return this.line(ch.repeat(this.width)) }

  // Baris dua kolom: label kiri, nilai kanan rata kanan; potong kiri bila kepanjangan.
  twoCol(left, right) {
    let l = sanitize(left)
    const r = sanitize(right)
    const space = this.width - l.length - r.length
    if (space < 1) {
      const maxLeft = Math.max(1, this.width - r.length - 1)
      l = l.slice(0, maxLeft)
      const gap = Math.max(1, this.width - l.length - r.length)
      return this.line(l + ' '.repeat(gap) + r)
    }
    return this.line(l + ' '.repeat(space) + r)
  }

  // Teks rata tengah (di-pad spasi).
  center(str) {
    const s = sanitize(str)
    if (s.length >= this.width) return this.line(s)
    const pad = Math.floor((this.width - s.length) / 2)
    return this.line(' '.repeat(pad) + s)
  }

  build() { return new Uint8Array(this.bytes) }
}

// Susun struk dari data terformat (semua string sudah dilokalkan & diformat
// oleh pemanggil). `width` = jumlah kolom karakter (58mm=32, 80mm=42).
//
// data = {
//   shopName, branchName, branchAddr, branchPhone,
//   meta: [{ label, value }],                 // No struk, Tanggal, Pelanggan
//   items: [{ name, price, barber }],
//   rows:  [{ label, value, bold }],          // Subtotal, Diskon, TOTAL, Bayar, Kembali
//   thanks, poweredBy,
//   rating: { title, url } | null,
// }
export function buildReceipt(data, width = 32) {
  const b = new EscPosBuilder(width)
  b.init().align('center')

  if (data.shopName) { b.bold(true).size(true).center(data.shopName).size(false).bold(false) }
  if (data.branchName)  b.center(data.branchName)
  if (data.branchAddr)  b.center(data.branchAddr)
  if (data.branchPhone) b.center(data.branchPhone)

  b.align('left').divider()
  for (const m of data.meta || []) b.twoCol(m.label, m.value)
  b.divider()

  for (const it of data.items || []) {
    b.twoCol(it.name, it.price)
    if (it.barber) b.line(`  > ${it.barber}`)
  }
  b.divider()

  for (const r of data.rows || []) {
    if (r.bold) b.bold(true)
    b.twoCol(r.label, r.value)
    if (r.bold) b.bold(false)
  }

  b.divider()
  if (data.thanks)    b.align('center').line(data.thanks)
  if (data.poweredBy) b.align('center').line(data.poweredBy)

  if (data.rating?.url) {
    b.divider()
    b.align('center')
    if (data.rating.title) b.line(data.rating.title)
    b.line(data.rating.url)
  }

  b.feed(4).cut()
  return b.build()
}

export { EscPosBuilder, sanitize }
