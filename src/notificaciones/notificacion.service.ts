import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  CategoriaNotificacion,
  ModuloOrigenNotificacion,
  Prisma,
  type Notificacion,
} from '@PrismaClient';

export interface CrearAvisoInput {
  destinatarioId: string;
  categoria: CategoriaNotificacion;
  titulo: string;
  mensaje: string;
  moduloOrigen: ModuloOrigenNotificacion;
  referencia?: string;
  eventoId: string;
  esCritica?: boolean;
}

/**
 * H20 — Servicio único de avisos (Módulo 9).
 *
 * Contrato del documento: crearAviso({ destinatarioId, categoria, titulo (1–100),
 * mensaje (1–500), moduloOrigen, referencia? (≤100), eventoId, esCritica? })
 * → Notificacion | null.
 *
 * - Idempotente por (eventoId, usuarioId): los reintentos del mismo evento no
 *   duplican avisos (H16/H17 reutilizan el eventoId de H5/H4).
 * - Respeta preferencias de H21 salvo avisos críticos (rechazo/suspensión).
 * - Solo lo invocan módulos backend; no hay endpoint para emitir avisos.
 */
@Injectable()
export class NotificacionService {
  private readonly logger = new Logger(NotificacionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async crearAviso(input: CrearAvisoInput): Promise<Notificacion | null> {
    this.validar(input);
    const destinatario = await this.prisma.user.findUnique({
      where: { id: input.destinatarioId },
      select: { id: true },
    });
    if (!destinatario) throw new Error('El destinatario no existe.');

    if (!input.esCritica) {
      const pref = await this.prisma.preferenciaNotificacion.findUnique({
        where: {
          usuarioId_categoria: { usuarioId: input.destinatarioId, categoria: input.categoria },
        },
      });
      if (pref && !pref.activa) return null;
    }

    try {
      return await this.prisma.notificacion.create({
        data: {
          usuarioId: input.destinatarioId,
          categoria: input.categoria,
          titulo: input.titulo,
          mensaje: input.mensaje,
          moduloOrigen: input.moduloOrigen,
          referencia: input.referencia,
          eventoId: input.eventoId,
          esCritica: input.esCritica ?? false,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Duplicado omitido (mismo eventoId y destinatario).
        return null;
      }
      throw e;
    }
  }

  /** Envía el mismo evento a varios destinatarios, deduplicando usuarios. */
  async crearAvisos(
    destinatarios: Iterable<string>,
    base: Omit<CrearAvisoInput, 'destinatarioId'>,
  ): Promise<number> {
    let creados = 0;
    for (const id of new Set(destinatarios)) {
      try {
        if (await this.crearAviso({ ...base, destinatarioId: id })) creados++;
      } catch (e) {
        this.logger.error(`No se pudo crear aviso ${base.eventoId} para ${id}: ${String(e)}`);
      }
    }
    return creados;
  }

  /**
   * Usuarios vinculados a un equipo: capitán + jugadores activos con cuenta
   * (Jugador.usuarioId). Regla de destinatarios: un aviso por usuario.
   */
  async usuariosDeEquipos(equipoIds: string[]): Promise<string[]> {
    const equipos = await this.prisma.equipo.findMany({
      where: { id: { in: equipoIds } },
      select: {
        capitanId: true,
        jugadores: { where: { fechaBaja: null, usuarioId: { not: null } }, select: { usuarioId: true } },
      },
    });
    const ids = new Set<string>();
    for (const e of equipos) {
      ids.add(e.capitanId);
      for (const j of e.jugadores) if (j.usuarioId) ids.add(j.usuarioId);
    }
    return [...ids];
  }

  private validar(i: CrearAvisoInput) {
    if (!Object.values(CategoriaNotificacion).includes(i.categoria)) throw new Error('Categoría inválida');
    if (!Object.values(ModuloOrigenNotificacion).includes(i.moduloOrigen)) throw new Error('Módulo inválido');
    if (!i.titulo || i.titulo.length > 100) throw new Error('Título debe tener 1–100 caracteres');
    if (!i.mensaje || i.mensaje.length > 500) throw new Error('Mensaje debe tener 1–500 caracteres');
    if (i.referencia && i.referencia.length > 100) throw new Error('Referencia ≤ 100 caracteres');
    if (!i.eventoId) throw new Error('eventoId es obligatorio');
  }
}

@Global()
@Module({ providers: [NotificacionService], exports: [NotificacionService] })
export class NotificacionCoreModule {}
