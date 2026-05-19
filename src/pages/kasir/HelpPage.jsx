import React, { useMemo } from 'react'
import {
  LogIn, CreditCard, ListOrdered, LogOut, HelpCircle,
} from 'lucide-react'
import HelpCenter from '../../components/HelpCenter.jsx'
import { useAuthStore } from '../../store/authStore.js'
import { getBranchSlug } from '../../utils/branchSlug.js'

// ── /:branchId/kasir/bantuan — Pusat Bantuan untuk kasir ─────────────────────
// Panduan operasional harian: buka shift → transaksi → antrian → tutup shift.
// Tautan dibangun dari slug cabang aktif kasir.
function buildCategories(slug) {
  const pos          = `/${slug}/kasir/pos`
  const queue        = `/${slug}/kasir/queue`
  const bookings     = `/${slug}/kasir/bookings`
  const transactions = `/${slug}/kasir/transactions`
  const shiftClosing = `/${slug}/kasir/shift-closing`

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
          id: 'tx-poin',
          q: 'Bagaimana memakai poin loyalti pelanggan?',
          a: 'Pelanggan terdaftar bisa menukar poin sebagai potongan. 1 poin bernilai Rp100, dengan batas maksimal 50% dari subtotal.',
          steps: [
            'Pastikan pelanggan sudah dipilih di keranjang.',
            'Buka opsi tukar poin sebelum menekan Bayar.',
            'Masukkan jumlah poin — potongan langsung terhitung.',
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
          id: 'tx-riwayat',
          q: 'Di mana melihat transaksi yang sudah dibuat?',
          a: 'Menu Transaksi menampilkan seluruh transaksi pada cabang ini. Anda bisa mencari, melihat detail, dan mencetak ulang struk.',
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
            'Buka menu Booking lalu tekan tombol Walk-in.',
            'Isi data pelanggan dan layanan yang diminta.',
            'Simpan — tiket antrian otomatis dibuat untuk hari ini.',
          ],
          to: bookings,
          toLabel: 'Buka Booking',
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
  const categories = useMemo(() => buildCategories(slug), [slug])

  return (
    <HelpCenter
      title="Pusat Bantuan Kasir"
      subtitle="Panduan kerja harian — buka shift, catat transaksi, kelola antrian, tutup shift."
      categories={categories}
      support={{
        title: 'Ada kendala?',
        desc: 'Untuk perubahan layanan, harga, atau akun, hubungi pemilik toko Anda.',
      }}
    />
  )
}
