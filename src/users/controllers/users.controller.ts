import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@Auth/decorators';
import { UsersService } from '@Users/services';
import { CreateUserDto, UserResponseDto } from '@Users/dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Registro. Crear un usuario es crear un recurso, así que es un POST a la
   * colección `/users` y responde 201 (el default de Nest para POST).
   */
  @Public()
  @Post()
  @ApiOperation({ summary: 'Registra un nuevo usuario' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: 'El nombre de usuario ya está en uso.' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.usersService.create(dto);
    return UserResponseDto.fromEntity(user);
  }
}
