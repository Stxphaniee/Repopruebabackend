import crypto from 'node:crypto';
import fs from 'node:fs';
import { extname, join } from 'node:path';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '@Auth/decorators';
import { PrismaService } from '@Prisma/services';
import {
  EstadoPartido,
  RolUsuario,
  TipoMultimedia,
  type User,
} from '@PrismaClient';
import { Roles, err } from '../common/auth/roles.js';

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.mp4', '.mov']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

@Injectable()
export class MultimediaService {
  constructor(private readonly prisma: PrismaService) {}

  async subirMultimedia(
    user: User,
    partidoId: string,
    files: { originalname: string; size: number; buffer: Buffer; mimetype: string }[],
  ) {
    if (!files || files.length === 0) {
      throw err.badRequest(
        'ARCHIVOS_REQUERIDOS',
        'Debe enviar al menos un archivo multimedia.',
      );
    }
    if (files.length > 20) {
      throw err.badRequest(
        'MAXIMO_ARCHIVOS',
        'Se pueden subir como máximo 20 archivos a la vez.',
      );
    }

    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
    });
    if (!partido) {
      throw err.notFound('PARTIDO_NO_EXISTE', 'El partido no existe.');
    }
    if (partido.estado !== EstadoPartido.FINALIZADO) {
      throw err.conflict(
        'PARTIDO_NO_FINALIZADO',
        'Solo se puede subir contenido multimedia a partidos en estado FINALIZADO.',
      );
    }

    if (user.rol === RolUsuario.ARBITRO && partido.arbitroId !== user.id) {
      throw err.forbidden(
        'NO_ES_EL_ARBITRO',
        'Solo el árbitro asignado al partido o un organizador pueden subir archivos.',
      );
    }

    const uploadDir = join(process.cwd(), 'uploads', 'partidos', partidoId);
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const creados = [];

    for (const file of files) {
      const ext = extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        throw err.badRequest(
          'FORMATO_INVALIDO',
          `El formato "${ext}" no está permitido. Formatos válidos: jpg, jpeg, png, mp4, mov.`,
        );
      }

      const esVideo = ext === '.mp4' || ext === '.mov';
      const maxBytes = esVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

      if (file.size > maxBytes) {
        throw err.badRequest(
          'PESO_EXCEDIDO',
          `El archivo ${file.originalname} excede el límite permitido de ${esVideo ? '50MB' : '10MB'}.`,
        );
      }

      const uniqueName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      const destPath = join(uploadDir, uniqueName);
      await fs.promises.writeFile(destPath, file.buffer);

      const url = `/uploads/partidos/${partidoId}/${uniqueName}`;
      const tipo = esVideo ? TipoMultimedia.VIDEO : TipoMultimedia.IMAGEN;
      const mimeType =
        file.mimetype || (esVideo ? 'video/mp4' : 'image/jpeg');

      const record = await this.prisma.multimedia.create({
        data: {
          partidoId,
          tipo,
          url,
          tamanoBytes: file.size,
          mimeType,
        },
      });

      creados.push(record);
    }

    return creados;
  }

  async listarGaleria(partidoId: string) {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
    });
    if (!partido) {
      throw err.notFound('PARTIDO_NO_EXISTE', 'El partido no existe.');
    }

    return this.prisma.multimedia.findMany({
      where: { partidoId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async eliminarMultimedia(id: string) {
    const item = await this.prisma.multimedia.findUnique({
      where: { id },
    });
    if (!item) {
      throw err.notFound(
        'MULTIMEDIA_NO_EXISTE',
        'El archivo multimedia no existe.',
      );
    }

    await this.prisma.multimedia.delete({
      where: { id },
    });

    const localPath = join(process.cwd(), item.url.replace(/^\//, ''));
    try {
      await fs.promises.unlink(localPath);
    } catch {
      // Ignorar si el archivo no existe en disco
    }

    return { eliminado: true };
  }
}

@ApiTags('multimedia')
@ApiBearerAuth()
@Controller()
export class MultimediaController {
  constructor(private readonly service: MultimediaService) {}

  @Post('partidos/:id/galeria')
  @Roles(RolUsuario.ORGANIZADOR, RolUsuario.ARBITRO)
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 20))
  subirMultimedia(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: { originalname: string; size: number; buffer: Buffer; mimetype: string }[],
  ) {
    return this.service.subirMultimedia(user, id, files);
  }

  @Public()
  @Get('partidos/:id/galeria')
  listarGaleria(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listarGaleria(id);
  }

  @Delete('galeria/:id')
  @Roles(RolUsuario.ORGANIZADOR)
  eliminarMultimedia(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.eliminarMultimedia(id);
  }
}

@Module({
  controllers: [MultimediaController],
  providers: [MultimediaService],
  exports: [MultimediaService],
})
export class MultimediaModule {}
