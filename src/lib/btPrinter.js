// Cetak struk via Web Bluetooth (ESC/POS). Jalan di Chrome Android/desktop —
// TIDAK didukung di iOS/Safari. Wajib HTTPS + dipanggil dari gesture pengguna
// (klik tombol). Koneksi disimpan sebagai singleton selama sesi.
import { useSyncExternalStore } from 'react'

// Service UUID umum printer thermal BLE / modul UART (HM-10, Nordic UART,
// Microchip transparent UART, dll). acceptAllDevices butuh daftar
// optionalServices agar service bisa diakses setelah tersambung.
const KNOWN_SERVICES = [
  0x18f0, 0xff00, 0xffe0, 0xfee7, 0xfff0,
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip transparent UART
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
]

let device = null
let characteristic = null
let state = {
  supported: typeof navigator !== 'undefined' && !!navigator.bluetooth,
  connecting: false,
  connected: false,
  deviceName: '',
}

const listeners = new Set()
function setState(patch) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb) }
function getSnapshot() { return state }

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

function onDisconnected() {
  characteristic = null
  setState({ connected: false })
}

// Temukan karakteristik yang bisa ditulis di seluruh service yang terbaca.
async function discoverWritable(server) {
  const services = await server.getPrimaryServices()
  for (const s of services) {
    let chars = []
    try { chars = await s.getCharacteristics() } catch { continue }
    for (const c of chars) {
      if (c.properties.write || c.properties.writeWithoutResponse) return c
    }
  }
  return null
}

async function ensureConnected() {
  if (!device) throw new Error('Printer belum dipilih.')
  if (device.gatt.connected && characteristic) return
  const server = await device.gatt.connect()
  characteristic = await discoverWritable(server)
  if (!characteristic) {
    throw new Error('Printer tersambung tapi tak ada jalur tulis yang dikenali. Coba printer lain.')
  }
  setState({ connected: true, deviceName: device.name || 'Printer' })
}

// Minta pengguna memilih printer & sambungkan (harus dari klik tombol).
async function connect() {
  if (!navigator.bluetooth) {
    throw new Error('Browser ini tidak mendukung Bluetooth. Pakai Chrome di Android.')
  }
  setState({ connecting: true })
  try {
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_SERVICES,
    })
    device.removeEventListener?.('gattserverdisconnected', onDisconnected)
    device.addEventListener('gattserverdisconnected', onDisconnected)
    await ensureConnected()
    setState({ connecting: false })
    return device.name || 'Printer'
  } catch (err) {
    setState({ connecting: false })
    throw err
  }
}

// Kirim byte ESC/POS (Uint8Array). Reconnect otomatis bila perlu. Ditulis
// per-chunk supaya tidak melebihi MTU printer murah.
async function write(bytes) {
  await ensureConnected()
  const CHUNK = 100
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.slice(i, i + CHUNK)
    if (characteristic.properties.write && characteristic.writeValueWithResponse) {
      await characteristic.writeValueWithResponse(slice)
    } else if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(slice)
      await delay(16)
    } else {
      await characteristic.writeValue(slice)
      await delay(16)
    }
  }
}

function disconnect() {
  try { if (device?.gatt?.connected) device.gatt.disconnect() } catch { /* noop */ }
  characteristic = null
  setState({ connected: false })
}

export const btPrinter = { connect, write, disconnect, ensureConnected, get supported() { return state.supported } }

// Hook React untuk status realtime + aksi.
export function useBtPrinter() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { ...snap, connect, write, disconnect }
}
