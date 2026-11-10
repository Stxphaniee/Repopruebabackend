import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token obtenido en el login.',
    example: '9f2b1c...',
  })
  @IsString()
  @IsNotEmpty({ message: 'El refresh token es obligatorio.' })
  refreshToken!: string;
}
