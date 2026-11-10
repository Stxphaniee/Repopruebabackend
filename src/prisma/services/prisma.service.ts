import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@PrismaClient';
import type { EnvConfig } from '@Config';

/**
 * Cliente de Prisma atado al ciclo de vida de Nest.
 *
 * Desde Prisma 7 la conexión ya no se resuelve desde schema.prisma: hay que
 * pasarle un driver adapter con la connection string en tiempo de ejecución.
 *
 * Solo los repositorios deberían inyectar este servicio. Los servicios de
 * negocio hablan con los repositorios, no con Prisma.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService<EnvConfig, true>) {
    const adapter = new PrismaPg({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
    });

    super({
      adapter,
      log:
        configService.get('NODE_ENV', { infer: true }) === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado a PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
