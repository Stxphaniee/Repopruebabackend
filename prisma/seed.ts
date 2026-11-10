import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'Demo1234!';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // `upsert` hace el seed idempotente: se puede correr las veces que haga falta.
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash },
  });

  console.log(`Usuario demo listo: ${user.email} / ${DEMO_PASSWORD}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
