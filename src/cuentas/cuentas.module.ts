import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { PrismaService } from '@Prisma/services';
import { CurrentUser } from '@Auth/decorators';
import { Prisma, RolUsuario, type User } from '@PrismaClient';
import { Roles, err } from '../common/auth/roles.js';

export const DUI_REGEX = /^\d{8}-\d$/;

class PerfilDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 100, { message: 'El nombre completo debe tener entre 3 y 100 caracteres.' })
  nombreCompleto!: string;

  @IsString()
  @Matches(DUI_REGEX, { message: 'El DUI debe tener el formato 00000000-0.' })
  dui!: string;
}

class CambiarRolDto {
  @IsEnum(RolUsuario)
  rol!: RolUsuario;
}

class VincularDto {
  @IsUUID()
  usuarioId!: string;
}

class BuscarUsuariosQuery {
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsEnum(RolUsuario) rol?: RolUsuario;
}

@Injectable()
export class CuentasService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerPerfil(user: User) {
    const perfil = await this.prisma.userProfile.findUnique({ where: { userId: user.id } });
    return { email: user.email, rol: user.rol, perfil };
  }

  async guardarPerfil(user: User, dto: PerfilDto) {
    try {
      return await this.prisma.userProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...dto },
        update: dto,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw err.conflict('DUI_DUPLICADO', 'El DUI ya está registrado en otra cuenta.');
      }
      throw e;
    }
  }

  buscarUsuarios(q: BuscarUsuariosQuery) {
    return this.prisma.user.findMany({
      where: {
        email: q.email ? { contains: q.email.toLowerCase() } : undefined,
        rol: q.rol,
      },
      select: { id: true, email: true, rol: true, isActive: true, perfil: true },
      orderBy: { email: 'asc' },
      take: 50,
    });
  }

  /** Módulo 0 (c): PATCH /api/admin/usuarios/:id/rol con auditoría. */
  async cambiarRol(autor: User, id: string, rol: RolUsuario) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw err.notFound('USUARIO_NO_EXISTE', 'El usuario no existe.');
    if (u.rol === rol) throw err.conflict('ROL_SIN_CAMBIO', `La cuenta ya es ${rol}.`);
    const [actualizado] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { rol } }),
      this.prisma.auditoriaRol.create({
        data: { usuarioId: id, autorId: autor.id, rolAnterior: u.rol, rolNuevo: rol },
      }),
    ]);
    return { id: actualizado.id, rol: actualizado.rol };
  }

  /** Módulo 0 (d): fichas sin cuenta + cuentas cuyo DUI de perfil coincide. */
  async sinVincular() {
    const fichas = await this.prisma.jugador.findMany({
      where: { usuarioId: null, fechaBaja: null },
      select: { id: true, nombre: true, dui: true, equipo: { select: { id: true, nombre: true } } },
      orderBy: { nombre: 'asc' },
    });
    const perfiles = await this.prisma.userProfile.findMany({
      where: { dui: { in: fichas.map((f) => f.dui) }, user: { jugador: null } },
      select: { userId: true, dui: true, nombreCompleto: true, user: { select: { email: true } } },
    });
    const porDui = new Map(perfiles.map((p) => [p.dui, p]));
    return fichas.map((f) => {
      const p = porDui.get(f.dui);
      return {
        ...f,
        cuentaCoincidente: p
          ? { usuarioId: p.userId, email: p.user.email, nombreCompleto: p.nombreCompleto }
          : null,
      };
    });
  }

  async vincular(jugadorId: string, usuarioId: string) {
    return this.prisma.$transaction(async (tx) => {
      const ficha = await tx.jugador.findUnique({ where: { id: jugadorId } });
      if (!ficha) throw err.notFound('FICHA_NO_EXISTE', 'La ficha de jugador no existe.');
      const usuario = await tx.user.findUnique({ where: { id: usuarioId }, include: { perfil: true, jugador: true } });
      if (!usuario) throw err.notFound('USUARIO_NO_EXISTE', 'La cuenta no existe.');
      if (ficha.fechaBaja) throw err.badRequest('FICHA_INACTIVA', 'La ficha no está activa.');
      if (ficha.usuarioId) throw err.conflict('FICHA_YA_VINCULADA', 'La ficha ya tiene una cuenta asociada.');
      if (usuario.jugador) throw err.conflict('CUENTA_YA_VINCULADA', 'La cuenta ya está vinculada a otra ficha.');
      if (!usuario.perfil || usuario.perfil.dui !== ficha.dui) {
        throw err.conflict('IDENTIDAD_NO_COINCIDE', 'El DUI del perfil no coincide con el de la ficha.');
      }
      const r = await tx.jugador.update({ where: { id: jugadorId }, data: { usuarioId } });
      return { jugadorId: r.id, usuarioId: r.usuarioId };
    });
  }
}

@ApiTags('mi-perfil')
@ApiBearerAuth()
@Controller('mi-perfil')
export class PerfilController {
  constructor(private readonly svc: CuentasService) {}

  @Get()
  obtener(@CurrentUser() user: User) {
    return this.svc.obtenerPerfil(user);
  }

  /** El userId se toma de la sesión, nunca del body. */
  @Put()
  guardar(@CurrentUser() user: User, @Body() dto: PerfilDto) {
    return this.svc.guardarPerfil(user, dto);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(RolUsuario.ORGANIZADOR)
@Controller('admin')
export class AdminCuentasController {
  constructor(private readonly svc: CuentasService) {}

  @Get('usuarios')
  buscar(@Query() q: BuscarUsuariosQuery) {
    return this.svc.buscarUsuarios(q);
  }

  @Patch('usuarios/:id/rol')
  cambiarRol(@CurrentUser() autor: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CambiarRolDto) {
    return this.svc.cambiarRol(autor, id, dto.rol);
  }

  @Get('jugadores/sin-vincular')
  sinVincular() {
    return this.svc.sinVincular();
  }

  @Patch('jugadores/:id/vincular')
  vincular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VincularDto) {
    return this.svc.vincular(id, dto.usuarioId);
  }
}

@Module({
  controllers: [PerfilController, AdminCuentasController],
  providers: [CuentasService],
})
export class CuentasModule {}
