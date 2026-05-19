// Seed testimoni landing page (LandingTestimonial).
// Idempotent: testimoni dilewati bila sudah ada (cocok nama + businessName),
// jadi aman dijalankan ulang. Hapus/ubah lewat Super Admin → Landing → Testimoni.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TESTIMONIALS = [
  {
    name: 'Rizky Pratama',
    role: 'Owner',
    businessName: 'Kraton Barbershop',
    message: 'Dulu tiap tutup toko aku rekap manual sampai malam. Sekarang omzet 3 cabang kebaca dari satu layar — tinggal buka HP, langsung tahu cabang mana yang paling rame. Hemat waktu banget.',
    rating: 5,
    displayOrder: 0,
  },
  {
    name: 'Andi Setiawan',
    role: 'Pemilik',
    businessName: "Gentlemen's Cut",
    message: 'Aplikasinya gampang dipakai, kasir baru sehari langsung lancar tanpa training ribet. Antrian pelanggan juga jadi rapi, nggak ada lagi yang berebut giliran.',
    rating: 5,
    displayOrder: 1,
  },
  {
    name: 'Budi Hartono',
    role: 'Owner',
    businessName: 'Classic Barber Co.',
    message: 'Yang paling kerasa itu booking online-nya. Pelanggan pesan sendiri lewat link, jadwal barber langsung kebagi otomatis. Jam sibuk weekend sekarang jauh lebih teratur.',
    rating: 5,
    displayOrder: 2,
  },
  {
    name: 'Dewi Lestari',
    role: 'Manajer',
    businessName: 'Sharp Studio Barber',
    message: 'Fitur WhatsApp otomatis bikin pelanggan ngerasa diurus — struk dan pengingat booking langsung masuk ke chat mereka. Banyak yang balik lagi karena ada poin loyalti juga.',
    rating: 5,
    displayOrder: 3,
  },
  {
    name: 'Fajar Nugroho',
    role: 'Founder',
    businessName: 'Barberia Nusantara',
    message: 'Sebelumnya semua catatan di buku sama Excel, sering selisih. Pakai SembaPOS, laporan harian beres otomatis. Komisi barber juga kehitung sendiri, nggak ada drama lagi tiap gajian.',
    rating: 5,
    displayOrder: 4,
  },
  {
    name: 'Hendra Wijaya',
    role: 'Owner',
    businessName: 'Urban Fade Barbershop',
    message: 'Awalnya coba gratisnya dulu, eh keterusan. Setup-nya cepat, hari itu juga toko udah bisa transaksi. Buat barbershop yang baru mau rapi-rapi, ini pas banget.',
    rating: 5,
    displayOrder: 5,
  },
];

async function main() {
  let created = 0;
  let skipped = 0;
  for (const t of TESTIMONIALS) {
    const existing = await prisma.landingTestimonial.findFirst({
      where: { name: t.name, businessName: t.businessName },
    });
    if (existing) {
      console.log(`• dilewati (sudah ada): ${t.name} — ${t.businessName}`);
      skipped++;
      continue;
    }
    await prisma.landingTestimonial.create({ data: { ...t, isActive: true } });
    console.log(`✓ ditambahkan: ${t.name} — ${t.businessName}`);
    created++;
  }
  console.log(`\nSelesai. ${created} ditambahkan, ${skipped} dilewati.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
