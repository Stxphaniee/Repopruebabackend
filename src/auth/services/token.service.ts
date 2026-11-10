import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { RefreshTokenRepository } from '@Auth/repositories';
import type { AccessTokenPayload, TokenPair } from '@Auth/types';
import type { EnvConfig } from '@Config';
import type { User } from '@PrismaClient';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_BYTES = 32;

/**
 * Emisión, rotación y revocación de tokens.
 *
 * El access token es un JWT de vida corta y sin estado. El refresh token es un
 * string opaco persistido: se guarda su SHA-256, no el valor en claro.
 *
 * Por qué SHA-256 y no bcrypt para el refresh token: son 32 bytes aleatorios,
 * es decir alta entropía, así que no hay un espacio de búsqueda que un KDF
 * lento deba encarecer. Además hace falta buscarlo por hash en un índice
 * (bcrypt genera un salt distinto por hash, así que no se puede indexar) y
 * bcrypt trunca en 72 bytes. bcrypt queda para las contraseñas, que sí son de
 * baja entropía.
 */
@Injectable()
export class TokenService {
  private readonly refreshTokenTtlMs: number;

  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly jwtService: JwtService,
    configService: ConfigService<EnvConfig, true>,
  ) {
    this.refreshTokenTtlMs =
      configService.get('REFRESH_TOKEN_EXPIRES_IN_DAYS', { infer: true }) *
      MILLISECONDS_PER_DAY;
  }

  /** Emite un par de tokens nuevo y persiste el refresh token. */
  async issueTokenPair(user: User): Promise<TokenPair> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');

    await this.refreshTokenRepository.create({
      tokenHash: this.hashToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + this.refreshTokenTtlMs),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: await this.getAccessTokenTtlSeconds(accessToken),
    };
  }

  /**
   * Canjea un refresh token por un par nuevo (rotación).
   *
   * Incluye detección de reúso: si llega un token que ya fue canjeado, se
   * asume que fue robado y se revoca la sesión completa del usuario.
   */
  async rotate(refreshToken: string): Promise<{ user: User; tokens: TokenPair }> {
    const stored = await this.refreshTokenRepository.findByTokenHashWithUser(
      this.hashToken(refreshToken),
    );

    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    if (stored.revokedAt !== null) {
      await this.refreshTokenRepository.revokeAllForUser(stored.userId);
      throw new UnauthorizedException(
        'Refresh token ya utilizado. Se cerraron todas las sesiones por seguridad.',
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expirado.');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('La cuenta está inactiva.');
    }

    await this.refreshTokenRepository.revokeById(stored.id);

    return {
      user: stored.user,
      tokens: await this.issueTokenPair(stored.user),
    };
  }

  /**
   * Revoca un refresh token puntual (logout).
   *
   * Es idempotente a propósito: un logout con un token ya inválido igual
   * responde 204, así no se convierte en un oráculo para descubrir qué tokens
   * existen.
   */
  async revoke(refreshToken: string): Promise<void> {
    await this.refreshTokenRepository.revokeByTokenHash(
      this.hashToken(refreshToken),
    );
  }

  /** Revoca todas las sesiones activas de un usuario. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenRepository.revokeAllForUser(userId);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Deriva la vigencia del `exp` real del token ya firmado, en vez de reparsear
   * JWT_EXPIRES_IN ("15m", "1h", ...) a mano.
   */
  private async getAccessTokenTtlSeconds(accessToken: string): Promise<number> {
    const decoded = await this.jwtService.verifyAsync<
      AccessTokenPayload & { exp: number; iat: number }
    >(accessToken);
    return decoded.exp - decoded.iat;
  }
}
