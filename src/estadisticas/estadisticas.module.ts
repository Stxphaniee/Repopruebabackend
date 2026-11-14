import {
  Controller,
  Get,
  Injectable,
  Module,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { CurrentUser } from '@Auth/decorators';
import { PrismaService } from '@Prisma/services';
import {
  EstadoEquipo,
  EstadoPartido,
  RolUsuario,
  TipoEvento,
  type User,
} from '@PrismaClient';
import { Roles, err } from '../common/auth/roles.js';
import { TemporadaModule, TemporadaService } from '../common/temporada.js';

export class RankingQueryDto {
  @IsOptional()
  @IsIn(['goles', 'asistencias', 'amarillas', 'rojas'], {
    message: 'La categoría debe ser goles, asistencias, amarillas o rojas.',
  })
  categoria?: 'goles' | 'asistencias' | 'amarillas' | 'rojas' = 'goles';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}

@Injectable()
export class EstadisticasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly temporadaService: TemporadaService,
  ) {}

  async misEstadisticas(user: User) {
    const jugador = await this.prisma.jugador.findUnique({
      where: { usuarioId: user.id },
      include: {
        equipo: { select: { id: true, nombre: true } },
      },
    });

    if (!jugador) {
      throw err.notFound(
        'JUGADOR_NO_ENCONTRADO',
        'No tienes una ficha de jugador vinculada a tu cuenta.',
      );
    }

    const eventos = await this.prisma.eventoPartido.findMany({
      where: {
        jugadorId: jugador.id,
        partido: { estado: EstadoPartido.FINALIZADO },
      },
      select: { tipo: true },
    });

    let goles = 0;
    let asistencias = 0;
    let amarillas = 0;
    let rojas = 0;

    for (const ev of eventos) {
      if (ev.tipo === TipoEvento.GOL) goles++;
      else if (ev.tipo === TipoEvento.ASISTENCIA) asistencias++;
      else if (ev.tipo === TipoEvento.AMARILLA) amarillas++;
      else if (ev.tipo === TipoEvento.ROJA) rojas++;
    }

    const pj = await this.prisma.participacionPartido.count({
      where: {
        jugadorId: jugador.id,
        participo: true,
        partido: { estado: EstadoPartido.FINALIZADO },
      },
    });

    return {
      jugador: {
        id: jugador.id,
        nombre: jugador.nombre,
        numeroCamiseta: jugador.numeroCamiseta,
        posicion: jugador.posicion,
        equipo: jugador.equipo,
      },
      pj,
      goles,
      asistencias,
      amarillas,
      rojas,
    };
  }

  async ranking(dto: RankingQueryDto) {
    const temporada = await this.temporadaService.activa();
    const categoria = dto.categoria ?? 'goles';
    const limit = dto.limit ?? 10;

    let tipoEvento: TipoEvento;
    switch (categoria) {
      case 'asistencias':
        tipoEvento = TipoEvento.ASISTENCIA;
        break;
      case 'amarillas':
        tipoEvento = TipoEvento.AMARILLA;
        break;
      case 'rojas':
        tipoEvento = TipoEvento.ROJA;
        break;
      case 'goles':
      default:
        tipoEvento = TipoEvento.GOL;
        break;
    }

    const jugadores = await this.prisma.jugador.findMany({
      where: {
        equipo: {
          temporadaId: temporada.id,
          estado: EstadoEquipo.APROBADO,
        },
      },
      include: {
        equipo: { select: { id: true, nombre: true } },
      },
    });

    const jugadorIds = jugadores.map((j) => j.id);

    const [eventos, participaciones] = await Promise.all([
      this.prisma.eventoPartido.findMany({
        where: {
          tipo: tipoEvento,
          jugadorId: { in: jugadorIds },
          partido: {
            jornada: { temporadaId: temporada.id },
            estado: EstadoPartido.FINALIZADO,
          },
        },
        select: { jugadorId: true },
      }),
      this.prisma.participacionPartido.findMany({
        where: {
          participo: true,
          jugadorId: { in: jugadorIds },
          partido: {
            jornada: { temporadaId: temporada.id },
            estado: EstadoPartido.FINALIZADO,
          },
        },
        select: { jugadorId: true },
      }),
    ]);

    const conteoEventos = new Map<string, number>();
    for (const ev of eventos) {
      conteoEventos.set(ev.jugadorId, (conteoEventos.get(ev.jugadorId) ?? 0) + 1);
    }

    const conteoPj = new Map<string, number>();
    for (const part of participaciones) {
      conteoPj.set(part.jugadorId, (conteoPj.get(part.jugadorId) ?? 0) + 1);
    }

    const items = jugadores.map((j) => ({
      jugadorId: j.id,
      nombre: j.nombre,
      equipo: j.equipo,
      cantidad: conteoEventos.get(j.id) ?? 0,
      pj: conteoPj.get(j.id) ?? 0,
    }));

    // Desempates: mayor cantidad desc, luego menor PJ asc, luego nombre asc
    items.sort((a, b) => {
      if (b.cantidad !== a.cantidad) return b.cantidad - a.cantidad;
      if (a.pj !== b.pj) return a.pj - b.pj; // menor PJ primero
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });

    const rankeados = items.slice(0, limit).map((item, idx) => ({
      posicion: idx + 1,
      ...item,
    }));

    return rankeados;
  }
}

@ApiTags('jugadores')
@ApiBearerAuth()
@Controller('jugadores')
export class JugadoresEstadisticasController {
  constructor(private readonly service: EstadisticasService) {}

  @Get('mis-estadisticas')
  @Roles(RolUsuario.JUGADOR, RolUsuario.CAPITAN)
  misEstadisticas(@CurrentUser() user: User) {
    return this.service.misEstadisticas(user);
  }
}

@ApiTags('estadisticas')
@ApiBearerAuth()
@Controller('estadisticas')
export class EstadisticasController {
  constructor(private readonly service: EstadisticasService) {}

  @Get('ranking')
  @Roles(RolUsuario.ORGANIZADOR)
  ranking(@Query() dto: RankingQueryDto) {
    return this.service.ranking(dto);
  }
}

@Module({
  imports: [TemporadaModule],
  controllers: [JugadoresEstadisticasController, EstadisticasController],
  providers: [EstadisticasService],
  exports: [EstadisticasService],
})
export class EstadisticasModule {}
