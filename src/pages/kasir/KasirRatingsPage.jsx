import React from 'react'
import RatingsReport from '../../components/RatingsReport.jsx'

// Halaman rating untuk kasir — backend otomatis scope ke cabang kasir.
// Read-only (kasir tidak moderasi rating; itu di /admin/ratings).
export default function KasirRatingsPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <RatingsReport
        title="Rating Pelanggan"
        subtitle="Penilaian masuk untuk cabang ini dari halaman rating publik."
      />
    </div>
  )
}
