import React, { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Scissors, Mail, ShieldCheck, FileText } from 'lucide-react'
import { useLanding } from '../hooks/useLanding.js'

// Halaman legal publik (Syarat & Ketentuan + Kebijakan Privasi).
// SELALU tema terang dengan warna HEX eksplisit (sama seperti LandingPage) —
// JANGAN pakai class tema app (bg-dark/text-off-white) supaya tidak ikut
// di-flip oleh theme store. Konten netral & editable lewat brand/kontak dari
// /api/landing. Tanggal "terakhir diperbarui" disetel manual saat revisi.
const LAST_UPDATED = '29 Mei 2026'

function Section({ n, title, children }) {
  return (
    <section className="mt-8 scroll-mt-24">
      <h2 className="font-display text-lg sm:text-xl font-bold text-[#1E1B2E] flex items-baseline gap-2">
        <span className="text-[#6366F1] tabular-nums">{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      <div className="mt-2.5 space-y-3 text-[15px] leading-relaxed text-[#3F3D5C]">{children}</div>
    </section>
  )
}

function Bullets({ items }) {
  return (
    <ul className="space-y-1.5 pl-1">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#6366F1] flex-shrink-0" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

function TermsContent({ siteName, email }) {
  return (
    <>
      <Section n={1} title="Penerimaan Syarat">
        <p>
          Dengan mendaftar, mengakses, atau menggunakan layanan {siteName} (“Layanan”), Anda
          menyatakan telah membaca, memahami, dan menyetujui Syarat &amp; Ketentuan ini. Jika Anda
          tidak setuju, mohon untuk tidak menggunakan Layanan. Jika Anda menyetujui atas nama suatu
          badan usaha, Anda menyatakan berwenang untuk mengikat badan usaha tersebut.
        </p>
      </Section>

      <Section n={2} title="Definisi">
        <Bullets items={[
          <><strong>“Layanan”</strong> — aplikasi manajemen barbershop {siteName} (kasir/POS, antrian, booking online, multi-cabang, laporan, dan fitur terkait).</>,
          <><strong>“Pengguna” / “Anda”</strong> — pemilik usaha atau staf yang menggunakan Layanan.</>,
          <><strong>“Akun”</strong> — akun toko (tenant) beserta seluruh data di dalamnya.</>,
          <><strong>“Pelanggan Akhir”</strong> — pelanggan dari usaha Anda yang datanya Anda kelola melalui Layanan.</>,
        ]} />
      </Section>

      <Section n={3} title="Layanan">
        <p>
          {siteName} menyediakan perangkat lunak berbasis langganan (SaaS) untuk membantu
          pengelolaan barbershop. Kami dapat menambah, mengubah, atau menghentikan fitur tertentu
          dari waktu ke waktu untuk peningkatan kualitas. Layanan disediakan “sebagaimana adanya”
          dan “sebagaimana tersedia”.
        </p>
      </Section>

      <Section n={4} title="Pendaftaran & Akun">
        <Bullets items={[
          'Anda wajib memberikan data yang benar, akurat, dan terkini saat mendaftar.',
          'Anda bertanggung jawab penuh atas kerahasiaan kata sandi dan seluruh aktivitas pada Akun Anda.',
          'Segera beri tahu kami jika ada penggunaan Akun tanpa izin atau pelanggaran keamanan.',
          'Satu Akun ditujukan untuk satu badan usaha; Anda bertanggung jawab atas akses staf yang Anda buat.',
        ]} />
      </Section>

      <Section n={5} title="Masa Coba & Langganan">
        <p>
          Layanan menyediakan masa coba gratis (umumnya 14 hari) tanpa kartu kredit. Setelah masa
          coba berakhir, Anda dapat berlangganan salah satu paket berbayar untuk melanjutkan
          penggunaan. Langganan berlaku per periode (bulanan atau tahunan) sesuai paket yang
          dipilih dan <strong>diperpanjang secara otomatis</strong> pada setiap akhir periode kecuali
          dibatalkan sebelum tanggal perpanjangan.
        </p>
        <p>
          Anda dapat menaikkan (upgrade) atau menurunkan (downgrade) paket kapan saja; perubahan
          berlaku sesuai ketentuan penyesuaian biaya pada periode berjalan/berikutnya.
        </p>
      </Section>

      <Section n={6} title="Harga & Pembayaran">
        <Bullets items={[
          <>Pembayaran diproses melalui penyedia pembayaran pihak ketiga (Duitku). Kami tidak menyimpan data kartu/akun pembayaran Anda.</>,
          'Harga dapat berubah sewaktu-waktu; perubahan tidak berlaku surut untuk periode yang sudah dibayar dan akan diberitahukan sebelumnya.',
          'Kegagalan atau keterlambatan pembayaran dapat mengakibatkan penangguhan akses sampai pembayaran diselesaikan.',
          'Seluruh harga sudah termasuk atau belum termasuk pajak sesuai ketentuan yang berlaku dan akan ditampilkan saat checkout.',
        ]} />
      </Section>

      <Section n={7} title="Pengembalian Dana">
        <p>
          Mengingat tersedianya masa coba gratis untuk menilai kecocokan Layanan, pembayaran
          langganan pada umumnya bersifat tidak dapat dikembalikan. Untuk kendala tagihan atau
          permintaan khusus, silakan hubungi kami dan kami akan menindaklanjuti secara wajar dan
          itikad baik.
        </p>
      </Section>

      <Section n={8} title="Kewajiban & Larangan Pengguna">
        <p>Anda setuju untuk tidak:</p>
        <Bullets items={[
          'Menggunakan Layanan untuk tujuan melanggar hukum atau merugikan pihak lain.',
          'Mengakses sistem tanpa izin, merekayasa balik, atau mengganggu keamanan/kinerja Layanan.',
          'Mengunggah konten berbahaya (malware) atau data yang melanggar hak pihak ketiga.',
          'Menyalahgunakan Layanan untuk mengirim pesan spam atau menyalahi ketentuan penyedia (mis. WhatsApp).',
        ]} />
      </Section>

      <Section n={9} title="Data & Konten Anda">
        <p>
          Data yang Anda masukkan (data toko, transaksi, dan data Pelanggan Akhir) tetap menjadi
          milik Anda. Anda memberi kami izin terbatas untuk memproses data tersebut semata-mata
          guna menyediakan dan meningkatkan Layanan. Anda bertanggung jawab memastikan Anda berhak
          mengumpulkan dan mengelola data Pelanggan Akhir sesuai peraturan yang berlaku. Pengelolaan
          data pribadi diatur lebih lanjut dalam <Link to="/kebijakan-privasi" className="text-[#4F46E5] font-medium hover:underline">Kebijakan Privasi</Link>.
        </p>
      </Section>

      <Section n={10} title="Ketersediaan Layanan & Dukungan">
        <p>
          Kami berupaya menjaga Layanan tersedia secara wajar, namun tidak menjamin bebas gangguan
          100%. Pemeliharaan terjadwal atau keadaan di luar kendali (force majeure) dapat
          memengaruhi ketersediaan. Dukungan diberikan melalui kanal resmi yang kami sediakan.
        </p>
      </Section>

      <Section n={11} title="Kekayaan Intelektual">
        <p>
          Seluruh hak atas perangkat lunak, merek, logo, dan materi {siteName} adalah milik kami
          atau pemberi lisensi kami. Syarat ini tidak mengalihkan kepemilikan apa pun kepada Anda
          selain hak pakai terbatas selama langganan aktif.
        </p>
      </Section>

      <Section n={12} title="Batasan Tanggung Jawab">
        <p>
          Sepanjang diizinkan hukum, {siteName} tidak bertanggung jawab atas kerugian tidak
          langsung, kehilangan keuntungan, atau kehilangan data yang timbul dari penggunaan
          Layanan. Total tanggung jawab kami atas klaim apa pun dibatasi sebesar biaya langganan
          yang Anda bayarkan dalam 3 (tiga) bulan terakhir.
        </p>
      </Section>

      <Section n={13} title="Penangguhan & Penghentian">
        <p>
          Kami dapat menangguhkan atau menghentikan Akun yang melanggar Syarat ini atau tidak
          menyelesaikan pembayaran. Anda dapat berhenti berlangganan kapan saja. Setelah
          penghentian, kami dapat menghapus data Akun sesuai jangka waktu retensi pada Kebijakan
          Privasi — pastikan Anda mengekspor data penting sebelum berhenti.
        </p>
      </Section>

      <Section n={14} title="Perubahan Syarat">
        <p>
          Kami dapat memperbarui Syarat ini sewaktu-waktu. Perubahan material akan kami beri tahu
          melalui Layanan atau email. Dengan terus menggunakan Layanan setelah perubahan berlaku,
          Anda dianggap menyetujui Syarat yang diperbarui.
        </p>
      </Section>

      <Section n={15} title="Hukum yang Berlaku">
        <p>
          Syarat ini tunduk pada hukum Republik Indonesia. Setiap sengketa akan diupayakan
          diselesaikan secara musyawarah terlebih dahulu, dan apabila tidak tercapai, diselesaikan
          melalui jalur hukum yang berlaku di Indonesia.
        </p>
      </Section>

      <Section n={16} title="Kontak">
        <p>
          Pertanyaan mengenai Syarat ini dapat disampaikan ke{' '}
          {email
            ? <a href={`mailto:${email}`} className="text-[#4F46E5] font-medium hover:underline break-all">{email}</a>
            : <span className="font-medium">kanal dukungan resmi {siteName}</span>}.
        </p>
      </Section>
    </>
  )
}

function PrivacyContent({ siteName, email }) {
  return (
    <>
      <Section n={1} title="Pendahuluan">
        <p>
          Kebijakan Privasi ini menjelaskan bagaimana {siteName} mengumpulkan, menggunakan,
          menyimpan, dan melindungi data pribadi sehubungan dengan penggunaan Layanan. Kami
          berkomitmen mematuhi Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi
          (UU PDP) dan peraturan terkait di Indonesia.
        </p>
      </Section>

      <Section n={2} title="Data yang Kami Kumpulkan">
        <Bullets items={[
          <><strong>Data akun:</strong> nama, email, nomor telepon, nama usaha, dan kredensial login.</>,
          <><strong>Data transaksi & operasional:</strong> data layanan, penjualan, booking, staf, dan laporan yang Anda buat di Layanan.</>,
          <><strong>Data pembayaran:</strong> diproses oleh Duitku; kami hanya menyimpan status & referensi transaksi, bukan data kartu Anda.</>,
          <><strong>Data teknis:</strong> alamat IP, jenis perangkat/peramban, dan log penggunaan untuk keamanan dan peningkatan layanan.</>,
        ]} />
      </Section>

      <Section n={3} title="Cara & Dasar Kami Menggunakan Data">
        <p>Kami memproses data untuk:</p>
        <Bullets items={[
          'Menyediakan, mengoperasikan, dan memelihara Layanan.',
          'Memproses langganan, pembayaran, dan pengingat tagihan.',
          'Memberi dukungan, notifikasi penting, dan informasi pembaruan.',
          'Menjaga keamanan, mencegah penyalahgunaan, dan memenuhi kewajiban hukum.',
        ]} />
        <p>
          Dasar pemrosesan meliputi pelaksanaan perjanjian (langganan), persetujuan Anda,
          kepentingan sah kami yang wajar, serta kepatuhan hukum.
        </p>
      </Section>

      <Section n={4} title="Data Pelanggan Akhir Anda">
        <p>
          Untuk data Pelanggan Akhir yang Anda kelola melalui Layanan (mis. nama dan nomor telepon
          pelanggan toko Anda), Anda bertindak sebagai pengendali data dan {siteName} sebagai
          pemroses data atas instruksi Anda. Anda bertanggung jawab memperoleh dasar yang sah untuk
          mengumpulkan dan menggunakan data tersebut.
        </p>
      </Section>

      <Section n={5} title="Berbagi Data dengan Pihak Ketiga">
        <p>Kami tidak menjual data Anda. Kami hanya berbagi data seperlunya dengan:</p>
        <Bullets items={[
          'Penyedia pembayaran (Duitku) untuk memproses transaksi langganan.',
          'Penyedia pengiriman pesan (mis. gateway WhatsApp) bila fitur tersebut Anda aktifkan.',
          'Penyedia infrastruktur/hosting untuk menjalankan Layanan.',
          'Pihak berwenang jika diwajibkan oleh hukum.',
        ]} />
      </Section>

      <Section n={6} title="Cookie & Teknologi Serupa">
        <p>
          Kami menggunakan cookie dan penyimpanan lokal untuk menjaga sesi login, preferensi, dan
          mengukur penggunaan secara agregat. Anda dapat mengatur cookie melalui peramban, namun
          beberapa fungsi inti mungkin tidak bekerja tanpanya.
        </p>
      </Section>

      <Section n={7} title="Keamanan Data">
        <p>
          Kami menerapkan langkah teknis dan organisasi yang wajar (mis. enkripsi transport/SSL,
          kontrol akses berbasis peran, pencadangan) untuk melindungi data. Namun, tidak ada sistem
          yang sepenuhnya bebas risiko; kami akan menindaklanjuti insiden keamanan sesuai ketentuan
          yang berlaku.
        </p>
      </Section>

      <Section n={8} title="Penyimpanan & Retensi">
        <p>
          Data disimpan selama Akun aktif dan selama diperlukan untuk tujuan pada kebijakan ini
          atau sebagaimana diwajibkan hukum. Setelah Akun dihentikan, data dapat dihapus atau
          dianonimkan setelah periode retensi yang wajar. Anda disarankan mengekspor data penting
          sebelum berhenti berlangganan.
        </p>
      </Section>

      <Section n={9} title="Hak Anda">
        <p>Sesuai UU PDP, Anda berhak untuk antara lain:</p>
        <Bullets items={[
          'Mengakses dan memperoleh salinan data pribadi Anda.',
          'Memperbaiki data yang tidak akurat.',
          'Menghapus atau membatasi pemrosesan dalam kondisi tertentu.',
          'Menarik persetujuan dan mengajukan keberatan atas pemrosesan tertentu.',
        ]} />
        <p>Permohonan dapat diajukan melalui kontak di bawah; kami akan menanggapi dalam waktu yang wajar.</p>
      </Section>

      <Section n={10} title="Privasi Anak">
        <p>
          Layanan ditujukan untuk pelaku usaha dan tidak diperuntukkan bagi anak di bawah umur.
          Kami tidak dengan sengaja mengumpulkan data pribadi anak.
        </p>
      </Section>

      <Section n={11} title="Perubahan Kebijakan">
        <p>
          Kami dapat memperbarui Kebijakan Privasi ini. Perubahan material akan diberitahukan
          melalui Layanan atau email. Tanggal “Terakhir diperbarui” di atas mencerminkan versi
          terbaru.
        </p>
      </Section>

      <Section n={12} title="Kontak">
        <p>
          Untuk pertanyaan atau permohonan terkait data pribadi, hubungi{' '}
          {email
            ? <a href={`mailto:${email}`} className="text-[#4F46E5] font-medium hover:underline break-all">{email}</a>
            : <span className="font-medium">kanal dukungan resmi {siteName}</span>}.
        </p>
      </Section>
    </>
  )
}

export default function LegalPage() {
  const { pathname } = useLocation()
  const isPrivacy = pathname.includes('privasi') || pathname.includes('privacy')
  const { data } = useLanding()
  const hero = data?.hero || {}
  const siteName = (hero.siteName || 'SembaPOS').trim()
  const email = (hero.contactEmail || '').trim()
  const logo = hero.siteLogo

  const title = isPrivacy ? 'Kebijakan Privasi' : 'Syarat & Ketentuan'
  const Icon = isPrivacy ? ShieldCheck : FileText

  useEffect(() => {
    const prev = document.title
    document.title = `${title} — ${siteName}`
    window.scrollTo(0, 0)
    return () => { document.title = prev }
  }, [title, siteName])

  return (
    <div className="min-h-screen bg-[#F4F4FA] text-[#3F3D5C] font-body antialiased">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-[#F4F4FA]/90 backdrop-blur-md border-b border-[#D5D8E8]">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            {logo ? (
              <img src={logo} alt={siteName} className="h-8 w-auto max-w-[150px] object-contain" />
            ) : (
              <>
                <div className="w-8 h-8 rounded-lg bg-[#1E1B2E] flex items-center justify-center shrink-0">
                  <Scissors size={15} className="text-[#6366F1]" />
                </div>
                <span className="font-display text-lg font-bold tracking-tight text-[#1E1B2E] truncate">{siteName}</span>
              </>
            )}
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#56548A] hover:text-[#1E1B2E] transition-colors shrink-0"
          >
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Kembali ke beranda</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#D5D8E8] text-[#4F46E5] text-xs font-semibold">
          <Icon size={13} /> Dokumen Resmi
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#1E1B2E] tracking-tight mt-4">{title}</h1>
        <p className="text-sm text-[#7C7AA8] mt-2">Terakhir diperbarui: {LAST_UPDATED}</p>

        <div className="mt-8 rounded-2xl bg-white border border-[#D5D8E8] shadow-[0_20px_50px_-30px_rgba(28,26,23,0.3)] p-6 sm:p-9">
          {isPrivacy
            ? <PrivacyContent siteName={siteName} email={email} />
            : <TermsContent siteName={siteName} email={email} />}
        </div>

        {/* Cross-link + kontak */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm">
          <Link
            to={isPrivacy ? '/syarat-ketentuan' : '/kebijakan-privasi'}
            className="inline-flex items-center gap-1.5 font-medium text-[#4F46E5] hover:underline"
          >
            {isPrivacy ? <FileText size={15} /> : <ShieldCheck size={15} />}
            Baca {isPrivacy ? 'Syarat & Ketentuan' : 'Kebijakan Privasi'}
          </Link>
          {email && (
            <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 text-[#56548A] hover:text-[#1E1B2E] transition-colors break-all">
              <Mail size={15} className="text-[#6366F1]" /> {email}
            </a>
          )}
        </div>
      </main>

      <footer className="border-t border-[#D5D8E8] mt-6">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-6 text-[12px] text-[#7C7AA8] flex flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} {siteName}.</span>
          <div className="flex items-center gap-4">
            <Link to="/" className="hover:text-[#1E1B2E] transition-colors">Beranda</Link>
            <Link to="/syarat-ketentuan" className="hover:text-[#1E1B2E] transition-colors">Syarat</Link>
            <Link to="/kebijakan-privasi" className="hover:text-[#1E1B2E] transition-colors">Privasi</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
