import React from 'react'
import RatingsReport from '../../components/RatingsReport.jsx'

// Halaman rating untuk barber — backend otomatis scope ke transaksi yang
// barber ini melayani (untuk shop rating) dan barberId = self (untuk barber
// rating). Tab "Rating Toko" tetap ditampilkan supaya barber tahu pengalaman
// keseluruhan pelanggan, tidak hanya penilaian terhadap dirinya.
export default function BarberRatingsPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <RatingsReport
        title="Rating Saya"
        subtitle="Penilaian pelanggan untuk pelayanan Anda dan toko."
      />
    </div>
  )
}
