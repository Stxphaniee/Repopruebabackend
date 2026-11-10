import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EmailAlreadyTakenError } from '@Users/errors';
import { Prisma, type User } from '@PrismaClient';

/** Código de Prisma para violación de restricción única. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export interface CreateUserData {
  email: string;
  passwordHash: string;
}

/**
 * Único punto del módulo que habla con la tabla `users`.
 *
 * Los servicios no conocen Prisma: reciben y devuelven entidades, y los
 * detalles del ORM (códigos de error, formas de `where`, `select`) quedan
 * encapsulados acá. Eso permite cambiar el acceso a datos sin tocar la lógica
 * de negocio, y testear los servicios con un doble de este repositorio.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @throws {EmailAlreadyTakenError} si el email ya está registrado.
   *
   * Se deja que la base decida la unicidad en vez de consultar antes: un
   * `findUnique` previo tiene una condición de carrera entre la lectura y el
   * insert. El código P2002 de Prisma se traduce a un error de dominio para
   * que la capa de servicio no tenga que conocer los códigos del ORM.
   */
  async create({ email, passwordHash }: CreateUserData): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: { email: this.normalizeEmail(email), passwordHash },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new EmailAlreadyTakenError(email);
      }
      throw error;
    }
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.prisma.user
      .count({ where: { email: this.normalizeEmail(email) } })
      .then((count) => count > 0);
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  setActive(id: string, isActive: boolean): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }

  deleteById(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }

  /**
   * Los emails se persisten y se consultan en minúsculas.
   *
   * El índice único de Postgres es sensible a mayúsculas, así que sin esto
   * "Demo@mail.com" y "demo@mail.com" serían dos cuentas distintas y el login
   * fallaría según cómo el usuario escribiera su email. Va en el repositorio a
   * propósito: es el único punto por el que pasan todas las lecturas y
   * escrituras, así que ningún llamador puede saltearse la normalización.
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
