import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '@Auth/decorators';
import { RolUsuario, type User } from '@PrismaClient';
import { Roles } from '../common/auth/roles.js';
import { NotificacionCoreModule } from '../notificaciones/notificacion.service.js';
import {
  CambiarEstadoPartidoDto,
  CorregirResultadoDto,
  CrearJornadaDto,
  CrearPartidoDto,
  ListarPartidosQuery,
  ModificarPartidoDto,
  RegistrarEventoDto,
  RegistrarParticipantesDto,
} from './partidos.dto.js';
import { PartidosService } from './partidos.service.js';

@ApiTags('jornadas')
@ApiBearerAuth()
@Controller('jornadas')
export class JornadasController {
  constructor(private readonly service: PartidosService) {}

  @Post()
  @Roles(RolUsuario.ORGANIZADOR)
  crearJornada(@CurrentUser() org: User, @Body() dto: CrearJornadaDto) {
    return this.service.crearJornada(org, dto);
  }

  @Public()
  @Get()
  listarJornadas() {
    return this.service.listarJornadas();
  }

  @Patch(':id/publicar')
  @Roles(RolUsuario.ORGANIZADOR)
  publicarJornada(
    @CurrentUser() org: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.publicarJornada(org, id);
  }
}

@ApiTags('partidos')
@ApiBearerAuth()
@Controller('partidos')
export class PartidosController {
  constructor(private readonly service: PartidosService) {}

  @Post()
  @Roles(RolUsuario.ORGANIZADOR)
  @HttpCode(HttpStatus.CREATED)
  crearPartido(@CurrentUser() org: User, @Body() dto: CrearPartidoDto) {
    return this.service.crearPartido(org, dto);
  }

  @Public()
  @Get('resultados')
  listarPartidos(@Query() query: ListarPartidosQuery) {
    return this.service.listarPartidos(query);
  }

  @Public()
  @Get(':id/marcador')
  marcadorPartido(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.marcadorPartido(id);
  }

  @Public()
  @Get(':id')
  detallePartido(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detallePartido(id);
  }

  @Patch(':id/estado')
  @Roles(RolUsuario.ARBITRO)
  cambiarEstadoPartido(
    @CurrentUser() arbitro: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoPartidoDto,
  ) {
    return this.service.cambiarEstadoPartido(arbitro, id, dto);
  }

  @Patch(':id')
  @Roles(RolUsuario.ORGANIZADOR)
  modificarPartido(
    @CurrentUser() org: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModificarPartidoDto,
  ) {
    return this.service.modificarPartido(org, id, dto);
  }

  @Post(':id/participantes')
  @Roles(RolUsuario.ARBITRO)
  registrarParticipantes(
    @CurrentUser() arbitro: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RegistrarParticipantesDto,
  ) {
    return this.service.registrarParticipantes(arbitro, id, body);
  }

  @Post(':id/eventos')
  @Roles(RolUsuario.ARBITRO)
  registrarEvento(
    @CurrentUser() arbitro: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarEventoDto,
  ) {
    return this.service.registrarEvento(arbitro, id, dto);
  }

  @Post(':id/corregir')
  @Roles(RolUsuario.ORGANIZADOR)
  corregirResultado(
    @CurrentUser() org: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorregirResultadoDto,
  ) {
    return this.service.corregirResultado(org, id, dto);
  }
}

@ApiTags('arbitro')
@ApiBearerAuth()
@Controller('arbitro')
export class ArbitroPartidosController {
  constructor(private readonly service: PartidosService) {}

  @Get('mis-partidos')
  @Roles(RolUsuario.ARBITRO)
  misPartidosArbitro(@CurrentUser() arbitro: User) {
    return this.service.misPartidosArbitro(arbitro);
  }
}

@Module({
  imports: [NotificacionCoreModule],
  controllers: [
    JornadasController,
    PartidosController,
    ArbitroPartidosController,
  ],
  providers: [PartidosService],
  exports: [PartidosService],
})
export class PartidosModule {}
