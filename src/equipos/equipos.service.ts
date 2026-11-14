import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  CategoriaNotificacion,
  EstadoEquipo,
  EstadoJornada,
  EstadoPago,
  EstadoPartido,
  ModuloOrigenNotificacion,
  Prisma,
  RolUsuario,
  type User,
} from '@PrismaClient';
import { err } from '../common/auth/roles.js';
import { TemporadaService } from '../common/temporada.js';
import { calcularMarcador } from '../common/marcador.js';
import { NotificacionService } from '../notificaciones/notificacion.service.js';
import type {
  CambiarEstadoEquipoDto,
  CrearEquipoDto,
  JugadorInputDto,
  ReenviarEquipoDto,
} from './equipos.dto.js';

export const PLANTILLA_MIN = 5;
export const PLANTILLA_MAX = 15;
const DIAS_VENCIMIENTO_CUOTA = 15;

export function edad(fechaNacimiento: Date, hoy = new Date()): number {
  let e = hoy.getUTCFullYear() - fechaNacimiento.getUTCFullYear();
  const m = hoy.getUTCMonth() - fechaNacimiento.getUTCMonth();
  if (m < 0 || (m === 0 && hoy.getUTCDate() < fechaNacimiento.getUTCDate())) e--;
  return e;
}

@Injectable()
export class EquiposService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly temporadas: TemporadaService,
    private readonly notificaciones: NotificacionService,
  ) {}

  // -------------------------------------------------------------------------
  // Validaciones compartidas (H1, H2 reenvío, H3 alta)
  // -------------------------------------------------------------------------

  /** Valida una plantilla completa: cupo, edad, DUI y camiseta únicos. */
  validarPlantilla(jugadores: JugadorInputDto[]) {
    if (jugadores.length < PLANTILLA_MIN || jugadores.length > PLANTILLA_MAX) {
      throw err.badRequest(
        'CUPO_PLANTILLA',
        `La plantilla debe tener entre ${PLANTILLA_MIN} y ${PLANTILLA_MAX} jugadores.`,
      );
    }
    const duis = new Set<string>();
    const camisetas = new Set<number>();
    for (const j of jugadores) {
      this.validarJugador(j);
      if (duis.has(j.dui)) throw err.conflict('DUI_DUPLICADO', `El DUI ${j.dui} está repetido en la plantilla.`);
      if (camisetas.has(j.numeroCamiseta)) {
        throw err.conflict('CAMISETA_DUPLICADA', `La camiseta ${j.numeroCamiseta} está repetida en la plantilla.`);
      }
      duis.add(j.dui);
      camisetas.add(j.numeroCamiseta);
    }
  }

  validarJugador(j: JugadorInputDto) {
    const nac = new Date(j.fechaNacimiento);
    if (Number.isNaN(nac.getTime()) || nac > new Date()) {
      throw err.badRequest('FECHA_INVALIDA', `La fecha de nacimiento de ${j.nombre} no es válida.`);
    }
    if (edad(nac) < 18) {
      throw err.badRequest('MENOR_DE_EDAD', `${j.nombre} debe tener 18 años o más.`);
    }
  }

  /** DUI ya registrado en otra ficha (Jugador.dui es único global). */
  private async verificarDuisLibres(
    tx: Prisma.TransactionClient,
    duis: string[],
    excluirEquipoId?: string,
  ) {
    const existentes = await tx.jugador.findMany({
      where: { dui: { in: duis }, ...(excluirEquipoId ? { equipoId: { not: excluirEquipoId } } : {}) },
      select: { dui: true },
    });
    if (existentes.length > 0) {
      throw err.conflict('DUI_DUPLICADO', `El DUI ${existentes[0].dui} ya está inscrito en otro equipo.`);
    }
  }

  private mapUnique(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = JSON.stringify(e.meta ?? {});
      if (target.includes('nombre')) throw err.conflict('NOMBRE_DUPLICADO', 'Ya existe un equipo con ese nombre en la temporada.');
      if (target.includes('capitan')) throw err.forbidden('CAPITAN_CON_EQUIPO', 'Ya inscribiste un equipo en esta temporada.');
      if (target.includes('dui')) throw err.conflict('DUI_DUPLICADO', 'Uno de los DUI ya está inscrito.');
      if (target.includes('numero_camiseta')) throw err.conflict('CAMISETA_DUPLICADA', 'Número de camiseta repetido.');
      throw err.conflict('DUPLICADO', 'Registro duplicado.');
    }
    throw e;
  }

  // -------------------------------------------------------------------------
  // H1 — Inscripción de equipo y plantilla
  // -------------------------------------------------------------------------

  async crear(capitan: User, dto: CrearEquipoDto) {
    const temporada = await this.temporadas.activa();
    if (dto.temporadaId !== temporada.id) {
      throw err.badRequest('TEMPORADA_INVALIDA', 'La temporada indicada no es la temporada activa.');
    }
    if (!this.temporadas.enInscripcion(temporada)) {
      throw err.conflict('PERIODO_CERRADO', 'El período de inscripciones se encuentra cerrado.');
    }
    const yaTiene = await this.prisma.equipo.findUnique({
      where: { temporadaId_capitanId: { temporadaId: temporada.id, capitanId: capitan.id } },
    });
    if (yaTiene) throw err.forbidden('CAPITAN_CON_EQUIPO', 'Ya inscribiste un equipo en esta temporada.');

    this.validarPlantilla(dto.jugadores);
    const nombre = dto.nombre.trim();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const dup = await tx.equipo.findFirst({
          where: { temporadaId: temporada.id, nombre: { equals: nombre, mode: 'insensitive' } },
        });
        if (dup) throw err.conflict('NOMBRE_DUPLICADO', 'Ya existe un equipo con ese nombre en la temporada.');
        await this.verificarDuisLibres(tx, dto.jugadores.map((j) => j.dui));
        const equipo = await tx.equipo.create({
          data: { nombre, temporadaId: temporada.id, capitanId: capitan.id },
        });
        const jugadores = [];
        for (const j of dto.jugadores) {
          jugadores.push(
            await tx.jugador.create({
              data: { ...j, nombre: j.nombre.trim(), fechaNacimiento: new Date(j.fechaNacimiento), equipoId: equipo.id },
              select: { id: true },
            }),
          );
        }
        return { id: equipo.id, estado: equipo.estado, jugadores: jugadores.map((x) => x.id) };
      });
    } catch (e) {
      this.mapUnique(e);
    }
  }

  // -------------------------------------------------------------------------
  // H2 — Validación de elegibilidad
  // -------------------------------------------------------------------------

  async pendientes() {
    const temporada = await this.temporadas.activa();
    const equipos = await this.prisma.equipo.findMany({
      where: { temporadaId: temporada.id, estado: EstadoEquipo.PENDIENTE_VALIDACION },
      include: {
        capitan: { select: { email: true, perfil: { select: { nombreCompleto: true } } } },
        _count: { select: { jugadores: { where: { fechaBaja: null } } } },
      },
      orderBy: { updatedAt: 'asc' },
    });
    return equipos.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      capitan: e.capitan.perfil?.nombreCompleto ?? e.capitan.email,
      capitanEmail: e.capitan.email,
      cantidadJugadores: e._count.jugadores,
      fechaEnvio: e.updatedAt,
    }));
  }

  async detalle(id: string) {
    const e = await this.prisma.equipo.findUnique({
      where: { id },
      include: {
        capitan: { select: { id: true, email: true, perfil: true } },
        jugadores: { where: { fechaBaja: null }, orderBy: { numeroCamiseta: 'asc' } },
        pago: true,
      },
    });
    if (!e) throw err.notFound('EQUIPO_NO_EXISTE', 'El equipo no existe.');
    return e;
  }

  async mio(capitan: User) {
    const temporada = await this.temporadas.activa();
    const e = await this.prisma.equipo.findUnique({
      where: { temporadaId_capitanId: { temporadaId: temporada.id, capitanId: capitan.id } },
      include: {
        jugadores: { where: { fechaBaja: null }, orderBy: { numeroCamiseta: 'asc' } },
        pago: true,
      },
    });
    if (!e) throw err.notFound('SIN_EQUIPO', 'Aún no has inscrito un equipo.');
    return {
      ...e,
      periodoCorreccionAbierto: this.temporadas.enInscripcionOAltasBajas(temporada),
      periodoAltasBajasAbierto: this.temporadas.enAltasBajas(temporada),
      temporada: { id: temporada.id, nombre: temporada.nombre },
    };
  }

  async cambiarEstado(id: string, dto: CambiarEstadoEquipoDto) {
    const equipo = await this.prisma.equipo.findUnique({ where: { id }, include: { temporada: true } });
    if (!equipo) throw err.notFound('EQUIPO_NO_EXISTE', 'El equipo no existe.');
    if (equipo.estado !== EstadoEquipo.PENDIENTE_VALIDACION) {
      throw err.conflict('TRANSICION_INVALIDA', 'Solo pueden aprobarse o rechazarse equipos PENDIENTE_VALIDACION.');
    }

    if (dto.estado === EstadoEquipo.RECHAZADO) {
      const motivo = dto.motivoRechazo?.trim();
      if (!motivo) throw err.badRequest('MOTIVO_REQUERIDO', 'Debes indicar el motivo de rechazo.');
      const r = await this.prisma.equipo.update({
        where: { id },
        data: { estado: EstadoEquipo.RECHAZADO, motivoRechazo: motivo },
      });
      await this.notificaciones.crearAviso({
        destinatarioId: equipo.capitanId,
        categoria: CategoriaNotificacion.INSCRIPCIONES,
        moduloOrigen: ModuloOrigenNotificacion.INSCRIPCIONES,
        titulo: 'Equipo rechazado',
        mensaje: `Tu inscripción de "${equipo.nombre}" fue rechazada. Motivo: ${motivo}`.slice(0, 500),
        referencia: equipo.id,
        eventoId: `equipo:${equipo.id}:rechazado:${r.updatedAt.getTime()}`,
        esCritica: true,
      });
      return { id: r.id, estado: r.estado, motivoRechazo: r.motivoRechazo };
    }

    // APROBADO: crea la cuota PENDIENTE ($50, vence en 15 días calendario).
    const ahora = new Date();
    const vence = new Date(ahora);
    vence.setUTCDate(vence.getUTCDate() + DIAS_VENCIMIENTO_CUOTA);
    const [r, pago] = await this.prisma.$transaction([
      this.prisma.equipo.update({
        where: { id },
        data: { estado: EstadoEquipo.APROBADO, motivoRechazo: null },
      }),
      this.prisma.pago.upsert({
        where: { equipoId: id },
        create: {
          equipoId: id,
          monto: equipo.temporada.cuotaInscripcion,
          estado: EstadoPago.PENDIENTE,
          fechaVencimiento: vence,
        },
        update: {},
      }),
    ]);
    await this.notificaciones.crearAviso({
      destinatarioId: equipo.capitanId,
      categoria: CategoriaNotificacion.INSCRIPCIONES,
      moduloOrigen: ModuloOrigenNotificacion.INSCRIPCIONES,
      titulo: 'Equipo aprobado',
      mensaje: `Tu equipo "${equipo.nombre}" fue aprobado. Se creó la cuota de inscripción de $${pago.monto.toFixed(2)} en estado PENDIENTE.`,
      referencia: equipo.id,
      eventoId: `equipo:${equipo.id}:aprobado`,
    });
    return { id: r.id, estado: r.estado, pagoId: pago.id };
  }

  async reenviar(capitan: User, id: string, dto: ReenviarEquipoDto) {
    const equipo = await this.prisma.equipo.findUnique({ where: { id }, include: { temporada: true } });
    if (!equipo) throw err.notFound('EQUIPO_NO_EXISTE', 'El equipo no existe.');
    if (equipo.capitanId !== capitan.id) throw err.forbidden('NO_PROPIETARIO', 'Solo el capitán del equipo puede reenviarlo.');
    if (equipo.estado !== EstadoEquipo.RECHAZADO) {
      throw err.conflict('TRANSICION_INVALIDA', 'Solo se pueden reenviar equipos RECHAZADOS.');
    }
    if (!this.temporadas.enInscripcionOAltasBajas(equipo.temporada)) {
      throw err.conflict('PERIODO_CERRADO', 'El período para corregir la inscripción está cerrado.');
    }
    this.validarPlantilla(dto.jugadores);
    const nombre = dto.nombre?.trim() ?? equipo.nombre;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const dup = await tx.equipo.findFirst({
          where: { temporadaId: equipo.temporadaId, nombre: { equals: nombre, mode: 'insensitive' }, id: { not: id } },
        });
        if (dup) throw err.conflict('NOMBRE_DUPLICADO', 'Ya existe un equipo con ese nombre en la temporada.');
        await this.verificarDuisLibres(tx, dto.jugadores.map((j) => j.dui), id);
        // Un equipo RECHAZADO nunca jugó partidos: su plantilla no tiene
        // historial y se reemplaza completa por la corregida.
        await tx.jugador.deleteMany({ where: { equipoId: id } });
        for (const j of dto.jugadores) {
          await tx.jugador.create({
            data: { ...j, nombre: j.nombre.trim(), fechaNacimiento: new Date(j.fechaNacimiento), equipoId: id },
          });
        }
        const r = await tx.equipo.update({
          where: { id },
          data: { nombre, estado: EstadoEquipo.PENDIENTE_VALIDACION, motivoRechazo: null },
        });
        return { id: r.id, estado: r.estado };
      });
    } catch (e) {
      this.mapUnique(e);
    }
  }

  // -------------------------------------------------------------------------
  // H3 — Altas y bajas
  // -------------------------------------------------------------------------

  private async equipoPropio(capitan: User, id: string) {
    const equipo = await this.prisma.equipo.findUnique({ where: { id }, include: { temporada: true } });
    if (!equipo) throw err.notFound('EQUIPO_NO_EXISTE', 'El equipo no existe.');
    if (equipo.capitanId !== capitan.id) throw err.forbidden('NO_PROPIETARIO', 'No eres el capitán de este equipo.');
    return equipo;
  }

  async jugadores(capitan: User, id: string) {
    const equipo = await this.equipoPropio(capitan, id);
    const jugadores = await this.prisma.jugador.findMany({
      where: { equipoId: id, fechaBaja: null },
      orderBy: { numeroCamiseta: 'asc' },
    });
    return {
      equipo: { id: equipo.id, nombre: equipo.nombre, estado: equipo.estado },
      periodoAbierto: this.temporadas.enAltasBajas(equipo.temporada),
      jugadores,
    };
  }

  private async validarModificable(capitan: User, id: string) {
    const equipo = await this.equipoPropio(capitan, id);
    if (equipo.estado !== EstadoEquipo.APROBADO) {
      throw err.conflict('EQUIPO_NO_APROBADO', 'Solo un equipo APROBADO puede gestionar altas y bajas.');
    }
    if (!this.temporadas.enAltasBajas(equipo.temporada)) {
      throw err.conflict('PERIODO_CERRADO', 'El período de altas y bajas ha finalizado.');
    }
    return equipo;
  }

  async agregarJugador(capitan: User, id: string, dto: JugadorInputDto) {
    await this.validarModificable(capitan, id);
    this.validarJugador(dto);
    return this.prisma.$transaction(async (tx) => {
      const activos = await tx.jugador.count({ where: { equipoId: id, fechaBaja: null } });
      if (activos >= PLANTILLA_MAX) {
        throw err.badRequest('CUPO_PLANTILLA', `La plantilla ya alcanzó el máximo de ${PLANTILLA_MAX} jugadores.`);
      }
      const duiTomado = await tx.jugador.findUnique({ where: { dui: dto.dui } });
      if (duiTomado) throw err.badRequest('DUI_DUPLICADO', 'El DUI ya está inscrito en la liga.');
      const camiseta = await tx.jugador.findUnique({
        where: { equipoId_numeroCamiseta: { equipoId: id, numeroCamiseta: dto.numeroCamiseta } },
      });
      if (camiseta) throw err.conflict('CAMISETA_DUPLICADA', `La camiseta ${dto.numeroCamiseta} ya está asignada en el equipo.`);
      return tx.jugador.create({
        data: { ...dto, nombre: dto.nombre.trim(), fechaNacimiento: new Date(dto.fechaNacimiento), equipoId: id },
      });
    });
  }

  async darDeBaja(capitan: User, id: string, jugadorId: string) {
    await this.validarModificable(capitan, id);
    return this.prisma.$transaction(async (tx) => {
      const jugador = await tx.jugador.findUnique({ where: { id: jugadorId } });
      if (!jugador || jugador.equipoId !== id) throw err.notFound('JUGADOR_NO_EXISTE', 'El jugador no pertenece a este equipo.');
      if (jugador.fechaBaja) throw err.conflict('YA_DADO_DE_BAJA', 'El jugador ya fue dado de baja.');
      const activos = await tx.jugador.count({ where: { equipoId: id, fechaBaja: null } });
      if (activos <= PLANTILLA_MIN) {
        throw err.badRequest('CUPO_PLANTILLA', `La plantilla no puede quedar con menos de ${PLANTILLA_MIN} jugadores.`);
      }
      const enCurso = await tx.participacionPartido.findFirst({
        where: { jugadorId, partido: { estado: EstadoPartido.EN_CURSO } },
      });
      if (enCurso) throw err.conflict('PARTIDO_EN_CURSO', 'El jugador participa en un partido EN_CURSO.');
      // Baja lógica: se preservan eventos y participaciones históricas.
      return tx.jugador.update({ where: { id: jugadorId }, data: { fechaBaja: new Date() } });
    });
  }

  // -------------------------------------------------------------------------
  // H6 — Calendario del equipo del usuario autenticado
  // -------------------------------------------------------------------------

  /** Capitán: Equipo.capitanId. Jugador: Jugador.usuarioId (ficha activa). */
  async equipoDelUsuario(user: User): Promise<string | null> {
    const temporada = await this.temporadas.activa();
    if (user.rol === RolUsuario.CAPITAN) {
      const e = await this.prisma.equipo.findUnique({
        where: { temporadaId_capitanId: { temporadaId: temporada.id, capitanId: user.id } },
        select: { id: true },
      });
      if (e) return e.id;
    }
    const ficha = await this.prisma.jugador.findUnique({
      where: { usuarioId: user.id },
      select: { equipoId: true, fechaBaja: true, equipo: { select: { temporadaId: true } } },
    });
    if (ficha && !ficha.fechaBaja && ficha.equipo.temporadaId === temporada.id) return ficha.equipoId;
    return null;
  }

  async misPartidos(user: User) {
    const equipoId = await this.equipoDelUsuario(user);
    if (!equipoId) {
      throw err.forbidden('SIN_VINCULO', 'Tu cuenta aún no está vinculada a un jugador');
    }
    const partidos = await this.prisma.partido.findMany({
      where: {
        jornada: { estado: EstadoJornada.PUBLICADA },
        OR: [{ equipoLocalId: equipoId }, { equipoVisitanteId: equipoId }],
      },
      include: {
        jornada: { select: { numero: true } },
        equipoLocal: { select: { id: true, nombre: true } },
        equipoVisitante: { select: { id: true, nombre: true } },
        eventos: { select: { tipo: true, jugador: { select: { equipoId: true } } } },
      },
      orderBy: { fechaHoraInicio: 'asc' },
    });
    return {
      equipoId,
      partidos: partidos.map(({ eventos, ...p }) => ({
        id: p.id,
        jornada: p.jornada.numero,
        fechaHoraInicio: p.fechaHoraInicio,
        fechaHoraFin: p.fechaHoraFin,
        cancha: p.cancha,
        estado: p.estado,
        motivoSuspension: p.motivoSuspension,
        esLocal: p.equipoLocalId === equipoId,
        rival: p.equipoLocalId === equipoId ? p.equipoVisitante : p.equipoLocal,
        equipoLocal: p.equipoLocal,
        equipoVisitante: p.equipoVisitante,
        marcador: p.estado === EstadoPartido.PROGRAMADO ? null : calcularMarcador(p, eventos),
      })),
    };
  }
}
