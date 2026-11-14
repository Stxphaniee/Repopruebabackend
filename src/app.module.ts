import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AuthModule } from '@Auth';
import { JwtAuthGuard } from '@Auth/guards';
import { validateEnv } from '@Config';
import { HealthModule } from '@Health';
import { PrismaModule } from '@Prisma';
import { UsersModule } from '@Users';
import { RolesGuard } from './common/auth/roles.js';
import { TemporadaModule } from './common/temporada.js';
import { CuentasModule } from './cuentas/cuentas.module.js';
import { EquiposModule } from './equipos/equipos.module.js';
import { EstadisticasModule } from './estadisticas/estadisticas.module.js';
import { MultimediaModule } from './multimedia/multimedia.module.js';
import { NotificacionCoreModule } from './notificaciones/notificacion.service.js';
import { NotificacionesModule } from './notificaciones/notificaciones.module.js';
import { PagosModule } from './pagos/pagos.module.js';
import { PartidosModule } from './partidos/partidos.module.js';
import { TablaModule } from './tabla/tabla.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Si falta DATABASE_URL o JWT_SECRET, la app no arranca.
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    TemporadaModule,
    NotificacionCoreModule,
    CuentasModule,
    EquiposModule,
    PartidosModule,
    TablaModule,
    EstadisticasModule,
    PagosModule,
    NotificacionesModule,
    MultimediaModule,
  ],
  providers: [
    {
      // Todo cerrado por defecto: las rutas públicas se abren con @Public().
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    {
      // Autorización basada en roles (@Roles).
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
