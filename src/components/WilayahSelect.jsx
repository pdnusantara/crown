import { ChevronDown, Loader2 } from 'lucide-react'
import { useProvinces, useRegencies, useDistricts, useVillages } from '../hooks/useWilayah.js'

function WilSelect({ label, options = [], value, onChange, disabled, loading, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          disabled={disabled || loading}
          className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 pr-8 text-sm outline-none focus:border-gold/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <option value="">{loading ? 'Memuat…' : placeholder}</option>
          {options.map(opt => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading
            ? <Loader2 size={14} className="text-muted animate-spin" />
            : <ChevronDown size={14} className="text-muted" />
          }
        </div>
      </div>
    </div>
  )
}

export function WilayahSelect({ value = {}, onChange }) {
  const provinsiId  = value.provinsiId  || ''
  const kabupatenId = value.kabupatenId || ''
  const kecamatanId = value.kecamatanId || ''

  const { data: provinces  = []                             } = useProvinces()
  const { data: regencies  = []                             } = useRegencies(provinsiId)
  const { data: districts  = [], isLoading: loadDist        } = useDistricts(kabupatenId)
  const { data: villages   = [], isLoading: loadVil         } = useVillages(kecamatanId)

  function handleProvinsi(e) {
    const prov = provinces.find(p => p.id === e.target.value) || null
    onChange({
      ...value,
      provinsiId:  prov?.id   || '', provinsi:  prov?.name || '',
      kabupatenId: '',               kabupaten: '',
      kecamatanId: '',               kecamatan: '',
      kelurahanId: '',               kelurahan: '',
    })
  }

  function handleKabupaten(e) {
    const kab = regencies.find(r => r.id === e.target.value) || null
    onChange({
      ...value,
      kabupatenId: kab?.id || '', kabupaten: kab?.name || '',
      kecamatanId: '',            kecamatan: '',
      kelurahanId: '',            kelurahan: '',
    })
  }

  function handleKecamatan(e) {
    const kec = districts.find(d => d.id === e.target.value) || null
    onChange({
      ...value,
      kecamatanId: kec?.id || '', kecamatan: kec?.name || '',
      kelurahanId: '',            kelurahan: '',
    })
  }

  function handleKelurahan(e) {
    const kel = villages.find(v => v.id === e.target.value) || null
    onChange({ ...value, kelurahanId: kel?.id || '', kelurahan: kel?.name || '' })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted">Wilayah</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <WilSelect
          label="Provinsi"
          options={provinces}
          value={provinsiId}
          onChange={handleProvinsi}
          placeholder="Pilih Provinsi"
        />
        <WilSelect
          label="Kabupaten / Kota"
          options={regencies}
          value={kabupatenId}
          onChange={handleKabupaten}
          disabled={!provinsiId}
          placeholder={provinsiId ? 'Pilih Kabupaten/Kota' : 'Pilih provinsi dulu'}
        />
        <WilSelect
          label="Kecamatan"
          options={districts}
          value={kecamatanId}
          onChange={handleKecamatan}
          disabled={!kabupatenId}
          loading={loadDist}
          placeholder={kabupatenId ? 'Pilih Kecamatan' : 'Pilih kabupaten dulu'}
        />
        <WilSelect
          label="Kelurahan / Desa"
          options={villages}
          value={value.kelurahanId || ''}
          onChange={handleKelurahan}
          disabled={!kecamatanId}
          loading={loadVil}
          placeholder={kecamatanId ? 'Pilih Kelurahan/Desa' : 'Pilih kecamatan dulu'}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted mb-1">Detail Alamat</label>
        <textarea
          value={value.detail || ''}
          onChange={e => onChange({ ...value, detail: e.target.value })}
          placeholder="No. rumah, gang, RT/RW, patokan, dll."
          rows={2}
          maxLength={500}
          className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60 resize-none"
        />
      </div>
    </div>
  )
}

export default WilayahSelect
