import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '@Users/services';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '@Auth/types';

/**
 * Guard global: valida el Bearer token y carga el usuario en el request.
 *
 * Se implementa a mano en vez de usar Passport porque `passport-jwt` es CJS y
 * su interoperabilidad con ESM estricto es frágil. El costo es unas pocas
 * líneas y se gana control sobre el mensaje de error.
 *
 * Importa los decoradores por ruta relativa y no por `@Auth/decorators` para
 * no crear un ciclo entre los barrels de guards/ y decorators/.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Falta el token de acceso.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      // Cubre firma inválida, token expirado y token malformado por igual:
      // no conviene decirle al cliente cuál de los tres fue.
      throw new UnauthorizedException('Token de acceso inválido o expirado.');
    }

    // Se relee el usuario en cada request para que una cuenta desactivada o
    // eliminada deje de funcionar sin esperar a que expire el token.
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('La cuenta no existe o está inactiva.');
    }

    request.user = user;
    return true;
  }

  private extractBearerToken(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }
}
