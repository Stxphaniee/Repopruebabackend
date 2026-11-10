import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { EnvConfig } from '@Config';

const API_PREFIX = 'api/v1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<EnvConfig, true>);

  // Versionado en la URI: /api/v1/...
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      // Descarta propiedades que no estén en el DTO...
      whitelist: true,
      // ...y además rechaza la request con 400 si vienen de más, en vez de
      // ignorarlas en silencio.
      forbidNonWhitelisted: true,
      // Convierte el payload al tipo del DTO (los query/params llegan string).
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SI Backend Boilerplate')
    .setDescription('API REST con autenticación por usuario y contraseña.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

await bootstrap();
