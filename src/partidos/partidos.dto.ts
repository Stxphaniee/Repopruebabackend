import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Cancha, EstadoPartido, TipoEvento } from '@PrismaClient';

export class CrearJornadaDto {
  @IsUUID()
  temporadaId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El número de jornada debe ser al menos 1.' })
  numero!: number;
}

export class CrearPartidoDto {
  @IsUUID()
  jornadaId!: string;

  @IsUUID()
  equipoLocalId!: string;

  @IsUUID()
  equipoVisitanteId!: string;

  @IsUUID()
  arbitroId!: string;

  @IsEnum(Cancha, { message: 'La cancha debe ser A, B o C.' })
  cancha!: Cancha;

  @IsDateString({}, { message: 'La fecha y hora de inicio no es válida.' })
  fechaHoraInicio!: string;
}

export class ModificarPartidoDto {
  @IsOptional()
  @IsDateString({}, { message: 'La fecha y hora de inicio no es válida.' })
  fechaHoraInicio?: string;

  @IsOptional()
  @IsEnum(Cancha, { message: 'La cancha debe ser A, B o C.' })
  cancha?: Cancha;

  @IsOptional()
  @IsEnum(EstadoPartido, { message: 'El estado del partido no es válido.' })
  estado?: EstadoPartido;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'El motivo de suspensión admite hasta 300 caracteres.' })
  motivoSuspension?: string;
}

export class CambiarEstadoPartidoDto {
  @IsEnum(EstadoPartido, { message: 'El estado debe ser EN_CURSO o FINALIZADO.' })
  estado!: EstadoPartido;
}

export class ParticipanteItemDto {
  @IsUUID()
  jugadorId!: string;

  @IsBoolean()
  participo!: boolean;
}

export class RegistrarParticipantesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un participante.' })
  @ValidateNested({ each: true })
  @Type(() => ParticipanteItemDto)
  jugadores!: ParticipanteItemDto[];
}

export class RegistrarEventoDto {
  @IsUUID()
  jugadorId!: string;

  @IsEnum(TipoEvento, { message: 'El tipo de evento debe ser GOL, ASISTENCIA, AMARILLA o ROJA.' })
  tipo!: TipoEvento;

  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'El minuto no puede ser negativo.' })
  minuto!: number;

  @IsOptional()
  @IsUUID()
  golRelacionadoId?: string;
}

export class CorregirEventoItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  jugadorId!: string;

  @IsEnum(TipoEvento)
  tipo!: TipoEvento;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minuto!: number;

  @IsOptional()
  @IsUUID()
  golRelacionadoId?: string;
}

export class CorregirResultadoDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorregirEventoItemDto)
  eventosCorregidos!: CorregirEventoItemDto[];

  @IsString()
  @MinLength(1, { message: 'La justificación es requerida.' })
  @MaxLength(300, { message: 'La justificación admite hasta 300 caracteres.' })
  justificacion!: string;
}

export class ListarPartidosQuery {
  @IsOptional()
  @IsUUID()
  jornadaId?: string;

  @IsOptional()
  @IsEnum(EstadoPartido)
  estado?: EstadoPartido;
}
