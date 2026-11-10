-- Renombra `username` a `email` preservando los datos.
--
-- Prisma genera por defecto un DROP COLUMN + ADD COLUMN para este cambio, que
-- falla en una tabla con filas (no se puede agregar una columna NOT NULL UNIQUE
-- sin default) y que ademas perderia los datos. Un RENAME es equivalente para
-- el schema resultante, no destructivo y funciona con la tabla poblada.
ALTER TABLE "users" RENAME COLUMN "username" TO "email";

-- El indice unico tiene que quedar con el nombre que Prisma espera para la
-- columna nueva, o la proxima migracion lo detectaria como un cambio pendiente.
ALTER INDEX "users_username_key" RENAME TO "users_email_key";

-- Los emails se guardan normalizados en minusculas (ver UserRepository), asi
-- que se alinean los valores que ya existian.
UPDATE "users" SET "email" = lower(trim("email"));
