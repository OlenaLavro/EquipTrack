import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { hash } from 'bcryptjs';

import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
});

async function main() {
  const org = await prisma.organization.create({ data: { name: 'BuildCo' } });
  const passwordHash = await hash('password123', 10);

  const [manager, worker] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'manager@buildco.test',
        name: 'Mira Manager',
        role: 'MANAGER',
        passwordHash,
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'worker@buildco.test',
        name: 'Will Worker',
        role: 'WORKER',
        passwordHash,
        organizationId: org.id,
      },
    }),
  ]);

  const site = await prisma.site.create({
    data: {
      name: 'Kyiv, Obolon site',
      organizationId: org.id,
      assets: {
        create: [
          { name: 'Excavator CAT 320', type: 'excavator', qrCode: 'EQ-0001' },
          { name: 'Generator Honda 5kW', type: 'generator', qrCode: 'EQ-0002' },
          { name: 'Crane Liebherr', type: 'crane', qrCode: 'EQ-0003' },
        ],
      },
    },
    include: { assets: true },
  });

  await prisma.ticket.create({
    data: {
      title: 'Hydraulic leak',
      assetId: site.assets[0].id,
      reportedById: worker.id,
      assigneeId: manager.id,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
