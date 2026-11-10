import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { UsersService } from '@Users/services';
import { TokenService } from './token.service.js';
import type { LoginDto } from '@Auth/dto';
import type { TokenPair } from '@Auth/types';
import type { User } from '@PrismaClient';

/**
 * Hash descartable con el que se compara cuando el email no existe.
 *
 * Sin esto, un login contra un email no registrado respondería muchísimo más
 * rápido que uno contra una cuenta real (no habría bcrypt de por medio), y esa
 * diferencia de tiempo permite enumerar qué emails están registrados.
 * Corresponde a un valor aleatorio; nunca va a matchear.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7ttRFZIqjvBeT3M1kRDRm1gy9cKr9Wy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<{ user: User; tokens: TokenPair }> {
    const user = await this.validateCredentials(dto.email, dto.password);
    return { user, tokens: await this.tokenService.issueTokenPair(user) };
  }

  /**
   * Valida email y contraseña.
   *
   * Responde el mismo 401 genérico en los tres casos posibles (email no
   * registrado, contraseña incorrecta, cuenta inactiva) para no filtrar qué
   * emails tienen cuenta.
   */
  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const passwordMatches = await this.usersService.verifyPassword(
      password,
      user.passwordHash,
    );

    if (!passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    return user;
  }

  refresh(refreshToken: string): Promise<{ user: User; tokens: TokenPair }> {
    return this.tokenService.rotate(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokenService.revoke(refreshToken);
  }
}
