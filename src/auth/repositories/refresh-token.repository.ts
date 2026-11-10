import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { RefreshToken, User } from '@PrismaClient';

export interface CreateRefreshTokenData {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

/** Refresh token con el usuario dueño ya cargado. */
export type RefreshTokenWithUser = RefreshToken & { user: User };

/**
 * Único punto del módulo que habla con la tabla `refresh_tokens`.
 *
 * Nota: acá siempre se maneja el *hash* del token, nunca el valor en claro.
 * El hasheo vive en TokenService, que es quien conoce el secreto del esquema.
 */
@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateRefreshTokenData): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  /** Busca por hash trayendo el usuario, para validar la sesión en una sola query. */
  findByTokenHashWithUser(
    tokenHash: string,
  ): Promise<RefreshTokenWithUser | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  revokeById(id: string): Promise<RefreshToken> {
    return this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoca por hash. Devuelve cuántas filas cambiaron.
   *
   * Usa `updateMany` con `revokedAt: null` en el filtro para que sea
   * idempotente: si el token no existe o ya estaba revocado, no lanza, solo
   * devuelve 0.
   */
  revokeByTokenHash(tokenHash: string): Promise<number> {
    return this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .then((result) => result.count);
  }

  /** Revoca todas las sesiones activas de un usuario. Devuelve cuántas cerró. */
  revokeAllForUser(userId: string): Promise<number> {
    return this.prisma.refreshToken
      .updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .then((result) => result.count);
  }

  /** Utilidad de mantenimiento: limpia tokens vencidos. */
  deleteExpired(now: Date = new Date()): Promise<number> {
    return this.prisma.refreshToken
      .deleteMany({ where: { expiresAt: { lt: now } } })
      .then((result) => result.count);
  }
}
