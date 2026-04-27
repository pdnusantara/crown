require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // ─── Packages (sync features to match frontend ALL_FLAGS IDs) ─────
  const packageDefs = [
    {
      name: 'Basic',
      price: 299000, maxBranches: 1, maxStaff: 5,
      branchAddonPrice: 99000, branchAddonType: 'monthly',
      description: 'Cocok untuk barbershop single-outlet',
      features: ['pos', 'queue', 'booking', 'loyalty', 'pwa'],
    },
    {
      name: 'Pro',
      price: 599000, maxBranches: 1, maxStaff: 20,
      branchAddonPrice: 79000, branchAddonType: 'monthly',
      description: 'Untuk barbershop yang ingin scaling',
      features: ['pos', 'queue', 'booking', 'loyalty', 'voucher', 'reports', 'heatmap', 'clv', 'schedule', 'multi_branch', 'whatsapp', 'barber_rating', 'pwa', 'backup'],
    },
    {
      name: 'Enterprise',
      price: 1299000, maxBranches: 1, maxStaff: 99,
      branchAddonPrice: 49000, branchAddonType: 'monthly',
      description: 'Skala besar, unlimited fitur & prioritas support',
      features: ['pos', 'queue', 'booking', 'loyalty', 'voucher', 'reports', 'heatmap', 'clv', 'schedule', 'multi_branch', 'whatsapp', 'barber_rating', 'pwa', 'backup', 'api_access', 'white_label'],
    },
  ];
  for (const pkg of packageDefs) {
    await prisma.package.upsert({
      where: { name: pkg.name },
      update: { features: pkg.features, description: pkg.description },
      create: pkg,
    });
  }
  console.log('Upserted packages with feature flags');

  // ─── Super Admin ───────────────────────────────────────────────────
  const superAdminPassword = await bcrypt.hash('Admin123!', 10);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@barberos.com' },
    update: {},
    create: {
      email: 'admin@barberos.com',
      password: superAdminPassword,
      name: 'Super Admin',
      role: 'super_admin',
      phone: '+6281234567890',
      isActive: true,
    },
  });
  console.log('Created super admin:', superAdmin.email);

  // ─── Tenant 1: Barber Kingdom ──────────────────────────────────────
  const tenant1 = await prisma.tenant.upsert({
    where: { email: 'info@barberkingdom.com' },
    update: { slug: 'barberkingdom' },
    create: {
      name: 'Barber Kingdom',
      slug: 'barberkingdom',
      email: 'info@barberkingdom.com',
      phone: '+6282111222333',
      address: 'Jl. Sudirman No. 1, Jakarta Pusat',
    },
  });
  console.log('Created tenant 1:', tenant1.name);

  // Branches for Tenant 1
  const branch1a = await prisma.branch.upsert({
    where: { id: 'branch-bk-1' },
    update: {},
    create: {
      id: 'branch-bk-1',
      tenantId: tenant1.id,
      name: 'Barber Kingdom - Sudirman',
      address: 'Jl. Sudirman No. 1, Jakarta Pusat',
      phone: '+6282111222334',
      openTime: '09:00',
      closeTime: '21:00',
    },
  });

  const branch1b = await prisma.branch.upsert({
    where: { id: 'branch-bk-2' },
    update: {},
    create: {
      id: 'branch-bk-2',
      tenantId: tenant1.id,
      name: 'Barber Kingdom - Menteng',
      address: 'Jl. Menteng No. 5, Jakarta Pusat',
      phone: '+6282111222335',
      openTime: '08:00',
      closeTime: '22:00',
    },
  });
  console.log('Created branches for tenant 1');

  // Staff for Tenant 1
  const adminT1Password = await bcrypt.hash('Admin123!', 10);
  const adminT1 = await prisma.user.upsert({
    where: { email: 'admin@barberkingdom.com' },
    update: {},
    create: {
      email: 'admin@barberkingdom.com',
      password: adminT1Password,
      name: 'Admin Barber Kingdom',
      role: 'tenant_admin',
      tenantId: tenant1.id,
      phone: '+6282111222340',
      isActive: true,
    },
  });

  const kasir1Password = await bcrypt.hash('Kasir123!', 10);
  const kasir1 = await prisma.user.upsert({
    where: { email: 'kasir@barberkingdom.com' },
    update: {},
    create: {
      email: 'kasir@barberkingdom.com',
      password: kasir1Password,
      name: 'Kasir Sudirman',
      role: 'kasir',
      tenantId: tenant1.id,
      branchId: branch1a.id,
      phone: '+6282111222341',
      isActive: true,
    },
  });

  const barber1Password = await bcrypt.hash('Barber123!', 10);
  const barber1 = await prisma.user.upsert({
    where: { email: 'budi@barberkingdom.com' },
    update: {},
    create: {
      email: 'budi@barberkingdom.com',
      password: barber1Password,
      name: 'Budi Santoso',
      role: 'barber',
      tenantId: tenant1.id,
      branchId: branch1a.id,
      phone: '+6282111222342',
      isActive: true,
    },
  });

  const barber2 = await prisma.user.upsert({
    where: { email: 'andi@barberkingdom.com' },
    update: {},
    create: {
      email: 'andi@barberkingdom.com',
      password: barber1Password,
      name: 'Andi Wijaya',
      role: 'barber',
      tenantId: tenant1.id,
      branchId: branch1a.id,
      phone: '+6282111222343',
      isActive: true,
    },
  });
  console.log('Created staff for tenant 1');

  // Services for Tenant 1
  const services1 = await Promise.all([
    prisma.service.upsert({
      where: { id: 'svc-bk-1' },
      update: {},
      create: {
        id: 'svc-bk-1',
        tenantId: tenant1.id,
        name: 'Potong Rambut Reguler',
        description: 'Potong rambut standar dengan teknik klasik',
        price: 50000,
        duration: 30,
        category: 'Haircut',
        icon: 'scissors',
      },
    }),
    prisma.service.upsert({
      where: { id: 'svc-bk-2' },
      update: {},
      create: {
        id: 'svc-bk-2',
        tenantId: tenant1.id,
        name: 'Potong Rambut + Cuci',
        description: 'Potong rambut lengkap dengan keramas dan styling',
        price: 75000,
        duration: 45,
        category: 'Haircut',
        icon: 'scissors',
      },
    }),
    prisma.service.upsert({
      where: { id: 'svc-bk-3' },
      update: {},
      create: {
        id: 'svc-bk-3',
        tenantId: tenant1.id,
        name: 'Cukur Jenggot',
        description: 'Trimming dan shaping jenggot profesional',
        price: 35000,
        duration: 20,
        category: 'Beard',
        icon: 'razor',
      },
    }),
    prisma.service.upsert({
      where: { id: 'svc-bk-4' },
      update: {},
      create: {
        id: 'svc-bk-4',
        tenantId: tenant1.id,
        name: 'Paket Lengkap',
        description: 'Potong rambut + cuci + cukur jenggot + styling',
        price: 120000,
        duration: 75,
        category: 'Package',
        icon: 'star',
      },
    }),
    prisma.service.upsert({
      where: { id: 'svc-bk-5' },
      update: {},
      create: {
        id: 'svc-bk-5',
        tenantId: tenant1.id,
        name: 'Creambath',
        description: 'Perawatan rambut dengan krim khusus',
        price: 85000,
        duration: 60,
        category: 'Treatment',
        icon: 'droplet',
      },
    }),
  ]);
  console.log('Created services for tenant 1');

  // Subscription for Tenant 1 (Pro)
  await prisma.subscription.upsert({
    where: { tenantId: tenant1.id },
    update: {},
    create: {
      tenantId: tenant1.id,
      package: 'Pro',
      status: 'active',
      price: 299000,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      autoRenew: true,
    },
  });
  console.log('Created Pro subscription for tenant 1');

  // Feature flags for Tenant 1
  const flags1 = ['queue', 'bookings', 'loyalty', 'vouchers', 'reports', 'multi_branch', 'barber_ratings', 'shifts'];
  await Promise.all(
    flags1.map((flagId) =>
      prisma.tenantFeatureFlag.upsert({
        where: { tenantId_flagId: { tenantId: tenant1.id, flagId } },
        update: {},
        create: { tenantId: tenant1.id, flagId, enabled: true },
      })
    )
  );

  // Vouchers for Tenant 1
  await prisma.voucher.upsert({
    where: { tenantId_code: { tenantId: tenant1.id, code: 'WELCOME10' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      code: 'WELCOME10',
      description: '10% off for new customers',
      type: 'percentage',
      value: 10,
      minPurchase: 50000,
      maxUses: 100,
      isActive: true,
    },
  });

  await prisma.voucher.upsert({
    where: { tenantId_code: { tenantId: tenant1.id, code: 'FLAT20K' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      code: 'FLAT20K',
      description: 'Diskon Rp 20.000',
      type: 'flat',
      value: 20000,
      minPurchase: 75000,
      isActive: true,
    },
  });
  console.log('Created vouchers for tenant 1');

  // Sample customers for Tenant 1
  const customers1 = await Promise.all([
    prisma.customer.upsert({
      where: { id: 'cust-bk-1' },
      update: {},
      create: {
        id: 'cust-bk-1',
        tenantId: tenant1.id,
        name: 'Ahmad Fauzi',
        phone: '081234567890',
        email: 'ahmad@email.com',
        loyaltyPoints: 150,
        visitCount: 5,
      },
    }),
    prisma.customer.upsert({
      where: { id: 'cust-bk-2' },
      update: {},
      create: {
        id: 'cust-bk-2',
        tenantId: tenant1.id,
        name: 'Rizky Pratama',
        phone: '081234567891',
        email: 'rizky@email.com',
        loyaltyPoints: 80,
        visitCount: 3,
      },
    }),
    prisma.customer.upsert({
      where: { id: 'cust-bk-3' },
      update: {},
      create: {
        id: 'cust-bk-3',
        tenantId: tenant1.id,
        name: 'Dian Setiawan',
        phone: '081234567892',
        loyaltyPoints: 200,
        visitCount: 8,
      },
    }),
  ]);
  console.log('Created customers for tenant 1');

  // ─── Tenant 2: Freshcut Studio ─────────────────────────────────────
  const tenant2 = await prisma.tenant.upsert({
    where: { email: 'hello@freshcutstudio.id' },
    update: { slug: 'freshcut' },
    create: {
      name: 'Freshcut Studio',
      slug: 'freshcut',
      email: 'hello@freshcutstudio.id',
      phone: '+6282222333444',
      address: 'Jl. Gatot Subroto No. 88, Bandung',
    },
  });
  console.log('Created tenant 2:', tenant2.name);

  // Branch for Tenant 2
  const branch2a = await prisma.branch.upsert({
    where: { id: 'branch-fc-1' },
    update: {},
    create: {
      id: 'branch-fc-1',
      tenantId: tenant2.id,
      name: 'Freshcut Studio - Gatsu',
      address: 'Jl. Gatot Subroto No. 88, Bandung',
      phone: '+6282222333445',
      openTime: '10:00',
      closeTime: '20:00',
    },
  });

  // Staff for Tenant 2
  const adminT2Password = await bcrypt.hash('Admin123!', 10);
  await prisma.user.upsert({
    where: { email: 'admin@freshcutstudio.id' },
    update: {},
    create: {
      email: 'admin@freshcutstudio.id',
      password: adminT2Password,
      name: 'Admin Freshcut',
      role: 'tenant_admin',
      tenantId: tenant2.id,
      phone: '+6282222333446',
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'kasir@freshcutstudio.id' },
    update: {},
    create: {
      email: 'kasir@freshcutstudio.id',
      password: await bcrypt.hash('Kasir123!', 10),
      name: 'Kasir Freshcut',
      role: 'kasir',
      tenantId: tenant2.id,
      branchId: branch2a.id,
      phone: '+6282222333447',
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'rafi@freshcutstudio.id' },
    update: {},
    create: {
      email: 'rafi@freshcutstudio.id',
      password: barber1Password,
      name: 'Rafi Hakim',
      role: 'barber',
      tenantId: tenant2.id,
      branchId: branch2a.id,
      phone: '+6282222333448',
      isActive: true,
    },
  });
  console.log('Created staff for tenant 2');

  // Services for Tenant 2
  await Promise.all([
    prisma.service.upsert({
      where: { id: 'svc-fc-1' },
      update: {},
      create: {
        id: 'svc-fc-1',
        tenantId: tenant2.id,
        name: 'Potong Rambut',
        price: 45000,
        duration: 30,
        category: 'Haircut',
      },
    }),
    prisma.service.upsert({
      where: { id: 'svc-fc-2' },
      update: {},
      create: {
        id: 'svc-fc-2',
        tenantId: tenant2.id,
        name: 'Haircut + Wash',
        price: 70000,
        duration: 45,
        category: 'Haircut',
      },
    }),
    prisma.service.upsert({
      where: { id: 'svc-fc-3' },
      update: {},
      create: {
        id: 'svc-fc-3',
        tenantId: tenant2.id,
        name: 'Beard Trim',
        price: 30000,
        duration: 15,
        category: 'Beard',
      },
    }),
  ]);

  // Subscription for Tenant 2 (Basic)
  await prisma.subscription.upsert({
    where: { tenantId: tenant2.id },
    update: {},
    create: {
      tenantId: tenant2.id,
      package: 'Basic',
      status: 'trial',
      price: 99000,
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-04-30'),
      autoRenew: false,
    },
  });
  console.log('Created Basic trial subscription for tenant 2');

  // Feature flags for Tenant 2 (limited)
  const flags2 = ['queue', 'bookings', 'loyalty'];
  await Promise.all(
    flags2.map((flagId) =>
      prisma.tenantFeatureFlag.upsert({
        where: { tenantId_flagId: { tenantId: tenant2.id, flagId } },
        update: {},
        create: { tenantId: tenant2.id, flagId, enabled: true },
      })
    )
  );
  console.log('Created feature flags for tenant 2');

  // ─── Sample Broadcast ──────────────────────────────────────────────
  const broadcast = await prisma.broadcast.create({
    data: {
      title: 'Selamat Datang di BarberOS!',
      message:
        'Terima kasih telah bergabung dengan platform BarberOS. Nikmati fitur-fitur lengkap untuk mengelola bisnis barbershop Anda dengan lebih efisien.',
      type: 'info',
      active: true,
    },
  });

  await prisma.broadcastRecipient.createMany({
    data: [
      { broadcastId: broadcast.id, tenantId: tenant1.id },
      { broadcastId: broadcast.id, tenantId: tenant2.id },
    ],
    skipDuplicates: true,
  });
  console.log('Created sample broadcast');

  // ─── Sample Ticket ─────────────────────────────────────────────────
  await prisma.ticket.create({
    data: {
      tenantId: tenant1.id,
      subject: 'Cara mengatur jadwal shift barber',
      description:
        'Halo, saya ingin mengetahui cara mengatur jadwal shift untuk para barber di cabang kami. Apakah ada panduan penggunaan fitur shifts?',
      category: 'General',
      priority: 'medium',
      status: 'open',
      createdById: adminT1.id,
    },
  });
  console.log('Created sample ticket');

  // ─── Sample Ratings ────────────────────────────────────────────────
  await prisma.barberRating.createMany({
    data: [
      { barberId: barber1.id, rating: 5 },
      { barberId: barber1.id, rating: 4 },
      { barberId: barber1.id, rating: 5 },
      { barberId: barber2.id, rating: 4 },
      { barberId: barber2.id, rating: 3 },
    ],
  });
  console.log('Created sample barber ratings');

  console.log('\nSeed completed successfully!\n');
  console.log('─────────────────────────────────────────');
  console.log('Test accounts:');
  console.log('  Super Admin:    admin@barberos.com         / Admin123!');
  console.log('  Tenant Admin 1: admin@barberkingdom.com    / Admin123!');
  console.log('  Kasir 1:        kasir@barberkingdom.com    / Kasir123!');
  console.log('  Barber 1:       budi@barberkingdom.com     / Barber123!');
  console.log('  Barber 2:       andi@barberkingdom.com     / Barber123!');
  console.log('  Tenant Admin 2: admin@freshcutstudio.id    / Admin123!');
  console.log('  Kasir 2:        kasir@freshcutstudio.id    / Kasir123!');
  console.log('  Barber (FC):    rafi@freshcutstudio.id     / Barber123!');
  console.log('─────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
