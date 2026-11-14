import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EstadoEquipo, Posicion } from '@PrismaClient';
import { DUI_REGEX } from '../cuentas/cuentas.module.js';

export class JugadorInputDto {
  @IsString()
  @MinLength(1, { message: 'El nombre del jugador es obligatorio.' })
  @MaxLength(100, { message: 'El nombre del jugador no puede superar 100 caracteres.' })
  nombre!: string;

  @IsString()
  @Matches(DUI_REGEX, { message: 'El DUI debe tener el formato 00000000-0.' })
  dui!: string;

  @IsDateString({}, { message: 'La fecha de nacimiento no es válida.' })
  fechaNacimiento!: string;

  @IsEnum(Posicion, { message: 'La posición debe ser Portero, Defensa, Mediocampista o Delantero.' })
  posicion!: Posicion;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'La camiseta debe estar entre 1 y 99.' })
  @Max(99, { message: 'La camiseta debe estar entre 1 y 99.' })
  numeroCamiseta!: number;
}

/**
 * H1: el cupo 5–15 se valida en el servicio para responder 400 con el
 * mensaje de negocio; aquí solo se acota el array para evitar abusos.
 */
export class CrearEquipoDto {
  @IsString()
  @Length(3, 50, { message: 'El nombre del equipo debe tener entre 3 y 50 caracteres.' })
  nombre!: string;

  @IsUUID()
  temporadaId!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => JugadorInputDto)
  jugadores!: JugadorInputDto[];
}

export class ReenviarEquipoDto {
  @IsOptional()
  @IsString()
  @Length(3, 50, { message: 'El nombre del equipo debe tener entre 3 y 50 caracteres.' })
  nombre?: string;

  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => JugadorInputDto)
  jugadores!: JugadorInputDto[];
}

export class CambiarEstadoEquipoDto {
  @IsIn([EstadoEquipo.APROBADO, EstadoEquipo.RECHAZADO], {
    message: 'El estado debe ser APROBADO o RECHAZADO.',
  })
  estado!: 'APROBADO' | 'RECHAZADO';

  @ValidateIf((o: CambiarEstadoEquipoDto) => o.motivoRechazo !== undefined)
  @IsString()
  @MaxLength(250, { message: 'El motivo de rechazo admite hasta 250 caracteres.' })
  motivoRechazo?: string;
}
