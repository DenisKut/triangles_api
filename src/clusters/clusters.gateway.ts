// Импорт необходимых декораторов и модулей из @nestjs/websockets и socket.io.
import {
	ConnectedSocket,
	MessageBody,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
// Импорт сервиса ClustersService, который используется для работы с кластерами.
import { ClustersService } from './clusters.service';

// Декоратор @WebSocketGateway создает WebSocket шлюз с настройками CORS, позволяющими подключения с любых источников.
// Поле server типа Server из socket.io для работы с WebSocket сервером.
// Поле clients хранит подключенных клиентов.
// Конструктор принимает ClustersService и запускает setInterval для регулярного обновления списка кластеров каждые 5 секунд, вызывая метод scanNetwork и передавая результаты через broadcastClusters
@WebSocketGateway({
	cors: {
		origin: '*'
	}
})
export class ClustersGateway {
	@WebSocketServer() server: Server;
	private clients: Socket[] = [];

	constructor(private readonly clustersService: ClustersService) {
		setInterval(async () => {
			const clusters = await this.clustersService.scanNetwork();
			this.broadcastClusters(clusters);
		}, 5000); // Обновление списка кластеров каждые 5 секунд
	}

	// Метод handleConnection добавляет подключенного клиента в массив clients и логирует событие подключения.
	handleConnection(client: Socket) {
		this.clients.push(client);
		console.log(`Client connected: ${client.id}`);
	}

	// Метод handleDisconnect удаляет отключенного клиента из массива clients и логирует событие отключения
	handleDisconnect(client: Socket) {
		this.clients = this.clients.filter(c => c !== client);
		console.log(`Client disconnected: ${client.id}`);
	}

	// Метод broadcastClusters отправляет обновленный список кластеров всем подключенным клиентам через событие scanner
	private broadcastClusters(clusters: { ip: string; port: number }[]) {
		this.clients.forEach(client => {
			client.emit('scanner', clusters);
		});
	}

	// Декоратор @SubscribeMessage регистрирует обработчик для события customMessage.
	// Метод handleCustomMessage логирует полученное сообщение и отправляет клиенту ответ.
	@SubscribeMessage('customMessage')
	handleCustomMessage(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	): void {
		console.log('Received custom message:', data);
		client.emit('response', { message: 'Custom message received' });
	}

	// Декоратор @SubscribeMessage регистрирует обработчик для события uploadJson
	// Метод handleUploadJson принимает данные JSON, обрабатывает их, сканирует сеть на наличие кластеров, распределяет задачи и возвращает результаты клиенту через событие uploadResult
	@SubscribeMessage('uploadJson')
	async handleUploadJson(
		@MessageBody() data: { jsonContent: string },
		@ConnectedSocket() client: Socket
	): Promise<void> {
		console.log('Received JSON file:', data.jsonContent);
		const jsonData = JSON.parse(data.jsonContent);
		const clusters = await this.clustersService.scanNetwork();
		const results = await this.clustersService.distributeTasks(
			jsonData,
			clusters
		);
		console.log('Obtuse triangles:', JSON.stringify(results));

		client.emit('uploadResult', {
			message: 'JSON file processed successfully',
			data: results
		});

		console.log('Sent upload result to client:', client.id);
	}

	// Декоратор @SubscribeMessage регистрирует обработчик для события setClusters
	// Метод handleSetClusters принимает данные кластеров от клиента, обновляет их в ClustersService и отправляет ответ клиенту через событие response
	@SubscribeMessage('setClusters')
	handleSetClusters(
		@MessageBody() data: { clusters: { ip: string; port: number }[] },
		@ConnectedSocket() client: Socket
	): void {
		if (Array.isArray(data.clusters)) {
			this.clustersService.setClientClusters(data.clusters);
			console.log('Client-defined clusters updated:', data.clusters);
			client.emit('response', { message: 'Clusters updated successfully' });
		} else {
			client.emit('response', { message: 'Invalid cluster data' });
		}
	}
}
