import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '@Users/dto';
import type { User } from '@PrismaClient';
import type { TokenPair } from '@Auth/types';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT de acceso, para el header Authorization: Bearer.' })
  accessToken!: string;

  @ApiProperty({ description: 'Token opaco para renovar el acceso en POST /auth/refresh.' })
  refreshToken!: string;

  @ApiProperty({ description: 'Vigencia del access token, en segundos.', example: 900 })
  expiresIn!: number;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  static from(user: User, tokens: TokenPair): AuthResponseDto {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: UserResponseDto.fromEntity(user),
    };
  }
}
