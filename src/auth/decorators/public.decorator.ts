import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca una ruta como accesible sin token.
 *
 * El guard de JWT está registrado globalmente (todo cerrado por defecto), así
 * que login, refresh y registro tienen que abrirse explícitamente. Olvidarse
 * de este decorador deja el endpoint protegido, que es el error seguro.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
