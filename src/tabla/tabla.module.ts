import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@Auth/decorators';
import { PrismaService } from '@Prisma/services';
import { EstadoEquipo, EstadoPartido, TipoEvento } from '@PrismaClient';
import { TemporadaModule, TemporadaService } from '../common/temporada.js';

export interface FilaTablaPosiciones {
  posicion: number;
  equipoId: string;
  nombre: string;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
}

@Injectable()
export class TablaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly temporadaService: TemporadaService,
  ) {}

  async obtenerTabla(): Promise<FilaTablaPosiciones[]> {
    const temporada = await this.temporadaService.activa();

    const equipos = await this.prisma.equipo.findMany({
      where: {
        temporadaId: temporada.id,
        estado: EstadoEquipo.APROBADO,
      },
      select: {
        id: true,
        nombre: true,
      },
    });

    const partidos = await this.prisma.partido.findMany({
      where: {
        jornada: { temporadaId: temporada.id },
        estado: EstadoPartido.FINALIZADO,
      },
      include: {
        eventos: {
          select: {
            tipo: true,
            jugador: { select: { equipoId: true } },
          },
        },
      },
    });

    const stats = new Map<
      string,
      {
        equipoId: string;
        nombre: string;
        pj: number;
        pg: number;
        pe: number;
        pp: number;
        gf: number;
        gc: number;
      }
    >();

    for (const e of equipos) {
      stats.set(e.id, {
        equipoId: e.id,
        nombre: e.nombre,
        pj: 0,
        pg: 0,
        pe: 0,
        pp: 0,
        gf: 0,
        gc: 0,
      });
    }

    for (const p of partidos) {
      let localGoles = 0;
      let visitanteGoles = 0;

      for (const ev of p.eventos) {
        if (ev.tipo === TipoEvento.GOL) {
          if (ev.jugador.equipoId === p.equipoLocalId) localGoles++;
          else if (ev.jugador.equipoId === p.equipoVisitanteId) visitanteGoles++;
        }
      }

      const statLocal = stats.get(p.equipoLocalId);
      if (statLocal) {
        statLocal.pj++;
        statLocal.gf += localGoles;
        statLocal.gc += visitanteGoles;
        if (localGoles > visitanteGoles) statLocal.pg++;
        else if (localGoles === visitanteGoles) statLocal.pe++;
        else statLocal.pp++;
      }

      const statVisitante = stats.get(p.equipoVisitanteId);
      if (statVisitante) {
        statVisitante.pj++;
        statVisitante.gf += visitanteGoles;
        statVisitante.gc += localGoles;
        if (visitanteGoles > localGoles) statVisitante.pg++;
        else if (visitanteGoles === localGoles) statVisitante.pe++;
        else statVisitante.pp++;
      }
    }

    const filas = Array.from(stats.values()).map((s) => {
      const dg = s.gf - s.gc;
      const pts = s.pg * 3 + s.pe;
      return {
        posicion: 0,
        equipoId: s.equipoId,
        nombre: s.nombre,
        pj: s.pj,
        pg: s.pg,
        pe: s.pe,
        pp: s.pp,
        gf: s.gf,
        gc: s.gc,
        dg,
        pts,
      };
    });

    filas.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.dg !== a.dg) return b.dg - a.dg;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });

    filas.forEach((f, idx) => {
      f.posicion = idx + 1;
    });

    return filas;
  }
}

@ApiTags('tabla-posiciones')
@Controller('tabla-posiciones')
export class TablaController {
  constructor(private readonly service: TablaService) {}

  @Public()
  @Get()
  obtenerTabla() {
    return this.service.obtenerTabla();
  }
}

@Module({
  imports: [TemporadaModule],
  controllers: [TablaController],
  providers: [TablaService],
  exports: [TablaService],
})
export class TablaModule {}
