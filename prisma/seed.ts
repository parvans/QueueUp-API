/**
 * Development seed script.
 * Run with: npm run db:seed
 *
 * Creates:
 *   - 1 clinic (City Health Clinic)
 *   - 2 doctors (Dr. Ayesha Patel, Dr. Rohan Mehta)
 *   - 1 admin user
 *   - 1 staff user linked to the clinic
 *
 * This seed is idempotent (uses upsert) — safe to run multiple times.
 * NEVER run against a production database.
 */

import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed script must NOT be run in production.');
  }

  console.log('🌱 Starting seed...');

  // ── Clinic ────────────────────────────────────────────────────────────────
  const clinic = await prisma.clinic.upsert({
    where: { id: 'seed-clinic-001' },
    update: {},
    create: {
      id: 'seed-clinic-001',
      name: 'City Health Clinic',
      address: '42 Main Street, Mumbai',
      phone: '+91 22 1234 5678',
    },
  });
  console.log(`  ✔ Clinic: ${clinic.name}`);

  // ── Doctors ───────────────────────────────────────────────────────────────
  const doctor1 = await prisma.doctor.upsert({
    where: { id: 'seed-doctor-001' },
    update: {},
    create: {
      id: 'seed-doctor-001',
      clinicId: clinic.id,
      name: 'Dr. Ayesha Patel',
      roomNumber: 'Room 1',
      avgServiceTimeSeconds: 600,
    },
  });

  const doctor2 = await prisma.doctor.upsert({
    where: { id: 'seed-doctor-002' },
    update: {},
    create: {
      id: 'seed-doctor-002',
      clinicId: clinic.id,
      name: 'Dr. Rohan Mehta',
      roomNumber: 'Room 2',
      avgServiceTimeSeconds: 600,
    },
  });
  console.log(`  ✔ Doctors: ${doctor1.name}, ${doctor2.name}`);

  // ── Admin user ────────────────────────────────────────────────────────────
  // passwordHash is a placeholder — real bcrypt hashing happens in AuthService.
  // For development, use the AuthModule's staff login endpoint to set a real hash.
  const admin = await prisma.user.upsert({
    where: { phone: '+910000000000' },
    update: {},
    create: {
      id: 'seed-user-admin-001',
      phone: '+910000000000',
      name: 'Admin',
      role: Role.ADMIN,
      email: 'admin@queueup.dev',
      passwordHash: 'PLACEHOLDER_SET_VIA_AUTH_MODULE',
    },
  });
  console.log(`  ✔ Admin: ${admin.email}`);

  // ── Staff user ────────────────────────────────────────────────────────────
  const staffUser = await prisma.user.upsert({
    where: { phone: '+910000000001' },
    update: {},
    create: {
      id: 'seed-user-staff-001',
      phone: '+910000000001',
      name: 'Front Desk Staff',
      role: Role.STAFF,
      email: 'staff@queueup.dev',
      passwordHash: 'PLACEHOLDER_SET_VIA_AUTH_MODULE',
    },
  });

  await prisma.clinicStaff.upsert({
    where: {
      userId_clinicId: {
        userId: staffUser.id,
        clinicId: clinic.id,
      },
    },
    update: {},
    create: {
      userId: staffUser.id,
      clinicId: clinic.id,
    },
  });
  console.log(`  ✔ Staff: ${staffUser.email} → ${clinic.name}`);

  console.log('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
