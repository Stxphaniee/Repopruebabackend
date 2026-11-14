import { ApiProperty } from '@nestjs/swagger';
import type { RolUsuario, User } from '@PrismaClient';

/**
 * Forma pública de un usuario.
 *
 * Los controladores devuelven esto y nunca la fila cruda de Prisma, para que
 * `passwordHash` no pueda filtrarse en una respuesta por descuido.
 *
 * Módulo 0 (b): respuesta { id, email, rol, activo }.
 */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'nestor@example.com', format: 'email' })
  email!: string;

  @ApiProperty({ enum: ['JUGADOR', 'CAPITAN', 'ARBITRO', 'ORGANIZADOR'] })
  rol!: RolUsuario;

  @ApiProperty()
  activo!: boolean;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      rol: user.rol,
      activo: user.isActive,
    };
  }
}
