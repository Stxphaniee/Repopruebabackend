import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@PrismaClient';

export interface RequestWithUser extends Request {
  user?: User;
}

/**
 * Extrae el usuario que JwtAuthGuard adjuntó al request.
 * Solo tiene sentido en rutas protegidas por el guard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user as User;
  },
);
