# syntax=docker/dockerfile:1

# ===========================================================================
# Dockerfile multi-stage para la API NestJS.
#
# El Postgres de desarrollo NO se construye acá: se levanta desde
# docker-compose.yml con la imagen oficial `postgres:18-alpine`.
#
# Alpine funciona sin instalar libssl porque el schema usa
# `engineType = "client"`, que no descarga el motor nativo de Rust.
# ===========================================================================

# --- Etapa 1: dependencias -------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

# El `postinstall` corre `prisma generate`, así que el schema y la config del
# CLI tienen que estar presentes ANTES del install.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# `prisma generate` lee datasource.url aunque no se conecte a la base.
# Se le pasa un placeholder para que no falle durante el build.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm ci

# --- Etapa 2: build --------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
# Incluye src/generated/prisma, producido por el postinstall de la etapa deps.
COPY --from=deps /app/src ./src
COPY . .

RUN npm run build

# Se eliminan las devDependencies para copiar solo runtime a la imagen final.
# Nota: `prisma`, `dotenv` y `tsx` son dependencies (no devDependencies) a
# propósito, porque el contenedor corre `prisma migrate deploy` al arrancar y
# `prisma db seed` a demanda; este prune se las llevaría.
RUN npm prune --omit=dev

# --- Etapa 3: runtime ------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
# Necesarios para `prisma migrate deploy` al arrancar el contenedor.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# El seed (`prisma db seed`) corre con tsx sobre prisma/seed.ts, que importa el
# cliente generado desde src/, no desde dist/.
COPY --from=builder /app/src/generated ./src/generated

# La imagen de Node ya trae el usuario `node` sin privilegios.
USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
