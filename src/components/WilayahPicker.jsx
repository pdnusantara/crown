import React from 'react'
import { useDistricts, useVillages } from '../hooks/useWilayah.js'

// Pemilih Kecamatan + Desa/Kelurahan dalam satu kabupaten tetap.
// `kabupatenId` = kabupaten fokus toko (dari Tenant.wilayah). Provinsi &
// kabupaten TIDAK ditanyakan di sini — sudah ditetapkan owner.
//
// Props:
//  - kabupatenId   : id BPS kabupaten/kota toko (wajib; kalau kosong → null)
//  - value         : { kecamatanId, kecamatan, kelurahanId, kelurahan }
//  - onChange(val) : dipanggil dengan value lengkap setiap pilihan berubah
//  - selectClassName / labelClassName : override gaya agar cocok per halaman
//  - disabled
export default function WilayahPicker({
  kabupatenId,
  value = {},
  onChange,
  selectClassName = 'w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60 disabled:opacity-40 transition-colors',
  labelClassName = 'block text-xs font-medium text-muted mb-1.5',
  disabled = false,
}) {
  const { data: districts = [], isLoading: loadingKec } = useDistricts(kabupatenId)
  const { data: villages = [],  isLoading: loadingDesa } = useVillages(value.kecamatanId)

  // Toko belum menetapkan wilayah → komponen tidak ditampilkan.
  if (!kabupatenId) return null

  const pickKecamatan = (id) => {
    const kec = districts.find(d => d.id === id)
    onChange({ kecamatanId: id || '', kecamatan: kec?.name || '', kelurahanId: '', kelurahan: '' })
  }
  const pickKelurahan = (id) => {
    const kel = villages.find(v => v.id === id)
    onChange({ ...value, kelurahanId: id || '', kelurahan: kel?.name || '' })
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={labelClassName}>Kecamatan</label>
        <select
          className={selectClassName}
          value={value.kecamatanId || ''}
          disabled={disabled || loadingKec}
          onChange={e => pickKecamatan(e.target.value)}
        >
          <option value="">{loadingKec ? 'Memuat…' : 'Pilih kecamatan'}</option>
          {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClassName}>Desa / Kelurahan</label>
        <select
          className={selectClassName}
          value={value.kelurahanId || ''}
          disabled={disabled || !value.kecamatanId || loadingDesa}
          onChange={e => pickKelurahan(e.target.value)}
        >
          <option value="">
            {!value.kecamatanId ? 'Pilih kecamatan dulu' : loadingDesa ? 'Memuat…' : 'Pilih desa'}
          </option>
          {villages.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
    </div>
  )
}
