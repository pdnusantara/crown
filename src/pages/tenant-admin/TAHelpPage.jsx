import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Rocket, Store, Users, BarChart3, Settings,
} from 'lucide-react'
import HelpCenter from '../../components/HelpCenter.jsx'

// ── /admin/bantuan — Pusat Bantuan untuk pemilik toko (tenant_admin) ──────────
// Konten statis: panduan langkah demi langkah tiap fitur, plus tautan langsung
// ke halaman terkait. Footer mengarah ke tiket support BarberOS.
const CATEGORIES = [
  {
    id: 'mulai',
    label: 'Memulai',
    icon: Rocket,
    items: [
      {
        id: 'm-checklist',
        q: 'Apa itu checklist "Persiapan Toko" di dashboard?',
        a: 'Checklist memandu Anda menyiapkan toko baru. Tiap langkah tercentang otomatis saat datanya sudah ada, dan checklist hilang sendiri begitu keempat langkah selesai.',
        steps: [
          'Tambah cabang pertama beserta alamat dan jam buka.',
          'Buat daftar layanan lengkap dengan harga dan durasi.',
          'Tambah akun kasir dan barber yang akan melayani.',
          'Catat transaksi pertama lewat menu POS di akun kasir.',
        ],
      },
      {
        id: 'm-cabang',
        q: 'Bagaimana menambah cabang?',
        a: 'Cabang adalah lokasi fisik toko Anda. Setiap transaksi, antrian, dan shift terikat ke satu cabang.',
        steps: [
          'Buka menu Cabang.',
          'Klik "Tambah Cabang", isi nama, alamat, dan jam operasional.',
          'Simpan — kasir bisa langsung dipasang ke cabang itu.',
        ],
        to: '/admin/branches',
        toLabel: 'Buka Cabang',
      },
      {
        id: 'm-layanan',
        q: 'Bagaimana mengatur daftar layanan dan harga?',
        a: 'Layanan adalah item yang dijual kasir di POS — potong rambut, cukur, cuci, dan lainnya. Harga serta durasi dipakai untuk transaksi dan estimasi antrian.',
        steps: [
          'Buka menu Layanan.',
          'Tambah layanan baru: nama, kategori, harga, dan durasi.',
          'Atur komisi barber bila layanan ini menghasilkan komisi.',
        ],
        to: '/admin/services',
        toLabel: 'Buka Layanan',
      },
      {
        id: 'm-staf',
        q: 'Bagaimana membuat akun kasir dan barber?',
        a: 'Setiap staf butuh akun untuk login. Kasir memproses transaksi di POS; barber muncul di pilihan saat melayani pelanggan.',
        steps: [
          'Buka menu Staff.',
          'Klik "Tambah Staff", pilih peran (kasir atau barber).',
          'Tetapkan cabang dan beri email serta kata sandi awal.',
          'Untuk barber pilih skema gaji (Komisi / Pokok / Pokok + Komisi); untuk kasir isi gaji pokok bulanan.',
          'Bagikan kredensial — staf login lewat subdomain toko Anda.',
        ],
        to: '/admin/staff',
        toLabel: 'Buka Staff',
      },
    ],
  },
  {
    id: 'operasional',
    label: 'Operasional Harian',
    icon: Store,
    items: [
      {
        id: 'o-pos',
        q: 'Bagaimana alur transaksi di kasir (POS)?',
        a: 'POS dipakai akun kasir untuk mencatat penjualan. Sebagai pemilik Anda tidak melayani transaksi langsung, tetapi penting memahami alurnya.',
        steps: [
          'Kasir membuka shift sebelum transaksi pertama.',
          'Pilih pelanggan (wajib), barber, dan layanan ke keranjang.',
          'Terapkan voucher atau poin loyalti bila ada.',
          'Pilih metode bayar dan selesaikan — struk tercetak.',
        ],
      },
      {
        id: 'o-antrian',
        q: 'Bagaimana sistem antrian bekerja?',
        a: 'Antrian menampilkan pelanggan yang menunggu giliran di tiap cabang. Tiket antrian bisa dibuat dari walk-in maupun booking.',
        steps: [
          'Pelanggan walk-in didaftarkan kasir lewat tombol Walk-in.',
          'Booking yang check-in otomatis masuk antrian.',
          'Barber memanggil dan menyelesaikan tiket sesuai urutan.',
        ],
      },
      {
        id: 'o-booking',
        q: 'Bagaimana mengelola booking pelanggan?',
        a: 'Booking adalah janji temu yang dibuat pelanggan lewat halaman publik /book atau oleh kasir. Pada hari-H booking di-check-in agar masuk antrian.',
        steps: [
          'Aktifkan dan sesuaikan halaman booking publik di Pengaturan.',
          'Kasir memantau booking masuk di menu Booking.',
          'Saat pelanggan datang, kasir menekan check-in.',
        ],
      },
      {
        id: 'o-shift',
        q: 'Apa itu tutup shift dan kenapa penting?',
        a: 'Tutup shift mencocokkan uang fisik di laci dengan total transaksi sistem. Selisih tercatat sehingga kebocoran kas mudah terdeteksi.',
        steps: [
          'Kasir membuka shift di awal jam kerja.',
          'Di akhir shift, kasir menghitung uang laci.',
          'Sistem menampilkan selisih terhadap penjualan tunai.',
        ],
      },
    ],
  },
  {
    id: 'pelanggan',
    label: 'Pelanggan & Loyalti',
    icon: Users,
    items: [
      {
        id: 'p-pelanggan',
        q: 'Bagaimana mengelola data pelanggan?',
        a: 'Setiap pelanggan menyimpan riwayat kunjungan, poin loyalti, dan segmen RFM. Data ini membantu Anda mengenali pelanggan setia.',
        to: '/admin/customers',
        toLabel: 'Buka Pelanggan',
      },
      {
        id: 'p-loyalti',
        q: 'Bagaimana program poin loyalti bekerja?',
        a: 'Pelanggan mengumpulkan poin tiap transaksi. Poin bisa ditukar di POS sebagai potongan — 1 poin setara Rp100, maksimal 50% dari subtotal.',
        steps: [
          'Poin bertambah otomatis saat transaksi selesai.',
          'Kasir menukar poin pelanggan di POS sebelum bayar.',
          'Riwayat poin tercatat pada profil pelanggan.',
        ],
        to: '/admin/customers',
        toLabel: 'Buka Pelanggan',
      },
      {
        id: 'p-voucher',
        q: 'Bagaimana membuat voucher diskon?',
        a: 'Voucher memberi potongan harga dengan kode unik. Voucher bisa berupa nominal tetap atau persentase, dengan batas pakai dan masa berlaku.',
        steps: [
          'Buka menu Voucher.',
          'Buat voucher: kode, jenis diskon, dan masa berlaku.',
          'Bagikan kode — kasir memasukkannya di POS saat bayar.',
        ],
        to: '/admin/vouchers',
        toLabel: 'Buka Voucher',
      },
      {
        id: 'p-rating',
        q: 'Di mana saya melihat rating barber?',
        a: 'Pelanggan dapat memberi rating setelah dilayani. Halaman Rating Barber merangkum skor tiap barber agar Anda bisa menilai kualitas layanan.',
        to: '/admin/ratings',
        toLabel: 'Buka Rating Barber',
      },
    ],
  },
  {
    id: 'laporan',
    label: 'Laporan & Analisis',
    icon: BarChart3,
    items: [
      {
        id: 'l-laporan',
        q: 'Laporan apa saja yang tersedia?',
        a: 'Menu Laporan menyajikan omzet, jumlah transaksi, performa layanan, serta performa tiap barber lengkap dengan komisi riil yang mereka hasilkan. Bisa difilter per cabang dan periode, lalu diekspor ke CSV.',
        to: '/admin/reports',
        toLabel: 'Buka Laporan',
      },
      {
        id: 'l-perbandingan',
        q: 'Bagaimana membandingkan performa antar cabang?',
        a: 'Halaman Perbandingan Cabang menampilkan metrik beberapa cabang berdampingan sehingga mudah melihat cabang mana yang unggul.',
        to: '/admin/comparison',
        toLabel: 'Buka Perbandingan',
      },
      {
        id: 'l-pengeluaran',
        q: 'Bagaimana mencatat pengeluaran toko?',
        a: 'Menu Pengeluaran mencatat biaya operasional (sewa, gaji, listrik, belanja, dll). Total pengeluaran dipotong dari omzet untuk menghitung laba bersih bulan tersebut.',
        steps: [
          'Klik "Tambah", pilih kategori, isi nominal, tanggal, dan deskripsi.',
          'Pakai pemilih bulan di atas untuk berpindah periode.',
          'Tombol "Salin Bulan Lalu" menyalin pengeluaran rutin (sewa, gaji, internet) dari bulan sebelumnya — centang yang perlu, simpan sekaligus.',
          'Ekspor CSV untuk menyimpan rekap pengeluaran satu bulan.',
        ],
        to: '/admin/expenses',
        toLabel: 'Buka Pengeluaran',
      },
      {
        id: 'l-gaji-barber',
        q: 'Bagaimana mencatat gaji barber dan kasir?',
        a: 'Skema gaji tiap staf diatur di menu Staf. Barber: Komisi (% omzet), Gaji Pokok, atau Pokok + Komisi. Kasir: Gaji Pokok bulanan. Fitur "Gaji Staf" menghitung gaji tiap staf otomatis sesuai skemanya — pembayaran tetap Anda yang mencatat.',
        steps: [
          'Atur skema/nominal gaji tiap staf di menu Staf.',
          'Di halaman Pengeluaran, klik tombol "Gaji Staf".',
          'Muncul daftar gaji barber & kasir untuk bulan yang dilihat, lengkap dengan rinciannya.',
          'Klik "Catat" — form pengeluaran terisi otomatis (kategori Gaji & Honor, nominal = gaji).',
          'Periksa nominalnya (boleh diubah bila berbeda), lalu simpan. Staf yang sudah dicatat ditandai "✓ Dicatat".',
        ],
        to: '/admin/expenses',
        toLabel: 'Buka Pengeluaran',
      },
    ],
  },
  {
    id: 'pengaturan',
    label: 'Pengaturan & Akun',
    icon: Settings,
    items: [
      {
        id: 's-pengaturan',
        q: 'Apa yang bisa diatur di menu Pengaturan?',
        a: 'Pengaturan mencakup profil toko, tampilan halaman booking publik, zona waktu, notifikasi WhatsApp, serta pesan otomatis setelah transaksi.',
        to: '/admin/settings',
        toLabel: 'Buka Pengaturan',
      },
      {
        id: 's-pesan-transaksi',
        q: 'Bagaimana menyesuaikan pesan WhatsApp setelah transaksi?',
        a: 'Di Pengaturan → tab Pesan Transaksi Anda bisa menulis sendiri teks pesan WhatsApp untuk pelanggan. Gunakan {nama} untuk nama pelanggan dan {toko} untuk nama toko.',
        steps: [
          'Buka Pengaturan lalu pilih tab Pesan Transaksi.',
          'Isi "Pesan WhatsApp otomatis ke pelanggan" — kalimat pembuka notifikasi otomatis (rincian transaksi ditambahkan otomatis).',
          'Isi "Penutup pesan WhatsApp share manual" — kalimat penutup saat kasir membagikan struk lewat tombol WhatsApp.',
          'Klik Simpan Pesan. Bila notifikasi otomatis aktif, tombol share manual di kasir otomatis disembunyikan agar pelanggan tak dapat dua pesan.',
        ],
        to: '/admin/settings',
        toLabel: 'Buka Pengaturan',
      },
      {
        id: 's-pengingat-kunjungan',
        q: 'Bagaimana mengingatkan pelanggan lama yang belum kembali?',
        a: 'Di Pengaturan → tab Pengingat Kunjungan, sistem dapat mengirim pesan WhatsApp otomatis ke pelanggan yang sudah sekian hari tidak berkunjung. Memerlukan WhatsApp toko tersambung di tab WhatsApp Beta.',
        steps: [
          'Sambungkan WhatsApp toko lebih dulu di tab WhatsApp Beta.',
          'Buka tab Pengingat Kunjungan, nyalakan "Aktifkan pengingat kunjungan".',
          'Tentukan ambang hari (mis. 30 hari tanpa kunjungan) dan jam kirim harian.',
          'Pilih frekuensi: "Sekali saja" (1× per masa nonaktif) atau "Berulang" (kirim ulang tiap ambang hari).',
          'Tulis teks pesan — gunakan {nama}, {toko}, dan {hari} sebagai placeholder.',
          'Simpan. Gunakan "Kirim Pengingat Sekarang" untuk mengirim langsung tanpa menunggu jadwal.',
        ],
        to: '/admin/settings',
        toLabel: 'Buka Pengaturan',
      },
      {
        id: 's-jadwal',
        q: 'Bagaimana mengatur jadwal kerja barber?',
        a: 'Menu Jadwal menentukan hari dan jam kerja tiap barber. Jadwal ini memengaruhi slot yang tersedia di halaman booking publik.',
        to: '/admin/schedule',
        toLabel: 'Buka Jadwal',
      },
      {
        id: 's-langganan',
        q: 'Bagaimana memperpanjang langganan?',
        a: 'Masa langganan toko terlihat di sidebar dan menu Billing. Sebelum kedaluwarsa, perpanjang lewat Billing agar toko tetap aktif.',
        steps: [
          'Buka menu Billing.',
          'Pilih paket dan klik perpanjang.',
          'Selesaikan pembayaran — masa aktif diperpanjang otomatis.',
        ],
        to: '/admin/billing',
        toLabel: 'Buka Billing',
      },
      {
        id: 's-paket',
        q: 'Beberapa fitur tidak muncul — kenapa?',
        a: 'Sebagian fitur (mis. rating barber) hanya aktif pada paket tertentu. Bila fitur yang Anda butuhkan terkunci, naikkan paket lewat menu Billing.',
        to: '/admin/billing',
        toLabel: 'Buka Billing',
      },
    ],
  },
]

export default function TAHelpPage() {
  const navigate = useNavigate()

  return (
    <HelpCenter
      title="Pusat Bantuan"
      subtitle="Panduan mengelola toko Anda — dari menyiapkan cabang hingga membaca laporan."
      categories={CATEGORIES}
      support={{
        title: 'Masih butuh bantuan?',
        desc: 'Kirim tiket ke tim support BarberOS dan kami akan membantu Anda.',
        action: {
          label: 'Hubungi Support',
          onClick: () => navigate('/admin/tickets'),
        },
      }}
    />
  )
}
