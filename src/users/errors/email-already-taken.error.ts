/**
 * Error de dominio: el email ya está registrado.
 *
 * Lo lanza el repositorio al detectar la violación de unicidad, y la capa de
 * servicio lo traduce a una excepción HTTP. Así el repositorio no depende de
 * `@nestjs/common` ni sabe de códigos de estado, y el servicio no necesita
 * conocer los códigos de error de Prisma.
 */
export class EmailAlreadyTakenError extends Error {
  constructor(public readonly email: string) {
    super(`El email "${email}" ya está registrado.`);
    this.name = 'EmailAlreadyTakenError';
  }
}
