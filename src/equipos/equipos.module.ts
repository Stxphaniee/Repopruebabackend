import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import { RolUsuario, type User } from '@PrismaClient';
import { Roles } from '../common/auth/roles.js';
import { TemporadaModule } from '../common/temporada.js';
import { NotificacionCoreModule } from '../notificaciones/notificacion.service.js';
import {
  CambiarEstadoEquipoDto,
  CrearEquipoDto,
  JugadorInputDto,
  ReenviarEquipoDto,
} from './equipos.dto.js';
import { EquiposService } from './equipos.service.js';

@ApiTags('equipos')
@ApiBearerAuth()
@Controller('equipos')
export class EquiposController {
  constructor(private readonly service: EquiposService) {}

  @Post()
  @Roles(RolUsuario.CAPITAN)
  crear(@CurrentUser() capitan: User, @Body() dto: CrearEquipoDto) {
    return this.service.crear(capitan, dto);
  }

  @Get('pendientes')
  @Roles(RolUsuario.ORGANIZADOR)
  pendientes() {
    return this.service.pendientes();
  }

  @Get('mio')
  @Roles(RolUsuario.CAPITAN)
  mio(@CurrentUser() capitan: User) {
    return this.service.mio(capitan);
  }

  @Get('mis-partidos')
  @Roles(RolUsuario.JUGADOR, RolUsuario.CAPITAN)
  misPartidos(@CurrentUser() user: User) {
    return this.service.misPartidos(user);
  }

  @Get(':id')
  @Roles(RolUsuario.ORGANIZADOR)
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detalle(id);
  }

  @Patch(':id/estado')
  @Roles(RolUsuario.ORGANIZADOR)
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoEquipoDto,
  ) {
    return this.service.cambiarEstado(id, dto);
  }

  @Patch(':id/reenviar')
  @Roles(RolUsuario.CAPITAN)
  reenviar(
    @CurrentUser() capitan: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReenviarEquipoDto,
  ) {
    return this.service.reenviar(capitan, id, dto);
  }

  @Get(':id/jugadores')
  @Roles(RolUsuario.CAPITAN)
  jugadores(
    @CurrentUser() capitan: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.jugadores(capitan, id);
  }

  @Post(':id/jugadores')
  @Roles(RolUsuario.CAPITAN)
  agregarJugador(
    @CurrentUser() capitan: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JugadorInputDto,
  ) {
    return this.service.agregarJugador(capitan, id, dto);
  }

  @Patch(':id/jugadores/:jugadorId/baja')
  @Roles(RolUsuario.CAPITAN)
  darDeBaja(
    @CurrentUser() capitan: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('jugadorId', ParseUUIDPipe) jugadorId: string,
  ) {
    return this.service.darDeBaja(capitan, id, jugadorId);
  }
}

@Module({
  imports: [TemporadaModule, NotificacionCoreModule],
  controllers: [EquiposController],
  providers: [EquiposService],
  exports: [EquiposService],
})
export class EquiposModule {}
