import React, { useMemo } from 'react'
import {
  LogIn, CreditCard, ListOrdered, LogOut, HelpCircle, Fingerprint,
} from 'lucide-react'
import HelpCenter from '../../components/HelpCenter.jsx'
import { useAuthStore } from '../../store/authStore.js'
import { useFeatureFlags } from '../../hooks/useFeatureFlags.js'
import { getBranchSlug } from '../../utils/branchSlug.js'

// Topik → feature flag. Yang fiturnya tidak aktif di paket toko tampil
// "terkunci" (kasir tak bisa upgrade → HelpCenter arahkan hubungi pemilik).
const FEATURE_BY_ARTICLE = {
  'tx-poin': 'loyalty', 'tx-voucher': 'voucher', 'tx-rating-qr': 'barber_rating',
  'an-checkin': 'booking',
  'ab-checkin': 'attendance', 'ab-checkout': 'attendance', 'ab-luar': 'attendance',
}

// ── /:branchId/kasir/bantuan — Pusat Bantuan untuk kasir ─────────────────────
// Panduan operasional harian: buka shift → transaksi → antrian → tutup shift.
// Tautan dibangun dari slug cabang aktif kasir.
function buildCategories(slug) {
  const pos          = `/${slug}/kasir/pos`
  const queue        = `/${slug}/kasir/queue`
  const bookings     = `/${slug}/kasir/bookings`
  const transactions = `/${slug}/kasir/transactions`
  const shiftClosing = `/${slug}/kasir/shift-closing`
  const attendance   = `/${slug}/kasir/attendance`

  return [
    {
      id: 'shift',
      label: 'Memulai Kerja',
      icon: LogIn,
      items: [
        {
          id: 'sh-buka',
          q: 'Bagaimana membuka shift?',
          a: 'Shift harus dibuka sebelum transaksi pertama hari itu. Saat membuka shift Anda mencatat uang awal di laci (modal kembalian).',
          steps: [
            'Buka menu Tutup Shift.',
            'Klik "Buka Shift" dan masukkan jumlah uang modal di laci.',
            'Mulai melayani transaksi di menu Kasir.',
          ],
          to: shiftClosing,
          toLabel: 'Buka Shift',
        },
        {
          id: 'sh-lupa',
          q: 'Saya lupa membuka shift, bagaimana?',
          a: 'Bila sistem meminta Anda membuka shift saat hendak bertransaksi, buka shift dulu lewat menu Tutup Shift. Transaksi tidak bisa dicatat tanpa shift aktif.',
          to: shiftClosing,
          toLabel: 'Buka Shift',
        },
        {
          id: 'sh-kas-keluar',
          q: 'Ada uang tunai keluar dari laci (ngamen, parkir, beli es). Bagaimana mencatatnya?',
          a: 'Gunakan fitur "Kas Keluar" di menu Tutup Shift. Uang tunai yang keluar dari laci untuk keperluan sah (ngamen, parkir, konsumsi, beli kebutuhan) harus dicatat agar saat tutup kas tidak terhitung sebagai selisih/kas kurang. Setiap kas keluar otomatis mengurangi "Kas Diharapkan".',
          steps: [
            'Buka menu Tutup Shift saat shift sedang berjalan.',
            'Di bagian "Kas Keluar", tekan "Tambah".',
            'Isi nominal dan keterangan (boleh pakai pilihan cepat: Ngamen, Parkir, Konsumsi, Lainnya).',
            'Simpan — nominalnya langsung mengurangi Kas Diharapkan.',
            'Salah input? Tekan ikon tempat sampah di daftar untuk menghapus selama shift belum ditutup.',
          ],
          to: shiftClosing,
          toLabel: 'Buka Tutup Shift',
        },
        {
          id: 'sh-tutup',
          q: 'Bagaimana menutup shift di akhir kerja?',
          a: 'Saat tutup shift Anda menghitung uang di laci lalu sistem membandingkannya dengan kas yang seharusnya (kas awal + tunai masuk − kas keluar). Kas Aktual wajib diisi; bila ada selisih, isi alasannya.',
          steps: [
            'Buka menu Tutup Shift.',
            'Hitung uang fisik di laci. Tekan "Hitung uang laci" untuk memasukkan jumlah per pecahan — totalnya otomatis mengisi Kas Aktual.',
            'Bila kas tidak sama dengan kas diharapkan, isi alasan selisih (wajib).',
            'Isi "Modal Disimpan" bila sebagian uang ditahan untuk modal kembalian besok — sisanya jadi "Uang Disetor" ke pemilik.',
            'Tekan "Tutup Shift", periksa ringkasan (termasuk peringatan bila ada antrian belum dibayar), lalu konfirmasi.',
          ],
          to: shiftClosing,
          toLabel: 'Buka Tutup Shift',
        },
      ],
    },
    {
      id: 'transaksi',
      label: 'Transaksi (Kasir)',
      icon: CreditCard,
      items: [
        {
          id: 'tx-alur',
          q: 'Bagaimana mencatat transaksi baru?',
          a: 'Menu Kasir dipakai untuk mencatat penjualan layanan kepada pelanggan. Pelanggan wajib dipilih — transaksi tidak bisa diproses tanpa pelanggan.',
          steps: [
            'Pilih atau daftarkan pelanggan terlebih dahulu (wajib).',
            'Pilih barber yang melayani, lalu tambahkan layanan ke keranjang.',
            'Masukkan voucher atau tukar poin loyalti bila ada.',
            'Pilih metode pembayaran dan tekan Bayar.',
            'Struk tercetak dan transaksi tersimpan.',
            'Di struk Anda bisa mencetak atau membagikan ke WhatsApp pelanggan. Tombol share WhatsApp tidak muncul bila notifikasi WhatsApp otomatis sudah aktif — pesan dikirim sendiri oleh sistem.',
          ],
          to: pos,
          toLabel: 'Buka Kasir',
        },
        {
          id: 'tx-cetak-bluetooth',
          q: 'Bagaimana mencetak struk ke printer Bluetooth?',
          a: 'Struk bisa langsung dicetak ke printer thermal Bluetooth (58mm/80mm) dari HP Android lewat Chrome. Tombol "Printer Biasa / PDF" memakai dialog cetak bawaan browser; untuk printer thermal Bluetooth, gunakan tombol "Printer Thermal (Bluetooth)" di layar struk.',
          steps: [
            'Nyalakan printer thermal Bluetooth Anda.',
            'Selesaikan pembayaran hingga struk muncul.',
            'Pilih lebar kertas (58mm atau 80mm) sesuai printer.',
            'Tekan "Hubungkan Printer Thermal", lalu pilih printer dari daftar yang muncul.',
            'Struk langsung tercetak; cetakan berikutnya cukup tekan "Printer Thermal (Bluetooth)".',
            'Mau cetak ulang struk lama? Buka menu Transaksi → ketuk transaksinya → bagian "Cetak Struk" punya tombol "Printer Thermal (Bluetooth)" yang sama.',
            'Catatan: fitur ini berjalan di Chrome (Android/komputer), bukan di iPhone/Safari.',
          ],
          to: pos,
          toLabel: 'Buka Kasir',
        },
        {
          id: 'tx-poin',
          q: 'Bagaimana memakai poin loyalti pelanggan?',
          a: 'Pelanggan terdaftar bisa menukar poin sebagai potongan. Nilai poin, minimal tukar, dan batas potongan ditentukan pemilik di Pengaturan → Sistem Poin; nilai serta batas maksimalnya tampil langsung di panel tukar poin saat transaksi. Bila pemilik menonaktifkan sistem poin, panel ini tidak muncul.',
          steps: [
            'Pastikan pelanggan sudah dipilih di keranjang.',
            'Buka opsi tukar poin sebelum menekan Bayar.',
            'Masukkan jumlah poin (atau pakai tombol Maks) — potongan langsung terhitung sesuai nilai poin toko.',
          ],
          to: pos,
          toLabel: 'Buka Kasir',
        },
        {
          id: 'tx-voucher',
          q: 'Bagaimana memakai voucher diskon?',
          a: 'Voucher diberikan pelanggan berupa kode. Masukkan kode di keranjang sebelum pembayaran; bila valid, potongan otomatis diterapkan.',
          to: pos,
          toLabel: 'Buka Kasir',
        },
        {
          id: 'tx-rating-qr',
          q: 'Bagaimana meminta pelanggan memberi rating?',
          a: 'Setelah pembayaran berhasil, di struk muncul kode QR rating (bila fitur Rating Barber aktif). Pelanggan tinggal memindai untuk menilai layanan — tanpa perlu WhatsApp, jadi pelanggan walk-in tanpa nomor HP pun bisa memberi rating.',
          steps: [
            'Selesaikan pembayaran seperti biasa.',
            'Tunjukkan kode QR di layar struk kepada pelanggan untuk dipindai, atau cetak struk — QR ikut tercetak.',
            'Bila ingin dibagikan secara digital, tekan "Salin link rating" lalu kirimkan linknya.',
            'Hasil penilaian masuk ke laporan rating toko & barber.',
          ],
          to: pos,
          toLabel: 'Buka Kasir',
        },
        {
          id: 'tx-riwayat',
          q: 'Di mana melihat transaksi yang sudah dibuat?',
          a: 'Menu Transaksi menampilkan seluruh transaksi pada cabang ini. Anda bisa mencari, melihat detail, dan mencetak ulang struk — lewat dialog cetak browser ("Cetak") maupun printer thermal Bluetooth ("Cetak Bluetooth").',
          to: transactions,
          toLabel: 'Buka Transaksi',
        },
      ],
    },
    {
      id: 'antrian',
      label: 'Antrian & Booking',
      icon: ListOrdered,
      items: [
        {
          id: 'an-walkin',
          q: 'Bagaimana melayani pelanggan walk-in?',
          a: 'Walk-in adalah pelanggan yang datang tanpa booking. Daftarkan mereka agar masuk antrian dan barber tahu urutannya.',
          steps: [
            'Buka halaman Antrian lalu tekan tombol Walk-in.',
            'Cari pelanggan lama (ketik nama/HP) agar poin loyalti otomatis tertaut, atau ketik nama baru bila pelanggan belum terdaftar.',
            'Pilih satu atau beberapa layanan (durasi total muncul otomatis) dan barber bila ada.',
            'Simpan — tiket antrian dibuat untuk hari ini, lengkap dengan estimasi waktu tunggu.',
          ],
          to: queue,
          toLabel: 'Buka Antrian',
        },
        {
          id: 'an-checkin',
          q: 'Bagaimana memproses pelanggan yang sudah booking?',
          a: 'Saat pelanggan dengan booking datang, lakukan check-in agar mereka masuk antrian.',
          steps: [
            'Buka menu Booking dan cari nama pelanggan.',
            'Tekan check-in pada booking tersebut.',
            'Pelanggan kini muncul di daftar Antrian.',
          ],
          to: bookings,
          toLabel: 'Buka Booking',
        },
        {
          id: 'an-antrian',
          q: 'Bagaimana memantau antrian?',
          a: 'Menu Antrian menampilkan pelanggan yang menunggu pada hari ini. Barber memanggil sesuai urutan; tiket yang sudah dibayar otomatis hilang setelah 30 menit.',
          to: queue,
          toLabel: 'Buka Antrian',
        },
      ],
    },
    {
      id: 'tutup',
      label: 'Mengakhiri Kerja',
      icon: LogOut,
      items: [
        {
          id: 'tt-tutup',
          q: 'Bagaimana menutup shift di akhir kerja?',
          a: 'Tutup shift mencocokkan uang fisik di laci dengan total penjualan tunai sistem. Lakukan ini sebelum pulang.',
          steps: [
            'Buka menu Tutup Shift.',
            'Hitung seluruh uang di laci dan masukkan jumlahnya.',
            'Sistem menampilkan selisih terhadap penjualan tunai.',
            'Konfirmasi untuk menutup shift.',
          ],
          to: shiftClosing,
          toLabel: 'Buka Tutup Shift',
        },
        {
          id: 'tt-selisih',
          q: 'Ada selisih uang saat tutup shift, bagaimana?',
          a: 'Selisih berarti uang laci tidak sama dengan catatan sistem. Hitung ulang uang dan periksa transaksi tunai. Bila selisih tetap ada, tutup shift apa adanya — selisih tercatat, lalu laporkan ke pemilik toko.',
          to: shiftClosing,
          toLabel: 'Buka Tutup Shift',
        },
      ],
    },
    {
      id: 'absensi',
      label: 'Absensi Digital',
      icon: Fingerprint,
      items: [
        {
          id: 'ab-checkin',
          q: 'Bagaimana cara absen masuk (check-in)?',
          a: 'Absensi memakai lokasi GPS. Anda hanya bisa check-in saat berada di lokasi cabang. Pastikan GPS HP aktif dan izinkan akses lokasi saat diminta browser.',
          steps: [
            'Buka menu Absensi.',
            'Tekan "Check In Sekarang" — izinkan akses lokasi bila browser bertanya.',
            'Bila berhasil, status berubah jadi "Sedang bekerja". Status terlambat dihitung otomatis dari jadwal kerja Anda.',
          ],
          to: attendance,
          toLabel: 'Buka Absensi',
        },
        {
          id: 'ab-checkout',
          q: 'Bagaimana absen pulang (check-out)?',
          a: 'Saat selesai bekerja, buka menu Absensi lalu tekan "Check Out Sekarang". Total jam kerja Anda akan tercatat. Bila lupa check-out, sistem dapat menutupnya otomatis di akhir hari.',
          to: attendance,
          toLabel: 'Buka Absensi',
        },
        {
          id: 'ab-luar',
          q: 'Absen saya ditolak karena di luar jangkauan?',
          a: 'Aplikasi menampilkan jarak Anda dari cabang. Mendekatlah ke lokasi cabang lalu coba lagi. Bila Anda yakin sudah di cabang, pastikan GPS akurat (aktifkan GPS presisi tinggi) atau laporkan ke pemilik toko agar koordinat cabang diperiksa.',
          to: attendance,
          toLabel: 'Buka Absensi',
        },
      ],
    },
    {
      id: 'umum',
      label: 'Masalah Umum',
      icon: HelpCircle,
      items: [
        {
          id: 'u-logout',
          q: 'Saya tiba-tiba keluar dari sistem (logout)?',
          a: 'Login kembali memakai email dan kata sandi Anda lewat alamat subdomain toko. Bila terus berulang, laporkan ke pemilik toko.',
        },
        {
          id: 'u-layanan',
          q: 'Layanan atau harga yang saya cari tidak ada?',
          a: 'Daftar layanan dan harga dikelola oleh pemilik toko. Bila ada yang kurang atau salah, minta pemilik memperbaruinya di menu Layanan.',
        },
      ],
    },
  ]
}

export default function KasirHelpPage() {
  const { user } = useAuthStore()
  const slug = getBranchSlug(user)
  const categories = useMemo(() => {
    const cats = buildCategories(slug)
    cats.forEach(c => c.items.forEach(it => {
      if (FEATURE_BY_ARTICLE[it.id]) it.feature = FEATURE_BY_ARTICLE[it.id]
    }))
    return cats
  }, [slug])
  // Saat flag belum termuat → undefined (tanpa gating) agar tak ada kedipan
  // "terkunci". Kasir tak diberi tombol upgrade (lockedAction tak di-pass).
  const { data: enabledFlags, isSuccess } = useFeatureFlags(user?.tenantId)

  return (
    <HelpCenter
      title="Pusat Bantuan Kasir"
      subtitle="Panduan kerja harian — buka shift, catat transaksi, kelola antrian, tutup shift."
      categories={categories}
      enabledFlags={isSuccess ? (enabledFlags || []) : undefined}
      support={{
        title: 'Ada kendala?',
        desc: 'Untuk perubahan layanan, harga, atau akun, hubungi pemilik toko Anda.',
      }}
    />
  )
}
