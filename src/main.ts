import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors(); // Enable CORS for mobile app
  app.setGlobalPrefix('api');
  // Serve uploaded avatars as static files: GET /uploads/avatars/:filename
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.useGlobalPipes(new ValidationPipe());
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Leoni Employee Management API')
    .setDescription('The Leoni API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const PORT = process.env.PORT || 3000;
  await app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}
bootstrap();
