import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  Cancha,
  CategoriaNotificacion,
  EstadoEquipo,
  EstadoJornada,
  EstadoPago,
  EstadoPartido,
  ModuloOrigenNotificacion,
  Prisma,
  RolUsuario,
  TipoEvento,
  type User,
} from '@PrismaClient';
import { err } from '../common/auth/roles.js';
import {
  calcularMarcador,
  PARTIDO_DURACION_MIN,
} from '../common/marcador.js';
import { NotificacionService } from '../notificaciones/notificacion.service.js';
import type {
  CambiarEstadoPartidoDto,
  CorregirResultadoDto,
  CrearJornadaDto,
  CrearPartidoDto,
  ListarPartidosQuery,
  ModificarPartidoDto,
  RegistrarEventoDto,
  RegistrarParticipantesDto,
} from './partidos.dto.js';

@Injectable()
export class PartidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionService,
  ) {}

  // -------------------------------------------------------------------------
  // Jornadas
  // -------------------------------------------------------------------------

  async crearJornada(_org: User, dto: CrearJornadaDto) {
    const temporada = await this.prisma.temporada.findUnique({
      where: { id: dto.temporadaId },
    });
    if (!temporada) {
      throw err.notFound('TEMPORADA_NO_EXISTE', 'La temporada no existe.');
    }

    const duplicada = await this.prisma.jornada.findUnique({
      where: {
        temporadaId_numero: {
          temporadaId: dto.temporadaId,
          numero: dto.numero,
        },
      },
    });
    if (duplicada) {
      throw err.conflict(
        'JORNADA_DUPLICADA',
        `Ya existe la jornada número ${dto.numero} para esta temporada.`,
      );
    }

    return this.prisma.jornada.create({
      data: {
        temporadaId: dto.temporadaId,
        numero: dto.numero,
        estado: EstadoJornada.BORRADOR,
      },
    });
  }

  async listarJornadas() {
    const jornadas = await this.prisma.jornada.findMany({
      include: {
        partidos: {
          include: {
            equipoLocal: { select: { id: true, nombre: true } },
            equipoVisitante: { select: { id: true, nombre: true } },
            arbitro: {
              select: {
                id: true,
                email: true,
                perfil: { select: { nombreCompleto: true } },
              },
            },
            eventos: {
              select: { tipo: true, jugador: { select: { equipoId: true } } },
            },
          },
          orderBy: { fechaHoraInicio: 'asc' },
        },
      },
      orderBy: { numero: 'asc' },
    });

    return jornadas.map((j) => ({
      ...j,
      partidos: j.partidos.map(({ eventos, ...p }) => ({
        ...p,
        marcador: calcularMarcador(p, eventos),
      })),
    }));
  }

  async publicarJornada(_org: User, id: string) {
    const jornada = await this.prisma.jornada.findUnique({
      where: { id },
      include: {
        partidos: {
          include: {
            equipoLocal: true,
            equipoVisitante: true,
          },
        },
      },
    });
    if (!jornada) {
      throw err.notFound('JORNADA_NO_EXISTE', 'La jornada no existe.');
    }
    if (jornada.estado !== EstadoJornada.BORRADOR) {
      throw err.conflict(
        'JORNADA_YA_PUBLICADA',
        'Solo se pueden publicar jornadas en estado BORRADOR.',
      );
    }

    const actualizada = await this.prisma.jornada.update({
      where: { id },
      data: {
        estado: EstadoJornada.PUBLICADA,
        publishedAt: new Date(),
      },
    });

    // Notificaciones (H17 para capitanes, H4 para árbitros)
    const capitanes = new Set<string>();
    for (const partido of jornada.partidos) {
      capitanes.add(partido.equipoLocal.capitanId);
      capitanes.add(partido.equipoVisitante.capitanId);

      // Notificar árbitro asignado
      await this.notificaciones.crearAviso({
        destinatarioId: partido.arbitroId,
        categoria: CategoriaNotificacion.CALENDARIO,
        moduloOrigen: ModuloOrigenNotificacion.CALENDARIO,
        titulo: 'Partido asignado',
        mensaje: `Has sido asignado como árbitro para el partido entre ${partido.equipoLocal.nombre} y ${partido.equipoVisitante.nombre} de la jornada ${jornada.numero}.`,
        referencia: partido.id,
        eventoId: `jornada:${id}:partido:${partido.id}:arbitro`,
      });
    }

    for (const capitanId of capitanes) {
      await this.notificaciones.crearAviso({
        destinatarioId: capitanId,
        categoria: CategoriaNotificacion.CALENDARIO,
        moduloOrigen: ModuloOrigenNotificacion.CALENDARIO,
        titulo: 'Jornada publicada',
        mensaje: `La jornada ${jornada.numero} ha sido publicada en el calendario.`,
        referencia: jornada.id,
        eventoId: `jornada:${id}:publicada:capitan:${capitanId}`,
      });
    }

    return actualizada;
  }

  // -------------------------------------------------------------------------
  // Partidos
  // -------------------------------------------------------------------------

  private async validarSolapamiento(
    tx: Prisma.TransactionClient,
    cancha: Cancha,
    equipoLocalId: string,
    equipoVisitanteId: string,
    inicio: Date,
    fin: Date,
    excluirId?: string,
  ) {
    const overlap = await tx.partido.findFirst({
      where: {
        estado: { notIn: [EstadoPartido.CANCELADO, EstadoPartido.SUSPENDIDO] },
        ...(excluirId ? { id: { not: excluirId } } : {}),
        OR: [
          // Solapamiento misma cancha
          {
            cancha,
            fechaHoraInicio: { lt: fin },
            fechaHoraFin: { gt: inicio },
          },
          // Solapamiento mismo equipo (local o visitante)
          {
            OR: [
              { equipoLocalId: equipoLocalId },
              { equipoVisitanteId: equipoLocalId },
              { equipoLocalId: equipoVisitanteId },
              { equipoVisitanteId: equipoVisitanteId },
            ],
            fechaHoraInicio: { lt: fin },
            fechaHoraFin: { gt: inicio },
          },
        ],
      },
    });

    if (overlap) {
      if (overlap.cancha === cancha) {
        throw err.conflict(
          'CANCHA_OCUPADA',
          'La cancha ya está ocupada en ese rango horario.',
        );
      }
      throw err.conflict(
        'EQUIPO_OCUPADO',
        'Uno de los equipos ya tiene un partido programado en ese rango horario.',
      );
    }
  }

  async crearPartido(_org: User, dto: CrearPartidoDto) {
    if (dto.equipoLocalId === dto.equipoVisitanteId) {
      throw err.badRequest(
        'EQUIPOS_IGUALES',
        'El equipo local y el equipo visitante no pueden ser el mismo.',
      );
    }

    const jornada = await this.prisma.jornada.findUnique({
      where: { id: dto.jornadaId },
    });
    if (!jornada) {
      throw err.notFound('JORNADA_NO_EXISTE', 'La jornada no existe.');
    }
    if (jornada.estado !== EstadoJornada.BORRADOR) {
      throw err.conflict(
        'JORNADA_NO_BORRADOR',
        'Solo se pueden programar partidos en jornadas en estado BORRADOR.',
      );
    }

    const [local, visitante, arbitro] = await Promise.all([
      this.prisma.equipo.findUnique({
        where: { id: dto.equipoLocalId },
        include: { pago: true },
      }),
      this.prisma.equipo.findUnique({
        where: { id: dto.equipoVisitanteId },
        include: { pago: true },
      }),
      this.prisma.user.findUnique({
        where: { id: dto.arbitroId },
      }),
    ]);

    if (!local || !visitante) {
      throw err.notFound(
        'EQUIPO_NO_EXISTE',
        'Uno o ambos equipos no existen en la base de datos.',
      );
    }
    if (
      local.estado !== EstadoEquipo.APROBADO ||
      visitante.estado !== EstadoEquipo.APROBADO
    ) {
      throw err.badRequest(
        'EQUIPO_NO_APROBADO',
        'Ambos equipos deben estar en estado APROBADO.',
      );
    }
    if (
      local.pago?.estado !== EstadoPago.PAGADO ||
      visitante.pago?.estado !== EstadoPago.PAGADO
    ) {
      throw err.badRequest(
        'EQUIPO_NO_PAGADO',
        'Ambos equipos deben tener su cuota de inscripción en estado PAGADO.',
      );
    }

    if (!arbitro || arbitro.rol !== RolUsuario.ARBITRO) {
      throw err.badRequest(
        'ARBITRO_INVALIDO',
        'El usuario seleccionado no tiene el rol de Árbitro.',
      );
    }

    const inicio = new Date(dto.fechaHoraInicio);
    if (Number.isNaN(inicio.getTime())) {
      throw err.badRequest('FECHA_INVALIDA', 'Fecha y hora de inicio inválida.');
    }
    const fin = new Date(inicio.getTime() + PARTIDO_DURACION_MIN * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      await this.validarSolapamiento(
        tx,
        dto.cancha,
        dto.equipoLocalId,
        dto.equipoVisitanteId,
        inicio,
        fin,
      );

      return tx.partido.create({
        data: {
          jornadaId: dto.jornadaId,
          equipoLocalId: dto.equipoLocalId,
          equipoVisitanteId: dto.equipoVisitanteId,
          arbitroId: dto.arbitroId,
          cancha: dto.cancha,
          fechaHoraInicio: inicio,
          fechaHoraFin: fin,
          estado: EstadoPartido.PROGRAMADO,
        },
      });
    });
  }

  async listarPartidos(query: ListarPartidosQuery) {
    const partidos = await this.prisma.partido.findMany({
      where: {
        jornada: { estado: EstadoJornada.PUBLICADA },
        ...(query.jornadaId ? { jornadaId: query.jornadaId } : {}),
        ...(query.estado ? { estado: query.estado } : {}),
      },
      include: {
        jornada: { select: { numero: true } },
        equipoLocal: { select: { id: true, nombre: true } },
        equipoVisitante: { select: { id: true, nombre: true } },
        eventos: {
          select: { tipo: true, jugador: { select: { equipoId: true } } },
        },
      },
      orderBy: { fechaHoraInicio: 'asc' },
    });

    return partidos.map(({ eventos, ...p }) => ({
      ...p,
      marcador: calcularMarcador(p, eventos),
    }));
  }

  async detallePartido(id: string) {
    const partido = await this.prisma.partido.findUnique({
      where: { id },
      include: {
        jornada: { select: { id: true, numero: true, estado: true } },
        equipoLocal: { select: { id: true, nombre: true } },
        equipoVisitante: { select: { id: true, nombre: true } },
        arbitro: {
          select: {
            id: true,
            email: true,
            perfil: { select: { nombreCompleto: true } },
          },
        },
        eventos: {
          include: {
            jugador: {
              select: {
                id: true,
                nombre: true,
                numeroCamiseta: true,
                equipoId: true,
              },
            },
          },
          orderBy: { minuto: 'asc' },
        },
      },
    });

    if (!partido) {
      throw err.notFound('PARTIDO_NO_EXISTE', 'El partido no existe.');
    }

    const marcador = calcularMarcador(partido, partido.eventos);
    const galeriaDisponible = partido.estado === EstadoPartido.FINALIZADO;

    return {
      ...partido,
      marcador,
      galeriaDisponible,
    };
  }

  async marcadorPartido(id: string) {
    const partido = await this.prisma.partido.findUnique({
      where: { id },
      include: {
        eventos: {
          select: { tipo: true, jugador: { select: { equipoId: true } } },
        },
      },
    });
    if (!partido) {
      throw err.notFound('PARTIDO_NO_EXISTE', 'El partido no existe.');
    }
    return {
      partidoId: partido.id,
      estado: partido.estado,
      marcador: calcularMarcador(partido, partido.eventos),
    };
  }

  async modificarPartido(_org: User, id: string, dto: ModificarPartidoDto) {
    const partido = await this.prisma.partido.findUnique({
      where: { id },
      include: {
        equipoLocal: true,
        equipoVisitante: true,
      },
    });
    if (!partido) {
      throw err.notFound('PARTIDO_NO_EXISTE', 'El partido no existe.');
    }

    if (
      partido.estado === EstadoPartido.EN_CURSO ||
      partido.estado === EstadoPartido.FINALIZADO
    ) {
      throw err.conflict(
        'PARTIDO_NO_MODIFICABLE',
        'No se puede modificar un partido que ya está EN_CURSO o FINALIZADO.',
      );
    }

    if (dto.estado === EstadoPartido.SUSPENDIDO && !dto.motivoSuspension?.trim()) {
      throw err.badRequest(
        'MOTIVO_REQUERIDO',
        'Debe indicar un motivo de suspensión.',
      );
    }

    let nuevoEstado = dto.estado ?? partido.estado;
    let nuevoMotivo = dto.motivoSuspension ?? partido.motivoSuspension;

    if (
      partido.estado === EstadoPartido.SUSPENDIDO &&
      dto.estado === EstadoPartido.PROGRAMADO
    ) {
      // Reprogramar
      nuevoEstado = EstadoPartido.PROGRAMADO;
      nuevoMotivo = null;
    }

    const inicio = dto.fechaHoraInicio
      ? new Date(dto.fechaHoraInicio)
      : partido.fechaHoraInicio;
    const fin = new Date(inicio.getTime() + PARTIDO_DURACION_MIN * 60 * 1000);
    const cancha = dto.cancha ?? partido.cancha;

    const actualizado = await this.prisma.$transaction(async (tx) => {
      if (
        dto.fechaHoraInicio ||
        dto.cancha ||
        nuevoEstado === EstadoPartido.PROGRAMADO
      ) {
        await this.validarSolapamiento(
          tx,
          cancha,
          partido.equipoLocalId,
          partido.equipoVisitanteId,
          inicio,
          fin,
          partido.id,
        );
      }

      return tx.partido.update({
        where: { id },
        data: {
          fechaHoraInicio: inicio,
          fechaHoraFin: fin,
          cancha,
          estado: nuevoEstado,
          motivoSuspension: nuevoMotivo,
        },
      });
    });

    // Notificaciones H5/H16
    const accion = dto.estado ?? 'MODIFICADO';
    const usuarios = await this.notificaciones.usuariosDeEquipos([
      partido.equipoLocalId,
      partido.equipoVisitanteId,
    ]);
    const destinatarios = new Set([...usuarios, partido.arbitroId]);

    await this.notificaciones.crearAvisos(destinatarios, {
      categoria: CategoriaNotificacion.CALENDARIO,
      moduloOrigen: ModuloOrigenNotificacion.CALENDARIO,
      titulo: 'Actualización de partido',
      mensaje: `El partido entre ${partido.equipoLocal.nombre} y ${partido.equipoVisitante.nombre} fue actualizado: estado ${actualizado.estado}.${actualizado.motivoSuspension ? ' Motivo: ' + actualizado.motivoSuspension : ''}`,
      referencia: partido.id,
      eventoId: `partido:${id}:${accion}:${Date.now()}`,
    });

    return actualizado;
  }

  // -------------------------------------------------------------------------
  // Árbitros
  // -------------------------------------------------------------------------

  async misPartidosArbitro(arbitro: User) {
    const partidos = await this.prisma.partido.findMany({
      where: {
        arbitroId: arbitro.id,
        jornada: { estado: EstadoJornada.PUBLICADA },
      },
      include: {
        jornada: { select: { numero: true } },
        equipoLocal: { select: { id: true, nombre: true } },
        equipoVisitante: { select: { id: true, nombre: true } },
        eventos: {
          select: { tipo: true, jugador: { select: { equipoId: true } } },
        },
      },
      orderBy: { fechaHoraInicio: 'asc' },
    });

    return partidos.map(({ eventos, ...p }) => ({
      ...p,
      marcador: calcularMarcador(p, eventos),
    }));
  }

  async cambiarEstadoPartido(
    arbitro: User,
    id: string,
    dto: CambiarEstadoPartidoDto,
  ) {
    const partido = await this.prisma.partido.findUnique({
      where: { id },
      include: {
        equipoLocal: true,
        equipoVisitante: true,
        eventos: {
          select: { tipo: true, jugador: { select: { equipoId: true } } },
        },
      },
    });
    if (!partido) {
      throw err.notFound('PARTIDO_NO_EXISTE', 'El partido no existe.');
    }
    if (partido.arbitroId !== arbitro.id) {
      throw err.forbidden(
        'NO_ES_EL_ARBITRO',
        'Solo el árbitro asignado puede cambiar el estado de este partido.',
      );
    }

    const valido =
      (partido.estado === EstadoPartido.PROGRAMADO &&
        dto.estado === EstadoPartido.EN_CURSO) ||
      (partido.estado === EstadoPartido.EN_CURSO &&
        dto.estado === EstadoPartido.FINALIZADO);

    if (!valido) {
      throw err.conflict(
        'TRANSICION_INVALIDA',
        `No se puede cambiar el estado de ${partido.estado} a ${dto.estado}.`,
      );
    }

    const actualizado = await this.prisma.partido.update({
      where: { id },
      data: { estado: dto.estado },
    });

    if (dto.estado === EstadoPartido.FINALIZADO) {
      const marcador = calcularMarcador(partido, partido.eventos);
      const destinatarios = await this.notificaciones.usuariosDeEquipos([
        partido.equipoLocalId,
        partido.equipoVisitanteId,
      ]);

      await this.notificaciones.crearAvisos(destinatarios, {
        categoria: CategoriaNotificacion.RESULTADOS,
        moduloOrigen: ModuloOrigenNotificacion.RESULTADOS,
        titulo: 'Resultado final del partido',
        mensaje: `Resultado final: ${partido.equipoLocal.nombre} ${marcador?.local ?? 0} - ${marcador?.visitante ?? 0} ${partido.equipoVisitante.nombre}`,
        referencia: partido.id,
        eventoId: `partido:${partido.id}:finalizado`,
      });
    }

    return actualizado;
  }

  async registrarParticipantes(
    arbitro: User,
    id: string,
    body: RegistrarParticipantesDto,
  ) {
    const partido = await this.prisma.partido.findUnique({
      where: { id },
    });
    if (!partido) {
      throw err.notFound('PARTIDO_NO_EXISTE', 'El partido no existe.');
    }
    if (partido.arbitroId !== arbitro.id) {
      throw err.forbidden(
        'NO_ES_EL_ARBITRO',
        'Solo el árbitro asignado puede registrar participantes.',
      );
    }
    if (partido.estado !== EstadoPartido.EN_CURSO) {
      throw err.conflict(
        'PARTIDO_NO_EN_CURSO',
        'El partido debe estar EN_CURSO para registrar participantes.',
      );
    }

    const jugadorIds = body.jugadores.map((j) => j.jugadorId);
    const jugadoresDb = await this.prisma.jugador.findMany({
      where: { id: { in: jugadorIds } },
    });

    const equipoValidoIds = new Set([
      partido.equipoLocalId,
      partido.equipoVisitanteId,
    ]);
    for (const j of jugadoresDb) {
      if (!equipoValidoIds.has(j.equipoId)) {
        throw err.badRequest(
          'JUGADOR_NO_PERTENECE',
          `El jugador ${j.nombre} no pertenece a ninguno de los dos equipos del partido.`,
        );
      }
    }
    if (jugadoresDb.length !== jugadorIds.length) {
      throw err.badRequest(
        'JUGADOR_NO_EXISTE',
        'Uno o más jugadores no existen en el sistema.',
      );
    }

    await this.prisma.$transaction(
      body.jugadores.map((p) =>
        this.prisma.participacionPartido.upsert({
          where: {
            partidoId_jugadorId: {
              partidoId: id,
              jugadorId: p.jugadorId,
            },
          },
          create: {
            partidoId: id,
            jugadorId: p.jugadorId,
            participo: p.participo,
          },
          update: {
            participo: p.participo,
          },
        }),
      ),
    );

    return { registrado: true, total: body.jugadores.length };
  }

  async registrarEvento(
    arbitro: User,
    id: string,
    dto: RegistrarEventoDto,
  ) {
    const partido = await this.prisma.partido.findUnique({
      where: { id },
    });
    if (!partido) {
      throw err.notFound('PARTIDO_NO_EXISTE', 'El partido no existe.');
    }
    if (partido.arbitroId !== arbitro.id) {
      throw err.forbidden(
        'NO_ES_EL_ARBITRO',
        'Solo el árbitro asignado puede registrar eventos.',
      );
    }
    if (partido.estado !== EstadoPartido.EN_CURSO) {
      throw err.conflict(
        'PARTIDO_NO_EN_CURSO',
        'El partido debe estar EN_CURSO para registrar eventos.',
      );
    }

    const jugador = await this.prisma.jugador.findUnique({
      where: { id: dto.jugadorId },
    });
    if (
      !jugador ||
      (jugador.equipoId !== partido.equipoLocalId &&
        jugador.equipoId !== partido.equipoVisitanteId)
    ) {
      throw err.badRequest(
        'JUGADOR_NO_PERTENECE',
        'El jugador no pertenece a ninguno de los dos equipos del partido.',
      );
    }

    if (dto.tipo === TipoEvento.ASISTENCIA) {
      if (!dto.golRelacionadoId) {
        throw err.badRequest(
          'GOL_REQUERIDO',
          'Una asistencia debe estar asociada a un gol.',
        );
      }
      const gol = await this.prisma.eventoPartido.findUnique({
        where: { id: dto.golRelacionadoId },
      });
      if (!gol || gol.partidoId !== id || gol.tipo !== TipoEvento.GOL) {
        throw err.badRequest(
          'GOL_INVALIDO',
          'El gol relacionado no existe o no corresponde a un gol de este partido.',
        );
      }
    }

    return this.prisma.eventoPartido.create({
      data: {
        partidoId: id,
        jugadorId: dto.jugadorId,
        tipo: dto.tipo,
        minuto: dto.minuto,
        golRelacionadoId: dto.golRelacionadoId,
      },
    });
  }

  async corregirResultado(
    org: User,
    id: string,
    dto: CorregirResultadoDto,
  ) {
    const partido = await this.prisma.partido.findUnique({
      where: { id },
      include: {
        equipoLocal: true,
        equipoVisitante: true,
      },
    });
    if (!partido) {
      throw err.notFound('PARTIDO_NO_EXISTE', 'El partido no existe.');
    }
    if (partido.estado !== EstadoPartido.FINALIZADO) {
      throw err.conflict(
        'PARTIDO_NO_FINALIZADO',
        'Solo se pueden corregir resultados de partidos en estado FINALIZADO.',
      );
    }

    const eventosAntes = await this.prisma.eventoPartido.findMany({
      where: { partidoId: id },
      orderBy: { minuto: 'asc' },
    });

    await this.prisma.$transaction(async (tx) => {
      // 1. Guardar auditoría
      await tx.auditoriaResultado.create({
        data: {
          partidoId: id,
          organizadorId: org.id,
          eventosAntes: JSON.parse(JSON.stringify(eventosAntes)),
          eventosDespues: JSON.parse(JSON.stringify(dto.eventosCorregidos)),
          justificacion: dto.justificacion.trim(),
        },
      });

      // 2. Borrar eventos anteriores de asistencia y gol (asistencias primero por FK)
      await tx.eventoPartido.deleteMany({
        where: { partidoId: id, tipo: TipoEvento.ASISTENCIA },
      });
      await tx.eventoPartido.deleteMany({
        where: { partidoId: id, tipo: TipoEvento.GOL },
      });

      // 3. Crear nuevos eventos
      const idMap = new Map<string, string>();
      for (const ev of dto.eventosCorregidos) {
        if (ev.tipo === TipoEvento.GOL) {
          const creado = await tx.eventoPartido.create({
            data: {
              partidoId: id,
              jugadorId: ev.jugadorId,
              tipo: TipoEvento.GOL,
              minuto: ev.minuto,
            },
          });
          if (ev.id) idMap.set(ev.id, creado.id);
        }
      }

      for (const ev of dto.eventosCorregidos) {
        if (ev.tipo === TipoEvento.ASISTENCIA) {
          const relatedId = ev.golRelacionadoId
            ? (idMap.get(ev.golRelacionadoId) ?? ev.golRelacionadoId)
            : null;
          await tx.eventoPartido.create({
            data: {
              partidoId: id,
              jugadorId: ev.jugadorId,
              tipo: TipoEvento.ASISTENCIA,
              minuto: ev.minuto,
              golRelacionadoId: relatedId,
            },
          });
        }
      }
    });

    // Notificaciones H9
    const destinatarios = await this.notificaciones.usuariosDeEquipos([
      partido.equipoLocalId,
      partido.equipoVisitanteId,
    ]);
    await this.notificaciones.crearAvisos(destinatarios, {
      categoria: CategoriaNotificacion.RESULTADOS,
      moduloOrigen: ModuloOrigenNotificacion.RESULTADOS,
      titulo: 'Corrección de resultado',
      mensaje: `El resultado del partido fue corregido por la organización. Justificación: ${dto.justificacion}`.slice(
        0,
        500,
      ),
      referencia: id,
      eventoId: `partido:${id}:resultado_corregido:${Date.now()}`,
    });

    return { corregido: true };
  }
}
