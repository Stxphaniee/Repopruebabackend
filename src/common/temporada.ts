import { Controller, Get, Global, Injectable, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@Auth/decorators';
import { PrismaService } from '@Prisma/services';
import type { Temporada } from '@PrismaClient';
import { err } from './auth/roles.js';

/**
 * Supuestos generales: una sola temporada activa ("Liga Mayor Amateur -
 * Temporada 2026"). Los períodos (inscripción 1–15 nov, altas/bajas 16 nov–15
 * dic, inclusivos) se configuran en seed.ts y se validan aquí.
 */
@Injectable()
export class TemporadaService {
  constructor(private readonly prisma: PrismaService) {}

  async activa(): Promise<Temporada> {
    const t = await this.prisma.temporada.findFirst({ where: { activa: true } });
    if (!t) throw err.conflict('SIN_TEMPORADA', 'No hay una temporada activa');
    return t;
  }

  /** Comparación por día calendario inclusivo. */
  static dentro(inicio: Date, fin: Date, ahora = new Date()): boolean {
    const finDia = new Date(fin);
    finDia.setUTCHours(23, 59, 59, 999);
    const iniDia = new Date(inicio);
    iniDia.setUTCHours(0, 0, 0, 0);
    return ahora >= iniDia && ahora <= finDia;
  }

  enInscripcion(t: Temporada, ahora = new Date()) {
    return TemporadaService.dentro(t.inscripcionInicio, t.inscripcionFin, ahora);
  }

  enAltasBajas(t: Temporada, ahora = new Date()) {
    return TemporadaService.dentro(t.altasBajasInicio, t.altasBajasFin, ahora);
  }

  /** H2: corrección/reenvío permitido del 1 nov al 15 dic. */
  enInscripcionOAltasBajas(t: Temporada, ahora = new Date()) {
    return TemporadaService.dentro(t.inscripcionInicio, t.altasBajasFin, ahora);
  }
}

/** GET /temporada/activa — público; devuelve id, nombre y cuota para el frontend. */
@ApiTags('temporada')
@Controller('temporada')
export class TemporadaController {
  constructor(private readonly svc: TemporadaService) {}

  @Public()
  @Get('activa')
  async activa() {
    const t = await this.svc.activa();
    return {
      id: t.id,
      nombre: t.nombre,
      cuotaInscripcion: t.cuotaInscripcion,
      inscripcionInicio: t.inscripcionInicio,
      inscripcionFin: t.inscripcionFin,
      altasBajasInicio: t.altasBajasInicio,
      altasBajasFin: t.altasBajasFin,
    };
  }
}

@Global()
@Module({
  controllers: [TemporadaController],
  providers: [TemporadaService],
  exports: [TemporadaService],
})
export class TemporadaModule {}


