import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

/** Largo máximo de una dirección de email según el RFC 5321. */
const MAX_EMAIL_LENGTH = 254;

/**
 * Normaliza y valida un campo de email.
 *
 * El `@Transform` corre antes de las validaciones (el ValidationPipe
 * transforma y después valida), y ese orden es el punto de todo esto: sin el
 * trim previo, un email con espacios alrededor lo rechaza `@IsEmail` con un 400
 * antes de que nadie pueda limpiarlo. Pasar el email con un espacio de más es
 * justo lo que hace un navegador al autocompletar o un usuario al copiar y
 * pegar, así que conviene aceptarlo.
 *
 * El lowercase acompaña porque el índice único de Postgres es sensible a
 * mayúsculas: sin normalizar, "Demo@mail.com" y "demo@mail.com" serían dos
 * cuentas distintas.
 *
 * UserRepository normaliza de nuevo al leer y escribir. La redundancia es a
 * propósito: esto cubre lo que entra por HTTP, y el repositorio cubre a
 * cualquier llamador interno que no pase por un DTO (el seed, por ejemplo).
 */
export function IsNormalizedEmail() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toLowerCase() : value,
    ),
    IsEmail({}, { message: 'El email no tiene un formato válido.' }),
    MaxLength(MAX_EMAIL_LENGTH, {
      message: `El email no puede superar los ${MAX_EMAIL_LENGTH} caracteres.`,
    }),
  );
}
