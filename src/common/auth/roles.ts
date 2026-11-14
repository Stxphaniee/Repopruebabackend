import {
  ForbiddenException,
  SetMetadata,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RolUsuario, User } from '@PrismaClient';

/**
 * Módulo 0 (f): autorización por rol.
 *
 * `JwtAuthGuard` (boilerplate) ya verifica el token y relee el usuario desde
 * la base en cada request, por lo que `request.user.rol` e `isActive` siempre
 * reflejan el estado real de la BD (nunca un valor enviado por el cliente).
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);

export const NO_AUTENTICADO = { codigo: 'NO_AUTENTICADO', mensaje: 'Inicia sesión' };
export const SIN_PERMISO = {
  codigo: 'SIN_PERMISO',
  mensaje: 'No tienes permiso para esta acción',
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RolUsuario[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user = context.switchToHttp().getRequest<{ user?: User }>().user;
    if (!user) throw new UnauthorizedException(NO_AUTENTICADO);
    if (!user.isActive || !roles.includes(user.rol)) {
      throw new ForbiddenException(SIN_PERMISO);
    }
    return true;
  }
}

/** Helpers para responder errores con el formato { codigo, mensaje }. */
export const err = {
  badRequest: (codigo: string, mensaje: string) => new BadRequestException({ codigo, mensaje }),
  forbidden: (codigo: string, mensaje: string) => new ForbiddenException({ codigo, mensaje }),
  notFound: (codigo: string, mensaje: string) => new NotFoundException({ codigo, mensaje }),
  conflict: (codigo: string, mensaje: string) => new ConflictException({ codigo, mensaje }),
};
