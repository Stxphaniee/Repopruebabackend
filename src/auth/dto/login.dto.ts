import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsNormalizedEmail } from '@Common/decorators';

export class LoginDto {
  @ApiProperty({ example: 'demo@example.com', format: 'email' })
  @IsNormalizedEmail()
  email!: string;

  // A diferencia del registro, acá NO se valida la forma de la contraseña:
  // las reglas de complejidad pueden cambiar con el tiempo y un usuario viejo
  // debe poder seguir entrando. Solo se acota el largo.
  @ApiProperty({ example: 'Demo1234!' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MaxLength(72)
  password!: string;
}
