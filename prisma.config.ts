import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Configuración del CLI de Prisma (migrate, generate, studio, db seed).
// El runtime de la aplicación no pasa por acá: la conexión se arma en
// src/prisma/prisma.service.ts con el driver adapter PrismaPg.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
