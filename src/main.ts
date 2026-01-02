import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors(); // Enable CORS for mobile app
  app.setGlobalPrefix('api');
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
