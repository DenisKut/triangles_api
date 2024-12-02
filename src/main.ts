import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { EventEmitter } from 'stream';
import { AppModule } from './app.module';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.useWebSocketAdapter(new IoAdapter(app));

	// Включение CORS
	app.enableCors({
		origin: '*',
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
		credentials: true
	});

	await app.listen(process.env.PORT ?? 3000);
}

EventEmitter.defaultMaxListeners = 1000;
bootstrap();
