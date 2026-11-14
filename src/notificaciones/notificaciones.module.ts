import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { CurrentUser } from '@Auth/decorators';
import { PrismaService } from '@Prisma/services';
import {
  CategoriaNotificacion,
  EstadoNotificacion,
  type User,
} from '@PrismaClient';
import { err } from '../common/auth/roles.js';

export class ListarNotificacionesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsIn(['no_leida', 'leida'], {
    message: 'El estado debe ser no_leida o leida.',
  })
  estado?: 'no_leida' | 'leida';
}

export class ActualizarPreferenciasDto {
  @IsOptional()
  @IsBoolean()
  pagos?: boolean;

  @IsOptional()
  @IsBoolean()
  calendario?: boolean;

  @IsOptional()
  @IsBoolean()
  resultados?: boolean;

  @IsOptional()
  @IsBoolean()
  inscripciones?: boolean;
}

@Injectable()
export class NotificacionesUserService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(user: User, q: ListarNotificacionesQuery) {
    const page = q.page && q.page > 0 ? q.page : 1;
    const limit = q.limit && q.limit > 0 ? q.limit : 10;
    const skip = (page - 1) * limit;

    let estadoFiltro: EstadoNotificacion | undefined;
    if (q.estado === 'no_leida') estadoFiltro = EstadoNotificacion.NO_LEIDA;
    else if (q.estado === 'leida') estadoFiltro = EstadoNotificacion.LEIDA;

    const where = {
      usuarioId: user.id,
      ...(estadoFiltro ? { estado: estadoFiltro } : {}),
    };

    const [items, total, noLeidas] = await Promise.all([
      this.prisma.notificacion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.count({
        where: {
          usuarioId: user.id,
          estado: EstadoNotificacion.NO_LEIDA,
        },
      }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      noLeidas,
    };
  }

  async marcarLeida(user: User, id: string) {
    const notificacion = await this.prisma.notificacion.findUnique({
      where: { id },
    });
    if (!notificacion) {
      throw err.notFound('NOTIFICACION_NO_EXISTE', 'La notificación no existe.');
    }
    if (notificacion.usuarioId !== user.id) {
      throw err.forbidden(
        'NO_PROPIETARIO',
        'No tienes permiso para modificar esta notificación.',
      );
    }

    return this.prisma.notificacion.update({
      where: { id },
      data: {
        estado: EstadoNotificacion.LEIDA,
        leidaAt: new Date(),
      },
    });
  }

  async marcarTodasLeidas(user: User) {
    const resultado = await this.prisma.notificacion.updateMany({
      where: {
        usuarioId: user.id,
        estado: EstadoNotificacion.NO_LEIDA,
      },
      data: {
        estado: EstadoNotificacion.LEIDA,
        leidaAt: new Date(),
      },
    });

    return { actualizadas: resultado.count };
  }

  async obtenerPreferencias(user: User) {
    const preferencias = await this.prisma.preferenciaNotificacion.findMany({
      where: { usuarioId: user.id },
    });

    const mapa = new Map(preferencias.map((p) => [p.categoria, p.activa]));

    return {
      pagos: mapa.get(CategoriaNotificacion.PAGOS) ?? true,
      calendario: mapa.get(CategoriaNotificacion.CALENDARIO) ?? true,
      resultados: mapa.get(CategoriaNotificacion.RESULTADOS) ?? true,
      inscripciones: mapa.get(CategoriaNotificacion.INSCRIPCIONES) ?? true,
    };
  }

  async actualizarPreferencias(user: User, dto: ActualizarPreferenciasDto) {
    const categorias: { cat: CategoriaNotificacion; val?: boolean }[] = [
      { cat: CategoriaNotificacion.PAGOS, val: dto.pagos },
      { cat: CategoriaNotificacion.CALENDARIO, val: dto.calendario },
      { cat: CategoriaNotificacion.RESULTADOS, val: dto.resultados },
      { cat: CategoriaNotificacion.INSCRIPCIONES, val: dto.inscripciones },
    ];

    for (const item of categorias) {
      if (item.val !== undefined) {
        await this.prisma.preferenciaNotificacion.upsert({
          where: {
            usuarioId_categoria: {
              usuarioId: user.id,
              categoria: item.cat,
            },
          },
          create: {
            usuarioId: user.id,
            categoria: item.cat,
            activa: item.val,
          },
          update: {
            activa: item.val,
          },
        });
      }
    }

    return this.obtenerPreferencias(user);
  }
}

@ApiTags('notificaciones')
@ApiBearerAuth()
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly service: NotificacionesUserService) {}

  @Get()
  listar(
    @CurrentUser() user: User,
    @Query() q: ListarNotificacionesQuery,
  ) {
    return this.service.listar(user, q);
  }

  @Patch('leer-todas')
  marcarTodasLeidas(@CurrentUser() user: User) {
    return this.service.marcarTodasLeidas(user);
  }

  @Patch(':id/leer')
  marcarLeida(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.marcarLeida(user, id);
  }
}

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class PreferenciasNotificacionesController {
  constructor(private readonly service: NotificacionesUserService) {}

  @Get('preferencias-notificaciones')
  obtenerPreferencias(@CurrentUser() user: User) {
    return this.service.obtenerPreferencias(user);
  }

  @Patch('preferencias-notificaciones')
  actualizarPreferencias(
    @CurrentUser() user: User,
    @Body() dto: ActualizarPreferenciasDto,
  ) {
    return this.service.actualizarPreferencias(user, dto);
  }
}

@Module({
  controllers: [
    NotificacionesController,
    PreferenciasNotificacionesController,
  ],
  providers: [NotificacionesUserService],
  exports: [NotificacionesUserService],
})
export class NotificacionesModule {}
