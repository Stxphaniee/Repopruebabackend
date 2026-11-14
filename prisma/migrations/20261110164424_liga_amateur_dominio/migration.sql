-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('JUGADOR', 'CAPITAN', 'ARBITRO', 'ORGANIZADOR');

-- CreateEnum
CREATE TYPE "EstadoEquipo" AS ENUM ('PENDIENTE_VALIDACION', 'APROBADO', 'RECHAZADO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "Posicion" AS ENUM ('PORTERO', 'DEFENSA', 'MEDIOCAMPISTA', 'DELANTERO');

-- CreateEnum
CREATE TYPE "Cancha" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "EstadoJornada" AS ENUM ('BORRADOR', 'PUBLICADA');

-- CreateEnum
CREATE TYPE "EstadoPartido" AS ENUM ('PROGRAMADO', 'EN_CURSO', 'FINALIZADO', 'SUSPENDIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('GOL', 'ASISTENCIA', 'AMARILLA', 'ROJA');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('PENDIENTE', 'PAGADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "AccionAuditoriaEquipo" AS ENUM ('SUSPENDER', 'REACTIVAR');

-- CreateEnum
CREATE TYPE "TipoMultimedia" AS ENUM ('IMAGEN', 'VIDEO');

-- CreateEnum
CREATE TYPE "CategoriaNotificacion" AS ENUM ('PAGOS', 'CALENDARIO', 'RESULTADOS', 'INSCRIPCIONES');

-- CreateEnum
CREATE TYPE "ModuloOrigenNotificacion" AS ENUM ('INSCRIPCIONES', 'CALENDARIO', 'RESULTADOS', 'PAGOS');

-- CreateEnum
CREATE TYPE "EstadoNotificacion" AS ENUM ('NO_LEIDA', 'LEIDA');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "rol" "RolUsuario" NOT NULL DEFAULT 'JUGADOR';

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "dui" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auditoria_roles" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "rol_anterior" "RolUsuario" NOT NULL,
    "rol_nuevo" "RolUsuario" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporadas" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "inscripcion_inicio" TIMESTAMP(3) NOT NULL,
    "inscripcion_fin" TIMESTAMP(3) NOT NULL,
    "altas_bajas_inicio" TIMESTAMP(3) NOT NULL,
    "altas_bajas_fin" TIMESTAMP(3) NOT NULL,
    "cuota_inscripcion" DECIMAL(10,2) NOT NULL DEFAULT 50.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temporadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipos" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "temporada_id" UUID NOT NULL,
    "estado" "EstadoEquipo" NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
    "capitan_id" UUID NOT NULL,
    "motivo_rechazo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jugadores" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "dui" TEXT NOT NULL,
    "fecha_nacimiento" DATE NOT NULL,
    "posicion" "Posicion" NOT NULL,
    "numero_camiseta" INTEGER NOT NULL,
    "equipo_id" UUID NOT NULL,
    "usuario_id" UUID,
    "fecha_baja" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jugadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornadas" (
    "id" UUID NOT NULL,
    "temporada_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoJornada" NOT NULL DEFAULT 'BORRADOR',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jornadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partidos" (
    "id" UUID NOT NULL,
    "jornada_id" UUID NOT NULL,
    "equipo_local_id" UUID NOT NULL,
    "equipo_visitante_id" UUID NOT NULL,
    "cancha" "Cancha" NOT NULL,
    "fecha_hora_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_hora_fin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoPartido" NOT NULL DEFAULT 'PROGRAMADO',
    "arbitro_id" UUID NOT NULL,
    "motivo_suspension" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_partido" (
    "id" UUID NOT NULL,
    "partido_id" UUID NOT NULL,
    "jugador_id" UUID NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "minuto" INTEGER NOT NULL,
    "gol_relacionado_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_partido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participaciones_partido" (
    "id" UUID NOT NULL,
    "partido_id" UUID NOT NULL,
    "jugador_id" UUID NOT NULL,
    "participo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "participaciones_partido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_resultados" (
    "id" UUID NOT NULL,
    "partido_id" UUID NOT NULL,
    "organizador_id" UUID NOT NULL,
    "eventos_antes" JSONB NOT NULL,
    "eventos_despues" JSONB NOT NULL,
    "justificacion" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_resultados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" UUID NOT NULL,
    "equipo_id" UUID NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoPago" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_vencimiento" TIMESTAMP(3) NOT NULL,
    "comprobante_id" TEXT,
    "ultimos4" TEXT,
    "fecha_pago" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_equipos" (
    "id" UUID NOT NULL,
    "equipo_id" UUID NOT NULL,
    "organizador_id" UUID NOT NULL,
    "accion" "AccionAuditoriaEquipo" NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado_anterior" "EstadoEquipo" NOT NULL,
    "estado_nuevo" "EstadoEquipo" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_equipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "multimedia" (
    "id" UUID NOT NULL,
    "partido_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "tipo" "TipoMultimedia" NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "multimedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "categoria" "CategoriaNotificacion" NOT NULL,
    "titulo" VARCHAR(100) NOT NULL,
    "mensaje" VARCHAR(500) NOT NULL,
    "modulo_origen" "ModuloOrigenNotificacion" NOT NULL,
    "referencia" VARCHAR(100),
    "evento_id" TEXT NOT NULL,
    "estado" "EstadoNotificacion" NOT NULL DEFAULT 'NO_LEIDA',
    "es_critica" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leida_at" TIMESTAMP(3),

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferencias_notificacion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "categoria" "CategoriaNotificacion" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "preferencias_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_dui_key" ON "user_profiles"("dui");

-- CreateIndex
CREATE UNIQUE INDEX "equipos_temporada_id_nombre_key" ON "equipos"("temporada_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "equipos_temporada_id_capitan_id_key" ON "equipos"("temporada_id", "capitan_id");

-- CreateIndex
CREATE UNIQUE INDEX "jugadores_dui_key" ON "jugadores"("dui");

-- CreateIndex
CREATE UNIQUE INDEX "jugadores_usuario_id_key" ON "jugadores"("usuario_id");

-- CreateIndex
CREATE INDEX "jugadores_equipo_id_idx" ON "jugadores"("equipo_id");

-- CreateIndex
CREATE UNIQUE INDEX "jugadores_equipo_id_numero_camiseta_key" ON "jugadores"("equipo_id", "numero_camiseta");

-- CreateIndex
CREATE UNIQUE INDEX "jornadas_temporada_id_numero_key" ON "jornadas"("temporada_id", "numero");

-- CreateIndex
CREATE INDEX "partidos_jornada_id_idx" ON "partidos"("jornada_id");

-- CreateIndex
CREATE INDEX "eventos_partido_partido_id_idx" ON "eventos_partido"("partido_id");

-- CreateIndex
CREATE UNIQUE INDEX "participaciones_partido_partido_id_jugador_id_key" ON "participaciones_partido"("partido_id", "jugador_id");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_equipo_id_key" ON "pagos"("equipo_id");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_comprobante_id_key" ON "pagos"("comprobante_id");

-- CreateIndex
CREATE INDEX "multimedia_partido_id_idx" ON "multimedia"("partido_id");

-- CreateIndex
CREATE INDEX "notificaciones_usuario_id_created_at_idx" ON "notificaciones"("usuario_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_evento_id_usuario_id_key" ON "notificaciones"("evento_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "preferencias_notificacion_usuario_id_categoria_key" ON "preferencias_notificacion"("usuario_id", "categoria");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_roles" ADD CONSTRAINT "auditoria_roles_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_roles" ADD CONSTRAINT "auditoria_roles_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_capitan_id_fkey" FOREIGN KEY ("capitan_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas" ADD CONSTRAINT "jornadas_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_equipo_local_id_fkey" FOREIGN KEY ("equipo_local_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_equipo_visitante_id_fkey" FOREIGN KEY ("equipo_visitante_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_arbitro_id_fkey" FOREIGN KEY ("arbitro_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "jugadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_gol_relacionado_id_fkey" FOREIGN KEY ("gol_relacionado_id") REFERENCES "eventos_partido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participaciones_partido" ADD CONSTRAINT "participaciones_partido_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participaciones_partido" ADD CONSTRAINT "participaciones_partido_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "jugadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_resultados" ADD CONSTRAINT "auditoria_resultados_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_resultados" ADD CONSTRAINT "auditoria_resultados_organizador_id_fkey" FOREIGN KEY ("organizador_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_equipos" ADD CONSTRAINT "auditoria_equipos_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_equipos" ADD CONSTRAINT "auditoria_equipos_organizador_id_fkey" FOREIGN KEY ("organizador_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multimedia" ADD CONSTRAINT "multimedia_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferencias_notificacion" ADD CONSTRAINT "preferencias_notificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
