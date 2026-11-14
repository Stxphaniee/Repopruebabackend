import crypto from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { CurrentUser } from '@Auth/decorators';
import { PrismaService } from '@Prisma/services';
import {
  AccionAuditoriaEquipo,
  CategoriaNotificacion,
  EstadoEquipo,
  EstadoPago,
  ModuloOrigenNotificacion,
  RolUsuario,
  type User,
} from '@PrismaClient';
import { Roles, err } from '../common/auth/roles.js';
import { TemporadaModule, TemporadaService } from '../common/temporada.js';
import {
  NotificacionCoreModule,
  NotificacionService,
} from '../notificaciones/notificacion.service.js';

export class PagarCuotaDto {
  @IsUUID()
  equipoId!: string;

  @IsString()
  @Length(13, 19, { message: 'El número de tarjeta debe tener entre 13 y 19 dígitos.' })
  numeroTarjeta!: string;

  @IsString()
  expiracion!: string;

  @IsString()
  @Length(3, 4, { message: 'El CVV debe tener 3 o 4 dígitos.' })
  cvv!: string;
}

export class SuspensionEquipoDto {
  @IsIn(['SUSPENDER', 'REACTIVAR'], {
    message: 'La acción debe ser SUSPENDER o REACTIVAR.',
  })
  accion!: 'SUSPENDER' | 'REACTIVAR';

  @IsOptional()
  @IsString()
  motivo?: string;
}

@Injectable()
export class PagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly temporadaService: TemporadaService,
    private readonly notificaciones: NotificacionService,
  ) {}

  async pagar(capitan: User, dto: PagarCuotaDto) {
    const equipo = await this.prisma.equipo.findUnique({
      where: { id: dto.equipoId },
      include: { pago: true },
    });

    if (!equipo) {
      throw err.notFound('EQUIPO_NO_EXISTE', 'El equipo no existe.');
    }
    if (equipo.capitanId !== capitan.id) {
      throw err.forbidden(
        'NO_PROPIETARIO',
        'Solo el capitán del equipo puede realizar el pago de la cuota.',
      );
    }
    if (
      equipo.estado !== EstadoEquipo.APROBADO &&
      equipo.estado !== EstadoEquipo.SUSPENDIDO
    ) {
      throw err.badRequest(
        'ESTADO_INVALIDO',
        'El equipo debe estar APROBADO o SUSPENDIDO para realizar el pago.',
      );
    }
    if (!equipo.pago) {
      throw err.notFound(
        'PAGO_NO_EXISTE',
        'No se encontró una cuota asociada a este equipo.',
      );
    }
    if (
      equipo.pago.estado !== EstadoPago.PENDIENTE &&
      equipo.pago.estado !== EstadoPago.VENCIDO
    ) {
      throw err.conflict(
        'PAGO_YA_REALIZADO',
        'La cuota de inscripción ya se encuentra pagada.',
      );
    }

    // Simulación de pasarela de pago por últimos 4 dígitos
    const ultimos4 = dto.numeroTarjeta.slice(-4);
    if (ultimos4 === '0002') {
      throw err.badRequest('FONDOS_INSUFICIENTES', 'Fondos insuficientes.');
    }

    const comprobanteId = crypto.randomUUID();
    const fechaPago = new Date();

    const pagoActualizado = await this.prisma.pago.update({
      where: { id: equipo.pago.id },
      data: {
        estado: EstadoPago.PAGADO,
        comprobanteId,
        ultimos4,
        fechaPago,
      },
    });

    await this.notificaciones.crearAviso({
      destinatarioId: equipo.capitanId,
      categoria: CategoriaNotificacion.PAGOS,
      moduloOrigen: ModuloOrigenNotificacion.PAGOS,
      titulo: 'Pago confirmado',
      mensaje: `Se confirmó el pago de la cuota de inscripción para "${equipo.nombre}". Comprobante: ${comprobanteId}`,
      referencia: equipo.pago.id,
      eventoId: `pago:${equipo.pago.id}:pagado:${Date.now()}`,
    });

    return {
      id: pagoActualizado.id,
      estado: pagoActualizado.estado,
      comprobanteId: pagoActualizado.comprobanteId,
      fechaPago: pagoActualizado.fechaPago,
      ultimos4: pagoActualizado.ultimos4,
    };
  }

  async listarPagosAdmin(estado?: string) {
    const temporada = await this.temporadaService.activa();

    let estadoFiltro: EstadoPago | undefined;
    if (estado) {
      const eUpper = estado.trim().toUpperCase();
      if (Object.values(EstadoPago).includes(eUpper as EstadoPago)) {
        estadoFiltro = eUpper as EstadoPago;
      }
    }

    const equipos = await this.prisma.equipo.findMany({
      where: {
        temporadaId: temporada.id,
        ...(estadoFiltro ? { pago: { estado: estadoFiltro } } : {}),
      },
      include: {
        pago: true,
        capitan: {
          select: {
            id: true,
            email: true,
            perfil: { select: { nombreCompleto: true, dui: true } },
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    return equipos.map((e) => ({
      equipoId: e.id,
      nombreEquipo: e.nombre,
      estadoEquipo: e.estado,
      capitan: e.capitan.perfil?.nombreCompleto ?? e.capitan.email,
      capitanEmail: e.capitan.email,
      pago: e.pago,
    }));
  }

  async cambiarSuspension(
    org: User,
    id: string,
    dto: SuspensionEquipoDto,
  ) {
    const equipo = await this.prisma.equipo.findUnique({
      where: { id },
      include: { pago: true },
    });
    if (!equipo) {
      throw err.notFound('EQUIPO_NO_EXISTE', 'El equipo no existe.');
    }

    if (dto.accion === 'SUSPENDER') {
      if (equipo.estado !== EstadoEquipo.APROBADO) {
        throw err.conflict(
          'ESTADO_INVALIDO',
          'Solo se pueden suspender equipos en estado APROBADO.',
        );
      }
      if (equipo.pago?.estado !== EstadoPago.VENCIDO) {
        throw err.badRequest(
          'PAGO_NO_VENCIDO',
          'Solo se puede suspender a un equipo si su pago está VENCIDO.',
        );
      }
      const motivo = dto.motivo?.trim();
      if (!motivo) {
        throw err.badRequest(
          'MOTIVO_REQUERIDO',
          'Debe indicar el motivo de suspensión.',
        );
      }

      await this.prisma.$transaction([
        this.prisma.equipo.update({
          where: { id },
          data: { estado: EstadoEquipo.SUSPENDIDO },
        }),
        this.prisma.auditoriaEquipo.create({
          data: {
            equipoId: id,
            organizadorId: org.id,
            accion: AccionAuditoriaEquipo.SUSPENDER,
            motivo,
            estadoAnterior: EstadoEquipo.APROBADO,
            estadoNuevo: EstadoEquipo.SUSPENDIDO,
          },
        }),
      ]);

      await this.notificaciones.crearAviso({
        destinatarioId: equipo.capitanId,
        categoria: CategoriaNotificacion.PAGOS,
        moduloOrigen: ModuloOrigenNotificacion.PAGOS,
        titulo: 'Equipo suspendido',
        mensaje: `Tu equipo "${equipo.nombre}" fue suspendido por falta de pago. Motivo: ${motivo}`,
        referencia: equipo.id,
        eventoId: `equipo:${id}:suspendido:${Date.now()}`,
        esCritica: true,
      });

      return { id: equipo.id, estado: EstadoEquipo.SUSPENDIDO };
    }

    if (dto.accion === 'REACTIVAR') {
      if (equipo.estado !== EstadoEquipo.SUSPENDIDO) {
        throw err.conflict(
          'ESTADO_INVALIDO',
          'Solo se pueden reactivar equipos en estado SUSPENDIDO.',
        );
      }
      if (equipo.pago?.estado !== EstadoPago.PAGADO) {
        throw err.badRequest(
          'PAGO_NO_REALIZADO',
          'Solo se puede reactivar a un equipo si su cuota está en estado PAGADO.',
        );
      }

      const motivo = dto.motivo?.trim() || 'Pago regularizado';

      await this.prisma.$transaction([
        this.prisma.equipo.update({
          where: { id },
          data: { estado: EstadoEquipo.APROBADO },
        }),
        this.prisma.auditoriaEquipo.create({
          data: {
            equipoId: id,
            organizadorId: org.id,
            accion: AccionAuditoriaEquipo.REACTIVAR,
            motivo,
            estadoAnterior: EstadoEquipo.SUSPENDIDO,
            estadoNuevo: EstadoEquipo.APROBADO,
          },
        }),
      ]);

      await this.notificaciones.crearAviso({
        destinatarioId: equipo.capitanId,
        categoria: CategoriaNotificacion.PAGOS,
        moduloOrigen: ModuloOrigenNotificacion.PAGOS,
        titulo: 'Equipo reactivado',
        mensaje: `Tu equipo "${equipo.nombre}" ha sido reactivado exitosamente.`,
        referencia: equipo.id,
        eventoId: `equipo:${id}:reactivado:${Date.now()}`,
        esCritica: true,
      });

      return { id: equipo.id, estado: EstadoEquipo.APROBADO };
    }

    throw err.badRequest('ACCION_INVALIDA', 'Acción inválida.');
  }

  @Cron('5 0 * * *')
  async marcarPagosVencidos() {
    const ahora = new Date();
    const pendientes = await this.prisma.pago.findMany({
      where: {
        estado: EstadoPago.PENDIENTE,
        fechaVencimiento: { lt: ahora },
      },
      include: {
        equipo: {
          select: { id: true, nombre: true, capitanId: true },
        },
      },
    });

    for (const pago of pendientes) {
      await this.prisma.pago.update({
        where: { id: pago.id },
        data: { estado: EstadoPago.VENCIDO },
      });

      await this.notificaciones.crearAviso({
        destinatarioId: pago.equipo.capitanId,
        categoria: CategoriaNotificacion.PAGOS,
        moduloOrigen: ModuloOrigenNotificacion.PAGOS,
        titulo: 'Cuota vencida',
        mensaje: `La cuota de inscripción para tu equipo "${pago.equipo.nombre}" ha vencido. Por favor regulariza tu pago para evitar suspensión.`,
        referencia: pago.id,
        eventoId: `pago:${pago.id}:vencido`,
        esCritica: true,
      });
    }
  }
}

@ApiTags('pagos')
@ApiBearerAuth()
@Controller('pagos')
export class PagosController {
  constructor(private readonly service: PagosService) {}

  @Post()
  @Roles(RolUsuario.CAPITAN)
  @HttpCode(HttpStatus.CREATED)
  pagar(@CurrentUser() capitan: User, @Body() dto: PagarCuotaDto) {
    return this.service.pagar(capitan, dto);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(RolUsuario.ORGANIZADOR)
@Controller('admin')
export class AdminPagosController {
  constructor(private readonly service: PagosService) {}

  @Get('pagos')
  listarPagos(@Query('estado') estado?: string) {
    return this.service.listarPagosAdmin(estado);
  }

  @Patch('equipos/:id/suspension')
  cambiarSuspension(
    @CurrentUser() org: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspensionEquipoDto,
  ) {
    return this.service.cambiarSuspension(org, id, dto);
  }
}

@Module({
  imports: [TemporadaModule, NotificacionCoreModule],
  controllers: [PagosController, AdminPagosController],
  providers: [PagosService],
  exports: [PagosService],
})
export class PagosModule {}
