import React from 'react'
import { useTranslation } from 'react-i18next'
import RatingsReport from '../../components/RatingsReport.jsx'

// Halaman rating untuk kasir — backend otomatis scope ke cabang kasir.
// Read-only (kasir tidak moderasi rating; itu di /admin/ratings).
export default function KasirRatingsPage() {
  const { t } = useTranslation()
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <RatingsReport
        title={t('kasirRatings.title')}
        subtitle={t('kasirRatings.subtitle')}
      />
    </div>
  )
}
